# Security tests: Favorites & Alerts

Owner: Ali (246090). Team 14, 26CSCN29H.

Every test below is run against the deployed API on Floci, through the API
Gateway address, with the test tokens kept outside the repository. The request
and the answer of each run are saved in `evidence/ST-xx.txt`, with the tokens
replaced by placeholders.

The `Actual` and `Pass` columns are filled in only from a real run.

**This is the DynamoDB version.** The earlier run on Neon (24 Nov) is kept in
`evidence/neon-version/` and in the git tag `neon-version`.

Address used: `http://9e60eb42eb.execute-api.localhost.floci.io:4566` (Floci 2.4.0, Docker Desktop, Windows 11)
Date of the run: 2026-11-26, 21:34 to 21:41 UTC
Test data: `scripts/seed-floci.js` (2 test routes) and `scripts/make-test-sessions.js` (parent1, parent2, admin, supervisor)

| ID | Scenario | Request | Expected | Actual | Pass | Evidence |
|---|---|---|---|---|---|---|
| ST-01 | No token (unauthenticated access) | `GET /api/favorites` with no Authorization header | 401 UNAUTHENTICATED | 401 `UNAUTHENTICATED` "Please log in." | Pass | `evidence/ST-01.txt` |
| ST-02 | Made-up token | `GET /api/favorites` with a random 64-character token | 401 UNAUTHENTICATED | 401 `UNAUTHENTICATED` (GetItem on `Sessions` finds no item with that hash) | Pass | `evidence/ST-02.txt` |
| ST-03 | Wrong role (unauthorized role) | `GET /api/favorites` with the admin token | 403 FORBIDDEN | 403 `FORBIDDEN` | Pass | `evidence/ST-03.txt` |
| ST-04 | NoSQL injection | `POST /api/favorites` with `{"routeId":{"$ne":null}}`, with `{"routeId":"' OR 1=1"}`, and with `{"routeId":"test-route-1","stopId":{"$gt":""}}` | 400 VALIDATION_ERROR, no data leaked, nothing saved | all three: 400 `VALIDATION_ERROR` "routeId and stopId must be valid ids.", body is only the error; parent1 favorites 1 before, 1 after | Pass | `evidence/ST-04.txt` |
| ST-05 | Wrong content type | `POST /api/favorites` with `Content-Type: text/plain` | 415 UNSUPPORTED_MEDIA_TYPE | 415 `UNSUPPORTED_MEDIA_TYPE` | Pass | `evidence/ST-05.txt` |
| ST-06 | Ownership check, delete | parent2 sends `DELETE /api/favorites/{parent1 favorite id}` | 404 NOT_FOUND, and parent1 still has the favorite | 404 `NOT_FOUND` "Favorite not found."; parent1 still has favorite `47681617-…` | Pass | `evidence/ST-06.txt` |
| ST-07 | Ownership check, update | parent2 sends `PATCH /api/alerts/{parent1 alert id}` | 404 NOT_FOUND | 404 `NOT_FOUND` "Alert not found."; parent1 alert `e7f48ff1-…` still `isRead:false` | Pass | `evidence/ST-07.txt` |
| ST-08 | Bad queue message | send `{"type":"unknown","message":"x"}` to the alerts queue | dropped and logged, no alert created | Lambda log: "dropped a bad message. type must be one of …"; alerts 1 before, 1 after | Pass | `evidence/ST-08.txt` |
| ST-09 | Repeated route event (queue test) | send `infra/events/route-cancelled.json` to the queue twice with SendMessage, no SNS wrapper | alerts created once only, and parent1 sees it | 1st delivery: 1 cancel alert, 1 `ProcessedEvents` item. 2nd: "route event 4444… was already handled, skipped"; cancel alerts stay 1, items stay 1. `GET /api/alerts` for parent1 shows "Route R1: the morning trip on 2026-11-24 is cancelled. Reason: Bus in the garage" | Pass | `evidence/ST-09.txt` |
| ST-10 | Secret exposure review | Lambda settings, the secret, git history, CloudWatch logs | no keys, no tokens, no passwords anywhere | Lambda env: NODE_ENV, SECRET_ID, CORS_ORIGINS, AWS_ENDPOINT_URL, no secret values. Secret holds only CALENDARIFIC_API_KEY and RATE_LIMIT_MAX, encrypted with my KMS key. Git history: 0 real DB URLs, 0 AWS keys, 0 tokens, `.env` never committed. Logs: 38 events, 0 Bearer/Authorization, 0 tokens, 0 64-hex strings | Pass | `evidence/ST-10.txt` |
| ST-11 | Rate limiting | 80 requests to `GET /api/alerts` with the PARENT1 token, one after the other; then 80 more, each with a different fake `X-Forwarded-For` | 429 `RATE_LIMITED` with `Retry-After` after 60 requests in a minute, and a fake `X-Forwarded-For` does not help | Run 1: 60 × 200, 20 × 429; the next request got 429 with `retry-after: 43` and `RATE_LIMITED`. `/api/health` still 200. Run 2 (fake `X-Forwarded-For`): 60 × 200, 20 × 429 | Pass (app layer, one Lambda copy) | `evidence/ST-11.txt` |
| ST-12 | Security headers | `curl -i GET /api/health` | CSP, nosniff, DENY, no-referrer, no-store, no X-Powered-By | 200 with `content-security-policy`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `cache-control: no-store`; no `X-Powered-By` | Pass | `evidence/ST-12.txt` |

