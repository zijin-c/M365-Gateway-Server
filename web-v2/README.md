# M365 Gateway 控制台静态资产包（web-v2）

本文件夹位于项目根目录的 `web-v2/` 子目录，包含 **M365 Gateway 现代化控制台与细化仪表盘**。

---

## 文件列表

- `index.html`：主控制台单页应用（含细化仪表盘、KPI、主力账号状态雷达、活动轨迹图、OAuth 向导、密钥管理、模型展示、审计日志）。
- `login.html`：深色玻璃拟态登录界面（集成强制改密流程与防暴破状态）。
- `debug.html`：旧调试路由兼容跳转页。
- `_headers`：Cloudflare 资产专用安全响应头策略。

---

## 部署说明

如需从项目根目录打包或引用本目录的静态文件部署到 Cloudflare，可在 Wrangler 配置中指定：

```jsonc
"assets": {
  "directory": "./web-v2",
  "binding": "ASSETS"
}
```
