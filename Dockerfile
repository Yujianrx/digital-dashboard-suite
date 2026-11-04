FROM node:24-bookworm-slim AS build
WORKDIR /suite
COPY operations/package*.json ./operations/
RUN npm --prefix operations ci --ignore-scripts
COPY operations ./operations
COPY scripts ./scripts
COPY app ./app
RUN node scripts/build-operations.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production DASHBOARD_MODE=web DASHBOARD_HOST=0.0.0.0 PORT=8765
ENV DASHBOARD_DATA_DIR=/var/lib/dashboard/data DASHBOARD_BACKUP_DIR=/var/lib/dashboard/backups
WORKDIR /suite
COPY --from=build /suite/app ./app
COPY server/*.mjs server/initial-state.json ./server/
RUN mkdir -p /var/lib/dashboard/data /var/lib/dashboard/backups && chown -R node:node /var/lib/dashboard
USER node
EXPOSE 8765
VOLUME ["/var/lib/dashboard"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:8765/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/host.mjs"]
