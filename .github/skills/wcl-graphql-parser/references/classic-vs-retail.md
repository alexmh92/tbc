# Classic vs Retail WCL Differences

## API Endpoints

| Version               | Base URL                                       |
| --------------------- | ---------------------------------------------- |
| Retail                | `https://www.warcraftlogs.com/api/v2/user`     |
| Classic (all seasons) | `https://classic.warcraftlogs.com/api/v2/user` |

**Both use the same GraphQL schema**. The only difference is the domain. Tokens are
per-account and work on both endpoints with the same Bearer token.

---

## Zone IDs

Zone IDs differ between Retail and Classic and must be found in the WCL UI URL or by querying
`worldData.zone(id: N)`. Known zones used in this repo:

| Zone                             | ID   | Notes                                                        |
| -------------------------------- | ---- | ------------------------------------------------------------ |
| Siege of Orgrimmar (Retail)      | 457  | SoO Retail                                                   |
| Siege of Orgrimmar (MoP Classic) | 1054 | SoO Classic; zone is available on `classic.warcraftlogs.com` |

When using `reportData.reports(zoneID: N)`, use the version-correct zone ID for the endpoint
you're hitting.

---

## Encounter IDs

WCL may register Classic encounters with a different numeric ID than retail, or register them
identically. For Garrosh Hellscream in SoO:

| Version      | Encounter IDs seen in logs |
| ------------ | -------------------------- |
| Retail / PTR | `1623`                     |
| MoP Classic  | `1623` and/or `51623`      |

Always check both. The `name` field (e.g., `"Garrosh Hellscream"`) is a reliable fallback:

```js
const GARROSH_ENCOUNTER_IDS = new Set([1623, 51623]);
function isGarroshFight(fight) {
	const nameMatch = (fight.name || '').toLowerCase() === 'garrosh hellscream';
	const encMatch = GARROSH_ENCOUNTER_IDS.has(fight.encounterID);
	return nameMatch || encMatch;
}
```

---

## Difficulty Values

| Difficulty | Classic SoO | Retail SoO |
| ---------- | ----------- | ---------- |
| Normal     | 3           | 3          |
| Heroic     | 4           | 4          |
| Mythic     | —           | 5          |
| LFR        | 1           | 1          |

In Classic, `difficulty: 3` = Normal, `difficulty: 4` = Heroic.
Filter in `isGarroshFight` using an `ALLOWED_DIFFICULTIES` set.

---

## Spell / Ability ID Availability

Spell IDs (e.g., `147209` for Malice, `147120` for Call Bombardment) are **sourced from
the game client** and are consistent across Retail and Classic for the same ability. However:

- Classic Phase 1 / PTR may have fewer logged reports, making ID verification harder.
- Some abilities are only used in specific encounter phases. Verify IDs on known kill logs
  before running bulk analysis.
- Use the spell probe pattern from [filtering.md](./filtering.md#discovered-spell-ids) to
  confirm IDs on a good log.

---

## Report Discovery Strategy

### Retail: use rankings

Retail has millions of logs; zone-based scraping is slow. Use `characterRankings` to get
high-quality kill logs directly:

```graphql
worldData {
  encounter(id: 1623) {
    characterRankings(difficulty: 5, limit: 25, page: 1) {
      rankings { report { code } fight }
    }
  }
}
```

This guarantees kills and gives top parses.

### Classic: use zone reports

Classic has far fewer logs and kills may be rare early in a patch. Use zone reports and allow
wipes — you can still analyze partial fight data:

```graphql
reportData {
  reports(zoneID: 1054, limit: 50, page: 1) {
    data { code }
    has_more_pages
  }
}
```

Filter fights locally by `difficulty`, `encounterID`/name, and optionally `kill`.

---

## Fight Count Expectations

For Classic MoP (early patch):

- Many logs per report are wipes or trash pulls.
- P4 of SoO Garrosh (where Bombardment occurs) requires ~8–12 min of sustained progress.
- Expect a high "candidate:valid" ratio: scanning 100–200 reports might yield only 5–20 reports
  that reached P4.
- Scale `CANDIDATE_REPORTS` to 600+ and `MAX_REPORT_PAGES` to 20+ for better valid counts.

---

## Known-Bad Reports

Some uploaded reports have corrupt or incomplete log data (e.g., logs cut mid-fight, test
environments, incorrect zone uploads). Track them in a built-in exclusion set and skip early:

```js
const EXCLUDED_REPORT_CODES = new Set([
	'tYyrpMf6c3nZVAz4', // known corrupt
	'Y1rz3vxpgfN4TVWd', // missing events
	// ...
]);
// Also support runtime injection:
const extra = (process.env.EXCLUDE_REPORT_CODES || '').split(',').filter(Boolean);
for (const code of extra) EXCLUDED_REPORT_CODES.add(code);
```

Apply the exclusion both in fight collection AND in the per-fight processing loop.

---

## Report Sampling Strategy (Classic)

For Classic zone scraping, you want **one best fight per report** (not all fights) to avoid
over-indexing on a single guild's logs. Selection priority:

1. Kill > wipe (kills have complete P4 data)
2. Longest duration (wipes that went furthest)
3. Highest fight ID (most recent attempt in the session)

```js
function selectBestFightForReport(garroshFights) {
	return (
		[...garroshFights].sort((a, b) => {
			if (a.kill !== b.kill) return b.kill ? 1 : -1;
			const durA = (a.endTime || 0) - (a.startTime || 0);
			const durB = (b.endTime || 0) - (b.startTime || 0);
			if (durA !== durB) return durB - durA;
			return (b.id || 0) - (a.id || 0);
		})[0] || null
	);
}
```

---

## GraphQL Schema Differences

The retail and classic endpoints share the same schema — all queries that work on one work on
the other. The only real differences are:

- Zone IDs in `reportData.reports(zoneID:)`
- Encounter IDs in `worldData.encounter(id:)` and fight `.encounterID` values
- Data availability (fewer classic logs, especially early patch)

---

## Rate Limits

Both endpoints are subject to the same WCL rate limits. As of 2024:

- ~1 OAuth token request per 30 sec per client
- API queries: soft limit, not officially published. Observed ~5–10 RPS is safe.
- Use `sleep(30)` between report fetches and `sleep(120)` between zone pages.
- Implement `AbortController` timeout (30s) + retry (3 attempts) on every request.
