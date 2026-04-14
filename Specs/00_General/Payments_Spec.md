# Sistema de Pagos

## 1. Principio Fundamental
EnBus **no integra procesadores de pago** (Stripe, PayPal, etc.). Todos los pagos se realizan **por fuera de la app**, directamente entre el cliente y la cooperativa. La app solo:
1. Muestra los datos bancarios de la cooperativa.
2. Recibe la confirmación del pago por parte del cliente.
3. Permite al personal de la cooperativa verificar y aprobar el pago manualmente.

## 2. Métodos de Pago por Cooperativa
Cada cooperativa registra sus propios métodos de pago desde su Panel Administrativo. Los métodos de pago son almacenados en la tabla `metodos_pago_cooperativa` de la DB.

### 2.1 Estructura de un Método de Pago

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `cooperativa_id` | UUID FK | Cooperativa dueña del método |
| `tipo` | ENUM | `TRANSFERENCIA_BANCARIA`, `PAGO_MOVIL`, `ZELLE`, `EFECTIVO` |
| `banco` | TEXT | Nombre del banco (ej: "Banesco") |
| `titular` | TEXT | Nombre del titular de la cuenta |
| `numero_cuenta` | TEXT | Número de cuenta o teléfono (Pago Móvil) |
| `cedula_rif` | TEXT | Cédula o RIF del titular |
| `email_zelle` | TEXT | Email para Zelle (si aplica) |
| `instrucciones` | TEXT | Instrucciones adicionales (opcional) |
| `activo` | BOOLEAN | Si se muestra al público |

### 2.2 Quién los administra
- La **cooperativa misma** (rol `admin_cooperativa`) registra, edita y desactiva sus métodos de pago desde su Panel.
- El Super Admin puede verlos pero no editarlos.

## 3. Flujo de Pago Unificado (Encomiendas y Boletos)
El flujo de pago es **idéntico** para encomiendas y boletos:

```
┌─────────────────────────────────────────────────────────────┐
│  1. App muestra datos bancarios de la cooperativa           │
│     (todos los métodos de pago activos)                     │
│                                                             │
│  2. El cliente realiza el pago por fuera de la app          │
│     (transferencia, Pago Móvil, Zelle, efectivo)            │
│                                                             │
│  3. El cliente regresa a la app y confirma el pago:         │
│     ┌─────────────────────────────────────────────┐         │
│     │  • Número de referencia de la transacción   │         │
│     │  • Fecha de la transacción                  │         │
│     │  • Banco emisor (selección de lista)         │         │
│     └─────────────────────────────────────────────┘         │
│                                                             │
│  4. La información se envía al Panel de la Cooperativa      │
│                                                             │
│  5. El taquillero / admin cooperativa VERIFICA manualmente  │
│     el pago y presiona "Aprobar Pago"                       │
│                                                             │
│  6. El estado cambia: POR_PAGAR → PAGADA (encomienda)       │
│                       RESERVADO → PAGADO (boleto)           │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Caso especial: Pago en Efectivo
- Si el cliente paga en efectivo directamente en la taquilla, **no necesita confirmar en la app**.
- El taquillero presiona **"Cobrado en Efectivo"** en su Panel, lo cual marca el pago directamente.

### 3.2 Caso especial: Cobro en Destino (Encomiendas)
- El destinatario recibe notificación con el monto a pagar.
- **Opción A**: Paga desde la app (mismo flujo: ve datos bancarios, paga externamete, confirma en app). El taquillero de destino verifica.
- **Opción B**: Paga en efectivo al retirar. El taquillero de destino marca "Cobrado en Efectivo".

## 4. Datos de Confirmación de Pago (App → DB)

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `numero_referencia` | TEXT | Sí | Número de referencia de la transacción bancaria |
| `fecha_transaccion` | DATE | Sí | Fecha en que se realizó el pago |
| `banco_emisor` | TEXT | Sí | Banco desde el cual se realizó el pago |
| `metodo_pago_id` | UUID FK | Sí | Método de pago de la cooperativa que se utilizó |
| `monto` | DECIMAL | Sí | Monto pagado (auto-llenado por el sistema) |
| `tipo_pago` | ENUM | Sí | `DIGITAL` o `EFECTIVO` |

## 5. Tarifas Estandarizadas (Encomiendas)

### 5.1 Definición
Las tarifas de encomiendas son **estandarizadas por EnBus** y aceptadas por todas las cooperativas al afiliarse. No varían por cooperativa.

### 5.2 Fórmula de Cálculo
```
costo_envio = peso_kg × tarifa_por_kg × factor_distancia
```

Donde:
- `peso_kg`: Peso real de la encomienda (ingresado por el taquillero).
- `tarifa_por_kg`: Precio base por kilogramo (definido por Super Admin en la tabla `tarifas`).
- `factor_distancia`: Multiplicador basado en el **tiempo estimado de recorrido** de la ruta. Definido por Super Admin.

### 5.3 Administración de Tarifas
- La tabla `tarifas` es gestionada exclusivamente por el **Super Admin**.
- La cooperativa **no puede** modificar las tarifas.
- Los cambios de tarifas aplican solo a encomiendas nuevas (no retroactivos).

### 5.4 Calculadora Estimada (App)
La app ofrece una calculadora para que el usuario estime el costo antes de ir a taquilla:
- Inputs: Peso estimado (kg), Origen, Destino.
- Output: Costo estimado (indicando que es aproximado y el precio final se determina en taquilla con el peso real).

## 6. Precios de Boletos
- Los precios de los boletos son definidos por cada **cooperativa** al crear sus rutas y viajes.
- No están estandarizados pues dependen del tipo de servicio (ejecutivo, económico, etc.).
- El precio se muestra en la lista de resultados de búsqueda y en la página de detalles del viaje.

## 7. Comisiones (EnBus ← Cooperativas)
- EnBus cobra una **comisión porcentual** por cada transacción procesada (encomienda o boleto).
- El porcentaje de comisión es configurable por cooperativa desde el Panel Super Admin.
- Al final de cada ciclo (semanal/mensual), se genera un balance de lo que la cooperativa debe a EnBus.
- Ver `04_Web_Super_Admin/Comisiones_Spec.md` para el flujo completo de liquidación.

## 8. Reembolsos (Boletos)
- Al cancelar un boleto `PAGADO`, se genera un registro de reembolso.
- Monto del reembolso: **95% del valor del boleto** (penalidad del 5%).
- El reembolso es procesado **por la cooperativa** en 1-2 días hábiles.
- El reembolso se realiza por el mismo canal por el cual se pagó.
- EnBus **no gestiona** el reembolso directamente; solo lo registra en el sistema.

## 9. Seguro de Encomiendas
- Todo envío procesado por EnBus incluye un **seguro gratuito** contra pérdida.
- Cobertura: **3 veces el valor declarado del paquete**.
- El costo del seguro lo **absorbe EnBus** (no se cobra al cliente ni a la cooperativa).
- La activación del seguro requiere apertura de incidencia (ver `04_Web_Super_Admin/Incidencias_Spec.md`).
