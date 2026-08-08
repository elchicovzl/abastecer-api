#!/usr/bin/env bash
#
# Backup diario de la base. Se instala en cron:
#
#   0 3 * * * /opt/asofer/backup.sh >> /var/log/asofer-backup.log 2>&1
#
# Para un sistema de inventario y compras esto NO es opcional: perder la
# base es perder la trazabilidad de gasto y de dotación de 9 obras. Y un
# backup que nunca restauraste no es un backup — es una carpeta con
# archivos. Probá el restore ANTES de necesitarlo.
set -euo pipefail

cd /opt/asofer
source .env

FECHA=$(date +%Y-%m-%d_%H%M)
ARCHIVO="/opt/asofer/backups/asofer_${FECHA}.sql.gz"
RETENCION_DIAS=14

mkdir -p /opt/asofer/backups

echo "[$(date -Is)] Iniciando backup → ${ARCHIVO}"

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists \
  | gzip > "${ARCHIVO}"

# Un dump vacío o truncado es peor que ninguno: da falsa tranquilidad.
TAMANO=$(stat -c%s "${ARCHIVO}")
if [ "${TAMANO}" -lt 1024 ]; then
  echo "[$(date -Is)] ❌ El backup pesa ${TAMANO} bytes. Algo salió mal."
  rm -f "${ARCHIVO}"
  exit 1
fi

echo "[$(date -Is)] ✅ Backup OK ($(numfmt --to=iec "${TAMANO}"))"

# Rotación
find /opt/asofer/backups -name "asofer_*.sql.gz" -mtime "+${RETENCION_DIAS}" -delete
echo "[$(date -Is)] Backups vigentes: $(ls -1 /opt/asofer/backups/*.sql.gz 2>/dev/null | wc -l)"
