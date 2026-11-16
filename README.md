# School Bus Route Tracker (Team 14, Lab Group A-2)

Cloud Computing and Cloud Security (26CSCN29H).

The backend is split into three services. Each service is its own Express app in its own folder,
with its own `package.json`, its own `.env` and its own Vercel project. The frontend sits alone in one folder.

| Folder | What it holds | Owner | Branch | Local port |
|---|---|---|---|---|
| `frontend/` | React app (Vite), all pages | Whole team | each member edits his own page on his own branch | 5173 |
| `route-stop/` | Route & Stop API | Yehia (247330) | `yehia/route-stop` | 3001 |
| `schedule-arrival/` | Schedule & Arrival API + Signup / Login | Ahmed (230102) | `ahmed/schedule-arrival` | 3002 |
| `favorites-alerts/` | Favorites & Alerts API | Ali (246090) | `ali/favorites-alerts` | 3003 |

All three services use the same Neon database. Each service only writes to its own tables.
Login is built in `schedule-arrival/` (lead: Ahmed). The other services check the same session
token with their own copy of `middleware/auth.js`.

## Inside each service folder

```
server.js      starts this service only
routes/        URLs and which role can call them
controllers/   checks the request (400) and calls the service
services/      all SQL lives here
middleware/    logger.js, auth.js (requireAuth, requireRole)
db/            index.js (Neon), schema.sql (this service's tables only)
```

**Rule:** each member edits only his own folder. Shared files (`frontend/src/App.jsx`,
`frontend/src/api.js`, `frontend/src/config.js`, every `middleware/auth.js`) change only after telling the group.

## Run on your laptop

Each service runs on its own port. Example for Favorites & Alerts:
```
cd favorites-alerts
copy .env.example .env      (then put the real values inside)
npm install
npm run dev                  (API on http://localhost:3003)
```

Frontend:
```
cd frontend
copy .env.example .env.local
npm install
npm run dev                  (site on http://localhost:5173)
```

## Database setup (only once, in the Neon SQL Editor)

Run the files in this order:
1. `schedule-arrival/db/auth-schema.sql`
2. `route-stop/db/schema.sql`
3. `schedule-arrival/db/schema.sql`
4. `favorites-alerts/db/schema.sql`

## Daily Git routine

```
git checkout main
git pull
git checkout yehia/route-stop        (use your own branch name)
git merge main

... work only inside your folder ...

git add .
git commit -m "Add create route endpoint"
git push
```

Then on GitHub click **Compare & pull request**, then **Create pull request**. Another member checks it and clicks **Merge**.

**Never** push to `main` directly. **Never** commit `.env`.

## Deploy (Lab 5)

Four Vercel projects from this one repo, one per folder:

| Vercel project | Root Directory | Values to add in the Vercel dashboard |
|---|---|---|
| `bus-route-stop-api` | `route-stop` | DATABASE_URL, CORS_ORIGINS |
| `bus-schedule-arrival-api` | `schedule-arrival` | DATABASE_URL, CORS_ORIGINS, TURNSTILE_SECRET_KEY |
| `bus-favorites-alerts-api` | `favorites-alerts` | DATABASE_URL, CORS_ORIGINS, CALENDARIFIC_API_KEY |
| `bus-tracker-web` | `frontend` | VITE_ROUTE_API_URL, VITE_SCHEDULE_API_URL, VITE_FAVORITES_API_URL |

So one service can be deployed or fixed without touching the others.