**Result: 12 of 12 pass on Floci.**

**Note on ST-04.** On Neon this was a SQL injection test. DynamoDB has no SQL, so
the attack to try is NoSQL style: an operator object (`{"$ne": null}`) where a
plain id is expected, or a quote trick (`' OR 1=1`). `services/ids.js` only
accepts strings of letters, digits, `-`, `_` and `:`, and the services only ever put
values in `Key` and `ExpressionAttributeValues`, never in the expression text.

**Note on ST-11.** Floci stores the API Gateway throttle (rate 10, burst 20) but
does not enforce it, so the 429 comes from `middleware/rateLimit.js`. The count is
kept per Lambda copy: requests sent in parallel can be spread over several copies
(seen in the Neon run on 24 Nov). On real AWS the API Gateway throttle is the
shared limit, and that part still has to be checked on real AWS.

## DynamoDB tables and encryption

`evidence/dynamodb-tables.txt` lists the 10 tables with their keys and indexes
(same as Ahmed's design), and shows that my 4 tables (`Favorites`, `Alerts`,
`Holidays`, `ProcessedEvents`) are encrypted with my KMS key
`alias/favorites-alerts`, rotation on. The shared tables use the default
AWS-owned encryption.

## Suspicious activity in the logs

30 requests with no token are sent on purpose, then the log is searched for the
lines `middleware/logger.js` writes:

```
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name /aws/lambda/favorites-alerts-api \
  --filter-pattern "SECURITY"
```

`infra/deploy.sh` turns the same pattern into the CloudWatch metric
`SchoolBus/FavoritesAlerts / favorites-alerts-security-denied`, and the alarm
`favorites-alerts-security-denied-alarm` goes to ALARM on 5 or more in 5 minutes.
It has no SNS action any more: the state is read in CloudWatch.

Result of the run (2026-11-26, 21:41 UTC, `evidence/suspicious-activity.txt`):

- 30 requests with no token: 30 × 401.
- `filter-log-events --filter-pattern SECURITY` from the start of the run: 30 lines, each `SECURITY denied GET /api/favorites status=401 reason=UNAUTHENTICATED user=anonymous`.
- Metric filter `favorites-alerts-security-denied` is in place. The metric had Sum = 50 in the 5-minute period of the run (the 30 requests plus the 429s from the end of ST-11).
- Alarm `favorites-alerts-security-denied-alarm`: state **ALARM** (threshold 5). `favorites-alerts-lambda-errors` and `favorites-alerts-dlq-not-empty`: OK. None of the 3 has an action.

## Tests that run without AWS

`npm test` runs 89 unit tests against an in-memory fake of DynamoDB. The
security ones are in `tests/auth.test.js` (9), `tests/security.test.js` (6),
`tests/rateLimit.test.js` (7), `tests/routeEvents.test.js` (9), the ownership,
duplicate and NoSQL tests in `tests/favorites.test.js`,
`tests/favoritesService.test.js` and `tests/alertsService.test.js`. They prove
the code refuses what it should; the table above proves the deployed service does.
