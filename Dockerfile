FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data

# Install ca-certificates and curl for trusted TLS roots required by workerd
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_DIR=/etc/ssl/certs \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

WORKDIR /app

# Install runtime dependencies (miniflare, wrangler)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy pre-built bundle, assets, configuration, and scripts
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/wrangler.jsonc ./wrangler.jsonc
COPY --from=build /app/dist ./dist
COPY --from=build /app/web-v2 ./web-v2
COPY --from=build /app/scripts ./scripts

# Setup persistent directory and unprivileged user
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node scripts/server-healthcheck.mjs || exit 1

CMD ["node", "server.mjs"]
