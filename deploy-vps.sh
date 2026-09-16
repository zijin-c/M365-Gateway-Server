#!/usr/bin/env bash
# ==============================================================================
# M365 Gateway VPS 一键部署与运维脚本 (Linux)
# 支持环境检测、密钥自动生成、Docker 容器一键启动与状态检查
# ==============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}       M365 Gateway VPS 服务器部署脚本             ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. 检查或生成 .env 配置文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[1/4] 未检测到 .env 配置文件，正在自动生成安全密钥...${NC}"
    if command -v node >/dev/null 2>&1; then
        node scripts/generate-keys.mjs --write-env
    else
        # 兜底：使用 openssl 生成 32 字节 Base64URL 密钥与强随机密码
        RANDOM_KEY=$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=\n')
        RANDOM_PASS=$(openssl rand -base64 15 | tr -d '=+/\n')
        cp .env.example .env
        sed -i "s/DATA_ENCRYPTION_KEY=.*/DATA_ENCRYPTION_KEY=${RANDOM_KEY}/" .env
        sed -i "s/BOOTSTRAP_ADMIN_PASSWORD=.*/BOOTSTRAP_ADMIN_PASSWORD=${RANDOM_PASS}/" .env
        chmod 600 .env
        echo -e "${GREEN}已创建 .env 文件！${NC}"
        echo -e "  DATA_ENCRYPTION_KEY: ${RANDOM_KEY}"
        echo -e "  BOOTSTRAP_ADMIN_PASSWORD: ${RANDOM_PASS}"
    fi
else
    echo -e "${GREEN}[1/4] 检测到已存在 .env 配置文件。${NC}"
fi

# 2. 读取配置
PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 | tr -d ' \r\n' || echo "8787")
PORT=${PORT:-8787}
ADMIN_PASS=$(grep -E "^BOOTSTRAP_ADMIN_PASSWORD=" .env | cut -d '=' -f2 | tr -d ' \r\n' || echo "")

# 3. 部署模式选择
echo -e "${YELLOW}[2/4] 检查部署运行环境...${NC}"

HAS_DOCKER=false
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    HAS_DOCKER=true
fi

if [ "$HAS_DOCKER" = true ]; then
    echo -e "${GREEN}检测到 Docker 和 Docker Compose，推荐使用容器化部署。${NC}"
    echo -e "${YELLOW}[3/4] 正在构建并启动 Docker 容器...${NC}"
    # 预创建持久化目录并赋予权限，避免 Docker 挂载时出现 Linux 权限不足
    mkdir -p ./data && chmod -R 777 ./data
    docker compose up --build -d
    echo -e "${GREEN}Docker 容器已在后台启动！${NC}"

    echo -e "${YELLOW}[4/4] 检查服务健康状态...${NC}"
    sleep 3
    for i in {1..10}; do
        if curl -s -f "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
            echo -e "${GREEN}服务健康检查通过！${NC}"
            break
        fi
        echo "等待服务就绪 (${i}/10)..."
        sleep 2
    done
else
    echo -e "${YELLOW}未检测到 Docker，尝试原生 Node.js 部署...${NC}"
    if ! command -v node >/dev/null 2>&1; then
        echo -e "${RED}错误：系统中既没有安装 Docker，也没有安装 Node.js！${NC}"
        echo -e "请先安装 Docker 或 Node.js 20+ 后再运行本脚本。"
        exit 1
    fi

    echo -e "${YELLOW}[3/4] 正在安装 Node.js 依赖并构建服务 bundle...${NC}"
    npm ci
    npm run build:server

    echo -e "${YELLOW}[4/4] 启动提示：${NC}"
    if command -v pm2 >/dev/null 2>&1; then
        pm2 start ecosystem.config.cjs
        pm2 save
        echo -e "${GREEN}已通过 PM2 启动服务！${NC}"
    else
        echo -e "您可以直接运行以下命令在前台或后台启动："
        echo -e "  ${CYAN}npm start${NC}  或  ${CYAN}nohup npm start > server.log 2>&1 &${NC}"
    fi
fi

# 获取本机公网或局域网 IP
SERVER_IP=$(curl -s -4 ifconfig.me || curl -s -4 ip.sb || hostname -I | awk '{print $1}' || echo "你的VPS公网IP")

echo ""
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}              🎉 M365 Gateway 部署完成!             ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "服务访问地址:  ${CYAN}http://${SERVER_IP}:${PORT}${NC}"
echo -e "本地管理后台:  ${CYAN}http://127.0.0.1:${PORT}${NC}"
echo -e "初始管理员密码: ${YELLOW}${ADMIN_PASS}${NC}"
echo ""
echo -e "提示："
echo -e "1. 首次登录请访问管理后台并按提示修改管理员密码。"
echo -e "2. 建议配置 Nginx 反向代理并配置 SSL 证书（配置模板见 nginx/m365-gateway.conf）。"
echo -e "3. 数据保存在 ./data 目录中，请定期进行备份。"
echo -e "${GREEN}====================================================${NC}"
