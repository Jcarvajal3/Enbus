# Flujos de taquilla como páginas + formatos de entrada unificados

Plan maestro (2026-11-19). Objetivo: que vender boletos y registrar encomiendas en el panel
navegue igual que en la app, en **páginas propias** (no diálogos), y que todos los campos de
la app, el panel de cooperativas y el admin usen **los mismos formatos y componentes**.

## 0. Reglas para todos los trabajos

- Lee `shared/README.md`, `PanelCooperativas/AGENTS.md` (Next 16: revisa `node_modules/next/dist/docs/` antes de usar APIs de routing / searchParams), `PanelCooperativas/DESIGN.md` y `EnBusApp/DESIGN.md`.
- **No toques** estos archivos (trabajo del usuario sin commitear): todo `src/app/(sitio)/**`, `src/components/sitio/**`, `src/lib/sitio/**`, `configuracion/actions.ts`, `configuracion/page.tsx`, `configuracion/tab-sucursales.tsx`, `src/lib/data/admin-tarifas.ts`, `src/components/push/**`, `Specs/05_Web_Landing_Page/**`. Si uno de ellos necesita un cambio, anótalo en tu informe final.
- No hagas commits, no cambies de rama, no ejecutes `next build` (lo corre el orquestador). Verifica con `npx tsc --noEmit -p .` y `npx eslint <archivos tocados>` en el proyecto correspondiente.
- Nunca edites un `*.generated.*`: edita `shared/` y ejecuta `node shared/generar.mjs`, luego `cd shared && npm test`.
- Solo toca los archivos de tu trabajo (sección 4). Si necesitas algo de otro trabajo, consúmelo por su API publicada aquí.
- Español en UI, comentarios y nombres, como el resto del código. Accesibilidad: label asociado, `aria-invalid`, `aria-describedby`, error con `role="alert"`.

## 1. Formatos canónicos (decisiones)

| Dato | Se muestra al escribir | Se guarda | Teclado | Placeholder |
|---|---|---|---|---|
| Teléfono | `0414-123.45.67` (máscara en vivo de `shared`) | `0414-1234567` (`telefonoParaGuardar`) | `tel` | `Ej. 0414-123.45.67` |
| Cédula | chips de letra + número con puntos `12.345.678` | `V-12345678` (`cedulaParaGuardar`) | numérico | `Ej. 12.345.678` |
| RIF | `J-12345678-9` (normaliza al salir del campo) | `normalizeRif` | texto, mayúsculas | `Ej. J-12345678-9` |
| Monto | `1.250,50` (coma decimal) | number (`leerMonto` de `shared/dinero.ts`) | decimal | `Ej. 1.250,00` |
| Fecha | calendario propio (sin `<input type=date>`) | `YYYY-MM-DD` en hora VE | — | `Elige la fecha` |
| Ciudad | buscador "Ciudad, Estado" agrupado por estado | `{ estado, ciudad }` | — | `Elige la ciudad` |
| Banco | buscador con código ("Banesco · 0134") + "Otro banco" | nombre del banco | — | `Elige el banco` |

- Placeholders siempre con `Ej. ` (sin dos puntos), igual que la app.
- Lo opcional se marca en la etiqueta con ` (opcional)`; nada de asteriscos.
- Un solo mensaje de error por campo bajo el campo, `role="alert"`; textos de `shared` (`TELEFONO_ERROR`, `CEDULA_ERROR`, `RIF_ERROR`, …). El ejemplo dentro de `TELEFONO_ERROR` pasa a `0414-123.45.67`.
- Letras de cédula por contexto (constantes nuevas en `shared/ve.ts`): `LETRAS_PERSONA = V,E` (perfil, empleados, chofer), `LETRAS_PASAJERO = V,E,P`, `LETRAS_ENCOMIENDA = V,E,J,P` (remitente/destinatario/retiro), `LETRAS_TITULAR = V,E,J,G,P` (titular de cuenta de pago). Una cédula guardada con otra letra no se pierde (se añade como chip).
- Mostrar datos guardados siempre con `formatTelefono` / `formatCedula` / `normalizeRif`; nada de helpers locales duplicados.

## 2. Flujos de taquilla como páginas

