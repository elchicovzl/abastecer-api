# syntax=docker/dockerfile:1
#
# Imagen del backend. Se construye desde la RAÍZ del repo porque es un
# monorepo con npm workspaces: el package-lock vive arriba.
#
#   docker build -f backend/Dockerfile -t asofer-api .
#
# Se usa `slim` (Debian) y no `alpine` a propósito: bcrypt es un módulo
# nativo y en musl hay que compilarlo desde cero. En un VPS nano eso es
# lento y a veces se queda sin memoria.

# ── Etapa 1: dependencias ────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# `--ignore-scripts` evita que se ejecuten postinstall de paquetes ajenos
# durante la instalación. Prisma se genera explícitamente más abajo.
RUN npm ci --ignore-scripts

# ── Etapa 2: build ───────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY backend ./backend

WORKDIR /app/backend
# El cliente de Prisma 7 se genera como TypeScript FUENTE dentro de src/,
# así que tiene que existir ANTES de compilar.
RUN npx prisma generate
RUN npm run build

# ── Etapa 3: runtime ─────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
# El schema y las migraciones viajan con la imagen: el release corre
# `prisma migrate deploy` desde acá.
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/prisma.config.ts ./backend/prisma.config.ts
COPY --from=build /app/backend/src/prisma/generated ./backend/src/prisma/generated

WORKDIR /app/backend

# Nunca correr como root dentro del contenedor.
USER node

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3100/api/health || exit 1

CMD ["node", "dist/src/main"]
