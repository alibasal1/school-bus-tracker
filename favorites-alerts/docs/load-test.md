# Load test, Favorites & Alerts service

Owner: Ali (246090). Team 14, 26CSCN29H.

## What was run

- Script: `k6/favorites-load.js`, in the shape of Lab 8.
- Tool: k6 v2.4.0 on Windows 11.
- Target: the deployed API on Floci, through API Gateway:
  `http://96301206f5.execute-api.localhost.floci.io:4566`
- Date: 2026-11-24, 18:08 UTC.
- Warm run: 5 × `GET /api/health` just before the test (all 200, 13 to 37 ms), so the
  Lambda was not cold when k6 started.
- Load (stages): 20 virtual users for 30 s, a spike to 100 users for 30 s, then down to 0
  in 10 s (1 min 10 s in total).
- Each iteration calls `GET /api/health` (no login) and `GET /api/holidays` (with the
  parent1 test token, passed in with `-e TOKEN=...` and never written in a file), then
  waits `sleep(0.5 + Math.random())` seconds.
- Thresholds: `http_req_duration` p(95) < 500 ms and `http_req_failed` rate < 5 %.
- 429 answers are counted on their own in the counter `rate_limited_429`. They are the
  rate limit working, so `http.expectedStatuses(200, 429)` keeps them out of
  `http_req_failed`. Any other status is a failure.

```
k6 run -e API_URL=$API_URL -e TOKEN=<PARENT1_TOKEN> k6/favorites-load.js
```

Full output: `evidence/k6-run.txt`.

### Why 429s were expected

The whole load comes from one machine, so every request has the same source IP, and
`middleware/rateLimit.js` allows 60 requests a minute per IP. Far more than 60
`/api/holidays` requests a minute were sent, so 429 answers were expected.
`/api/health` is never limited.

## Results

Run A is the deployed service on Floci (the run above). Run B is the same script,
same stages, thresholds and PARENT1 token, against `npm start` on the PC
(`http://localhost:3003`, 2026-11-24 18:21 UTC, warmed with 5 × `/api/health` and
1 × `/api/holidays` first). Full output of Run B: `evidence/k6-run-pc.txt`.

| Metric | Run A: Floci (API Gateway + Lambda) | Run B: Express on the PC, no Floci |
|---|---|---|
| Requests | 1072 (12.0 per second) | 5248 (73.9 per second) |
| Iterations | 536 (6.0 per second) | 2624 (37.0 per second) |
| Failed requests (`http_req_failed`) | 0.00 % (0 of 1072) | 0.00 % (0 of 5248) |
| 429 answers (`rate_limited_429`) | 0 (k6 never added to the counter, so it is not in the summary; CloudWatch also shows 0 `RATE_LIMITED` lines) | 2537 (of 2624 `/api/holidays` requests; 87 got 200) |
| Checks passed | 100 % (1072 of 1072) | 100 % (5248 of 5248) |
| Response time, average | 3.06 s | 8.41 ms |
| Response time, median | 458 ms | 0.51 ms |
| Response time, p(90) | 7.02 s | 0.93 ms |
| Response time, p(95) | 21.22 s | 1.13 ms |
| Response time, max | 43.09 s | 1.26 s |
| `/api/holidays` 200 answers, time inside the app (own log lines) | median 461 ms, p95 2.78 s | median 435 ms, p95 865 ms |

| Threshold | Limit | Run A: Floci | Run B: PC |
|---|---|---|---|
| `http_req_duration` | p(95) < 500 ms | 21.22 s, **not passed** | 1.13 ms, pass |
| `http_req_failed` | rate < 5 % | 0.00 %, pass | 0.00 %, pass |

The thresholds were not changed to make either run pass.

### Why Run B is so different

1. On the PC there is one Node process and no Floci in front of it, so no request waits for a Lambda copy to start or to be free; that wait was most of Run A's 21 s.
2. One process means one rate-limit count, so after the first 60 `/api/holidays` requests a minute every one got an instant 429 (2537 of them), while Floci spread Run A over several copies and none got a 429.
3. Most of Run B's requests are a `/api/health` or a 429 answered in about 1 ms without touching Neon, so its p95 of 1.13 ms mostly measures those; the 87 real `/api/holidays` answers still took about 435 ms each, the trip to Neon, the same as on Floci.

## Why Run A p95 is over 500 ms

1. Lambda on Floci: each copy is a Docker container that Floci starts while the load grows, and requests wait in Floci for a free copy; `/api/health` took 6 ms inside the Lambda but seconds at k6, so most of the time is that wait, not our code.
2. Every `/api/holidays` request goes from my laptop to Neon over the internet (a session check and the holidays cache), which is about 460 ms even when nothing else is busy.
3. One laptop runs k6, Docker, Floci and every Lambda copy at the same time, so at 100 users they all compete for the same CPU.

## Why Run A had no 429s

The rate limit counts in memory, one count per Lambda copy (see `docs/security-controls.md`).
Floci ran the requests on several copies, and `docker ps` right after the run showed
copies only 20 to 40 seconds old, so copies were being started and replaced during the
run, each with an empty count. Only about 460 `/api/holidays` requests a minute got through
in total, and no single copy saw 60 of them inside one minute. ST-11 shows the limit
does answer 429 when the requests reach one copy (`evidence/ST-11.txt`). On real AWS the
shared limit is the API Gateway stage throttle (10 per second, burst 20), which Floci
does not enforce.

## What this shows, and what it does not

- No request failed: under a spike to 100 users every answer was a 200.
- The latency numbers measure this laptop setup (Floci queueing, Neon over the internet,
  one CPU for everything), not real AWS Lambda, where copies run on separate machines.
- Only the two read endpoints were tested, so the test changes no data.
- The previous run (50 users, p95 under 2 s) is in the git history of this file.
