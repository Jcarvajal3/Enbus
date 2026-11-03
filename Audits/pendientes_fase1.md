# Pendientes heredados de la fase 1 (para fases 2-3)

## Requieren migración / servidor (fase 2)
- RLS "Usuario compra boleto": INSERT en boletos solo rol 'user' -> venta en taquilla falla para taquillero/admin.
- Sin índice único parcial boletos(viaje_id, asiento) para RESERVADO/PAGADO/USADO.
- profiles sin sucursal_id; completeOnboarding no copia invitaciones.sucursal_id; encomiendas.sucursal_destino_id no se rellena (recepción compara ciudades).
- Despacho y venta no transaccionales (RPC).
- PENDIENTE_VERIFICACION no existe en enum estado_encomienda; recibir/[id] lo escribe y falla en silencio.
- RIF antiguos J-12345678 sin dígito verificador en cooperativas.rif.
- pagos sin columna para la tasa usada.
- PaymentFlow recibe monto en Bs; los callers deben convertir si precios pasan a USD.
- buscar.tsx: si falla insert de pagos tras crear boletos, error solo en DEV.

## UI (fase 3 / P1)
- entrega-modal.tsx: "Registrar Pago Digital" sin pago reportado llama procesarPago DIGITAL sin pagoExistenteId -> no escribe y devuelve éxito.
- recepcion-modal.tsx rechaza encomiendas en EN_RECEPCION (si se cierra el modal tras fallo del paso 2 queda atascada).
- entrega/page.tsx no filtra por sucursal.
- PC-36 parcial: lote premarcado y sin Deshacer al escanear.
- Hora VE pendiente: dashboard/page.tsx, entrega/page.tsx, entrega-modal.tsx (setHours), pago-modal.tsx, venta-flow.tsx; lib/utils.ts formatters sin timeZone.
- err.message crudo: pago-modal.tsx, venta-flow.tsx, entrega-modal.tsx; admin catch blocks (solicitudes, comisiones, cooperativas/actions).
- App: color primary/success/warning como texto aún en archivos no migrados; quitar tokens obsoletos de Text.tsx al final. viajes/[id].tsx err.message.
- APP-45 parcial: copiar PIN y resaltar solo en EN_OFICINA_DESTINO.
- Chip de Badge.tsx no acepta accessibilityLabel.
- Botón de PaymentFlow que llama onPaymentSuccess sin loading (desaparece con checkout atómico).
- Contador de tab bar blanco sobre coral 2.6:1.
- AD-04: "¿Olvidaste tu contraseña?" en login admin y contraste slate-500.
- AD-17: etiqueta "Período previsualizado".
- updateCooperativa permite logos de 5 MB.
- Panel registro: listUsers sin paginar; paso 1 sin <form>.
- Landing: fallback localhost:3001 en NEXT_PUBLIC_COOPERATIVAS_URL; reenviarInvitacion sin rate limit.
- APP-06 (restablecer contraseña) pendiente -> #23.
- expo-clipboard añadido: requiere rebuild del dev client.
