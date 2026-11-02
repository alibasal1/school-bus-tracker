# School Bus Route Tracker (Team 14, Lab Group A-2)

Cloud Computing and Cloud Security (26CSCN29H).

| Member | Service | Branch |
|---|---|---|
| Yehia (247330) | Route & Stop | `yehia/route-stop` |
| Ahmed (230102) | Schedule & Arrival | `ahmed/schedule-arrival` |
| Ali (246090) | Favorites & Alerts | `ali/favorites-alerts` |
| All | Signup / Login (shared) | `team/auth` |

## Folders

```
backend/    Express API (one Vercel Function)
  routes/       auth.js, routes.js (Yehia), schedule.js (Ahmed), favorites.js (Ali)
  controllers/  same names, one file per service
  services/     same names, all SQL lives here
  middleware/   logger.js, auth.js (requireAuth, requireRole)
  db/           index.js (Neon), schema.sql (run once in Neon)
frontend/   React app (Vite)
  src/pages/    LoginPage, RoutesPage (Yehia), SchedulePage (Ahmed), FavoritesPage (Ali)
docs/       API contract and notes
evidence/   Postman collection and screenshots
```

**Rule:** each member edits only his own files. Shared files (`server.js`, `middleware/auth.js`, `App.jsx`, `db/schema.sql`) are changed only after telling the group.

## Run on your laptop

```
cd backend
copy .env.example .env      (then put your Neon DATABASE_URL inside)
npm install
npm run dev                  (API on http://localhost:3000)

cd frontend
npm install
npm run dev                  (site on http://localhost:5173)
```

Check: open http://localhost:3000/api/health and you should see `{"status":"ok"}`.

## Daily Git routine

First time only:
```
git clone https://github.com/alibasal1/school-bus-tracker.git
cd school-bus-tracker
git checkout yehia/route-stop        (use your own branch name)
```

Every day:
```
git checkout main
git pull
git checkout yehia/route-stop
git merge main                       (get your teammates' finished work)

... work ...

git add .
git commit -m "Add create route endpoint"
git push
```

Then on GitHub click **Compare & pull request**, then **Create pull request**. Another member checks it and clicks **Merge**.

**Never** push to `main` directly. **Never** commit `.env`.

## Deploy (Lab 5)

Two Vercel projects from this one repo:
- `bus-tracker-api`: Root Directory `backend`. Add DATABASE_URL, CORS_ORIGINS, CALENDARIFIC_API_KEY, TURNSTILE_SECRET_KEY in the Vercel dashboard.
- `bus-tracker-web`: Root Directory `frontend`. Add VITE_API_BASE_URL (the API's Vercel link).
