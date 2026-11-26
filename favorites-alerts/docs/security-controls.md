# Security controls in the Favorites & Alerts service

Owner: Ali (246090), service 3 of the School Bus Route Tracker, Team 14.
Every control below is in the code and runs on Floci, not only described.

The service runs on 7 AWS services: Lambda, API Gateway (HTTP API), DynamoDB,
SQS (main queue + DLQ), CloudWatch, Secrets Manager and KMS, with a
least-privilege IAM role. EventBridge and SNS were removed (see README).

The threats these controls answer are in [threat-model.md](threat-model.md) (STRIDE, 10 threats).

## 1. Controls and where they are enforced

| # | Control | Where it is enforced | What it stops |
|---|---|---|---|
| 1 | Session check (`requireAuth`) | `middleware/auth.js`, on every route except `/api/health`: GetItem on `Sessions` by the token hash, then GetItem on `Users` | A request with no token, an unknown token or an expired session (`expires_at` in Unix seconds) gets 401 and never reaches the service code |
| 2 | Token stored as a hash | `hashToken()` (SHA-256). In Ahmed's `Sessions` table the item id is this hash | Someone who reads the database still cannot log in: the raw token is never stored |
| 3 | Same answer for unknown and expired tokens | `requireAuth` | An attacker cannot tell which tokens exist by comparing the replies |
| 4 | Role check (`requireRole`) | `routes/favorites.js`, parent-only routes | An admin session, or any other role, is refused with 403 in the backend, not by hiding a button |
| 5 | Ownership check | `services/favorites.js` and `services/alerts.js`: lists use `user-id-index` with the session user; delete and update use `ConditionExpression: user_id = :user` | Changing the `:id` in the URL returns 404, so a parent cannot read, delete or change another parent's favorite or alert. The check and the write are one DynamoDB request |
| 6 | Input validation | `controllers/favorites.js` and `services/ids.js`: ids must be strings of letters, digits, `-`, `_` and `:` (1 to 200; `:` is in the alert ids Ahmed's worker makes), `Content-Type`, JSON object, `unread` true/false, `year` 2000 to 2100 | Bad or oversized input is refused with 400 or 415 before DynamoDB is called |
| 7 | No NoSQL injection | all of `services/`: values go only in `Key` and `ExpressionAttributeValues`, never into the expression text; ids must be plain strings | An operator object such as `{"$ne": null}` or text such as `' OR 1=1` is refused with 400 (ST-04) and can never change what a query matches |
| 8 | No secrets in code or repo | `.env` is gitignored and absent from the whole commit history. The Calendarific key and the rate limit live in Secrets Manager (`favorites-alerts/app`), encrypted with our own KMS key `alias/favorites-alerts`, rotated yearly. DynamoDB needs no password: the IAM role gives access | A leaked repository leaks nothing. The Lambda settings hold only `SECRET_ID`, `CORS_ORIGINS`, `NODE_ENV` and, on Floci, `AWS_ENDPOINT_URL` |
| 9 | Least-privilege IAM role | `infra/iam/favorites-alerts-policy.json` | Write actions only on my 4 tables (`Favorites`, `Alerts`, `Holidays`, `ProcessedEvents`) and their indexes. Read only (GetItem, Query, Scan) on `Users`, `Sessions`, `Routes`, `Stops`, `Trips`, `TripStops`. Receive and delete on my queue, read my secret, decrypt with my key, write my own log group. No events, no SNS, nothing else |
| 10 | Rate limiting, two layers | 1. API Gateway stage throttling, 10 req/s with a burst of 20 (`infra/deploy.sh`). 2. `middleware/rateLimit.js`: 60 requests per minute per source IP (`RATE_LIMIT_MAX` in the secret), on every route except `/api/health`, answering 429 `RATE_LIMITED` with `Retry-After` | Guessing tokens or scraping is refused with 429. The client is keyed on the API Gateway source IP, never on `X-Forwarded-For`, so a faked header does not reset the count. Each Lambda copy keeps its own count, so the app limit is per copy; the API Gateway throttle is the shared limit on real AWS |
| 11 | Security response headers | `middleware/securityHeaders.js` | No sniffing, no framing, no referrer leak, no caching of a parent's data, and no Express version advertised |
| 12 | Security logging | `middleware/logger.js` writes a `SECURITY denied ...` line for 401, 403, 404, 409, 415, 429 and 5xx | Every refusal is recorded with who was refused and why. No password, token or request body is ever logged |
| 13 | Monitoring | CloudWatch Logs, the metric filter `favorites-alerts-security-denied`, and 3 alarms: Lambda errors, dead-letter queue not empty, 5 or more refusals in 5 minutes. The alarms have no SNS action; their state shows in CloudWatch | A broken deploy, a flood of failures or someone trying tokens is noticed instead of being silent |
| 14 | Encryption at rest with my key | `scripts/create-tables.js` turns on SSE with `alias/favorites-alerts` for my 4 tables (Floci accepted it and `describe-table` shows the key) | The data in my tables is encrypted with a key we control and rotate |
| 15 | Idempotent event handling | `services/processedEvents.js`: PutItem with `attribute_not_exists(event_id)` | A repeated route event creates its alerts only once (ST-09) |

## 1b. Role and permission matrix

The app has three roles. Supervisor belongs to Ahmed's service, where it marks
attendance; in this service it is a logged-in user with no parent data of its
own. Every line below is enforced in `routes/favorites.js` by `requireRole`,
after `requireAuth` has found the session. Nothing here relies on the frontend.

| Action | parent | supervisor | admin | Enforced where |
|---|---|---|---|---|
| `GET /api/favorites` (own saved stops) | yes | 403 | 403 | `requireRole('parent')` |
| `GET /api/favorites/options` | yes | 403 | 403 | `requireRole('parent')` |
| `POST /api/favorites` | yes, own only | 403 | 403 | `requireRole('parent')` + `user_id` from the session |
| `DELETE /api/favorites/{id}` | yes, own only | 403 | 403 | `requireRole('parent')` + `ConditionExpression: user_id = session user` |
| `GET /api/alerts` | yes, own only | 403 | 403 | `requireRole('parent')` + `user-id-index` |
| `PATCH /api/alerts/{id}` | yes, own only | 403 | 403 | `requireRole('parent')` + `ConditionExpression: user_id = session user` |
| `GET /api/holidays` | yes | yes | yes | `requireAuth` only: the school calendar is not private |
| `GET /api/health` | open | open | open | no check: it must answer before anyone logs in |

A parent never passes a user id in a request. The id always comes from the
session, so changing an id in the URL reaches nothing: the condition fails and
the answer is 404, not 403, which also avoids telling the caller that someone
else's record exists.

## 2. Security tests

The brief asks for at least 8 documented security tests. These run with `npm test`
against an in-memory fake of DynamoDB (`tests/helpers/fakeDynamo.js`).

| # | Test | File | Expected |
|---|---|---|---|
| 1 | No token at all | `tests/auth.test.js` | 401, and DynamoDB is never called |
| 2 | Token too short to be real | `tests/auth.test.js` | 401, rejected before DynamoDB |
| 3 | Unknown token | `tests/auth.test.js` | 401 |
| 4 | Expired session | `tests/auth.test.js` | 401, exactly the same answer as an unknown token |
| 5 | Valid parent session | `tests/auth.test.js` | 200, `req.user` is set from `Users` |
| 6 | Admin calling a parent-only route | `tests/auth.test.js` | 403 (unauthorized role) |
| 7 | The lookup uses the hash, never the raw token | `tests/auth.test.js` | the GetItem key is the hash only |
| 8 | Another parent's favorite or alert by id | `tests/favorites.test.js`, `tests/favoritesService.test.js`, `tests/alertsService.test.js` | 404, and the item is not deleted or changed |
| 9 | Invalid input and NoSQL injection: `{"$ne": null}`, `' OR 1=1`, wrong `Content-Type`, bad `unread`, bad `year` | `tests/favorites.test.js` | 400 or 415, the service is never called |
| 10 | Duplicate favorite | `tests/favoritesService.test.js` | refused, nothing new saved |
| 11 | Response headers present, no `X-Powered-By` | `tests/security.test.js` | all headers set |
| 12 | A refusal is logged with the reason and the user | `tests/security.test.js` | one `SECURITY denied` line |
| 13 | The log never contains the token | `tests/security.test.js` | the token string is absent from every line |
| 14 | A malformed route event from the queue | `tests/routeEvents.test.js` | dropped and logged, no alert created |
| 15 | The same route event (same `event_id`) delivered twice | `tests/routeEvents.test.js`, `tests/alertsService.test.js` | the duplicate is refused and creates nothing |
| 16 | Rate limit: request 61 in a minute, fake `X-Forwarded-For` | `tests/rateLimit.test.js` | 429 with `Retry-After`; the fake header does not reset the count |

The same scenarios are run by hand on the deployed API on Floci: see
`docs/security-tests.md` and `evidence/ST-01.txt` to `evidence/ST-12.txt`.

## 3. Shared responsibility

| AWS does | We do |
|---|---|
| Runs and patches the Lambda, API Gateway, DynamoDB and SQS infrastructure | Write the application code and its access rules |
| Encrypts the secret and the tables at rest with KMS and performs the key rotation | Decide what is a secret, who may read it, and rotate it |
| Keeps the services available and isolated between accounts | Configure IAM least privilege, the throttling limits and the alarms |

Why a wide admin role is wrong: one leaked key would then reach every function,
table, secret and queue in the account. With the role in `infra/iam/`, the worst
a leak gives an attacker is write access to this service's own 4 tables and read
access to the shared ones.

## 4. Limitations

- Floci serves the API over plain `http`, so `Strict-Transport-Security` is only
  sent when a request arrives over HTTPS, and traffic to the API is not encrypted
  on a local Floci run. On real AWS, API Gateway terminates HTTPS, the header is
  sent on every response, and the SDK talks to DynamoDB over HTTPS.
- Login itself lives in Ahmed's service. This service only verifies the session
  token, so password policy and lockout are outside its scope.
- The API Gateway throttle is per stage, not per user: it protects the service, but
  a single parent can still use the whole allowance. The app layer is per source IP,
  but it is kept in memory, so each Lambda copy counts on its own (a client spread
  over three warm copies could get up to three times the limit) and a cold start
  begins with an empty count. Floci stores the stage throttle but does not enforce
  it, so on Floci the 429 comes only from the app layer.
- `createAlertsForRoute` scans the whole `Favorites` table with a filter on
  `route_id`. That is fine for our small data; with many thousands of rows a
  route-id index on `Favorites` would be the right fix.
- The read-only permissions cover whole shared tables (for example every row of
  `Users`), because DynamoDB IAM cannot limit a Scan to some rows without
  fine-grained conditions. The code only ever reads the session's own user.

## 5. What is proved where

`npm test` proves the code refuses what it should, with a fake database.
`docs/security-tests.md` proves the deployed service on Floci does the same, and
its Actual and Pass columns are filled in only from a real run.
