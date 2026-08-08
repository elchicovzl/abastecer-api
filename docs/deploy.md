# Deploy — ASOFER

```
Vercel                        VPS (157.254.174.217)
┌──────────────┐             ┌──────────────────────────────┐
│ Next.js 16   │  HTTPS ───► │ Caddy (TLS) → API NestJS     │
│ frontend/    │             │              → PostgreSQL 16 │
└──────────────┘             └──────────────────────────────┘
```

El backend va a un servidor de verdad y **no a serverless**: `SELECT ... FOR
UPDATE` (ADR-007) necesita una conexión estable dentro de una transacción, y
Prisma en serverless agota el pool de Postgres.

---

## 1. Preparar el VPS (una sola vez)

```bash
ssh root@157.254.174.217

# Docker
curl -fsSL https://get.docker.com | sh

# Estructura
mkdir -p /opt/asofer/backups && cd /opt/asofer
```

Copiá desde tu máquina:

```bash
scp deploy/docker-compose.prod.yml deploy/Caddyfile deploy/backup.sh \
    root@157.254.174.217:/opt/asofer/
ssh root@157.254.174.217 'chmod +x /opt/asofer/backup.sh'
```

### Firewall

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

Postgres **no** se abre. En el compose no tiene `ports:` — vive en la red
interna de Docker. Exponer 5432 a internet es regalarle a cualquiera un
objetivo de fuerza bruta desde el minuto uno.

---

## 2. Variables de entorno del VPS

```bash
cd /opt/asofer

# Secretos DISTINTOS entre sí. Si se filtra el de access, con el mismo
# secreto el atacante también forja refresh tokens de 7 días.
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"  >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"  >> .env

cat >> .env <<'EOF'
POSTGRES_USER=asofer
POSTGRES_DB=asofer
API_DOMAIN=vps26685.cubepath.net
FRONTEND_URL=https://TU-APP.vercel.app
EOF

chmod 600 .env
```

`FRONTEND_URL` se completa después del primer deploy en Vercel.

---

## 3. Primer arranque

```bash
cd /opt/asofer
echo "API_IMAGE=ghcr.io/elchicovzl/abastecer-api/api:latest" > .image.env

# La imagen es privada: hace falta login en GHCR con un token que tenga
# read:packages.
echo "$GHCR_TOKEN" | docker login ghcr.io -u elchicovzl --password-stdin

docker compose -f docker-compose.prod.yml --env-file .env --env-file .image.env up -d

# Migrar y sembrar
docker compose -f docker-compose.prod.yml --env-file .env --env-file .image.env \
  run --rm api npx prisma migrate deploy

docker compose -f docker-compose.prod.yml --env-file .env --env-file .image.env \
  run --rm api npx tsx prisma/seed-prod.ts
```

El seed imprime las contraseñas **una sola vez**. Copialas en ese momento:
la base guarda solo el hash bcrypt y no hay forma de recuperarlas.

Verificar:

```bash
curl https://vps26685.cubepath.net/api/health   # {"status":"ok"}
```

---

## 4. Frontend en Vercel

1. Importar `elchicovzl/abastecer-api`
2. **Root Directory**: `frontend`
3. Variable de entorno:

| Nombre | Valor |
|---|---|
| `API_URL` | `https://vps26685.cubepath.net/api` |

`API_URL` se usa **solo en el servidor** (`lib/api-client.ts` tiene
`server-only`), así que nunca llega al bundle del navegador. Por eso NO
lleva prefijo `NEXT_PUBLIC_`.

Con la URL que te dé Vercel, actualizá `FRONTEND_URL` en el `.env` del VPS
y reiniciá la API.

---

## 5. Secrets de GitHub Actions

`Settings → Secrets and variables → Actions`:

| Secret | Valor |
|---|---|
| `VPS_HOST` | `157.254.174.217` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Contenido de tu clave privada (la `mac` que ya está en el VPS) |
| `API_DOMAIN` | `vps26685.cubepath.net` |

`GITHUB_TOKEN` lo provee Actions solo.

---

## 6. Backups

```bash
ssh root@157.254.174.217
crontab -e
# 0 3 * * * /opt/asofer/backup.sh >> /var/log/asofer-backup.log 2>&1
```

### Restaurar

```bash
cd /opt/asofer
gunzip -c backups/asofer_2026-08-08_0300.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U asofer -d asofer
```

**Probá el restore ahora, no el día que lo necesites.** Un backup que nunca
restauraste es una carpeta con archivos, no un respaldo.

---

## 7. Rollback

Cada deploy etiqueta la imagen con el SHA del commit:

```bash
cd /opt/asofer
echo "API_IMAGE=ghcr.io/elchicovzl/abastecer-api/api:<SHA-ANTERIOR>" > .image.env
docker compose -f docker-compose.prod.yml --env-file .env --env-file .image.env up -d api
```

⚠️ **El rollback de código NO revierte migraciones.** Si el deploy fallido
incluía un cambio de schema, hay que revertirlo con una migración nueva
hacia adelante — nunca borrando la anterior. Por eso `migrate deploy` es el
único comando de Prisma apto para producción: solo aplica, nunca destruye.

---

## Checklist antes de que ASOFER lo use en serio

- [ ] Contraseñas del seed de producción entregadas por canal seguro y cambiadas por cada usuario
- [ ] `FRONTEND_URL` apuntando a la URL real de Vercel
- [ ] Backup corriendo en cron **y un restore probado**
- [ ] Empleados reales cargados (el seed de producción no los inventa)
- [ ] Stock inicial cargado desde un conteo físico, no estimado
- [ ] `ufw` activo con solo 22, 80 y 443
- [ ] Acceso SSH por clave, `PasswordAuthentication no`

---

## Notas del VPS

Es un `gp-nano`: recursos justos. Por eso las imágenes se construyen en
GitHub Actions y el VPS solo las descarga — compilar ahí puede quedarse sin
memoria. Si la API empieza a ir lenta con varios usuarios simultáneos, el
cuello va a ser la RAM de Postgres antes que Node.
