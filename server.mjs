import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

// Automatically load .env if present and environment variables not already injected
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn(`[server] Notice: Failed to load .env file: ${err.message}`);
  }
}

const host = process.env.HOST?.trim() || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "8787", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const required = ["DATA_ENCRYPTION_KEY", "BOOTSTRAP_ADMIN_PASSWORD"];
for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. Please configure it in your .env file or environment.`
    );
  }
}

const persistenceRoot = resolve(process.env.DATA_DIR || "./data");
await mkdir(persistenceRoot, { recursive: true });

const runtimeRoot = resolve(process.env.RUNTIME_DIR || persistenceRoot, "runtime");
const wranglerHome = resolve(runtimeRoot, "wrangler");
const miniflareHome = resolve(runtimeRoot, "miniflare");
await mkdir(wranglerHome, { recursive: true });
await mkdir(miniflareHome, { recursive: true });

// Collect worker variables to serialize into a protected runtime env file
const runtimeVars = {
  ENVIRONMENT: process.env.ENVIRONMENT || "production",
  TENANT_NAME: process.env.TENANT_NAME || "default",
  MAX_ACCOUNTS: process.env.MAX_ACCOUNTS || "40",
  MIGRATION_ENABLED: process.env.MIGRATION_ENABLED || "false",
  MIGRATION_CANDIDATE_TAG: process.env.MIGRATION_CANDIDATE_TAG || "account-migration-candidate",
  DIRECT_NATIVE_TOOL_MODE: process.env.DIRECT_NATIVE_TOOL_MODE || "true",
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY.trim(),
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD.trim(),
  M365_CLIENT_ID: process.env.M365_CLIENT_ID?.trim() || "c0ab8ce9-e9a0-42e7-b064-33d422df41f1",
};

const optionalVars = [
  "M365_CLIENT_ID",
  "M365_AUTHORITY",
  "M365_REDIRECT_URI",
  "M365_SCOPE",
  "COMPACTION_ENCRYPTION_KEY",
  "ADMIN_PASSWORD_RESET_VERSION",
  "BOOTSTRAP_GATEWAY_API_KEY",
  "BOOTSTRAP_GATEWAY_API_KEY_NAME",
  "RELAY5_URL",
  "RELAY7_URL",
  "RELAY5_HMAC_SECRET",
  "RELAY7_HMAC_SECRET",
  "RELAY_ORIGIN",
];

for (const key of optionalVars) {
  if (process.env[key] !== undefined && process.env[key] !== "") {
    runtimeVars[key] = process.env[key];
  }
}

// Write the protected runtime env file so secrets are not exposed in ps aux arguments
const runtimeEnvFile = resolve(runtimeRoot, ".runtime.env");
const runtimeEnvContent = Object.entries(runtimeVars)
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  .join("\n") + "\n";

await writeFile(runtimeEnvFile, runtimeEnvContent, { mode: 0o600 });

// If pre-built bundle exists, run it directly for instant startup
const prebuiltBundle = resolve(projectRoot, "dist/server-worker/index.js");
const positionalArgs = existsSync(prebuiltBundle) ? [prebuiltBundle] : [];

const executable = process.execPath;
const wranglerBin = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");

if (!existsSync(wranglerBin)) {
  throw new Error(`Wrangler binary not found at ${wranglerBin}. Please run npm install.`);
}

const args = [
  wranglerBin,
  "dev",
  ...positionalArgs,
  "--local",
  "--ip",
  host,
  "--port",
  String(port),
  "--persist-to",
  persistenceRoot,
  "--env-file",
  runtimeEnvFile,
  "--show-interactive-dev-session=false",
];

console.log(`[server] Starting M365 Gateway server on ${host}:${port}...`);

const child = spawn(executable, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    CI: "true",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_HOME: wranglerHome,
    MINIFLARE_HOME: miniflareHome,
    TMPDIR: runtimeRoot,
  },
  stdio: "inherit",
  shell: false,
});

child.once("error", (error) => {
  console.error(JSON.stringify({ event: "server_start_failed", code: error.code || "SPAWN_FAILED", message: error.message }));
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) console.log(JSON.stringify({ event: "server_stopped", signal }));
  process.exitCode = code ?? (signal ? 1 : 0);
});

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ event: "server_shutdown", signal }));
  if (!child.killed) {
    child.kill(signal);
    if (process.platform === "win32") {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      } catch {}
    }
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
