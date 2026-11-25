# BRIDEx — imagem para Easypanel / Docker
FROM node:24-alpine

# su-exec: inicia como root só para ajustar a permissão do volume, depois roda como usuário comum
RUN apk add --no-cache su-exec

# Site fechado: só entra quem já tem conta (ou recebe convite dos noivos). SIGNUP_OPEN=1 reabre o cadastro público.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    TRUST_PROXY=1 \
    SIGNUP_OPEN=0

WORKDIR /app
COPY package.json server.js admin.js ./
COPY lib ./lib
COPY public ./public

RUN mkdir -p /data && chown node:node /data

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/status >/dev/null || exit 1

ENTRYPOINT ["/bin/sh", "-c", "mkdir -p \"$DATA_DIR\" && chown -R node:node \"$DATA_DIR\" && exec su-exec node node --disable-warning=ExperimentalWarning server.js"]
