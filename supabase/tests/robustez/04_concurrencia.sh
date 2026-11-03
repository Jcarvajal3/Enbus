#!/bin/bash
# Prueba de concurrencia REAL (dos conexiones a la vez) contra la base del proyecto:
#   1. Dos pasajeros apartan el mismo asiento al mismo tiempo: uno lo obtiene, el otro recibe
#      EB_ASIENTO_OCUPADO (el candado del viaje serializa; el índice único es la última defensa).
#   2. Dos pagos con la misma referencia en la misma cooperativa al mismo tiempo: el segundo recibe
#      EB_REFERENCIA_REPETIDA (candado consultivo del trigger aa_referencia_unica_pago).
# Confirma datos de prueba y los borra al final (también si algo falla).
set -uo pipefail
REF="${SUPABASE_PROJECT_REF:-tydpnvajwfzcsxsowctp}"
API="https://api.supabase.com/v1/projects/$REF/database/query"
q() { python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$1" | curl -sS -X POST "$API" -H 'Content-Type: application/json' -d @-; echo; }
P1=61673358-fc41-4a22-8cf3-6caa775c8680; P2=b3315b30-03b1-4ee6-b962-97f68a943c72
C1=aaaaaaaa-0000-4000-8000-000000000001; C2=aaaaaaaa-0000-4000-8000-000000000002
VIAJE=$(q "select v.id from viajes v join rutas r on r.id=v.ruta_id join cooperativas c on c.id=v.cooperativa_id where v.estado='PROGRAMADO' and v.fecha_hora_salida > now() + interval '1 day' and r.activa and c.estado='ACTIVA' and coalesce(r.precio_pasaje,0)>0 and not exists (select 1 from boletos b where b.viaje_id=v.id and b.asiento='29' and b.estado in ('RESERVADO','PAGADO','USADO')) order by v.fecha_hora_salida limit 1" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')
limpiar() { q "delete from pagos where numero_referencia = '55443322' and boleto_id in (select id from boletos where compra_id in ('$C1','$C2')); delete from boletos where compra_id in ('$C1','$C2'); select asientos_disponibles from viajes where id = '$VIAJE'" >/dev/null; }
trap limpiar EXIT
DISP0=$(q "select asientos_disponibles d from viajes where id='$VIAJE'" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["d"])')
reservar() { q "begin; set local role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true); select public.fn_reservar_asientos('$2', '$VIAJE', array['29'])->'boletos' b; select pg_sleep($3); commit;"; }
echo "== 1. mismo asiento a la vez (viaje $VIAJE)"
reservar $P1 $C1 3 > /tmp/enbus_c1.out &
sleep 1
reservar $P2 $C2 0 > /tmp/enbus_c2.out
wait
R1=$(cat /tmp/enbus_c1.out); R2=$(cat /tmp/enbus_c2.out)
echo "P1: ${R1:0:160}"; echo "P2: ${R2:0:200}"
N=$(q "select count(*) n from boletos where viaje_id='$VIAJE' and asiento='29' and estado in ('RESERVADO','PAGADO','USADO')" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["n"])')
DISP1=$(q "select asientos_disponibles d from viajes where id='$VIAJE'" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["d"])')
if [[ "$R2" == *EB_ASIENTO_OCUPADO* && "$N" == 1 && $((DISP0 - 1)) == "$DISP1" ]]; then echo "ok: un solo boleto para el asiento 29; contador $DISP0 → $DISP1"; else echo "FALLO: boletos=$N contador $DISP0 → $DISP1"; exit 1; fi

echo "== 2. misma referencia de pago a la vez"
BOL=$(q "select id from boletos where compra_id='$C1' limit 1" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')
COOP=$(q "select cooperativa_id c from viajes where id='$VIAJE'" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["c"])')
pagar() { q "begin; insert into pagos (boleto_id, pagador_id, cooperativa_id, monto, tipo_pago, numero_referencia, verificado) values ('$BOL', '$1', '$COOP', 1, 'DIGITAL', '55443322', false) returning id; select pg_sleep($2); commit;"; }
pagar $P1 3 > /tmp/enbus_p1.out &
sleep 1
pagar $P2 0 > /tmp/enbus_p2.out
wait
S1=$(cat /tmp/enbus_p1.out); S2=$(cat /tmp/enbus_p2.out)
echo "1º: ${S1:0:120}"; echo "2º: ${S2:0:200}"
M=$(q "select count(*) n from pagos where numero_referencia='55443322' and cooperativa_id='$COOP'" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["n"])')
if [[ "$S2" == *EB_REFERENCIA_REPETIDA* && "$M" == 1 ]]; then echo "ok: un solo pago con la referencia"; else echo "FALLO: pagos=$M"; exit 1; fi
