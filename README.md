# school-bus-favorites-alerts

School Bus Route Tracker, Team 14 (Lab Group A-2), 26CSCN29H.

**Service:** Favorites & Alerts
**Owner:** Ali (246090)
**Local port:** 3003

This repo holds one backend service only. It covers: favorites (My stops), alerts, holidays.

## The whole project

| Repo | What it holds | Owner |
|---|---|---|
| `school-bus-frontend` | React app (all pages) | Whole team |
| `school-bus-route-stop` | Route & Stop API | Yehia |
| `school-bus-schedule-arrival` | Schedule & Arrival API + Signup / Login | Ahmed |
| `school-bus-favorites-alerts` | Favorites & Alerts API | Ali |

All three APIs use the same Neon database. Each service only writes to its own tables.
Login happens in `school-bus-schedule-arrival`. The other services check the same
session token with their own copy of `middleware/auth.js`.

## Folders

```
server.js      starts this service only
routes/        URLs and which role can call them
controllers/   checks the request (400) and calls the service
services/      all SQL lives here
middleware/    logger.js, auth.js (requireAuth, requireRole)
db/            index.js (Neon), schema.sql
```

## Run on your laptop

```
copy .env.example .env      (then put the real values inside)
npm install
npm run dev
```

Check: open http://localhost:3003/api/health

## Database setup (only once, in the Neon SQL Editor)

Run the files in this order:
1. `school-bus-schedule-arrival/db/auth-schema.sql`
2. `school-bus-route-stop/db/schema.sql`
3. `school-bus-schedule-arrival/db/schema.sql`
4. `school-bus-favorites-alerts/db/schema.sql`

## Git rules

- Work on a branch, open a pull request, merge after checking it.
- **Never** commit `.env`. Only `.env.example` is pushed.

## Deploy (Lab 5)

One Vercel project for this repo. Add the values from `.env.example` in the Vercel dashboard.
Put the frontend's Vercel link in `CORS_ORIGINS`.

## Deploy to AWS on Floci (Lab 7)

Floci is a free copy of AWS on your laptop. One script builds everything:
IAM role and policy, the Lambda function, and the API Gateway in front of it.

```
docker compose -f infra/floci/docker-compose.yml up -d
export AWS_PROFILE=floci
bash infra/deploy.sh
```

The script prints your API address, for example `http://abc123.execute-api.localhost.floci.io:4566`.
Open `<address>/api/health`: you must see `"runtime":"lambda"`.

Run `bash infra/deploy.sh` again after every code change. It updates the same function.

| File | What it is |
|---|---|
| `app.js` | The Express app (no listen) |
| `server.js` | Runs the app on your PC |
| `lambda.js` | Runs the app on Lambda (serverless-http) |
| `infra/iam/trust-policy.json` | Only Lambda may use the role |
| `infra/iam/favorites-alerts-policy.json` | What the role may do (least privilege) |
| `infra/deploy.sh` | Builds everything on Floci or real AWS |
