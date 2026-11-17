FROM node:22-alpine
WORKDIR /app

COPY . .

# Demo verifier: production startup is intentionally blocked by runtime-policy.
ENV NODE_ENV=development
ENV AEGIS_MODE=demo
ENV PORT=8080

USER node

EXPOSE 8080
CMD ["node", "server.mjs"]
