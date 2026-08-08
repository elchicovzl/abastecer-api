# ASOFER — Compras e Inventarios

Sistema web de automatización de compras e inventarios para ASOFER (obras y mejoras estructurales, 9 contratos activos).

Flujo: **Requisición → Verificación de Stock → Aprobación de OC → Recepción → Entrega**, con trazabilidad completa y auditoría de cada mutación.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 11 · Prisma 7 · PostgreSQL 16 |
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind 4 · React Hook Form · Zod 4 |
| Tests | Vitest 4 + Supertest (unit/integración) · Playwright (E2E) |
| Lenguaje | TypeScript 5.9 |

## Estructura

```
asofer/
├── backend/          NestJS + Prisma
├── frontend/         Next.js 16
├── tests/            E2E Playwright (base-page.ts, helpers.ts)
├── docker-compose.yml
└── playwright.config.ts
```

## Puesta en marcha

```bash
# 1. Levantar las bases (dev en 5432, test en 5433)
docker compose up -d

# 2. Instalar dependencias (workspaces npm — desde la raíz)
npm install

# 3. Crear backend/.env a partir del bloque de abajo
#    y generar los secretos JWT:
openssl rand -base64 48

# 4. Migrar y sembrar
npm run prisma:migrate --workspace=backend
npm run prisma:seed --workspace=backend

# 5. Arrancar backend y frontend juntos
npm run dev
```

Backend en `http://localhost:3100/api`, frontend en `http://localhost:3000`.

`npm run dev` usa `concurrently --kill-others`: **Ctrl+C baja los DOS procesos**.
Sin eso, matar el frontend dejaba el backend huérfano — y un dev server
zombie sobrevive incluso al borrado de su propio código, siguiendo escribir
archivos en un directorio que creés vacío.

Para levantarlos por separado, en dos terminales:
```bash
npm run dev:api    # backend :3100
npm run dev:web    # frontend :3000
```

Para bajar las bases: `npm run stop`.

## `backend/.env`

Este archivo **no está versionado ni se generó automáticamente** — creálo a mano con este contenido:

```dotenv
NODE_ENV=development
PORT=3100

DATABASE_URL="postgresql://asofer:asofer_dev@localhost:5432/asofer?schema=public"
TEST_DATABASE_URL="postgresql://asofer:asofer_test@localhost:5433/asofer_test?schema=public"

# Dos secretos DISTINTOS a propósito: si se filtra el de access,
# el atacante no puede forjar refresh tokens.
JWT_ACCESS_SECRET="generar-con-openssl-rand-base64-48"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_SECRET="otro-distinto-generar-igual"
JWT_REFRESH_TTL="7d"

BCRYPT_ROUNDS=12
CORS_ORIGIN="http://localhost:3000"
```

## Comandos

| Comando | Qué hace |
|---------|----------|
| `npm test` | Unit + integración (backend y frontend) |
| `npm run test:e2e` | E2E Playwright (levanta ambos servidores solo) |
| `npm run lint` | ESLint en los dos paquetes |
| `npm run typecheck` | `tsc --noEmit` en los dos paquetes |

## Roles

| Rol | Alcance |
|-----|---------|
| `COORDINATOR` (12) | Crea requisiciones — **solo de su contrato** |
| `WAREHOUSE` | Verifica stock, recibe compras, despacha |
| `PURCHASING_MANAGER` | Aprueba, rechaza o ajusta órdenes de compra |
| `ADMIN` | Usuarios, roles, empleados, dashboards |

## Tests

| Suite | Cantidad | Comando |
|-------|----------|---------|
| Backend (unit + integración) | 121 | `npm test --workspace=backend` |
| Frontend (unit) | 17 | `npm test --workspace=frontend` |
| E2E (Playwright) | 12 | `npm run test:e2e` |
| **Total** | **150** | |

Los E2E levantan backend y frontend solos y corren contra la base de
**desarrollo**. Acumulan datos entre corridas: si necesitás partir limpio,
volvé a correr la migración y el seed.

## Documentación

- [`docs/api.md`](docs/api.md) — endpoints, códigos de respuesta y reglas de negocio

## Decisiones de arquitectura

| ADR | Decisión |
|-----|----------|
| 001 | JWT access 15m + refresh 7d hasheado en BD → revocación real |
| 002 | Segregación por contrato en la capa de SERVICIO, no en controllers |
| 003 | El stock sube por lo recibido, no por lo pedido |
| 004 | Estados como enum de Postgres + máquina de estados centralizada |
| 005 | `employeeId` a nivel de LÍNEA, no de cabecera |
| 006 | Auditoría automática vía interceptor global |
| 007 | Descuento de stock con `SELECT ... FOR UPDATE` + CHECK `quantity >= 0` |
| 008 | Acceso cruzado entre contratos responde 404, nunca 403 |
| 009 | Últimas versiones estables salvo TypeScript (5.9, por los decorators de Nest) |

## Estado

**Completo: 50/50 tareas** de las 8 fases planificadas.
Fuera de alcance de esta iteración: notificaciones email/in-app, integración
con proveedores, CI/CD y app móvil.
