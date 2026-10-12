# TellTale — zero-dependency Node server
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    DATA_DIR=/data

# No npm install needed — the app uses only Node's built-in modules.
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY data ./data

RUN node scripts/build-client.js && \
    mkdir -p /data && \
    cp -n data/scans.json /data/scans.json 2>/dev/null || true && \
    chown -R node:node /app /data

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=4s --start-period=6s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/api/health || exit 1

CMD ["node", "src/server.js"]
