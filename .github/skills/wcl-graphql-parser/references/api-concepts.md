# WCL API Concepts

## Report vs Fight

| Concept    | What it is                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Report** | A single logging session (e.g. a raid night). Identified by an alphanumeric `code` like `qbBDVcZJrtkT2gxW`.                                                                            |
| **Fight**  | One encounter attempt within a report. Has a numeric `id` (unique per report), `startTime` / `endTime` in ms relative to report start, `encounterID`, `kill` (bool), and `difficulty`. |

Key: a report has many fights. Boss timing analysis always needs a specific `(reportCode, fightId)` pair.

---

## Fight Metadata Fields

```graphql
fights {
  id           # Int, unique within the report
  name         # String, e.g. "Garrosh Hellscream"
  encounterID  # Int — matches worldData.encounter IDs; 0 or null for trash/unknown
  kill         # Boolean — true if boss was killed
  difficulty   # Int — see Difficulty Codes below
  startTime    # Float, ms from report start (NOT epoch)
  endTime      # Float, ms from report start
}
```

`endTime - startTime` = fight duration in ms.
Timestamps passed to `events(startTime:, endTime:)` are **relative to report start**, not epoch.

---

## Difficulty Codes

| ID  | Label                  |
| --- | ---------------------- |
| 1   | LFR                    |
| 2   | Flex / Normal (old)    |
| 3   | Normal                 |
| 4   | Heroic                 |
| 5   | Mythic                 |
| 10  | Normal (10-man legacy) |
| 25  | Heroic (25-man legacy) |

Classic MoP SoO uses `3` (Normal) and `4` (Heroic).

---

## Encounter IDs

Encounter IDs are **consistent** across retail and classic for the same boss, but the prefix may
differ for Classic encounter registrations. Always search both when uncertain:

```js
const GARROSH_ENCOUNTER_IDS = new Set([1623, 51623]);
```

`51623` is the Classic registration of the same boss. When building a fight filter, check both:

```js
const isGarrosh = f => GARROSH_ENCOUNTER_IDS.has(f.encounterID) || (f.name || '').toLowerCase() === 'garrosh hellscream';
```

---

## Event Shape

Each event from `events { data }` is a JSON object. Key fields:

| Field           | Type   | Meaning                                                            |
| --------------- | ------ | ------------------------------------------------------------------ |
| `timestamp`     | Float  | Ms from report start. Always present for valid events.             |
| `type`          | String | Event category (see Event Types below)                             |
| `sourceID`      | Int    | Actor ID of the caster/attacker (matches `masterData.actors[].id`) |
| `targetID`      | Int    | Actor ID of the target                                             |
| `abilityGameID` | Int    | Spell/ability ID — **prefer this field**                           |
| `ability.guid`  | Int    | Fallback spell ID (older event format)                             |
| `ability.id`    | Int    | Another fallback                                                   |
| `ability.name`  | String | Human-readable spell name (unreliable for filtering)               |

Always read ability ID defensively:

```js
const id = e.abilityGameID ?? e.ability?.guid ?? e.ability?.gameID ?? e.ability?.id;
```

---

## Event Types

| Type               | Meaning                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `begincast`        | Boss starts casting a spell (channeling / cast bar starts). Fired before `cast`. Best anchor for "when did the ability begin". |
| `cast`             | Cast completed / instant cast landed.                                                                                          |
| `applydebuff`      | First application of a debuff on target.                                                                                       |
| `applydebuffstack` | Debuff stack added (implies debuff already exists).                                                                            |
| `refreshdebuff`    | Debuff refreshed before expiry.                                                                                                |
| `removedebuff`     | Debuff removed from target.                                                                                                    |
| `applybuff`        | Buff applied.                                                                                                                  |
| `damage`           | Damage hit registered. May fire many times per cast for AoE.                                                                   |
| `heal`             | Heal event.                                                                                                                    |
| `summon`           | Boss summoned an NPC.                                                                                                          |
| `resourcechange`   | Energy/rage/etc. change.                                                                                                       |
| `absorbed`         | Damage/heal absorbed.                                                                                                          |

**When tracking "when did the boss use ability X":**

- Use `begincast` if you want the moment the boss started committing to the action.
- Use `cast` if you want the moment it actually fired.
- Use `applydebuff` if the boss applies a debuff without a visible cast.

---

## Spell ID Notes

Spell IDs are game-data IDs from the WoW client. Tips:

- IDs are **shared** between Retail and Classic for abilities that exist in both.
- Classic may re-register NPC spells under different IDs (e.g., boss encounter IDs as above).
- To discover spell IDs from an unknown log: fetch all events filtered by source name, aggregate by `abilityGameID`, and look for `begincast`/`cast` events in the right time window.
- Example probe pattern from this repo:

```js
// Aggregate all boss-source events and see what IDs fire
const d = await graphqlQuery(
	`
  query($code: String!, $fightId: Int!, $filter: String!) {
    reportData { report(code: $code) {
      events(fightIDs: [$fightId], dataType: All, filterExpression: $filter) {
        data
      }
    }}
  }`,
	{ code, fightId, filter: "source.name='Garrosh Hellscream'" },
);
const m = new Map();
for (const e of d.reportData.report.events.data || []) {
	const id = e.abilityGameID ?? e.ability?.guid ?? e.ability?.id;
	if (!id) continue;
	const r = m.get(id) || { id, count: 0, types: new Set() };
	r.count++;
	r.types.add(e.type);
	m.set(id, r);
}
console.log([...m.values()].sort((a, b) => b.count - a.count).slice(0, 30));
```

---

## Actor/Source IDs

`masterData.actors` is the NPC/player roster for the report:

```graphql
report(code: $code) {
  masterData {
    actors {
      id       # Int — used in event.sourceID / event.targetID
      name     # String
      type     # "Player" | "NPC" | "Pet"
      subType  # "Boss" | class name etc.
    }
  }
}
```

Use `actors.find(a => a.name === 'Garrosh Hellscream' && a.type === 'NPC')` to get the boss actor ID,
then filter events by `e.sourceID === bossActorID` as an alternative to `filterExpression`.

---

## Rankings vs Zone Reports for Bulk Collection

**Rankings** (`worldData.encounter.characterRankings`) — gives you the top parses for a specific
encounter/difficulty. Returns `{ report { code }, fight }` pairs. Works well for Retail where you
want guaranteed kill logs.

**Zone reports** (`reportData.reports(zoneID: N)`) — returns all uploaded reports for a zone,
ordered by upload date descending. Includes wipes. Works well for Classic where kill counts are
low. Paginate with `page` and check `has_more_pages`.
