#!/bin/bash
# Ejecuta una prueba contra la base del proyecto por la Management API (sustituye \i 00_fixtures.sql).
# Uso: supabase/tests/robustez/run.sh 01_asientos_boletos.sql [más archivos…]
# Requiere el proxy autenticado de la Management API (o SUPABASE_ACCESS_TOKEN y quitar el comentario).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REF="${SUPABASE_PROJECT_REF:-tydpnvajwfzcsxsowctp}"
for f in "$@"; do
  echo "== $f"
  python3 - "$DIR" "$DIR/$f" > /tmp/enbus_prueba_body.json <<'PY'
import json, sys, re
d, f = sys.argv[1], sys.argv[2]
sql = open(f).read()
sql = re.sub(r'^\\i\s+(\S+)\s*$', lambda m: open(d + '/' + m.group(1)).read(), sql, flags=re.M)
print(json.dumps({"query": sql}))
PY
  curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H 'Content-Type: application/json' ${SUPABASE_ACCESS_TOKEN:+-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"} \
    -d @/tmp/enbus_prueba_body.json | python3 -c 'import json,sys
d=json.load(sys.stdin)
if isinstance(d,list) and d and "resultado" in d[-1]: print(d[-1]["resultado"])
else: print(json.dumps(d, ensure_ascii=False)[:3000]); sys.exit(1)'
done
