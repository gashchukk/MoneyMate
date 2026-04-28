
function parseDotEnv(text) {
  const out = {};
  if (!text) return out;
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function tryOpen(path) {
  if (!path) return null;
  try {
    return open(path);
  } catch {
    return null;
  }
}

function loadEnvMap() {
  const paths = [];
  if (__ENV.K6_DOTENV_PATH) paths.push(__ENV.K6_DOTENV_PATH);
  paths.push("backend/k6/.env", "k6/.env", ".env");
  const seen = new Set();
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    const raw = tryOpen(p);
    if (raw) return parseDotEnv(raw);
  }
  return {};
}

const _file = loadEnvMap();

export function envVar(key, fallback = "") {
  const shell = __ENV[key];
  if (shell !== undefined && shell !== null && String(shell) !== "") {
    return String(shell);
  }
  const f = _file[key];
  if (f !== undefined && f !== null && String(f) !== "") {
    return String(f);
  }
  return fallback === undefined || fallback === null ? "" : String(fallback);
}