### 2.1 Armazón común (panel) `src/components/flujo/`
Equivalente web de `ScreenHeader variant="steps"` + `FloatingBar` de la app:
- `<FlujoPagina>`: página completa dentro del shell del panel (en móvil ocupa todo el ancho; contenido centrado `max-w-2xl` en escritorio). Cabecera con botón ← (`aria-label` "Volver al paso anterior" / "Salir de la venta"), título del paso, indicador de tramos + "Paso n de N" (igual a la app). Fases sin número (p. ej. "Boletos emitidos") ocultan el indicador.
- `<BarraFlujo resumen acciones>`: barra fija al fondo (respeta `safe-area-inset-bottom` y el sidebar en escritorio), línea de resumen encima y botón principal a todo el ancho en móvil, botón secundario opcional.
- `usePasoEnUrl(pasos)`: el paso vive en `?paso=` (push al avanzar, así **atrás del navegador = paso anterior** como `useWizardBack`); si se llega a un paso sin el estado necesario, vuelve al primero válido con `replace`.
- `useSalidaProtegida(sucio)`: confirmación "¿Salir sin terminar? / Perderás los datos que ingresaste." al salir con datos (← en el paso 1, enlaces del sidebar, `beforeunload`), bloqueada mientras se envía.

### 2.2 Venta de boletos `/cooperativas/taquilla/boletos/vender`
Pasos (mismos títulos y orden que la app, en voz del operador):
1. **Elige la salida** — `SelectorDia` (con el nuevo `FechaField` para "otra fecha") + filtro de ruta + lista de salidas (radio). `?viaje=<id>` preselecciona y salta al paso 2 (lo usa Embarque). CTA "Continuar".
2. **Elige los asientos** — mapa del bus alineado visualmente con la app (chofer, puerta, leyenda Libre/Ocupado/Elegido). CTA "Continuar" con resumen "Asientos 3 y 4 · Bs X".
3. **¿Quién viaja?** — una tarjeta "Asiento N" por asiento: Nombre y apellido, `CedulaField` (`LETRAS_PASAJERO`), `TelefonoField` (opcional). Mismo patrón de error/enfoque que la app.
4. **¿Cómo pagó?** — `CobroTaquillaForm` actual (efectivo Bs/USD con vuelto, punto de venta, PM/transferencia/Zelle) con los campos nuevos (`MontoField`, `FechaField`, `BancoField`). CTA "Cobrar Bs X".
- Fase final **Boletos emitidos** (como "Tu compra"): resumen cobrado/recibido/vuelto, tarjetas con QR, "Imprimir", "Vender otro" (conserva día y ruta) y "Listo" (vuelve a `?volver=` o a la lista de taquilla).
- Cobrar una reserva hecha en la app: página `/cooperativas/taquilla/boletos/cobrar/[compraId]` (paso único "¿Cómo pagó?" + fase "Boletos emitidos").
- Se conserva todo lo que hoy es solo del panel (ver informe en §5): idempotencia, `requireOnline`, manejo de `EB_*`, impresión Bluetooth/navegador, aviso de venta repetida, límite 200 viajes.
- Los botones "Vender boletos" / "Cobrar" de taquilla y Embarque pasan a ser enlaces (`?volver=embarque` cuando viene de Embarque).

### 2.3 Encomienda `/cooperativas/taquilla/encomiendas/nueva`
Pasos (mismos de la app):
1. **¿A dónde la envías?** — sucursal de origen (solo si el usuario no tiene una asignada) + destino entre las rutas activas que salen de esa ciudad (tarjetas seleccionables, "Crear ruta" para admin) + "Desde Bs X (1 kg)".
2. **Detalles de la encomienda** — secciones "Quien envía" y "Quien recibe" (Nombre, `CedulaField` `LETRAS_ENCOMIENDA`, `TelefonoField`), "Contenido" (descripción, peso kg obligatorio, valor USD opcional, costo estimado en vivo), "¿Quién paga?" (Paga al enviar / Paga al retirar).
3. **Revisa y registra** — resumen por bloques con "Editar" (vuelve al paso y el CTA dice "Volver al resumen", como AN-20). CTA "Registrar y recibir".
- Fases tras registrar (sin número de paso): **Encomienda registrada** (PIN, costo, WhatsApp, imprimir guía) → **Foto del paquete** → **Cobro** (solo ORIGEN + POR_PAGAR) → vuelve a la lista con la encomienda abierta (`?encomienda=<id>`).
- La foto y el cobro se extraen a componentes de contenido reutilizables; `PhotoCaptureModal` y `PagoModal` siguen existiendo como envoltorios de diálogo para la recepción de encomiendas creadas en la app y para `entrega-modal` (`CobroEncomiendaForm` mantiene su export).

## 3. Componentes de campo

