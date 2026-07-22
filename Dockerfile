# ============================================
# 鑫钱包 · 多阶段 Docker 构建
# 运行阶段仅含生产依赖，并以非 root 用户运行
# 依赖以 server/package.json + server/package-lock.json（项目真实清单）为准，构建可复现
# 由 .github/workflows/release-image.yml 自动触发（推送 v*.*.* tag）
# ============================================

# ---- 阶段 1：安装生产依赖 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
# 使用 npm ci 确保 lockfile 与 package.json 一致，避免隐性升级
RUN npm ci --omit=dev

# ---- 阶段 2：精简运行镜像 ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# 使用非 root 用户运行，提升容器安全性
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY server ./server
COPY js ./js
COPY css ./css
COPY images ./images
COPY pages ./pages
COPY index.html ./
COPY login.html ./

# 容器自带健康检查：等待 /healthz 返回 200
COPY <<'EOF' /app/docker-healthcheck.js
const http = require('http');
const req = http.request({ host: '127.0.0.1', port: process.env.PORT || 18888, path: '/healthz', timeout: 2000 }, r => process.exit(r.statusCode === 200 ? 0 : 1));
req.on('error', () => process.exit(1));
req.on('timeout', () => process.exit(1));
req.end();
EOF

USER appuser

# 生产环境强烈建议显式注入 ENCRYPTION_KEY（用于 AI 凭证等敏感字段加密）
# 不注入时，crypto.js 启动时会自动生成临时密钥（每次容器重启会失效）
# 使用：docker run -e ENCRYPTION_KEY=$(openssl rand -hex 32) ...
ENV ENCRYPTION_KEY=

EXPOSE 18888
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node /app/docker-healthcheck.js

# OCI 镜像元数据（docker/build-push-action 会用 metadata-action 再次写入更完整的 labels）
ARG VERSION=dev
LABEL org.opencontainers.image.title="XIN Wallet" \
      org.opencontainers.image.description="鑫钱包 - 个人财务助手 (Node.js + Express + MariaDB)" \
      org.opencontainers.image.source="https://github.com/ZJX93/XIN-Wallet" \
      org.opencontainers.image.vendor="ZJX93" \
      org.opencontainers.image.licenses="MIT"

CMD ["node", "server/index.js"]
