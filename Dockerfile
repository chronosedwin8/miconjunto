# MiConjunto — imagen de producción (web + worker de jobs en el mismo contenedor)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=America/Bogota PORT=3000
COPY --from=build /app ./
RUN mkdir -p storage && chown -R node:node storage
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# Aplica migraciones y arranca web + worker
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
