---
name: wcl-graphql-parser
description: 'Build WarcraftLogs GraphQL API v2 parsers in Node.js ESM. Use for: fetching boss fight events, bulk report/fight collection, spell delay analysis, boss ability timing, debuff tracking, Retail or Classic WCL data, batch analytics with caching. Triggers: "parse WCL logs", "fetch WarcraftLogs events", "analyze WCL report", "WCL GraphQL query", "boss ability timing", "batch WCL reports", "WarcraftLogs parser script", "analyze fight events".'
---

# WCL GraphQL Parser

## Overview

WarcraftLogs (WCL) exposes a GraphQL API v2. Parsers in this repo are Node.js ESM scripts that query
that API to extract timing, damage, cast, and debuff data from boss fights for analysis.

- **Retail endpoint**: `https://www.warcraftlogs.com/api/v2/user`
- **Classic endpoint**: `https://classic.warcraftlogs.com/api/v2/user`
- **Auth**: OAuth2 Bearer token via `WCL_TOKEN` env var (or hardcoded in script for local use)

---

## Procedure

### 1. Set up the API client

```js
import fs from 'fs';
const API_URL = 'https://classic.warcraftlogs.com/api/v2/user'; // or retail URL
const TOKEN = process.env.WCL_TOKEN || '<token>';
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_RETRIES = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function graphqlQuery(query, variables = {}) {
	let lastError = null;
	for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(API_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
				body: JSON.stringify({ query, variables }),
				signal: controller.signal,
			});
			const text = await response.text();
			if (!response.ok) throw new Error(`API Error: ${response.status} - ${text.slice(0, 600)}`);
			const json = JSON.parse(text);
			if (json.errors) throw new Error(`GraphQL Errors: ${JSON.stringify(json.errors)}`);
			return json.data;
		} catch (err) {
			lastError = err;
			if (attempt < REQUEST_RETRIES) await sleep(250 * attempt);
		} finally {
			clearTimeout(timeout);
		}
	}
	throw lastError;
}
```

Always add timeout (`AbortController`) + retry loop to prevent hangs on slow WCL responses.

---

### 2. Fetch all events for a fight (paginated)

WCL events are paginated via `nextPageTimestamp`. Always loop until null:

```js
async function getAllFightEvents(code, fightId, fightStartTime, fightEndTime) {
	let startTime = fightStartTime;
	let allEvents = [];
	while (true) {
		const data = await graphqlQuery(
			`
      query($code: String!, $fightId: Int!, $start: Float!, $end: Float!) {
        reportData {
          report(code: $code) {
            events(fightIDs: [$fightId], dataType: All, startTime: $start, endTime: $end) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `,
			{ code, fightId, start: startTime, end: fightEndTime },
		);
		const payload = data.reportData.report.events;
		allEvents = allEvents.concat((payload.data || []).filter(e => e.timestamp != null));
		if (!payload.nextPageTimestamp || payload.nextPageTimestamp === startTime) break;
		startTime = payload.nextPageTimestamp;
	}
	return allEvents;
}
```

Never filter by ability IDs on the API side — fetch all, filter locally (see [filtering reference](./references/filtering.md)).

---

### 3. Identify abilities by ID

Extract ability IDs defensively — WCL uses multiple field names depending on event type:

```js
function getAbilityId(event) {
	return event.abilityGameID ?? event.ability?.guid ?? event.ability?.gameID ?? event.ability?.id ?? null;
}

function filterAbilityEvents(events, abilityId) {
	return events.filter(e => getAbilityId(e) === abilityId);
}
```

See [api-concepts reference](./references/api-concepts.md) for full event shape and known ability ID quirks.

---

### 4. Collect multiple reports (bulk mode)

For bulk analytics, collect `(reportCode, fightId)` pairs from rankings or zone reports, then
process each fight with a cache to avoid re-fetching:

```js
// Zone-based collection (Classic):
const data = await graphqlQuery(
	`
  query($zoneID: Int!, $limit: Int!, $page: Int!) {
    reportData {
      reports(zoneID: $zoneID, limit: $limit, page: $page) {
        data { code }
        has_more_pages
      }
    }
  }
`,
	{ zoneID: 1054, limit: 50, page: 1 },
);

// Rankings-based collection (Retail):
const data = await graphqlQuery(
	`
  query($encounterID: Int!, $difficulty: Int!, $limit: Int!, $page: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(difficulty: $difficulty, limit: $limit, page: $page) {
          rankings { report { code } fight }
        }
      }
    }
  }
`,
	{ encounterID: 1502, difficulty: 5, limit: 25, page: 1 },
);
```

See [api-concepts reference](./references/api-concepts.md) for encounter IDs, difficulty codes, and Classic vs Retail differences.

---

### 5. Cache fight datasets

Always cache per-fight event data to avoid re-fetching on reruns:

```js
const CACHE_FILE = 'tmp/my_cache.json';
const CACHE_VERSION = 1;

function loadCache() {
	try {
		const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
		if (parsed.version !== CACHE_VERSION) throw new Error('stale');
		return parsed;
	} catch {
		return { version: CACHE_VERSION, pairList: [], fights: {}, reportFights: {} };
	}
}

function saveCache(cache) {
	cache.version = CACHE_VERSION;
	fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Cache key per fight:
const key = `${code}::${fightId}`;
if (!REFRESH && cache.fights[key]) return cache.fights[key];
// ... fetch, store, return
cache.fights[key] = dataset;
saveCache(cache);
```

Env flags `REFRESH_PAIRS=1` / `REFRESH_FIGHT_CACHE=1` force rebuild when needed.

---

### 6. Compute timing delays

Standard pattern: find last anchor event (e.g., Malice cast) before a target event (e.g., Bombardment begincast):

```js
function selectLastAnchorBefore(anchorTimeline, targetEvent) {
	const prior = anchorTimeline.filter(a => a.timestamp < targetEvent.timestamp);
	if (!prior.length) return null;
	const last = prior[prior.length - 1];
	return { delayMs: targetEvent.timestamp - last.timestamp };
}
```

Deduplicate clustered events (same ability firing multiple hits within a short window):

```js
function uniqueByTimestamp(events, clusterMs = 250) {
	const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
	return sorted.filter((e, i) => i === 0 || e.timestamp - sorted[i - 1].timestamp > clusterMs);
}
```

---

### 7. Output

Write JSON + Markdown in a consistent summary shape:

```js
const summary = {
  requestedReports: TARGET_REPORTS,
  validReportsFound: validResults.length,
  excludedReportsCount: EXCLUDED_REPORT_CODES.size,
  aggregateByBombardment: { b1: stats([...]), b2: stats([...]) },
  results: validResults,
};
fs.writeFileSync('tmp/output.json', JSON.stringify(summary, null, 2));
fs.writeFileSync('tmp/output.md', renderMarkdown(summary));
```

---

## References

- [API Concepts: event shape, IDs, fight metadata](./references/api-concepts.md)
- [Filtering: event types, filterExpression, dataType](./references/filtering.md)
- [Classic vs Retail: endpoints, encounter IDs, spell ID differences](./references/classic-vs-retail.md)

---

## Quick Checklist

- [ ] Bearer token set
- [ ] Correct API endpoint (retail vs classic)
- [ ] `nextPageTimestamp` loop for events
- [ ] Ability IDs resolved locally (not via API filter)
- [ ] Event types filtered locally (`cast`, `begincast`, `applydebuff`, etc.)
- [ ] Timeout + retry on every `graphqlQuery` call
- [ ] Cache file with version gate
- [ ] `REFRESH_*` env flags for forced rebuilds
- [ ] Only valid rows in output JSON/Markdown
