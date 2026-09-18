import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.API_BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';
const TENANT = __ENV.TENANT_ID || '';

export const options = {
  scenarios: {
    health: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      exec: 'health',
    },
    leads: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      exec: 'leads',
    },
    sync: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      exec: 'sync',
    },
    assign: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      exec: 'assign',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const authHeaders = {
  Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
  'X-Tenant-Id': TENANT,
};

export function health() {
  const res = http.get(`${BASE}/health/live`);
  check(res, { 'live is 200': (r) => r.status === 200 });
  sleep(0.01);
}

export function leads() {
  const res = http.get(`${BASE}/leads?limit=20`, { headers: authHeaders });
  check(res, { 'leads is 200': (r) => r.status === 200 });
}

export function sync() {
  const res = http.get(`${BASE}/sync`, { headers: authHeaders });
  check(res, { 'sync is 200': (r) => r.status === 200 });
}

export function assign() {
  const res = http.post(`${BASE}/leads/lead-1/assign`, '{}', { headers: authHeaders });
  check(res, { 'assign is 200': (r) => r.status === 200 });
}
