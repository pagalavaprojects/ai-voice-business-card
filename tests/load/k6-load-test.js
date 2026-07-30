import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 }, // Ramp-up to 20 virtual users
    { duration: "1m", target: 50 },  // Stay at 50 virtual users
    { duration: "30s", target: 0 },  // Ramp-down to 0
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests must complete under 500ms
    http_req_failed: ["rate<0.01"],   // Error rate must be less than 1%
  },
};

export default function () {
  const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

  // 1. Health check probe
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health check status is 200": (r) => r.status === 200,
  });

  sleep(1);

  // 2. Public business card page request
  const cardRes = http.get(`${BASE_URL}/demo-company/demo-employee`);
  check(cardRes, {
    "webcard page status is 200": (r) => r.status === 200,
  });

  sleep(2);
}
