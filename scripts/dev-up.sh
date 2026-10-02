#!/usr/bin/env bash
# =============================================================================
#  Sobe o ambiente de desenvolvimento do zero (ou depois de um reset da sandbox)
#
#    bash scripts/dev-up.sh
#
#  Faz, nesta ordem:
#   1. garante os binários do PostgreSQL (instala via apt se faltarem);
#   2. recria diretórios vazios do cluster (snapshots não preservam pastas
#      vazias — pg_tblspc, pg_notify etc.) e corrige as permissões;
#   3. sobe o PostgreSQL em 127.0.0.1:5432 usando ./.pgdata;
#   4. instala as dependências (node_modules não é preservado entre sessões);
#   5. gera o Prisma Client e aplica as migrações pendentes.
#
#  Depois disso, rode em dois terminais (ou use `npm run dev`):
#    npm run dev:api   # http://localhost:4000
#    npm run dev:web   # http://localhost:5173
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/.pgdata"
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)"

# 1 ------------------------------------------------------------ PostgreSQL ----
if [ -z "$PG_BIN" ]; then
  echo "📦 PostgreSQL não encontrado — instalando (primeira vez nesta máquina)..."
  sudo -n apt-get update -qq
  sudo -n apt-get install -y -qq postgresql
  PG_BIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
fi
export PATH="$PG_BIN:$PATH"

# 2 ------------------------------------------------- cluster: pastas/perms ----
mkdir -p "$PGDATA"
chmod 700 "$PGDATA"
for dir in pg_tblspc pg_notify pg_stat pg_stat_tmp pg_snapshots pg_twophase \
           pg_replslot pg_dynshmem pg_commit_ts pg_wal/archive_status \
           pg_logical/snapshots pg_logical/mappings; do
  mkdir -p "$PGDATA/$dir"
  chmod 700 "$PGDATA/$dir"
done

# 3 ------------------------------------------------------------ subir banco ---
if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "✅ PostgreSQL já está no ar."
else
  echo "🐘 Subindo PostgreSQL ($PGDATA)..."
  pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" \
    -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start
  sleep 3
  pg_isready -h 127.0.0.1 -p 5432
fi

# 4 ------------------------------------------------------------ dependências --
cd "$ROOT"
if [ ! -d node_modules ] || [ ! -d frontend/node_modules ]; then
  echo "📦 Instalando dependências..."
  npm install
fi

# 5 -------------------------------------------------------------- Prisma ------
npx prisma generate >/dev/null
npm run db:migrate:deploy

echo
echo "✅ Ambiente pronto!"
echo "   API      -> npm run dev:api  (http://localhost:4000)"
echo "   Frontend -> npm run dev:web  (http://localhost:5173)"
echo "   Tudo     -> npm run dev"
