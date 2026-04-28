
import http from "k6/http";
import { check, group, sleep } from "k6";
import { envVar } from "./dotenv.js";

const BASE = envVar("BASE_URL", "https://money-mate-neon-beta.vercel.app").replace(/\/+$/, "");

const maxFailRate = Math.max(
  0.02,
  Math.min(0.95, Number(envVar("K6_ABORT_ERROR_RATE", "0.25")))
);
const peak = Math.max(10, Math.min(2000, Number(envVar("K6_STRESS_PEAK_VUS", "300"))));
const errorSamplesPerEndpoint = Math.max(0, Number(envVar("K6_ERROR_SAMPLES_PER_ENDPOINT", "5")));
const includeErrorBody = String(envVar("K6_LOG_ERROR_BODIES", "false")).toLowerCase() === "true";

const _errorSampleCount = {
  accounts: 0,
  transactions: 0,
  mcc: 0,
};

function logFailedSample(endpoint, res) {
  if (_errorSampleCount[endpoint] >= errorSamplesPerEndpoint) return;
  _errorSampleCount[endpoint] += 1;

  const payload = {
    endpoint,
    sample: _errorSampleCount[endpoint],
    status: res.status,
    error: res.error || null,
    url: res.url,
  };

  if (includeErrorBody) {
    const body = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
    payload.body = body.slice(0, 500);
  }

  console.error(`[k6:error] ${JSON.stringify(payload)}`);
}

const stages = [
  { duration: "20s", target: Math.min(5, peak) },
  { duration: "30s", target: Math.min(15, peak) },
  { duration: "45s", target: Math.min(40, peak) },
  { duration: "1m", target: Math.min(80, peak) },
  { duration: "1m30s", target: Math.min(Math.floor(peak * 0.45), peak) },
  { duration: "2m", target: Math.min(Math.floor(peak * 0.75), peak) },
  { duration: "3m", target: peak },
  { duration: "30s", target: 0 },
];

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages,
      gracefulRampDown: "20s",
    },
  },
  thresholds: {
    http_req_failed: [
      {
        threshold: `rate<${maxFailRate}`,
        abortOnFail: true,
      },
    ],
    http_req_duration: ["p(95)<60000"],
  },
};

export function setup() {
  const fromEnv = envVar("K6_ACCESS_TOKEN");
  if (fromEnv) {
    return { token: fromEnv.trim() };
  }
  const email = envVar("K6_EMAIL");
  const password = envVar("K6_PASSWORD");
  if (!email || !password) {
    throw new Error("Set K6_EMAIL + K6_PASSWORD or K6_ACCESS_TOKEN for stress_read.js");
  }
  const res = http.post(
    `${BASE}/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" } }
  );
  if (res.status === 0 || res.body == null || res.body === "") {
    throw new Error(
      `Login request got no response body (status=${res.status}, error="${res.error || ""}"). ` +
        `Check BASE_URL=${BASE}, VPN/firewall, and that the API is reachable.`
    );
  }
  if (res.status !== 200) {
    throw new Error(`Login failed HTTP ${res.status}: ${String(res.body).slice(0, 500)}`);
  }
  let token;
  try {
    const body = res.json();
    token = body && body.access_token;
  } catch {
    throw new Error(`Login response is not valid JSON: ${String(res.body).slice(0, 300)}`);
  }
  if (!token) {
    throw new Error("Login JSON missing access_token");
  }
  return { token };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    "Content-Type": "application/json",
  };

  const discard = includeErrorBody ? {} : { discardResponseBody: true };

  group("accounts list", () => {
    const r = http.get(`${BASE}/accounts`, { ...discard, headers });
    const ok = check(r, { "accounts 2xx": (res) => res.status >= 200 && res.status < 300 });
    if (!ok) logFailedSample("accounts", r);
  });

  group("transactions list", () => {
    const r = http.get(`${BASE}/transactions`, { ...discard, headers });
    const ok = check(r, { "transactions 2xx": (res) => res.status >= 200 && res.status < 300 });
    if (!ok) logFailedSample("transactions", r);
  });

  group("mcc", () => {
    const r = http.get(`${BASE}/mcc/${5812 + (__VU % 10)}`, discard);
    const ok = check(r, { "mcc 2xx": (res) => res.status >= 200 && res.status < 300 });
    if (!ok) logFailedSample("mcc", r);
  });

  sleep(0.05 + Math.random() * 0.1);
}
