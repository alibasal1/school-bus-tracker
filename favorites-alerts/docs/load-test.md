# Load test, Favorites & Alerts service

Owner: Ali (246090). Team 14, 26CSCN29H.

## What was run

- Script: `k6/favorites-load.js`
- Tool: k6 v2.4.0 on Windows 11
- Target: the deployed API on Floci, through API Gateway:
  `http://22b92e5059.execute-api.localhost.floci.io:4566`
- Date: 2026-11-24, 02:42 UTC
- Load: ramp from 0 to 50 virtual users in 20 s, then hold 50 users for 40 s (1 minute in total).
- Each iteration calls `GET /api/health` (no login) and `GET /api/holidays`
  (with the parent1 test token, passed in with `-e TOKEN=...` and never written in a file).
- Thresholds: `http_req_failed` rate < 1 %, `http_req_duration` p(95) < 2000 ms.

```
k6 run -e API_URL=$API_URL -e TOKEN=<PARENT1_TOKEN> k6/favorites-load.js
```

Full output: `evidence/k6-run.txt`.

## Results

| Metric | Value |
|---|---|
| Requests | 6000 (88.5 per second) |
| Iterations | 3000 (44.2 per second) |
| Failed requests (`http_req_failed`) | 0.00 % (0 of 6000) |
| Checks passed | 100 % (6000 of 6000) |
| Response time, average | 448 ms |
| Response time, median | 421 ms |
| Response time, p(90) | 647 ms |
| Response time, p(95) | 1.44 s |
| Response time, max | 12.04 s |
| Data received / sent | 7.6 MB / 942 kB |

| Threshold | Limit | Result | Pass |
|---|---|---|---|
| `http_req_failed` | rate < 1 % | 0.00 % | Pass |
| `http_req_duration` | p(95) < 2000 ms | p(95) = 1.44 s | Pass |

## What this shows, and what it does not

- At 50 concurrent users the service answered every request correctly, and
  95 % of the requests took under 1.44 s.
- A few requests were very slow (max 12 s). Floci runs Lambda in one Docker container
  on the same PC as k6, and every request also goes to Neon over the internet, so these
  numbers measure this laptop setup, not real AWS Lambda.
- No request got 429. Floci does not apply the API Gateway stage throttle (rate 10,
  burst 20). See ST-11 in `docs/security-tests.md`. On real AWS, a run at 88
  requests per second would get 429 answers for the requests above the limit. The
  script counts those as a pass for `/api/holidays`, and they would show up in
  `http_req_failed`.
- Only the two read endpoints were tested, so the test changes no data.
