// Load test for the Favorites & Alerts API, in the shape of Lab 8:
// 20 virtual users for 30 s, a spike to 100 for 30 s, then down to 0.
// Each user calls /api/health (no login) and /api/holidays (login), then waits
// 0.5 to 1.5 s like a real person would.
//
// The token is never written in this file. Pass it in the environment:
//   export API_URL=http://<api-id>.execute-api.localhost.floci.io:4566
//   export PARENT_TOKEN=<the parent1 token from test-tokens.txt>
//   k6 run -e API_URL=$API_URL -e TOKEN=$PARENT_TOKEN k6/favorites-load.js
//
// All the load comes from one machine, so every request has the same source IP.
// middleware/rateLimit.js allows 60 requests a minute per IP (per Lambda copy),
// so many /api/holidays requests are expected to get 429. A 429 is the limit
// working, not the service failing: it is counted on its own in rate_limited_429
// and is not in http_req_failed. Anything else that is not a 200 is a failure.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const API_URL = __ENV.API_URL;
const TOKEN = __ENV.TOKEN;

if (!API_URL) throw new Error('Set API_URL to the API Gateway address.');
if (!TOKEN) throw new Error('Set TOKEN to the parent1 token (from test-tokens.txt, never in a file).');

const rateLimited = new Counter('rate_limited_429');
// Time of the answers that did real work (200 only), next to the overall p95.
const okDuration = new Trend('ok_200_duration', true);

http.setResponseCallback(http.expectedStatuses(200, 429));

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '30s', target: 100 },
    { duration: '10s', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05']
  }
};

function record(res) {
  if (res.status === 429) rateLimited.add(1);
  if (res.status === 200) okDuration.add(res.timings.duration);
}

export default function () {
  group('health', () => {
    const res = http.get(`${API_URL}/api/health`);
    record(res);
    check(res, { 'health is 200': (r) => r.status === 200 });
  });

  group('holidays', () => {
    const res = http.get(`${API_URL}/api/holidays`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    record(res);
    check(res, { 'holidays is 200 or 429': (r) => r.status === 200 || r.status === 429 });
  });

  sleep(0.5 + Math.random());
}
