# school-bus-favorites-alerts

School Bus Route Tracker, Team 14 (Lab Group A-2), 26CSCN29H.

**Service:** Favorites & Alerts
**Owner:** Ali Mohsen (246090)
**Local port:** 3003

This repo holds one backend service only. It covers: favorites (My stops), alerts, holidays.

## The whole project

| Repo | What it holds | Owner |
|---|---|---|
| `school-bus-frontend` | React app (all pages) | Whole team |
| `school-bus-route-stop` | Route & Stop API | Yehia |
| `school-bus-schedule-arrival` | Schedule & Arrival API + Signup / Login | Ahmed |
| `school-bus-favorites-alerts` | Favorites & Alerts API | Ali |

## Why DynamoDB

The team uses **one database for all three services: DynamoDB**. Before, each
service talked to Neon (Postgres) over the internet. Now every table lives in
the same AWS account (Floci on our PCs), so:

- one place for all data, with the same table design for everyone (Ahmed's design),
- no database password: access comes from each Lambda's IAM role,
- each service writes only its own tables and reads the others.

The old Neon version is kept in the git tag `neon-version`, and its evidence is in
`evidence/neon-version/`.

## Tables

All keys are strings. Billing is PAY_PER_REQUEST. Same schema as Ahmed's
`scripts/provision/dynamodb.js`.

| Table | Key | Index | This service |
|---|---|---|---|
| `Favorites` | `id` | `user-id-index` (user_id) | reads and writes |
| `Alerts` | `id` | `user-id-index` (user_id) | reads and writes |
| `Holidays` | `id` (`holiday-eg-<date>` for the Calendarific cache, a UUID for admin holidays from Ahmed) | `date-index`, `year-index` | reads and writes the Calendarific cache. A year is fetched from Calendarific until it has `holiday-eg-` items; admin holidays never block it. The API shows both kinds, one per date (the admin one wins) |
| `ProcessedEvents` | `event_id` | | reads and writes (mine only) |
| `Users` | `id` | `email-index` | reads |
| `Sessions` | `id` (= SHA-256 of the token) | `token-hash-index` | reads |
| `Routes` | `id` | `name-index`, `area-index` | reads |
| `Stops` | `id` | `route-id-index` | reads |
| `Trips` | `id` | `route-id-index` | reads |
| `TripStops` | `trip_id` + `stop_id` | | reads (`arrive_from`, `arrive_to`) |

## The 7 AWS services

| Service | What it does here |
|---|---|
| Lambda | Runs the Express API (and the queue consumer) only when something comes in |
| API Gateway (HTTP API) | The one web address. Only our routes reach Lambda. Throttling 10 req/s, burst 20 |
| DynamoDB | The team database (tables above) |
| SQS + dead-letter queue | Yehia and Ahmed send alert messages here. A message that fails 3 times moves to the DLQ |
| CloudWatch | Logs, a metric filter that counts SECURITY lines, and 3 alarms |
| Secrets Manager | Holds the Calendarific key and the rate limit, not in code or Lambda settings |
| KMS | Our own key `alias/favorites-alerts` (rotated every year) encrypts the secret and my 4 tables |

IAM gives the Lambda a least-privilege role (`infra/iam/favorites-alerts-policy.json`).

**Removed: EventBridge and SNS.** The daily EventBridge job sent the "tomorrow is a
holiday" alert. The same alert is now made when the parent opens My stops or Alerts
(`ensureTomorrowHolidayAlert`), so the scheduled job was extra work. SNS was used for
the alarm emails and to forward Yehia's events. Yehia now sends straight to my SQS
queue, and the alarms show their state in CloudWatch without an SNS action. Fewer
services means less to secure and to explain.

## Folders

```
server.js      starts this service on your PC
lambda.js      runs it on Lambda: HTTP requests and SQS messages
routes/        URLs and which role can call them
controllers/   checks the request (400 / 415) and calls the service
services/      all DynamoDB calls live here
middleware/    logger, auth (requireAuth, requireRole), rate limit, security headers
db/            dynamo.js (one DynamoDB client), tables.js, pages.js
scripts/       tables, test data and test logins for Floci
infra/         deploy.sh, IAM policy, sample events
```

## Run on Floci (Lab 7)

```
docker compose -f infra/floci/docker-compose.yml up -d
export AWS_PROFILE=floci
cp .env.example .env              # then put the Calendarific key inside
npm install
bash infra/deploy.sh              # builds everything and prints the API address
node scripts/seed-floci.js        # test routes, stops and trips (only if Routes is empty)
node scripts/make-test-sessions.js   # 4 test logins, tokens go to ../test-tokens.txt
```

Open `<address>/api/health`: you must see `"runtime":"lambda"`.

If Floci restarts, everything on it is gone: run the three commands again.
Run `bash infra/deploy.sh` after every code change; it updates the same function.
`node scripts/cleanup-test-data.js` deletes only the items the two scripts made.

To run the API on your PC instead: `npm run dev` (it uses `AWS_ENDPOINT_URL` from `.env`).

## Tests

```
npm test
```

The Jest tests use an in-memory fake of DynamoDB (`tests/helpers/fakeDynamo.js`),
so no real database is needed. Security tests on the deployed API:
[docs/security-tests.md](docs/security-tests.md). Threats and their controls:
[docs/threat-model.md](docs/threat-model.md).

## Where the secrets live

| Place | What it holds |
|---|---|
| `.env` on your PC | The real values. Never pushed to GitHub. |
| Secrets Manager, `favorites-alerts/app` | `CALENDARIFIC_API_KEY` and `RATE_LIMIT_MAX`, encrypted with `alias/favorites-alerts`. Only this Lambda's role may read and decrypt it. |
| Lambda settings | `SECRET_ID`, `CORS_ORIGINS`, `NODE_ENV`, and on Floci `AWS_ENDPOINT_URL`. No passwords. |
| `../test-tokens.txt` | Test login tokens. Outside the repo, never committed. |

## Alerts from other services

Yehia and Ahmed send one message to `favorites-alerts-queue` with `sqs:SendMessage`.
See [docs/alerts-queue.md](docs/alerts-queue.md).

## Git rules

- Never commit `.env` or a token. Only `.env.example` is pushed.
- Small commits with clear messages.
