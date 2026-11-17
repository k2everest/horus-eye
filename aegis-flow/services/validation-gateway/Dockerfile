# Build from aegis-flow/: docker build -f services/validation-gateway/Dockerfile .
FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node libs/crypto-core ./libs/crypto-core
COPY --chown=node:node services/validation-gateway ./services/validation-gateway
WORKDIR /app/services/validation-gateway
# Signature verification is real; ZK and persistent state still block production.
ENV NODE_ENV=development
ENV AEGIS_MODE=demo
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
