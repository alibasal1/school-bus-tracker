// Load test for the Favorites & Alerts API. Lecture 9: measure before you claim.
// It ramps up to 50 virtual users for one minute on the two read endpoints that
// do not change any data: /api/health (no login) and /api/holidays (login).
//
// The token is never written in this file. Pass it in the environment:
//   export API_URL=http://<api-id>.execute-api.localhost.floci.io:4566
//   export PARENT_TOKEN=<the parent1 token from test-tokens.txt>
//   k6 run -e API_URL=$API_URL -e TOKEN=$PARENT_TOKEN k6/favorites-load.js
import http from 'k6/http';
import { check, group } from 'k6';

const API_URL = __ENV.API_URL;
const TOKEN = __ENV.TOKEN;

if (!API_URL) {
  throw new Error('Set API_URL to the API Gateway address.');
}

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '40s', target: 50 }
  ],
  thresholds: {
    // A failure rate above 1 percent, or a slow p95, fails the run.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000']
  }
};

export default function () {
  group('health', () => {
    const res = http.get(`${API_URL}/api/health`);
    check(res, { 'health is 200': (r) => r.status === 200 });
  });

  if (TOKEN) {
    group('holidays', () => {
      const res = http.get(`${API_URL}/api/holidays`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      // 429 is a pass here: it means the throttling we asked for is working.
      check(res, { 'holidays is 200 or 429': (r) => r.status === 200 || r.status === 429 });
    });
  }
}
