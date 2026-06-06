# Filtering WCL Events

## Overview

WCL events can be filtered **server-side** via `filterExpression` on the `events()` call, or
**client-side** in JavaScript after fetching. For ability timing analysis, prefer fetching all
events and filtering locally — it's simpler and avoids API quirks.

---

## `dataType` Parameter

Controls which categories of events the API returns:

| Value        | Returns                                                            |
| ------------ | ------------------------------------------------------------------ |
| `All`        | Every event type                                                   |
| `DamageDone` | `damage` events only                                               |
| `Casts`      | `cast` and `begincast` events                                      |
| `Buffs`      | `applybuff`, `removebuff`, `refreshbuff`                           |
| `Debuffs`    | `applydebuff`, `removedebuff`, `refreshdebuff`, `applydebuffstack` |
| `Healing`    | `heal`, `absorbed`                                                 |
| `Summons`    | `summon`                                                           |

For boss ability analysis, use `All` to catch both `begincast` (cast start) and `cast` (completion).
If you only need casts/debuffs, use `Casts` or `Debuffs` to reduce payload size.

---

## `filterExpression` Syntax

A simple expression language. Always pass as a string variable:

```graphql
events(fightIDs: [$fightId], dataType: All, filterExpression: $filter, ...) { data }
```

### Source/Target Filters

Filter by actor name (case-sensitive, exact):

```
source.name='Garrosh Hellscream'
target.name='Garrosh Hellscream'
```

Filter by actor type:

```
source.type='NPC'
target.type='Player'
```

Combine with AND / OR:

```
source.name='Garrosh Hellscream' and target.type='Player'
type='applydebuff' or type='applydebuffstack'
```

### Spell/Ability Filters

Filter by ability ID:

```
ability.id=147209
ability.id=147120 or ability.id=147209
```

### Event Type Filter

```
type='begincast'
type='cast' or type='begincast'
```

### Negation

```
source.name!='Garrosh Hellscream'
type!='damage'
```

### Numeric Comparisons

```
ability.id>100000
```

---

## When to Use filterExpression vs Local Filtering

| Use filterExpression                                      | Use local filtering                                      |
| --------------------------------------------------------- | -------------------------------------------------------- |
| Reducing huge event volumes (full raid log)               | Smaller fights or targeted analysis                      |
| Isolating a single NPC source to reduce pages             | When you need multiple ability IDs                       |
| Speeding up initial data collection                       | When building exploratory/unknown-ID parsers             |
| Server-side pre-filtering to count events (table queries) | After fetching, correlating events across multiple types |

**Gotcha**: `filterExpression` is applied server-side before pagination. This means
`nextPageTimestamp` values in filtered results reflect filtered positions — don't mix filtered
and unfiltered page tokens.

---

## Local Filtering Patterns

### Filter by event type

```js
const casts = events.filter(e => e.type === 'cast');
const beginCasts = events.filter(e => e.type === 'begincast');
const debuffs = events.filter(e => e.type === 'applydebuff' || e.type === 'applydebuffstack');
```

### Filter by ability ID

```js
const MALICE_ID = 147209;
const BOMBARDMENT_ID = 147120;
const getAbilityId = e => e.abilityGameID ?? e.ability?.guid ?? e.ability?.gameID ?? e.ability?.id;
const maliceEvents = events.filter(e => getAbilityId(e) === MALICE_ID);
const bombardEvents = events.filter(e => getAbilityId(e) === BOMBARDMENT_ID);
```

### Filter by boss sourceID

```js
const actors = reportData.masterData.actors;
const bossActor = actors.find(a => a.name === 'Garrosh Hellscream' && a.type === 'NPC');
const bossEvents = events.filter(e => e.sourceID === bossActor.id);
```

### Deduplicate near-simultaneous events (AoE spam)

Useful when an AoE ability fires many `damage` events in a cluster — pick the earliest per window:

```js
function deduplicateByWindow(events, windowMs = 500) {
	const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
	const result = [];
	for (const e of sorted) {
		if (!result.length || e.timestamp - result[result.length - 1].timestamp > windowMs) {
			result.push(e);
		}
	}
	return result;
}
```

---

## Table Queries: `hostilityType` Not `hostility`

The `table()` query (aggregate totals) uses `hostilityType`, not `hostility`:

```graphql
# CORRECT
table(fightIDs: [$fightId], dataType: DamageDone, hostilityType: Enemies)

# WRONG — will silently ignore or error
table(fightIDs: [$fightId], dataType: DamageDone, hostility: Enemies)
```

Valid values: `Friendlies`, `Enemies`, `Neutrals`.

---

## Timing and Delay Analysis

### "What is the delay between ability A and ability B within a fight phase?"

1. Collect all events for the fight (paginated, all event types).
2. Filter to ability A events and ability B events separately.
3. For each ability B occurrence:
    - Find the **last** ability A event with `timestamp < B.timestamp`.
    - Compute `delayMs = B.timestamp - A.timestamp`.
4. Aggregate across multiple fights/reports.

```js
function computeDelays(anchorEvents, targetEvents) {
	const results = [];
	for (const target of targetEvents) {
		const prior = anchorEvents.filter(a => a.timestamp < target.timestamp);
		if (!prior.length) continue;
		const anchor = prior[prior.length - 1];
		results.push({ targetTs: target.timestamp, anchorTs: anchor.timestamp, delayMs: target.timestamp - anchor.timestamp });
	}
	return results;
}
```

### "nth occurrence" pattern (Bombardment B1, B2, B3...)

Sort target events by timestamp. Index 0 = first occurrence, 1 = second, etc.

```js
const bombardments = events.filter(e => e.type === 'begincast' && getAbilityId(e) === BOMBARDMENT_ID).sort((a, b) => a.timestamp - b.timestamp);
const b1 = bombardments[0];
const b2 = bombardments[1];
```

---

## Source Name Filter: Classic Gotcha

In Classic WCL, boss actor names may differ between encounters. If `source.name=` returns no
results, fall back to fetching all events and filtering by `encounterID`-derived actor IDs via
`masterData.actors`. The actor approach is always more robust.

---

## Discovered Spell IDs

Some spells have different IDs depending on fight phase or difficulty. Always verify IDs by
inspection on a known-good report before hardcoding:

```js
// Quick probe: print all cast events by boss sorted by count
const bossEvents = allEvents.filter(e => e.sourceID === bossActorId);
const castEvents = bossEvents.filter(e => e.type === 'cast' || e.type === 'begincast');
const byId = new Map();
for (const e of castEvents) {
	const id = getAbilityId(e);
	if (!id) continue;
	const rec = byId.get(id) || { id, name: e.ability?.name, count: 0 };
	rec.count++;
	byId.set(id, rec);
}
console.table([...byId.values()].sort((a, b) => b.count - a.count));
```
