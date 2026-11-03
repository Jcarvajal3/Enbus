# Artefactos compartidos

Lo que un pasajero o un remitente ve, dicta, escanea o lleva impreso: código de boleto,
QR del pase de abordaje, código de seguimiento de la encomienda, PIN de retiro, ticket
de boleto y guía de encomienda. Las tres apps (app móvil, panel y landing) los
muestran igual y la taquilla los acepta igual.

**Fuente de código:** `shared/artefactos.ts` (y `shared/ve.ts` para cédula, teléfono,
ciudades y fechas). `node shared/generar.mjs` lo copia como `artefactos.generated.ts` en
`EnBusApp/src/utils/`, `PanelCooperativas/src/lib/` y `LandingEnBus/lib/`. En la app se
importa desde `src/utils/codigos.ts`; en el panel y la landing, desde
`@/lib/artefactos.generated`. Ver `shared/README.md`.

Regla general: **se guarda en una forma, se muestra en otra legible y se acepta en
cualquier forma razonable** (mayúsculas o minúsculas, con o sin guiones o espacios).

---

## 1. Código de boleto

| | |
|---|---|
| **Se guarda** | `boletos.codigo_boleto` = `BOL-` + 8 caracteres hex en mayúsculas: `BOL-7CABE4AD` (lo genera `_codigo_boleto_nuevo`). |
| **Se muestra** | En dos bloques de 4, más fácil de dictar: `BOL-7CAB-E4AD` → `formatCodigoBoleto(codigo)`. Si no tiene esa forma, se muestra tal cual. Siempre en monoespaciada. |
| **Acepta la taquilla** | `BOL-7CABE4AD`, `BOL-7CAB-E4AD`, `bol 7cab e4ad`, `PASS-BOL-7CABE4AD` (el QR). `fn_validar_embarque` compara sin signos ni espacios y sin el prefijo `PASS`. En el cliente, `normalizarCodigoBoleto(entrada)` → `BOL-7CABE4AD` antes de enviar lo escrito. |
| **Dónde aparece** | App: pase de abordaje (`boletos/[id]`), compra (`boletos/compra/[id]`), "Mis boletos", tarjeta "Tu próximo viaje". Panel: ticket impreso (`print-helpers`), venta y embarque en taquilla de boletos, pasajeros del viaje, verificación de pagos, reembolsos, manifiesto, admin (usuarios e incidencias). |

## 2. QR del pase de abordaje

| | |
|---|---|
| **Contenido** | `boletos.qr_embarque_data` y, si falta, `PASS-<código guardado>`: `PASS-BOL-7CABE4AD` → `qrBoleto(boleto)`. |
| **Lo lee** | El lector o la cámara de la taquilla de boletos (embarque). Es lo mismo que escribir el código. |
| **Dónde aparece** | Pase de abordaje en la app; ticket impreso del panel. |

## 3. Código de seguimiento de encomienda

| | |
|---|---|
| **Se guarda** | `encomiendas.tracking_id` = `EB-AAMMDD-NNNNN` (fecha de creación + 5 dígitos): `EB-261004-46719` (trigger `generar_tracking_id`, función `generar_tracking_id_fn`). Patrón: `TRACKING_RE = /^EB-\d{6}-\d{5}$/`. |
| **Se muestra** | Igual que se guarda, en monoespaciada. |
| **Acepta** | Con minúsculas o espacios: `normalizarTracking(entrada)` (sin espacios y en mayúsculas); `esTracking(v)` dice si lo es. Taquilla de encomiendas, despacho, recepción en destino, entrega y "Rastrear" de la landing. |
| **QR de la guía** | El mismo código de seguimiento → `qrEncomienda(encomienda)`; si aún no tiene código, el `id`. |
| **Dónde aparece** | App: detalle de envío y de recepción, "Mis encomiendas". Panel: guía impresa, listas y diálogos de taquilla, despacho, recepción, entrega, Resumen, admin. Landing: `/rastrear`. |

## 4. PIN de retiro

| | |
|---|---|
| **Qué es** | 4 dígitos (`PIN_RETIRO_LONGITUD`) que el sistema asigna al pasar la encomienda a recepción; solo lo ven el remitente y el destinatario en la app, y va impreso en la guía. `pinValido(v)` → `/^\d{4}$/`. |
| **Intentos** | Se bloquea a los 10 intentos fallidos (`PIN_MAX_INTENTOS`); solo el administrador de la cooperativa o el equipo de EnBus lo desbloquean (`fn_desbloquear_pin`, con motivo). |
| **Validación** | `fn_validar_pin_retiro` deja una validación de 15 minutos (`PIN_VALIDACION_MINUTOS`) para el empleado que la hizo; `fn_entregar_encomienda` la exige y la consume. Pasados los 15 minutos: `EB_PIN_NO_VALIDADO` ("Vuelve a validar el PIN de retiro: la validación vence a los 15 minutos."). |
| **Sin PIN** | Solo el administrador de la cooperativa, con un motivo de al menos 10 caracteres. |
| **Dónde aparece** | App: detalle de la encomienda (remitente y destinatario). Panel: paso del PIN en "Entrega" (`pin-input`). Guía PDF e impresa. |

## 5. Ticket de boleto (impreso en taquilla)

En este orden, con los formatos compartidos:

1. Cooperativa
2. Ruta: `formatRuta` / `formatCiudad` ("Puerto La Cruz → Mérida")
3. Sale: fecha y hora de Venezuela (`formatFechaHoraVE`)
4. Unidad
5. Asiento
6. Pasajero
7. Cédula (`formatCedula`: "V-12.345.678")
8. Código en la forma mostrada (`formatCodigoBoleto`: "BOL-7CAB-E4AD")
9. QR (`qrBoleto`)
10. Total en Bs con su referencia "≈ USD" y la tasa BCV usada

## 6. Guía de encomienda (impresa y PDF)

1. Código de seguimiento (`EB-AAMMDD-NNNNN`) y su QR (`qrEncomienda`)
2. **Remitente real**: en las altas de taquilla, `remitente_nombre` / `remitente_telefono`, no el empleado que la registró
3. Destinatario: nombre, cédula (`formatCedula`) y teléfono (`formatTelefono`: "0414-123.45.67")
4. Ruta (`formatRuta`)
5. Modalidad de pago ("Pagada" o "Cobrar al retirar")
6. Costo (Bs con ≈ USD)
7. PIN de retiro

## 7. Cédula y teléfono (datos de personas en los artefactos)

| | Se guarda | Se muestra | Acepta |
|---|---|---|---|
| Cédula | `V-12345678` (`cedulaParaGuardar`) | `V-12.345.678`; RIF de 9 dígitos J/G/C: `J-12345678-9` (`formatCedula`) | Letra V, E, J, G, P o C (sin letra = V), con o sin puntos y guiones; 5 a 10 dígitos |
| Teléfono | `0414-1234567` (`telefonoParaGuardar`) | `0414-123.45.67` (`formatTelefono`) | `0414…`, `414…`, `+58 414…`, `58414…`; móviles 04xx y fijos 02xx |

Los marcadores `PENDIENTE-<id>` (cuentas de Google sin completar) cuentan como vacíos y
se muestran como "—".
