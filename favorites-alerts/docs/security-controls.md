# Security controls in the Favorites & Alerts service

Owner: Ali (246090), service 3 of the School Bus Route Tracker, Team 14.
Every control below is in the code and runs on Floci, not only described.

## 1. Controls and where they are enforced

| # | Control | Where it is enforced | What it stops |
|---|---|---|---|
| 1 | Session check (`requireAuth`) | `middleware/auth.js`, on every route except `/api/health` | A request with no token, an unknown token or an expired session gets 401 and never reaches the database |
| 2 | Token stored as a hash | `hashToken()` (SHA-256) before the `sessions` lookup | Someone who reads the database still cannot log in: the raw token is never stored |
| 3 | Same answer for unknown and expired tokens | `requireAuth` | An attacker cannot tell which tokens exist by comparing the replies |
| 4 | Role check (`requireRole`) | `routes/favorites.js`, parent-only routes | An admin session, or any other role, is refused with 403 in the backend, not by hiding a button |
| 5 | Ownership check | `services/favorites.js` and `services/alerts.js`: every query filters by `user_id = req.user.id` | Changing the `:id` in the URL returns 404, so a parent cannot read or delete another parent's favorite or alert |
| 6 | Input validation | `controllers/favorites.js`: UUID pattern, `Content-Type`, JSON object, `unread` true/false, `year` 2000 to 2100 | Bad or oversized input is refused with 400 or 415 before any SQL runs |
| 7 | Parameterised SQL only | all of `services/` (`@neondatabase/serverless` tagged templates) | SQL injection: values are always sent as parameters, never joined into the query text |
| 8 | No secrets in code or repo | `.env` is gitignored and absent from the whole commit history; values live in Secrets Manager (`favorites-alerts/app`), encrypted with our own KMS key `alias/favorites-alerts`, rotated yearly | A leaked repository leaks nothing. The Lambda settings hold only `SECRET_ID`, `CORS_ORIGINS`, `NODE_ENV` |
| 9 | Least-privilege IAM role | `infra/iam/favorites-alerts-policy.json` | The function may read only its own secret, its own queue and its own log group |
| 10 | Rate limiting, two layers | 1. API Gateway stage throttling, 10 req/s with a burst of 20 (`infra/deploy.sh`). 2. `middleware/rateLimit.js`: 60 requests per minute per source IP (`RATE_LIMIT_MAX` in the secret), on every route except `/api/health`, answering 429 `RATE_LIMITED` with `Retry-After` | Guessing tokens or scraping is refused with 429. The client is keyed on the API Gateway source IP, never on `X-Forwarded-For`, so a faked header does not reset the count. Each Lambda copy keeps its own count, so the app limit is per copy; the API Gateway throttle is the shared limit on real AWS |
| 11 | Security response headers | `middleware/securityHeaders.js` | No sniffing, no framing, no referrer leak, no caching of a parent's data, and no Express version advertised |
| 12 | Security logging | `middleware/logger.js` writes a `SECURITY denied ...` line for 401, 403, 404, 409, 415, 429 and 5xx | Every refusal is recorded with who was refused and why. No password, token or request body is ever logged |
| 13 | Monitoring | CloudWatch Logs plus alarms on Lambda errors and on the dead-letter queue | A broken deploy or a flood of failures is noticed instead of being silent |

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
| `DELETE /api/favorites/{id}` | yes, own only | 403 | 403 | `requireRole('parent')` + `WHERE user_id = session user` |
| `GET /api/alerts` | yes, own only | 403 | 403 | `requireRole('parent')` |
| `PATCH /api/alerts/{id}` | yes, own only | 403 | 403 | `requireRole('parent')` + `WHERE user_id = session user` |
| `GET /api/holidays` | yes | yes | yes | `requireAuth` only: the school calendar is not private |
| `GET /api/health` | open | open | open | no check: it must answer before anyone logs in |

A parent never passes a user id in a request. The id always comes from the
session, so changing an id in the URL reaches nothing: the row is simply not
found and the answer is 404, not 403, which also avoids telling the caller that
someone else's record exists.

## 2. Security tests

The brief asks for at least 8 documented security tests. These run with `npm test`.

| # | Test | File | Expected |
|---|---|---|---|
| 1 | No token at all | `tests/auth.test.js` | 401, and the database is never queried |
| 2 | Token too short to be real | `tests/auth.test.js` | 401, rejected before the database |
| 3 | Unknown token | `tests/auth.test.js` | 401 |
| 4 | Expired session | `tests/auth.test.js` | 401, same message as unknown |
| 5 | Valid parent session | `tests/auth.test.js` | 200, `req.user` is set from the session |
| 6 | Admin calling a parent-only route | `tests/auth.test.js` | 403 (unauthorized role) |
| 7 | The lookup uses the hash, never the raw token | `tests/auth.test.js` | the query parameters contain the hash only |
| 8 | Another parent's favorite or alert by id | `tests/favorites.test.js` | 404 (ownership check) |
| 9 | Invalid input: bad UUID, wrong `Content-Type`, bad `unread`, bad `year` | `tests/favorites.test.js` | 400 or 415 |
| 10 | Response headers present, no `X-Powered-By` | `tests/security.test.js` | all headers set |
| 11 | A refusal is logged with the reason and the user | `tests/security.test.js` | one `SECURITY denied` line |
| 12 | The log never contains the token | `tests/security.test.js` | the token string is absent from every line |
| 13 | A malformed route event from the topic | `tests/routeEvents.test.js` | dropped and logged, no alert created |
| 14 | The same route event delivered twice | `tests/routeEvents.test.js` | the second delivery creates nothing (idempotency key) |

Two more are run by hand on Floci and captured in `evidence/`: a flood of
requests answered with 429, and the `SECURITY denied` lines found in CloudWatch Logs.

## 3. Shared responsibility

| AWS does | We do |
|---|---|
| Runs and patches the Lambda, API Gateway and SQS infrastructure | Write the application code and its access rules |
| Encrypts the secret at rest with KMS and performs the key rotation | Decide what is a secret, who may read it, and rotate it |
| Keeps the services available and isolated between accounts | Configure IAM least privilege, the throttling limits and the alarms |

Why a wide admin role is wrong: one leaked key would then reach every function,
secret and queue in the account. With the role in `infra/iam/`, the worst a leak
gives an attacker is this one function's own secret and queue.

## 4. Limitations

- Floci serves the API over plain `http`, so `Strict-Transport-Security` is only
  sent when a request arrives over HTTPS, and traffic to the API is not encrypted
  on a local Floci run. The database connection is separate and does use TLS,
  because Neon requires it. On real AWS, API Gateway terminates HTTPS and the
  header is sent on every response.
- Login itself lives in Ahmed's service. This service only verifies the session
  token, so password policy and lockout are outside its scope.
- The API Gateway throttle is per stage, not per user: it protects the service, but
  a single parent can still use the whole allowance. The app layer is per source IP,
  but it is kept in memory, so each Lambda copy counts on its own (a client spread
  over three warm copies could get up to three times the limit) and a cold start
  begins with an empty count. Floci stores the stage throttle but does not enforce
  it, so on Floci the 429 comes only from the app layer.

## 5. What is proved where

`npm test` proves the code refuses what it should, with a fake database.
`docs/security-tests.md` proves the deployed service on Floci does the same, and
its Actual and Pass columns stay empty until each test has really been run.
