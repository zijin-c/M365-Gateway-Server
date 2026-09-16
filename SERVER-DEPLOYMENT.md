# M365 Gateway Server deployment

> 💡 **中文部署指南**：详细的中文 VPS 部署与运维指南（含 Docker、脚本一键部署、Nginx/Caddy 配置、常见问题）请参阅 [VPS-DEPLOYMENT.md](./VPS-DEPLOYMENT.md)。

This directory is an independent server-oriented derivative of the Cloudflare baseline. It keeps the existing Worker and Durable Object business logic and runs it inside Miniflare as a normal Node.js process. Local persistent directories replace Cloudflare Durable Object and KV services. Static administration assets are served through the existing `ASSETS` binding.

## Requirements

- Node.js 20 or newer, with Node.js 22 LTS recommended.
- Persistent local storage with backups.
- A TLS reverse proxy for any non-local deployment.
- Secrets supplied by the operating system, container orchestrator, or a secret manager.

## Build and run directly

```powershell
npm ci
npm run typecheck
npm test
npm run build:server
$env:DATA_ENCRYPTION_KEY = "value-from-your-secret-manager"
$env:BOOTSTRAP_ADMIN_PASSWORD = Read-Host "Enter the bootstrap administrator password"
npm start
```

Linux uses the equivalent environment injection mechanism. Do not commit a populated `.env` file.

The default listener is `127.0.0.1:8787`. Set `HOST=0.0.0.0` only when a firewall and TLS reverse proxy protect the service. Persistent state defaults to `./data` and can be changed with `DATA_DIR`.

## Docker Compose

Supply `DATA_ENCRYPTION_KEY` and `BOOTSTRAP_ADMIN_PASSWORD` through the shell or an external Compose secret mechanism, then run:

```text
docker compose up --build -d
```

The provided Compose configuration publishes only to loopback. Put Nginx, Caddy, IIS, or another controlled TLS reverse proxy in front of it if remote access is required.

## Health check

```text
npm run healthcheck
```

The endpoint is `GET /api/health`. A successful health response establishes only that the local process and storage adapters started. It does not prove Microsoft OAuth, ChatHub connectivity, model identity, model capability, or production readiness.

## Architecture and limitations

The minimum-risk migration keeps the Workers API boundary instead of rewriting the large Durable Object state machines. Miniflare supplies local Durable Object, KV, asset, Fetch, WebCrypto, streaming, and WebSocket-compatible runtime facilities. This preserves substantially more tested business logic than replacing storage and concurrency behavior with a new framework.

This server edition is not a horizontal cluster. Its local Durable Object and KV persistence must be owned by one active process. Running multiple replicas against the same directory is unsupported. Cloudflare R2 cold archive, Smart Placement, global edge distribution, managed Durable Object scheduling, and Cloudflare operational guarantees are not reproduced. Backups, disk encryption, TLS, process supervision, firewalling, monitoring, and disaster recovery are operator responsibilities.

Do not import Cloudflare production state by copying files or secrets. Accounts must be authorized separately unless a dedicated, reviewed migration procedure is implemented and tested.
