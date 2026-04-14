# Panel Cooperativas: Entrega

## 1. Objetivo
Interfaz para que el taquillero de la sucursal de destino valide el PIN de retiro del destinatario y entregue la encomienda.

## 2. Interfaz

### 2.1 Vista Principal
- URL: `/cooperativas/entrega`
- Lista de encomiendas en estado `EN_OFICINA_DESTINO`, listas para retiro.
- Columnas: Tracking ID, Destinatario, Teléfono, Días en oficina, Modalidad de pago.
- **Alerta visual** para encomiendas con más de 3 días sin retirar (amarillo) y más de 4 días (rojo).

### 2.2 Flujo de Entrega
1. El destinatario se presenta en la taquilla con su cédula/RIF.
2. El taquillero busca la encomienda por Tracking ID o nombre del destinatario.
3. **Cobro en Destino (si aplica)**: Si `modalidad_pago = 'DESTINO'` y el pago no ha sido verificado:
   - Se le muestra al taquillero que hay un cobro pendiente.
   - Opción A: El taquillero verifica que el destinatario pagó desde la app (datos de pago visibles) → **"Aprobar Pago"**.
   - Opción B: El destinatario paga en efectivo → **"Cobrado en Efectivo"**.
4. **Validación del PIN**: Campo de 4 dígitos donde el taquillero ingresa el PIN que le dicta el destinatario.
   - Si es correcto → Confirmación visual verde.
   - Si es incorrecto → Error con contador de intentos restantes.
   - Si se agotan los 10 intentos → PIN bloqueado. Mensaje: "PIN bloqueado. El destinatario debe contactar a soporte."
5. **Confirmación**: Botón **"Confirmar Entrega"** (habilitado solo si PIN validado y pago verificado si aplica).
6. Estado cambia a `ENTREGADA`. No se envían notificaciones.

## 3. Reglas
- El PIN tiene máximo **10 intentos fallidos** antes de bloquearse (`encomiendas.pin_bloqueado = true`).
- Un PIN bloqueado solo puede desbloquearse por el Super Admin.
- El taquillero debe verificar la cédula/RIF del destinatario visualmente (no se valida en sistema).
- Las encomiendas con más de **5 días hábiles** en oficina serán marcadas automáticamente como `DEVUELTA` por el sistema (CRON job).
