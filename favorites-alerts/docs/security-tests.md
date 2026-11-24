# Security tests: Favorites & Alerts

Owner: Ali (246090). Team 14, 26CSCN29H.

Every test below is run against the deployed API on Floci, through the API
Gateway address, with the test tokens kept outside the repository. The request
and the answer of each run are saved in `evidence/ST-xx.txt`, with the tokens
replaced by placeholders.

The `Actual` and `Pass` columns are filled in only from a real run. Empty means
not run yet.

Address used: `http://22b92e5059.execute-api.localhost.floci.io:4566` (Floci, Docker Desktop, Windows 11)
Date of the run: 2026-11-24, 02:34 to 02:41 UTC

| ID | Scenario | Request | Expected | Actual | Pass | Evidence |
|---|---|---|---|---|---|---|
| ST-01 | No token (unauthenticated access) | `GET /api/favorites` with no Authorization header | 401 UNAUTHENTICATED | 401 `UNAUTHENTICATED` "Please log in." | Pass | `evidence/ST-01.txt` |
| ST-02 | Made-up token | `GET /api/favorites` with a random 64-character token | 401 UNAUTHENTICATED | 401 `UNAUTHENTICATED` (no session matches the token hash) | Pass | `evidence/ST-02.txt` |
| ST-03 | Wrong role (unauthorized role) | `GET /api/favorites` with the admin token | 403 FORBIDDEN | 403 `FORBIDDEN` | Pass | `evidence/ST-03.txt` |
| ST-04 | Invalid input | `POST /api/favorites` with `{"routeId":"abc"}` | 400 VALIDATION_ERROR | 400 `VALIDATION_ERROR` "routeId and stopId must be valid UUIDs." | Pass | `evidence/ST-04.txt` |
| ST-05 | Wrong content type | `POST /api/favorites` with `Content-Type: text/plain` | 415 UNSUPPORTED_MEDIA_TYPE | 415 `UNSUPPORTED_MEDIA_TYPE` | Pass | `evidence/ST-05.txt` |
| ST-06 | Ownership check, delete | parent2 sends `DELETE /api/favorites/{parent1 favorite id}` | 404 NOT_FOUND, and parent1 still has the favorite | 404 `NOT_FOUND` "Favorite not found."; parent1 still has favorite `e97e177e-…` | Pass | `evidence/ST-06.txt` |
| ST-07 | Ownership check, update | parent2 sends `PATCH /api/alerts/{parent1 alert id}` | 404 NOT_FOUND | 404 `NOT_FOUND` "Alert not found."; parent1 alert `747fc412-…` still `isRead:false` | Pass | `evidence/ST-07.txt` |
| ST-08 | Bad queue message | send `{"type":"unknown","message":"x"}` to the alerts queue | dropped and logged, no alert created | Lambda log: "dropped a bad message. type must be one of …"; alerts 1 → 1 | Pass | `evidence/ST-08.txt` |
| ST-09 | Repeated route event | send `infra/events/route-cancelled.json` to the queue twice | alerts created once only | 1st delivery: 1 alert, 1 `processed_events` row. 2nd: "route event 4444… was already handled, skipped"; alerts stay 2, rows stay 1 | Pass | `evidence/ST-09.txt` |
| ST-10 | Secret exposure review | Lambda settings, git history, CloudWatch logs | no DATABASE_URL, no keys, no tokens anywhere | Lambda env: NODE_ENV, SECRET_ID, CORS_ORIGINS only, no DATABASE_URL. Git history: 0 real DB URLs (only the `user:password@host` placeholder in `.env.example`), 0 AWS keys, 0 tokens, `.env` never committed. Logs: 88 events, 0 DB URLs, 0 Bearer/Authorization, 0 tokens, 0 64-hex strings | Pass | `evidence/ST-10.txt` |
| ST-11 | Rate limiting | 80 requests to `GET /api/alerts` with the PARENT1 token, one after the other; then 80 more, each with a different fake `X-Forwarded-For` | 429 `RATE_LIMITED` with `Retry-After` after 60 requests in a minute, and a fake `X-Forwarded-For` does not help | Run 1: 60 × 200, 20 × 429; the next request got 429 with `retry-after: 6` and `RATE_LIMITED`. Run 2 (fake `X-Forwarded-For`): 60 × 200, 20 × 429. `/api/health` still 200. 41 `reason=RATE_LIMITED` SECURITY lines in CloudWatch. With 8 requests in parallel there was no 429, because Floci spread them over several Lambda copies (see note) | Pass (app layer, one Lambda copy) | `evidence/ST-11.txt` |
| ST-12 | Security headers | `curl -i GET /api/health` | CSP, nosniff, DENY, no-referrer, no-store, no X-Powered-By | 200 with `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `cache-control: no-store`, HSTS; no `X-Powered-By` | Pass | `evidence/ST-12.txt` |

**Result: 12 of 12 pass on Floci.** ST-11 passes through the app-level limit; the API Gateway throttle itself is still not enforced by Floci.

**Note on ST-11.** The first run (24 Nov, 02:38 UTC) failed: the API Gateway stage stores rate 10 and burst 20, but Floci does not enforce it, and 200 requests at about 23 per second all got 200. `middleware/rateLimit.js` was then added as a second layer: 60 requests per minute per source IP, keyed on the API Gateway `sourceIp` and never on `X-Forwarded-For`. The rerun (24 Nov, 18:00 to 18:06 UTC) is in `evidence/ST-11.txt`. Sent one after the other, the requests reach one warm Lambda copy and request 61 onward gets 429, with or without a fake `X-Forwarded-For`. Sent 8 in parallel, Floci started several copies (4 `favorites-alerts-api` containers were running right after), each copy counted only its share, and all 80 got 200. That is the known limit of an in-memory counter: it is per Lambda copy. On real AWS the API Gateway throttle is the shared limit across all copies, and that part still has to be checked on real AWS.

**Bug found and fixed while running ST-04 and ST-07.** The first run of ST-07 returned 400 instead of 404, and a POST with two valid UUIDs was also refused. serverless-http 3 hands Express the raw body as a Buffer, and Express 5's `express.json()` leaves a body that is already set alone, so every POST and PATCH through Lambda failed validation (the unit tests use supertest, which never goes through Lambda). `lambda.js` now parses JSON bodies before Express sees them (`parseJsonBody`, covered by a new test in `tests/lambda.test.js`). All results in the table are from the run after the fix.

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
`favorites-alerts-security-denied-alarm` fires on 5 or more in 5 minutes and
sends to the SNS topic `favorites-alerts-ops`.

Result of the run (2026-11-24, `evidence/suspicious-activity.txt`):

- 30 requests with no token: 30 × 401.
- `filter-log-events --filter-pattern SECURITY` from the start of the run: 30 lines, each `SECURITY denied GET /api/favorites status=401 reason=UNAUTHENTICATED user=anonymous`.
- Metric filter `favorites-alerts-security-denied` is in place. The metric `SchoolBus/FavoritesAlerts / favorites-alerts-security-denied` had Sum = 43 in the 5-minute period of the run (the 30 requests plus the refused requests from ST-01 to ST-07).
- Alarm `favorites-alerts-security-denied-alarm`: state **ALARM** (threshold 5, `GreaterThanOrEqualToThreshold`, period 300 s), action `arn:aws:sns:us-east-1:000000000000:favorites-alerts-ops`.

## Tests that run without AWS

`npm test` runs 65 unit tests, of which these are the security ones:
`tests/auth.test.js` (7), `tests/security.test.js` (6), `tests/rateLimit.test.js` (7) and
`tests/routeEvents.test.js` (8), plus two role checks for supervisor in
`tests/favorites.test.js`. They use a fake database, so they prove the
code refuses what it should; the table above proves the deployed service does.
