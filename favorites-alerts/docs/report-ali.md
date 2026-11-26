# Favorites & Alerts service (draft for the team report)

Ali Mohsen (246090). Team 14, 26CSCN29H.
Personal repo: https://github.com/alibasal1/school-bus-favorites-alerts

## 1. My service

My service helps parents follow the bus stops they care about. A parent saves a route
or one stop ("My stops") and sees the next bus time for it today. The service also
keeps the parent's alerts: boarding, drop-off, cancelled trips, trip changes and
"tomorrow is a holiday". It shows the upcoming Egyptian public holidays, read from
Calendarific and saved in DynamoDB.

## 2. Architecture

The service runs on 7 AWS services (on Floci on our PCs), with an IAM role.

| Service | Why I use it |
|---|---|
| Lambda | Runs the Express API and the queue consumer only when something comes in. |
| API Gateway (HTTP API) | The one web address. Only my routes reach Lambda. Throttle 10 req/s, burst 20. |
| DynamoDB | The one team database. My 4 tables, plus the shared tables I read. |
| SQS + dead-letter queue | Other services send alerts to my queue. A message that fails 3 times moves to the DLQ. |
| CloudWatch | Logs, a metric filter that counts refused requests, and 3 alarms. |
| Secrets Manager | Holds the Calendarific key and the rate limit, not in the code or the Lambda settings. |
| KMS | My own key `alias/favorites-alerts` (rotation on) encrypts the secret and my 4 tables. |

IAM gives the Lambda a least-privilege role (`infra/iam/favorites-alerts-policy.json`).
EventBridge and SNS were used before and were removed: the holiday alert is now made
when the parent opens the app, and Yehia sends straight to my queue.

One command builds everything: `bash infra/deploy.sh`.

## 3. API endpoints

| Method | Path | Role | What it does |
|---|---|---|---|
| GET | `/api/health` | none | Health check. Never rate limited. |
| GET | `/api/favorites` | parent | The parent's saved stops, with today's next bus time and trip status. |
| GET | `/api/favorites/options` | parent | Every route with its stops, for the Save a stop form. |
| POST | `/api/favorites` | parent | Save a route or one stop. 409 if it is saved already. |
| DELETE | `/api/favorites/{id}` | parent | Remove one of the parent's own saved stops. 404 for anyone else's. |
| GET | `/api/alerts` | parent | The parent's alerts, newest first. `?unread=true` gives only unread ones. |
| PATCH | `/api/alerts/{id}` | parent | Mark one of the parent's own alerts as read (`{"isRead": true}`). |
| GET | `/api/holidays` | any logged-in role | Public holidays for a year (`?year=`, 2000 to 2100). |

## 4. Database

All keys are strings. Billing is PAY_PER_REQUEST. The design is the same as Ahmed's.

My tables (read and write):

| Table | Key | Index |
|---|---|---|
| `Favorites` | `id` | `user-id-index` |
| `Alerts` | `id` | `user-id-index` |
| `Holidays` | `id` | `date-index`, `year-index` |
| `ProcessedEvents` | `event_id` | |

Shared tables (I only read them): `Users`, `Sessions`, `Routes`, `Stops`, `Trips`, `TripStops`.

## 5. Security controls

Full list: `docs/security-controls.md`. Threats: `docs/threat-model.md` (STRIDE, 10 threats).

- Session check with the SHA-256 hash of the token, same 401 for unknown and expired (T1).
- Role check: favorites and alerts are parent only (T2).
- Ownership check with a DynamoDB `ConditionExpression`, 404 for other parents' items (T3).
- Id validation against NoSQL injection (T4).
- Queue message checks, `event_id` idempotency in `ProcessedEvents`, and the DLQ (T5).
- Secrets in Secrets Manager with my KMS key, nothing in git or the Lambda settings (T6).
- Two rate limits: API Gateway throttle and 60 requests a minute per source IP (T7).
- Least-privilege IAM per table (T8).
- SECURITY log lines, a metric filter and alarms (T9).
- Security headers and 415 for a wrong content type (T10).

## 6. Testing

