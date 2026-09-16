# M365 Gateway VPS 部署与运维完整指南

本指南专为将 M365 Gateway 部署在独立 VPS（如阿里云、腾讯云、搬瓦工、Linode、DigitalOcean、AWS EC2、Hetzner 等 Linux 服务器）而编写。

---

## 目录
- [一、环境准备与配置要求](#一环境准备与配置要求)
- [二、方式一：Docker 一键容器化部署（强烈推荐）](#二方式一docker-一键容器化部署强烈推荐)
- [三、方式二：Linux 一键运维脚本部署](#三方式二linux-一键运维脚本部署)
- [四、方式三：Node.js 原生部署（PM2 / systemd 守护）](#四方式三nodejs-原生部署pm2--systemd-守护)
- [五、域名绑定与 HTTPS 反向代理配置（Nginx / Caddy）](#五域名绑定与-https-反向代理配置nginx--caddy)
- [六、初次使用与账号授权指引](#六初次使用与账号授权指引)
- [七、数据持久化、备份与迁移](#七数据持久化备份与迁移)
- [八、常见问题与排错（FAQ）](#八常见问题与排错faq)

---

## 一、环境准备与配置要求

### 1. VPS 最低与推荐规格
- **CPU**：1 核（推荐 2 核及以上）
- **内存**：1 GB（推荐 2 GB 及以上，构建 Docker 镜像或安装依赖阶段建议至少 1.5G 可用内存或配置 2G Swap）
- **操作系统**：Ubuntu 20.04/22.04/24.04 LTS、Debian 11/12、CentOS 8/9 Stream、Rocky Linux、AlmaLinux 等常见 Linux 发行版
- **网络**：服务器需能正常访问微软服务（`login.microsoftonline.com` 与 `substrate.office.com`）。如果 VPS 处于国内大陆网络环境，可能需要配置网络出口代理。

---

## 二、方式一：Docker 一键容器化部署（强烈推荐）

使用 Docker 部署是目前最稳定、隔离性最好、最不易受系统环境影响的部署方式。

### 步骤 1：安装 Docker 与 Docker Compose（若已安装可跳过）
```bash
# Ubuntu / Debian 快速安装
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

### 步骤 2：下载或上传项目代码至 VPS
将本项目文件夹上传至 VPS 的任意工作目录，例如 `/opt/m365-gateway`：
```bash
cd /opt/m365-gateway
```

### 步骤 3：生成安全配置文件 `.env`
运行辅助脚本一键生成高强度加密密钥与初始管理员密码：
```bash
node scripts/generate-keys.mjs --write-env
```
> 如果您的 VPS 尚未安装 Node.js，可直接复制模板并使用 openssl 生成：
> ```bash
> cp .env.example .env
> # 生成 32 字节 Base64URL 密钥
> KEY=$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=\n')
> sed -i "s/DATA_ENCRYPTION_KEY=.*/DATA_ENCRYPTION_KEY=${KEY}/" .env
> # 设置您的初始管理员密码（至少 8 位）
> sed -i "s/BOOTSTRAP_ADMIN_PASSWORD=.*/BOOTSTRAP_ADMIN_PASSWORD=YourStrongPassword123!/" .env
> ```

### 步骤 4：启动容器
```bash
docker compose up --build -d
```

### 步骤 5：验证运行状态
```bash
docker compose ps
curl http://127.0.0.1:8787/api/health
```
如果返回 `{"status":"ok"}` 或 `{"ok":true}`，说明网关已成功在本地 8787 端口启动！

---

## 三、方式二：Linux 一键运维脚本部署

项目已内置自动化部署与运维脚本 `deploy-vps.sh`：

```bash
chmod +x deploy-vps.sh
./deploy-vps.sh
```
该脚本会自动：
1. 检测 `.env`，不存在时自动调用生成器生成 32 字节高强度密钥与强随机密码；
2. 检查 Docker / Node.js 运行环境；
3. 一键构建并启动服务；
4. 运行健康检查并在终端输出管理后台登录地址与密码。

---

## 四、方式三：Node.js 原生部署（PM2 / systemd 守护）

适合不希望使用 Docker、直接在 VPS 主机上运行 Node.js 进程的用户。

### 步骤 1：安装 Node.js 20+ 或 22 LTS
```bash
# 使用 NodeSource 安装 Node.js 22 LTS (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 步骤 2：安装依赖并预构建 Bundle
```bash
npm ci
npm run build:server
```

### 步骤 3：准备 `.env` 文件
```bash
node scripts/generate-keys.mjs --write-env
```

### 步骤 4：使用 PM2 启动并保持后台运行
```bash
# 全局安装 PM2
npm install -g pm2

# 使用配置启动
pm2 start ecosystem.config.cjs

# 保存当前进程列表并设置开机自启
pm2 save
pm2 startup
```

或者使用 systemd 守护服务：
```bash
# 复制服务单元文件
sudo cp m365-gateway.service /etc/systemd/system/
# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable --now m365-gateway
```

---

## 五、域名绑定与 HTTPS 反向代理配置（Nginx / Caddy）

> [!IMPORTANT]
> **关键注意事项**：
> 1. AI 模型的推理对话是长时间的 **SSE 流式传输**。如果使用 Nginx，**必须在配置中加入 `proxy_buffering off;`**，否则 Nginx 会等待接收满缓冲区才发送给客户端，导致前端控制台或客户端出现严重卡顿、无法实时逐字输出。
> 2. WebSocket 长连接支持：微软 ChatHub 会使用 WebSocket，必须在反代中添加 `Upgrade` 和 `Connection "upgrade"` 标头。

### 方案 A：使用 Nginx 配置（最常用）

1. 创建配置文件 `/etc/nginx/conf.d/m365-gateway.conf`（参考仓库中 `nginx/m365-gateway.conf`）：
```nginx
server {
    listen 80;
    server_name your-gateway.com; # 替换为您的域名

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 真实客户端 IP 转发
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # [必须] 关闭代理缓存与缓冲，确保流式输出即时到达
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        # 长连接超时时间（避免大模型长思考时连接被切断）
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
```
2. 申请免费 SSL 证书（推荐使用 Certbot）：
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-gateway.com
```

### 方案 B：使用 Caddy 配置（自动全自动 HTTPS）

编辑 `/etc/caddy/Caddyfile`（参考仓库中 `Caddyfile.example`）：
```caddy
your-gateway.com {
    reverse_proxy 127.0.0.1:8787 {
        flush_interval -1
        transport http {
            read_timeout 600s
            write_timeout 600s
        }
    }
}
```
重启 Caddy 即可自动完成证书申请与反向代理。

---

## 六、初次使用与账号授权指引

1. **访问管理后台**：
   - 打开浏览器，访问 `https://your-gateway.com/login`（或者直接访问 `http://<VPS_IP>:8787/login`）。
2. **首次登录与修改密码**：
   - 输入 `.env` 中配置的 `BOOTSTRAP_ADMIN_PASSWORD`；
   - 首次登录系统会强制要求修改为管理员新密码，按提示完成新密码设置；
3. **添加 Microsoft 365 账号**：
   - 点击后台的「添加账号 / OAuth 授权」；
   - 系统将生成微软官方登录链接，在浏览器中打开并登录您的 Microsoft 365 / Copilot 账号；
   - 授权成功后，复制浏览器地址栏的回调 URL 粘贴回管理后台即可完成账号绑定。
4. **生成 API Key**：
   - 切换到「API Key 管理」页面，点击「新建 API Key」；
   - 保存生成的 Key，可直接填入各类客户端（如 NextChat、LobeChat、Cherry Studio、Chatbox 等）中使用，OpenAI Base URL 填写 `https://your-gateway.com/v1`。

---

## 七、数据持久化、备份与迁移

- 本服务的所有核心数据（SQLite 数据库文件、AES-256 加密后的凭据密文、轮转日志）默认保存在项目根目录的 `./data` 文件夹内（Docker 容器内映射为 `/data`）。
- **备份方式**：
  ```bash
  # 停止或暂停写入，执行压缩归档
  tar -czvf m365-gateway-backup-$(date +%Y%m%d).tar.gz ./data .env
  ```
- **迁移到新 VPS**：
  将备份的压缩包拷贝到新 VPS，解压后直接执行 `docker compose up -d` 即可无缝恢复所有账号与会话！

---

## 八、常见问题与排错（FAQ）

### Q1: 启动后无法从外部 IP 访问 `http://<VPS-IP>:8787`？
- **检查防火墙**：许多云厂商（如阿里云安全组、腾讯云安全组、AWS 安全组、Oracle Cloud）默认拦截所有入站端口。请在云厂商网页控制台开放 **8787**（或者 80/443）入站规则。
- **检查系统防火墙**：
  ```bash
  # Ubuntu ufw
  sudo ufw allow 8787/tcp
  # CentOS / RHEL firewalld
  sudo firewall-cmd --permanent --add-port=8787/tcp && sudo firewall-cmd --reload
  ```

### Q2: 对话时文字是一大段突然跳出来，而不是逐字打字机效果？
- 检查您的反向代理（Nginx 等）是否配置了 `proxy_buffering off;`。未关闭反向代理缓冲时，Nginx 会等待数据积累满一块后再推送。

### Q3: 忘记管理员密码怎么办？
- 编辑 `.env` 文件，在 `ADMIN_PASSWORD_RESET_VERSION` 处填入一个任意新的字符串（例如 `ADMIN_PASSWORD_RESET_VERSION=reset-1`），并将 `BOOTSTRAP_ADMIN_PASSWORD` 改为您的新初始密码。
- 重启服务后，即可使用该初始密码重新登录并重设密码。

### Q4: 如何查看实时运行日志？
- Docker 部署：
  ```bash
  docker compose logs -f
  ```
- PM2 部署：
  ```bash
  pm2 logs m365-gateway
  ```
