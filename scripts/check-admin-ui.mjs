import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Script } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = existsSync(resolve(here, "../web-v2"))
  ? resolve(here, "../web-v2")
  : resolve(here, "../web");
const [html, login, debug, headers, readme] = await Promise.all([
  readFile(resolve(webRoot, "index.html"), "utf8"),
  readFile(resolve(webRoot, "login.html"), "utf8"),
  readFile(resolve(webRoot, "debug.html"), "utf8"),
  readFile(resolve(webRoot, "_headers"), "utf8"),
  readFile(resolve(here, "../README.md"), "utf8"),
]);

const assertions = [
  [/M365 Gateway/u, "independent M365 Gateway brand must be visible"],
  [/Durable Object 强一致密文权威副本 \+ AES-GCM KV 镜像/u, "credential storage boundary must be described accurately"],
  [/本页不是实时日志/u, "diagnostics UI must not claim to be a realtime log"],
  [/不支持不带字段名的裸授权码/u, "OAuth paste instructions must reject an unsupported bare code"],
  [/role="dialog" aria-modal="true" aria-labelledby="keyModalTitle"/u, "API Key modal must expose dialog semantics"],
  [/id="toastBox"[^>]*role="status"[^>]*aria-live="polite"/u, "UI notices must be announced accessibly"],
  [/fetch\("\/api\/admin\/keys"\)/u, "API Key list must use the implemented admin endpoint"],
  [/fetch\(`\/api\/admin\/keys\?id=\$\{encodeURIComponent\(id\)\}`[^\n]*method: "DELETE"/u, "API Key revocation must use the implemented DELETE endpoint"],
  [/body: JSON\.stringify\(\{ name, days \}\)/u, "API Key creation must use the backend name/days schema"],
  [/if \(submit\.disabled\) return/u, "API Key creation must prevent duplicate submissions"],
  [/k\.lastUsedAt \? new Date\(k\.lastUsedAt\)/u, "API Key UI must render the real lastUsedAt field"],
  [/fetch\("\/api\/accounts\/delete"[\s\S]*?body: JSON\.stringify\(\{ id \}\)/u, "account deletion must use the implemented POST body contract"],
  [/a\.active[\s\S]*?btn-reauth[\s\S]*?待命账号无需手动刷新/u, "manual token refresh must only be offered for the active account"],
  [/token_refresh_authorization_failed:[^\n]*微软授权已失效/u, "token refresh must surface the backend authorization failure"],
  [/token_refresh_rate_limited:[^\n]*微软暂时限制了令牌刷新/u, "token refresh must surface Microsoft rate limiting"],
  [/const ok = await syncAccounts\(\);[\s\S]*?if \(ok\) toast\("账号和诊断数据已同步"/u, "manual data sync must not claim success before the account request succeeds"],
  [/fetch\("\/api\/auth\/start"\)/u, "OAuth start must use the implemented endpoint and method"],
  [/fetch\(`\/api\/auth\/callback\?url=\$\{encodeURIComponent\(rawUrl\)\}`\)/u, "OAuth completion must use the server-owned PKCE callback contract"],
  [/fetch\("\/api\/admin\/debug\/logs\?limit=100"\)/u, "diagnostics must use the bounded diagnostics endpoint"],
  [/logsState = data\.records \|\| \[\]/u, "diagnostics must consume the records response field"],
  [/fetch\("\/api\/admin\/reset-stats"/u, "metric reset must use the implemented endpoint"],
  [/fetch\("\/api\/admin\/session"\)[\s\S]*?session\.must_change_password/u, "dashboard initialization must enforce the administrator session state"],
  [/escapeHtml\(a\.tokenState \|\| "未知"\)/u, "dynamic account state must be HTML escaped"],
  [/gpt-5\.6-sol/u, "the current default gateway model must be shown"],
  [/gpt-5\.5-reasoning/u, "the complete canonical GPT model catalog must be shown"],
  [/gpt-6-astra/u, "the current tenant-dependent gateway model must be shown"],
  [/claude-sonnet/u, "the current Claude gateway model must be shown"],
  [/claude-sonnet-reasoning/u, "the complete canonical Claude model catalog must be shown"],
  [/13 个可接受 ID/u, "the model page must distinguish seven canonical ids from six request aliases"],
  [/gpt-5\.6-think-deeper → gpt-5\.6-reasoning/u, "the accepted request aliases must be documented"],
  [/const SUNRISE_HOUR = 6;[\s\S]*const SUNSET_HOUR = 18;/u, "celestial orbit must use the documented local-time day boundary"],
  [/const now = new Date\(\);[\s\S]*now\.getHours\(\)/u, "celestial orbit must follow the browser's real local time"],
  [/setInterval\(updateCelestialOrbit, 15000\)/u, "celestial position must refresh from real time without animation-frame polling"],
  [/SYNODIC_MONTH_MS[\s\S]*--moon-shadow-shift/u, "moon rendering must include an approximate real lunar phase"],
  [/width: 360px;[\s\S]*height: 190px;/u, "celestial light must remain a local glow instead of illuminating the full page"],
  [/\.glass-panel \{[\s\S]*?background: var\(--glass-bg\);/u, "cards must not each render a page-wide celestial glow"],
  [/\.celestial-sun \{[\s\S]*?z-index: 0;/u, "sun must render behind the application surface"],
  [/\.celestial-moon \{[\s\S]*?z-index: 0;/u, "moon must render behind the application surface"],
  [/\.celestial-beam-glow \{[\s\S]*?z-index: 0;/u, "celestial glow must render behind the application surface"],
];

for (const [pattern, message] of assertions) {
  if (!pattern.test(html)) throw new Error(message);
}

for (const source of [html, login, debug]) {
  if (/Copilot Bridge/u.test(source)) throw new Error("legacy Copilot Bridge brand must not remain in Cloudflare assets");
  for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)) {
    new Script(match[1]);
  }
}

const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length > 0) throw new Error(`duplicate HTML ids: ${duplicateIds.join(", ")}`);
if (/\/api\/(?:keys|admin\/logs|admin\/reset-metrics|accounts\/oauth)/u.test(html)) {
  throw new Error("stale or unimplemented management API route remains in the UI");
}
if (/gpt-4o|o3-mini|claude-3-[57]-sonnet/u.test(html)) throw new Error("stale model catalog remains in the UI");
if (/codeVerifier|authUrl|validDays|k\.alias|k\.revokedAt|k\.requestCount/u.test(html)) {
  throw new Error("frontend fields do not match the implemented backend schema");
}
if (/CRUISE_CYCLE_MS|manualTimeOffset|m365_celestial_mode|requestAnimationFrame\(updateCelestialOrbit\)/u.test(html)) {
  throw new Error("celestial motion must not fall back to a simulated or manually advanced clock");
}
if (!/Content-Security-Policy:/u.test(headers) || !/Cache-Control: no-cache, no-store/u.test(headers)) {
  throw new Error("global static asset security headers are incomplete");
}

if (/admin888/u.test(login)) throw new Error("login page must not expose a shared bootstrap password");
if (!/随机初始密码仅在部署终端显示一次/u.test(login)) throw new Error("login page must explain one-time random bootstrap credentials");
if ((login.match(/minlength="8"/gu) ?? []).length !== 2) throw new Error("both new-password inputs must enforce the 8-character minimum");
if (/12 个字符|minlength="12"/u.test(`${login}\n${html}`)) throw new Error("stale 12-character password copy must not remain");
if (!/p1\.length < 8/u.test(html)) throw new Error("settings page must enforce the 8-character password minimum");

if (!/sessionStorage\.setItem\('m365\.currentPage','diagnostics'\)/u.test(debug)) throw new Error("legacy debug URL must route users to structured diagnostics");
if (/JSON\.stringify|x\.client|x\.upstream|x\.gateway|undefined/u.test(debug)) throw new Error("debug compatibility page must not render raw or nonexistent payload fields");

if (/32 MiB/u.test(readme) || !/AI 请求体 8 MiB/u.test(readme)) throw new Error("README must document the real 8 MiB AI request limit");
if (!/7 天/u.test(readme) || !/64 个/u.test(readme) || !/512 个/u.test(readme)) throw new Error("README must document bounded Responses alias retention");
if (!/最长 10 分钟/u.test(readme)) throw new Error("README must document the bounded long-task deadline");
if (!/图片输入与生成仍是未完成真实上游验收的候选能力/u.test(readme)) throw new Error("README must label image support as an unverified candidate capability");
if (!/音频、Realtime 和语音不支持/u.test(readme)) throw new Error("README must state that voice and Realtime are unsupported");

console.log("admin UI contract checks passed");