- **Jest:** 92 tests, all pass (`npm test`). DynamoDB is replaced by an in-memory fake
  (`tests/helpers/fakeDynamo.js`), so the real service code runs.
- **Security tests on Floci:** ST-01 to ST-12, 12 of 12 pass (`docs/security-tests.md`).
- **Load test (k6, Lab 8 stages):** see `docs/load-test.md`. Before (Neon): p95 21.22 s,
  0.00 % failed, 12.0 requests a second, 0 × 429.
  After (DynamoDB): p95 1.48 s, 0.00 % failed, 21.5 requests a second, 721 × 429.
  The p95 < 500 ms threshold failed in both runs; it was not changed.
- **Real account test:** a parent signed up and logged in with Ahmed's pages and his API,
  then used my My stops and Alerts with that session. All 7 steps passed
  (`evidence/real-account-test.txt`).

## 7. Logs and monitoring

- One line per request: method, path, status, time.
- One `SECURITY denied` line for each refused request (401, 403, 404, 409, 415, 429, 5xx)
  with the reason and the user. Never a token, password or body.
- Metric filter `favorites-alerts-security-denied` counts the SECURITY lines.
- 3 alarms: `favorites-alerts-lambda-errors`, `favorites-alerts-dlq-not-empty`,
  `favorites-alerts-security-denied-alarm` (5 or more in 5 minutes). They have no action;
  the state shows in CloudWatch.

## 8. Integration with the team

- **Ahmed (login):** his service writes `Users` and `Sessions`. My `middleware/auth.js`
  reads the same `Sessions` table, so his login token works in my service.
- **Yehia (route events):** he sends `trip.cancelled` and `trip.created` to my queue with
  `SendMessage`. He needs `sqs:SendMessage` on my queue ARN only. A repeated event creates
  nothing new (`event_id`).
- **Shared frontend:** my two pages (My stops, Alerts) use Ahmed's dark theme. They call
  my API with the same session token, because the shared gateway has no favorites routes.

## 9. Problems I hit and how I fixed them

1. **JSON body was a Buffer on Lambda.** Every POST and PATCH got 400 through Lambda.
   serverless-http gave Express the body as a Buffer. I parse it in `lambda.js`
   (`parseJsonBody`) and added a Jest test (commit `1ea6a5b`).
2. **Missing columns in Neon.** `GET /api/favorites/options` gave 500 because
   `routes.is_active` did not exist. I added a fallback for Postgres error 42703
   (commit `ae1d3d3`). This code went away with the DynamoDB move.
3. **Floci does not enforce the API Gateway throttle.** ST-11 first failed: 200 fast
   requests all got 200. I added an app-level rate limit per source IP
   (`middleware/rateLimit.js`, commit `ca05a87`).
4. **Git Bash path conversion.** Git Bash changes values that start with `/` into
   Windows paths. `infra/deploy.sh` sets `MSYS_NO_PATHCONV=1`. The same problem broke
   the frontend signup ("Failed to fetch") when the gateway path was set on the command line.
5. **Neon to DynamoDB.** The team moved to one database. I rewrote auth and all services
   for DynamoDB, rewrote the tests with a fake DynamoDB, and kept the old version in the
   git tag `neon-version` (commits `5267edd`, `2fafcee`).
6. **Ahmed's alert ids contain `:`.** My id check refused them, so Mark read on his alerts
   gave 400. I allowed `:` in `services/ids.js` and added a test (commit `ce6d558`).

## 10. Evidence

| Part | Files in `evidence/` |
|---|---|
| Security tests | `ST-01.txt` to `ST-12.txt` |
| Monitoring | `suspicious-activity.txt` |
| DynamoDB and KMS | `dynamodb-tables.txt` |
| Load test | `k6-dynamodb.txt` (after), `neon-version/k6-run.txt` and `neon-version/k6-run-pc.txt` (before) |
| Frontend (dark theme) | `frontend-theme-01` to `frontend-theme-18` (.png) |
| Real account test | `real-account-test.txt`, `frontend-real-01` to `frontend-real-05` (.png) |
| Neon version | everything in `neon-version/` |

## Individual Contribution Statement
(Ali writes this part himself.)
