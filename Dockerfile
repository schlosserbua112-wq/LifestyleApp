# Lifestyle-App: liefert die Web-App aus und nimmt Backups an.
FROM node:22-alpine
WORKDIR /app
COPY server/ ./server/
COPY public/ ./public/
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server/server.js"]
