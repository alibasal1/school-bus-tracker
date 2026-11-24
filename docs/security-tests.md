# Security tests, Favorites & Alerts service

Owner: Ali (246090). Team 14, 26CSCN29H.

Every test below is run against the deployed API on Floci, through the API
Gateway address, with the test tokens kept outside the repository. The request
and the answer of each run are saved in `evidence/ST-xx.txt`, with the tokens
replaced by placeholders.

The `Actual` and `Pass` columns are filled in only from a real run. Empty means
not run yet.

Address used: `__API_URL__`
Date of the run: `__DATE__`

| ID | Scenario | Request | Expected | Actual | Pass | Evidence |
|---|---|---|---|---|---|---|
| ST-01 | No token (unauthenticated access) | `GET /api/favorites` with no Authorization header | 401 UNAUTHENTICATED | | | `evidence/ST-01.txt` |
| ST-02 | Made-up token | `GET /api/favorites` with a random 64-character token | 401 UNAUTHENTICATED | | | `evidence/ST-02.txt` |
| ST-03 | Wrong role (unauthorized role) | `GET /api/favorites` with the admin token | 403 FORBIDDEN | | | `evidence/ST-03.txt` |
| ST-04 | Invalid input | `POST /api/favorites` with `{"routeId":"abc"}` | 400 VALIDATION_ERROR | | | `evidence/ST-04.txt` |
| ST-05 | Wrong content type | `POST /api/favorites` with `Content-Type: text/plain` | 415 UNSUPPORTED_MEDIA_TYPE | | | `evidence/ST-05.txt` |
| ST-06 | Ownership check, delete | parent2 sends `DELETE /api/favorites/{parent1 favorite id}` | 404 NOT_FOUND, and parent1 still has the favorite | | | `evidence/ST-06.txt` |
| ST-07 | Ownership check, update | parent2 sends `PATCH /api/alerts/{parent1 alert id}` | 404 NOT_FOUND | | | `evidence/ST-07.txt` |
| ST-08 | Bad queue message | send `{"type":"unknown","message":"x"}` to the alerts queue | dropped and logged, no alert created | | | `evidence/ST-08.txt` |
| ST-09 | Repeated route event | send `infra/events/route-cancelled.json` to the queue twice | alerts created once only | | | `evidence/ST-09.txt` |
| ST-10 | Secret exposure review | Lambda settings, git history, CloudWatch logs | no DATABASE_URL, no keys, no tokens anywhere | | | `evidence/ST-10.txt` |
| ST-11 | Rate limiting | 60 requests to `GET /api/health` as fast as possible | at least one 429 from API Gateway | | | `evidence/ST-11.txt` |
| ST-12 | Security headers | `curl -i GET /api/health` | CSP, nosniff, DENY, no-referrer, no-store, no X-Powered-By | | | `evidence/ST-12.txt` |

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

Result of the run: `__NOT RUN YET__`

## Tests that run without AWS

`npm test` runs 54 unit tests, of which these are the security ones:
`tests/auth.test.js` (7), `tests/security.test.js` (6) and
`tests/routeEvents.test.js` (8). They use a fake database, so they prove the
code refuses what it should; the table above proves the deployed service does.
