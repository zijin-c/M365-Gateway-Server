import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const envFile = resolve(root, ".env");
const envExample = resolve(root, ".env.example");

function generateEncryptionKey() {
  return randomBytes(32).toString("base64url");
}

function generateAdminPassword(length = 20) {
  // 使用无歧义的字母数字字符集，避免 #, $, %, & 等在 shell 与 .env 中具有特殊语义的字符
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const isWrite = args.includes("--write-env") || args.includes("--init");

const key = generateEncryptionKey();
const password = generateAdminPassword();

if (isCheck) {
  if (!existsSync(envFile)) {
    console.log(JSON.stringify({ exists: false, message: ".env file does not exist" }));
    process.exit(0);
  }
  const content = readFileSync(envFile, "utf8");
  const hasKey = /DATA_ENCRYPTION_KEY=[a-zA-Z0-9_-]{40,50}/.test(content);
  const hasPass = /BOOTSTRAP_ADMIN_PASSWORD=.+/.test(content);
  console.log(JSON.stringify({ exists: true, hasEncryptionKey: hasKey, hasAdminPassword: hasPass }));
  process.exit(0);
}

if (isWrite) {
  if (existsSync(envFile) && !args.includes("--force")) {
    console.warn("[generate-keys] .env file already exists. Use --force to overwrite.");
    process.exit(1);
  }

  let template = "";
  if (existsSync(envExample)) {
    template = readFileSync(envExample, "utf8");
  } else {
    template = `HOST=0.0.0.0
PORT=8787
DATA_DIR=./data
ENVIRONMENT=production
TENANT_NAME=default
MAX_ACCOUNTS=40
DIRECT_NATIVE_TOOL_MODE=true
DATA_ENCRYPTION_KEY=
BOOTSTRAP_ADMIN_PASSWORD=
`;
  }

  template = template.replace(
    /DATA_ENCRYPTION_KEY=.*/,
    `DATA_ENCRYPTION_KEY=${key}`
  );
  template = template.replace(
    /BOOTSTRAP_ADMIN_PASSWORD=.*/,
    `BOOTSTRAP_ADMIN_PASSWORD=${password}`
  );

  writeFileSync(envFile, template, { mode: 0o600 });
  console.log(`[generate-keys] Successfully generated and wrote configuration to ${envFile}`);
  console.log(`[generate-keys] DATA_ENCRYPTION_KEY:      ${key}`);
  console.log(`[generate-keys] BOOTSTRAP_ADMIN_PASSWORD: ${password}`);
  process.exit(0);
}

console.log("=== M365 Gateway 生产环境安全密钥生成器 ===");
console.log("");
console.log(`DATA_ENCRYPTION_KEY=${key}`);
console.log(`BOOTSTRAP_ADMIN_PASSWORD=${password}`);
console.log("");
console.log("提示：您可以将上述配置填入 .env 文件，或直接运行：");
console.log("  node scripts/generate-keys.mjs --write-env");
