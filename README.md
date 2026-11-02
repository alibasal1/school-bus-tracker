# School Bus Route Tracker (Team 14, Lab Group A-2)

## Who does what

| Member | Service | Branch |
|---|---|---|
| Yehia (247330) | Route & Stop | `yehia/route-stop` |
| Ahmed (230102) | Schedule & Arrival | `ahmed/schedule-arrival` |
| Ali (246090) | Favorites & Alerts | `ali/favorites-alerts` |
| All | Signup / Login (shared) | `team/auth` |

Each member works only on his own branch. `main` is the final version.

## First time (each member, once)

```
git clone https://github.com/alibasal1/school-bus-tracker.git
cd school-bus-tracker
git checkout yehia/route-stop
```
(Ahmed uses `ahmed/schedule-arrival`, Ali uses `ali/favorites-alerts`.)

## Every time you work

1. Get the latest work from the team:
```
git checkout main
git pull
git checkout yehia/route-stop
git merge main
```
2. Do your work.
3. Upload it:
```
git add .
git commit -m "Short message about what you did"
git push
```
4. On GitHub, click **Compare & pull request**, then **Create pull request**.
5. Another member looks at it and clicks **Merge**.

## Rules

- Never push to `main` directly. Always use a pull request.
- Edit only your own files. Tell the group before you change a shared file.
- Never upload `.env`. Only `.env.example`.
- Start every work day with `git pull`.