### Panel `src/components/campos/` (reemplaza `components/ve-fields.tsx`)
Todos construidos sobre `ui/field.tsx` (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`), controlados, con `id`, `label`, `value`, `onChange`, `error`, `ayuda`, `opcional`, `disabled`, `name` (input oculto con la forma guardada para server actions), `enterKeyHint`, `autoFocus`:
`Campo` (texto genérico), `TelefonoField`, `CedulaField` (chips), `RifField`, `MontoField` (`moneda: "Bs" | "USD"`), `FechaField` (calendario en popover en escritorio / hoja en móvil, atajos Hoy/Mañana, `min`, `max`, `diasActivos`), `HoraField`, `CiudadField` (combobox con búsqueda agrupado por estado; emite `{estado, ciudad}`), `BancoField`, y un `index.ts` que los exporta. Usa `@base-ui/react` (`combobox`, `popover`) que ya está instalado.

### App `EnBusApp/src/components`
`TelefonoField` y `CedulaField` usan las mismas funciones de `shared` (máscara en edición, número con puntos), constantes de letras por contexto, `leerMonto` compartido y la lista de bancos compartida.

### Shared
- `shared/ve.ts`: `mascaraTelefono` cubre también la edición (prefijo `+58` a medio escribir, borrar sobre un separador borra el dígito) mediante una función pura `editarTelefono(anterior, nuevo)`; `mascaraCedulaNumero` (puntos de miles); constantes `LETRAS_*`; placeholders y errores actualizados.
- `shared/dinero.ts`: `leerMonto(texto)` único (coma decimal, punto de miles; "12.5" y "12,5" → 12.5; "1.250" → 1250; "1.250,50" → 1250.5; acepta prefijos Bs/USD/$; máx. 2 decimales; inválido → null) + `MONTO_PLACEHOLDER`.
- `shared/bancos.ts` (nuevo, añadido a `generar.mjs`): lista única de bancos VE (código + nombre) que hoy está en `PanelCooperativas/src/lib/bancos.ts` y en la app.
- Pruebas en `shared/tests/` para todo lo nuevo.

## 4. Reparto de trabajos (propiedad de archivos)

| Fase | Trabajo | Archivos |
|---|---|---|
| 1 | **A. Shared + campos del panel** | `shared/**`, generados, `PanelCooperativas/src/components/campos/**` (nuevo), `components/ve-fields.tsx` (se elimina; actualizar sus importadores: `buses/client.tsx`, `tab-metodos-pago.tsx`, `registro/page.tsx`, `entrega-modal.tsx`, `nueva-encomienda-dialog.tsx` solo el import), `src/lib/bancos.ts`, `src/lib/ve.ts`, `src/lib/dinero.ts` |
| 1 | **B. Armazón de flujo del panel** | `PanelCooperativas/src/components/flujo/**` (nuevo) |
| 2 | **C. App** | `EnBusApp/**` (salvo generados) |
| 2 | **D. Boletos como página** | `components/boletos/**`, `app/cooperativas/(panel)/taquilla/boletos/**`, `app/cooperativas/(panel)/embarque/**` |
| 2 | **E. Encomienda como página** | `components/encomiendas/**`, `app/cooperativas/(panel)/taquilla/encomiendas/**`, y solo el import en `components/entrega/entrega-modal.tsx` si cambia la ruta de `CobroEncomiendaForm` |
| 2 | **F. Resto de formularios del panel y admin** | todo `PanelCooperativas/src` no listado en D/E ni en "no tocar" |
| 3 | **G. Revisión** | solo lectura + informe |

## 5. Referencia: estado actual
- Venta actual: `components/boletos/venta-flow.tsx` (`VentaFlow` diálogo de 5 pasos, `CobroTaquillaForm`, `CobrarReservaDialog`, `TicketsEmitidos`), montada en `taquilla/boletos/page.tsx` (~l.397, 407) y `embarque/page.tsx` (~l.488, 501). RPC `fn_vender_boletos_taquilla`, `fn_cobrar_reserva_taquilla` vía `taquilla/boletos/actions.ts`.
- Encomienda actual: `NuevaEncomiendaDialog` → `PhotoCaptureModal` → `PagoModal`, orquestado por `modalState` en `taquilla/encomiendas/page.tsx`. RPC `fn_registrar_encomienda_taquilla`, `fn_cobrar_encomienda_taquilla`, `fn_cotizar_envio_publico`.
- App: `EnBusApp/app/boletos/buscar.tsx` (wizard 4 pasos), `EnBusApp/app/encomiendas/nueva.tsx` (wizard 3 pasos), `ScreenHeader variant="steps"`, `FloatingBar`.
