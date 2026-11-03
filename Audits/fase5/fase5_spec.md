# Fase 5 · Coherencia UX/UI: especificación de implementación

Entrada: `app_navegacion.md` (AN-), `app_ui.md` (AU-), `panel_navegacion.md` (PN-), `panel_ui.md` (PU-), `admin.md` (AD5-), `sistema.md` (SY-). Este documento manda sobre ellas cuando chocan. Los IDs remiten a la fila de la auditoría ("Cambio propuesto"); aquí solo se amplía lo ambiguo o lo que cambia.

Objetivo: misma navegación, mismos componentes y mismo lenguaje visual en app, panel, admin y landing. **Sin funcionalidades nuevas y sin párrafos explicativos.**

## 1. Decisiones

| # | Decisión |
|---|---|
| D1 | Acción principal = amarillo `primary` + texto `ink` en los tres productos. Fuera `gradient` y todo texto blanco sobre amarillo/coral/azul vivo. `accent-strong` (#2F5FD0, token nuevo) = selección y estado activo (chip, asiento, opción, casilla, interruptor, foco, pestaña activa de la barra de la app, contador activo). Enlaces = `info-text`. Coral = solo dominio de encomiendas. Prevalece sobre la regla 4–5 de `app_ui.md`, AU-05, AU-11, AN-12 regla 12, AN-25, SY-20 (color del enlace) y PU regla 5–6 / PU-33 (selección amarilla). |
| D2 | Pestañas de la app: Inicio · Boletos · Encomiendas (AN-04 = SY-15). Boletos siempre antes que Encomiendas en todo listado de dominios. |
| D3 | App: una sola hoja de confirmación (`ConfirmSheet` sobre `BottomSheet`, vía `useConfirm()`), cero `Alert.alert`. Web: solo `ConfirmDialog`. Botones: confirmar arriba (verbo + objeto), salir debajo (`ghost`). Textos de AN-02 se sustituyen por los de SY-25. |
| D4 | Fechas y horas solo con `shared/ve.ts`, 12 h. App y landing (pasajero): "mar. 3 nov.", "2:30 p. m.", "mar. 3 nov. · 2:30 p. m.". Panel y admin (tablas): "03/11/2026", "03/11 · 2:30 p. m."; listas relativas con `formatHaceTiempo`. Separador fecha-hora: " · ". |
| D5 | Contraseña: mínimo 8 en app, panel y Supabase (`CLAVE_MINIMO`, `CLAVE_AYUDA`, `CLAVE_ERROR`). |
| D6 | Marca: bloque "EB" (texto `ink` 800 sobre `primary`, cuadrado, radio = 30 % del lado, fuente 42 % del lado) + "EnBus" + subzona. Un componente por producto con la misma geometría (§3). Iconos, splash, favicons y PWA salen de `shared/marca/eb.svg` con `shared/marca/generar-iconos.mjs` (Playwright global vía `createRequire`, ICO escrito a mano, sin dependencias). `app.json`: solo `name: "EnBus"`, iconos y splash. |
| D7 | Menús por grupos (§2.1) con contadores: cooperativas desde `fn_bandeja_cooperativa`; admin con las consultas que ya existen (solicitudes en revisión; incidencias ABIERTA + EN_PROCESO). PU-37 queda absorbido por PN-02. |
| D8 | Solicitud del admin con `?id=` (AD5-02); bucle de PN-01 corregido; `INICIO = "/cooperativas/dashboard"` para ambos roles (PN-04). |
| D9 | Radios: una escala, `tokens.radio` (valores sin cambiar), que `generar.mjs` escribe en `@theme` (SY-32). Uso por rol: control y chip `full`; app tarjeta `xl`, bloque interno `lg`, hoja `3xl`; web superficie (tarjeta, tabla, mosaico, aviso) `rounded-md` (16), capa (diálogo, hoja, menú, popover) `rounded-lg` (20), ítem interno de menú `rounded-sm`. Sustituye la escala reducida de PU-08 (su regla 3 se cumple con estos roles). `--radius-4xl` desaparece. |
| D10 | Ruta (origen/destino): iconos neutros, nunca azul ni coral. Origen `Circle` bold y destino `MapPin` fill, ambos `foreground`, en círculo `surface`. Mismo `RouteField` en Inicio, compra y envío; `RouteSummary` usa los mismos dos glifos. Resuelve AU-12, AU-15 y SY-14. |
| D11 | Etiqueta de correo = **"Correo"** en todas partes (SY-05 sobre PN-29 y PU-20, que pedían "Correo electrónico"). |
| D12 | Botones de salida: **"Atrás"** = paso anterior de un asistente (web; en la app es la ← de la cabecera). **"Volver"** = salir sin hacer nada cuando la acción es "Cancelar …". **"Cancelar"** = salir de un diálogo neutro. **"Listo"** = cerrar tras un éxito. "Cerrar" solo en la × y en avisos. Ajusta SY §4.4 ("Volver" en asistentes) a PN-28/PU-29. |
| D13 | "Suspendida" es `peligro` para cooperativa y cuenta, y el botón "Suspender …" es destructivo en ambos (SY-10/SY-11 sobre AD5-11 y regla 7 de `admin.md`). |
| D14 | Web: un único `ThemeProvider` en `app/layout.tsx` de panel; `Toaster` dentro. Logins y pantallas públicas siguen el tema elegido (sin `forcedTheme`, sin `dark` forzado). |
| D15 | Barra superior del panel y del admin: lista = "Grupo › Sección" (grupo en texto, oculto `< md`; sin grupo no se dibuja miga); detalle = "Sección › Objeto" (sección enlazada). `PageHeader` deja de llevar migas. Resuelve PN-03, PU-38 y AD5-05. |
| D16 | Descripción de `PageHeader`: ninguna en pantallas operativas (Resumen, taquillas, Pagos, Despacho, Recepción, Entrega; PU-35); en gestión y admin, una línea ≤ 60 caracteres o ninguna (textos de PN-10 y AD5-26 para las que la conservan). |
| D17 | Página: raíz `flex flex-col gap-6`, ancho completo, sin animación de entrada (PU-28 sobre PN-25). Configuración e Impresora y lector: `max-w-4xl` sin `mx-auto` (también su `loading`). |
| D18 | Anchos web: `DialogContent tamano` = `confirmar` (`sm:max-w-md`) · `formulario` (`sm:max-w-lg`, por defecto) · `flujo` (`sm:max-w-2xl`); todos con `max-h-[calc(100dvh-2rem)] overflow-y-auto` en la base. Hoja lateral única: derecha, `sm:max-w-xl`, título = identidad del objeto + `StatusBadge`. |
| D19 | Control segmentado (app `SegmentedControl`, web `TabsList`): pastilla `background` sobre pista `surface`/`muted`, texto `foreground` semibold; inactivo `muted-foreground`. No usa azul (es superficie, no selección de dato). |
| D20 | Gráficos: Boletos = `chart-3` (azul), Encomiendas = `chart-2` (coral oscurecido a #E5562A en claro, ≥ 3:1), series sin dominio = `chart-5` (tinta en claro, #D4D2CC en oscuro). Prevalece sobre AD5-23 (que invertía colores); el resto de AD5-23 vale. |
| D21 | Iconos Phosphor: el peso acompaña al texto. App: `bold` en botones, chips y filas; `regular` en cabecera (campana y avatar), pestañas inactivas y estados vacíos; `fill` en pestaña activa y en iconos de estado. Web: `regular` por defecto (también en botones); `fill` solo en iconos de estado (toasts, avisos, opción elegida). `duotone` prohibido en todo el sistema. Las insignias no llevan icono. |
| D22 | Contador del asistente: "Paso 2 de 4" (AU-42 sobre "01/0N" de AN regla 7). |
| D23 | Estado de la impresora: chip en la barra superior del shell, junto a la tasa (PN-06 sobre PU-26). Las cabeceras de página no llevan botón de impresora. |
| D24 | Asiento (app y panel): disponible blanco con borde `border-strong`; ocupado relleno `surface-dark`/`muted` + número `muted-foreground`, sin tachar ni check; elegido `accent-strong` + número blanco. Prevalece sobre AU-50 (tachado) y PU-33 (amarillo). |
| D25 | Las variantes retiradas (`accent`, `gradient`, `dangerSoft`, `glow`, `Text color="accent"|"secondary"`, `PageTransition`, `PageHeader migas`, `formatters.timeOnly/dateTime/dateFull`, `lib/utils dateFormatter*`) se conservan en la oleada 1 como alias `@deprecated` para que todo compile; la oleada 2 deja de usarlas y la integración las borra (§5). |
| D26 | Fuera de alcance: **PN-31** (renombrar `/dashboard` y `/hardware`): rompe marcadores, enlaces de correos y el `start_url` de la PWA sin beneficio visible. |

## 2. Sistema unificado

### 2.1 Navegación

**App**
1. Pestañas Inicio · Boletos · Encomiendas. Nombre de pestaña = H1 sin "Mis" ("Mis boletos", "Mis encomiendas").
2. Cabecera de pestaña: `ScreenHeader large`, título + `HeaderActions`; sin subtítulo. Inicio usa el mismo `ScreenHeader` con `BrandMark conNombre` como título (AN-22): campana y avatar no se mueven.
3. Cabecera de detalle: `compact`, ← (`useVolver`), ceja = nombre del objeto igual al de su lista ("Pase de abordaje" solo si PAGADO, si no "Boleto"; "Enviada" / "Para mí"), título = código, nunca truncado; estado en `status` (fila bajo el título). `right` solo para `IconButton`.
4. ← nunca muerta: `useVolver(padre)`. Padres: boleto, compra, viaje → `/(tabs)/boletos`; encomienda enviada → `/(tabs)/encomiendas?vista=enviadas`; recibida → `/(tabs)/encomiendas?vista=para-mi`; perfil, notificaciones, ayuda → `/(tabs)`; `cuenta/*` → `/perfil`; auth → `/login`. `unstable_settings.initialRouteName = '(tabs)'`.
5. Transiciones: pantalla empujada `slide_from_right` (sin `PageTransition`); hoja (`BottomSheet`) para selectores, tareas cortas y confirmaciones; ninguna pantalla completa sube desde abajo.
6. Asistentes: `ScreenHeader steps` ("Paso n de N" + título del paso); acción del paso en `FloatingBar` con 1 línea de resumen encima ("Asiento 6 · Bs 17.822,11"); tocar una opción selecciona, el botón avanza; los subpasos (forma de pago) se cierran con la misma ←.
7. Fin de asistente: `dismissTo(lista)` + `push(resultado)`; ← desde el resultado cae en la lista donde vive.
8. Sin sesión: `/login?volver=<ruta interna>`; tras entrar, `replace(volver ?? '/(tabs)')`.
9. Filas que abren algo: `EntityCard` con chevron. Vacío de lista: título + 1 línea + 1 acción.
10. Fila de menú = H1 de destino ("Ayuda"). Un nombre no designa dos lugares ("Avisos que recibes" ≠ "Notificaciones").

**Panel de cooperativas** (orden del mostrador; el taquillero ve el mismo orden con menos ítems; un grupo vacío no se dibuja)
- Resumen · **Ventas y cobros**: Taquilla de boletos, Taquilla de encomiendas, Pagos por verificar [n], Reembolsos [n] · **Encomiendas en ruta**: Despacho, Recepción en destino [n], Entrega [n, tono aviso] · **Operación**: Viajes, Rutas · **Cooperativa**: Empleados, Configuración · pie: Impresora y lector, usuario.

**Admin**
- Resumen · **Por atender**: Solicitudes [n], Incidencias [n] · **Directorio**: Cooperativas, Usuarios, Encomiendas · **Dinero**: Comisiones, Tarifas.

**Reglas web (ambas zonas)**
1. Nombre de sección idéntico en menú, miga, H1 y pestaña del navegador ("<Sección> · EnBus"; por defecto "Panel de cooperativas · EnBus" / "Administración · EnBus"; auth "Iniciar sesión · EnBus").
2. Un icono por sección (`ICONO_SECCION`), repetido en todo lo que lleve a ella y no usado para otra cosa. Unidad = `Bus`; escanear = `QrCode`.
3. Contexto en el shell: cooperativa · sucursal en la cabecera del menú (chip ámbar "Sin sucursal" si falta); tasa BCV e impresora en la barra superior. Nunca en descripciones.
4. Página = lista; hoja = ver un objeto (D18); diálogo = hacer una tarea; `ConfirmDialog` = confirmar. En el admin todo detalle es página con URL salvo la solicitud (hoja con `?id=`).
5. Todo filtro, pestaña y objeto abierto vive en la URL (`?estado= ?q= ?fecha= ?tab= ?vista= ?viaje= ?encomienda= ?id= ?pagina=`), con `useParamUrl`/`BarraFiltros`/`TabsUrl`.
6. Toda fila que es un objeto lo abre (`CeldaEnlace`); una celda que nombra otro objeto lo enlaza; acciones en la última columna (`size="sm" variant="outline"` + "⋯" `ghost icon-sm`).
7. Sección sin permiso → `redirect(INICIO)`. Con sesión de otra zona → su inicio (PN-01).
8. Menú `collapsible="icon"`, cerrado por defecto `< 1280 px`; enlace "Saltar al contenido" a `#contenido` en ambos shells.

### 2.2 Estructura de página

- **App:** `Screen` (fondo `background`) → `ScreenHeader` → contenido con margen lateral `Layout.screenPadding` (24, Inicio incluido), secciones a 24, dentro de tarjeta 12–16 → `FloatingBar` si hay acción principal de paso o de pantalla.
- **Web:** `PageHeader` (H1 + `estado` + como máximo 1 `default` + 1 `outline` + menú "Más") → `BarraFiltros` o `TabsUrl` → contenido (`Card` con la tabla). Raíz `flex flex-col gap-6`.

### 2.3 Visuales

| Tema | App | Web (panel, admin, landing) |
|---|---|---|
| Tipografía | Pestaña `title` 30; detalle, paso y hoja `heading` 20; tarjeta y vacío `subheading` 17; 24 solo cifras. `overline` solo en `SectionLabel` (sustantivo, nunca pregunta). Sin `capitalize`. | H1 `text-2xl font-semibold tracking-tight`; H2 `text-lg font-semibold`; tarjeta/diálogo `text-base font-semibold`; cuerpo `text-sm`; meta `text-xs`. Sin `uppercase`, sin `font-bold` salvo KPI, sin `text-xl`. |
| Espaciado | Solo `Spacing` (sin `± n`). | Página `gap-6`, tarjeta `gap-4`, campo `gap-2`, botones `gap-2`; icono con el `gap` del botón, nunca `mr-*`. |
| Radios | D9. | D9. Logo con `BrandMark`. |
| Superficies | Pantalla blanca; tarjeta `sunken` sin sombra; sombra solo en lo que flota (barra de pestañas, `FloatingBar`, toast, hoja). Detalles hermanos con el mismo fondo y tarjeta. | `Card` = `rounded-md border border-border bg-card`, sin `ring` ni sombra; tabla dentro de `Card p-0 overflow-hidden`. Nada de cajas a mano. |
| Color | D1. Amarillo = marca y acción; `primaryLight` para cajas de monto. Estados según `sistema.md` §4.1. | Igual. `bg-accent`/`text-accent-foreground` prohibidos fuera de gráficos; `secondary` = `muted`. Hover/foco de menús y selects `bg-muted text-foreground`. |
| Iconos | D21. `md` 18 en filas, `lg` 22 en cabecera y barra. Nunca el mismo icono en todas las filas. Métodos: `DeviceMobile` Pago Móvil, `Bank` Transferencia, `CurrencyDollar` Zelle, `Money` taquilla/efectivo. | D21. `size-4` en botones y texto, `size-5` en títulos y KPI, siempre `aria-hidden` si decorativo. |
| Botones | `primary` (1 por pantalla, `lg` 52 en pantalla y `FloatingBar`, `md` 44 en tarjetas y vacíos), `secondary`, `outline`, `ghost`, `danger` (relleno `dangerText` + blanco, solo en la confirmación), `dangerGhost` (abre la confirmación). Deshabilitado: relleno `surfaceDark` + texto `mutedForeground`, sin opacidad. Etiqueta ≤ 3 palabras. CTA de dominio con su icono (`Ticket` / `Package`). | `default` (amarillo, 1 por vista o diálogo), `outline`, `secondary` (muted), `ghost` (solo iconos de fila), `destructive` (`bg-destructive-text text-background`), `link` (`text-info-text font-medium underline-offset-4 hover:underline`). `default` en páginas y diálogos, `sm` en filas. Sin alturas a mano. Pie de diálogo: salida `outline` a la izquierda, acción a la derecha. |
| Campos | Borde en reposo `borderStrong`; etiqueta, texto y ayuda al mismo borde izquierdo; mismo `tone` en una tarjeta; marcador solo de formato "Ej. 0414-1234567" (nunca nombres ni "••••"); en web sin anillo doble. | `Field`/`FieldLabel`/`FieldDescription`; borde `border-input-border`, fondo `bg-background`; etiqueta `text-foreground font-medium`; error `text-destructive-text` en lugar de la ayuda; reglas fijas (contraseña) en `FieldDescription`, no en el marcador. |
| Tablas | — | Cabecera `bg-muted/50 text-muted-foreground font-medium`; montos, pesos, asientos, diferencias `text-right tabular-nums`; fecha y estado a la izquierda; códigos `font-mono text-sm text-foreground`; asiento `Badge outline font-mono`; columnas secundarias `hidden lg:table-cell`; paginar a partir de 25 filas ("Página 2 de 47"). |
| Hojas y diálogos | Confirmación `ConfirmSheet`; selector (ciudad, fecha, banco) `BottomSheet`; pie con área segura. Nada centrado. | D18. Un solo botón de cierre. Errores dentro del diálogo con `AvisoError`, nunca toast. |
| Vacío / carga / error | `EmptyState` (icono `regular` del dominio, título sin punto, 1 línea, 1 acción) · esqueleto con la forma de la pantalla (`ScreenSkeleton`); spinner solo en botones · `ErrorState` con `WarningCircle` y "Reintentar". | `EmptyState` (o `compacto`, o `FilaVacia` en tabla) · `TablaSkeleton` igual en `loading.tsx` y en el primer render; spinner solo en botones · `ErrorState` (`compacto` en tarjeta, tabla y diálogo). Nunca texto rojo suelto ni "Recarga la página". |
| Feedback | Toast: error persiste, éxito 3 s. Sin conexión: ámbar `warning-light` + `WifiSlash` bold, "Sin conexión. Ves lo último guardado."; al volver, toast verde "Conexión restaurada" 3 s. | Sonner: `closeButton`, iconos `fill` en color del tono, éxito/info 3 s, error con `avisarError` (persistente). Sin conexión ámbar: "Sin conexión. No se guardarán cambios."; "Conexión restaurada" 3 s. |
| Movimiento | Duraciones de `Motion`; toda animación respeta `useReducedMotion`. | `motion-safe:` en toda animación; sin animación de entrada de página. |
| Contraste | Texto ≥ 4,5:1, bordes de control ≥ 3:1, claro y oscuro (web). Ningún texto sobre `primary`/`secondary`/`accent` que no sea `ink`. Áreas táctiles ≥ 44 pt. | Igual; foco visible con `ring` (`accent-strong`). |

### 2.4 Estados y vocabulario canónicos

Canon = `sistema.md` §4.1 (tonos), §4.2 (tabla de estados), §4.3 (formatos) y §4.4 (verbos), **con estas correcciones**:

| Punto | Corrección |
|---|---|
| Selección (§4.3) | Siempre `accent-strong` con texto blanco (no `accent` con texto grande). |
| Enlace (§4.3) | `info-text`, peso 500–600, subrayado al hover/foco en web y siempre en texto corrido (D1). |
| Fechas (§4.3) | D4. "Fecha y hora" = "03/11/2026 · 2:30 p. m." (web) / "mar. 3 nov. · 2:30 p. m." (app). |
| cobro encomienda · COSTO_PENDIENTE (operador) | "Por calcular" · neutro (sustituye la propuesta "Sin costo"). |
| cuenta (§4.2) | Se usa también para empleados (la etiqueta "Desactivado" y el verbo "Desactivar cuenta" pasan a "Suspendida" / "Suspender cuenta" / "Reactivar cuenta") y para usuarios del admin. |
| Dominios nuevos | `recurso` (ruta, sucursal, método: Activa exito / Inactiva neutro) · `tarifa` (Vigente exito / Programada info / Anterior neutro) · `prioridad` (Alta peligro / Media pendiente / Baja neutro) · `reputacion` (etiquetas y umbrales actuales de `cooperativa-detail-tabs.tsx`; tonos exito / pendiente / peligro) · `retencion` (etiquetas actuales de `entrega/page.tsx:63-100`; tonos según §4.1). Avisos que no son estado ("Quedan 3", "Sin sucursal", "2 ciclos sin pagar") van con `TonoBadge`. |
| Volver / Atrás (§4.4) | D12. |
| Campos (§4.4) | "Correo" (D11). Contraseña: ayuda "Mínimo 8 caracteres.", error "Usa al menos 8 caracteres.". |
| Verbos añadidos | "Verificar pago" (no "Validar pago" ni "Verificar" a secas) · "Programar viaje" ("Programar N salidas" solo en lote) · "Marcar salida" / "Marcar llegada" · "Ir al Resumen" · "Ir a Mis boletos" · "Entrar \| Crear cuenta" (segmento del login) · éxito "Listo" con `CheckCircle`. |
| Insignias | Sin icono; app 12 pt `semibold`, web `text-xs font-semibold`. Terminado app = `done` (`surfaceDark` + `foreground`); neutro app = contorno. |

## 3. Contratos

Los alias `@deprecated` de D25 conservan la firma actual. Ningún cluster cambia una firma de esta sección.

### 3.1 `shared/` (W1-SHARED)

`tokens.json`:
- `claro` y `oscuro`: `accent-strong: #2F5FD0`, `accent-strong-foreground: #FFFFFF`. `ring`: claro `#2F5FD0`, oscuro `#5C8DFA`. `secondary-foreground`: `#202020` (ambos). `chart-2` claro `#E5562A`. `chart-5` oscuro `#D4D2CC`. Oscuro: `border-strong` y `input-border` `#757575`, `muted` `#2E2E2E`.
- `paleta.blue-dark` → `{claro.accent-strong}`.
- `generar.mjs` escribe en `tokens.generated.css` (panel y landing) un bloque `@theme { --radius-xs … --radius-3xl, --radius-full: 9999px }` desde `tokens.radio`, y genera además `errores.generated.ts` y `dinero.generated.ts` en los tres proyectos (app `src/utils/`, panel `src/lib/`, landing `lib/`). `--check` cubre los nuevos.

`ve.ts` (se añade; lo existente no cambia salvo lo indicado):
```ts
export const CLAVE_MINIMO = 8;
export const CLAVE_AYUDA = "Mínimo 8 caracteres.";
export const CLAVE_ERROR = "Usa al menos 8 caracteres.";
/** "mar. 3 nov." (con año si no es el actual: "mar. 3 nov. 2025"). Acepta ISO, Date o 'YYYY-MM-DD' (sin correr de día). */
export function formatDiaVE(valor: string | number | Date, ahora?: Date): string;
/** "mar. 3 nov. · 2:30 p. m." */
export function formatDiaHoraVE(valor: string | number | Date, ahora?: Date): string;
/** "03/11 · 2:30 p. m." (tablas del panel). */
export function formatFechaHoraCortaVE(valor: string | number | Date): string;
/** "hoy" → "Hoy". */
export function capitalizarInicio(s: string): string;
// Cambian: formatFechaHoraVE → "03/11/2026 · 2:30 p. m." (separador " · ");
// formatCiudad: en el respaldo, de/del/la/las/los/y en minúscula salvo al inicio (SY-21).
```
`artefactos.ts`: `normalizarTracking("EB26100312345")` → `"EB-261003-12345"` (acepta sin guiones, como la landing).

`errores.ts` (nuevo, TS puro):
```ts
export const MSG: {
  sinRed: string; generico: string; sesionVencida: string; enlaceVencido: string; correoInvalido: string;
  credenciales: string; usuarioNoExiste: string; cedulaDuplicada: string; demasiadosIntentos: string; claveCorta: string;
};
export function mensajeAuth(codigoOMensaje: string | null | undefined): string | null; // Supabase Auth → texto del catálogo
export function mensajePostgres(code: string | null | undefined): string | null;        // 23505, 42501, PGRST… → texto
```
Textos: sinRed "Sin conexión. Revisa tu internet e intenta de nuevo."; generico "Algo falló. Intenta de nuevo en unos segundos."; sesionVencida "Tu sesión venció. Inicia sesión de nuevo."; claveCorta = `CLAVE_ERROR`. App y panel conservan `humanizeError` con su firma y sus textos de contexto (asiento ocupado, "Otro compañero ya resolvió este pago").

`dinero.ts` (nuevo): el contrato común de los tres `dinero.ts` actuales; cada proyecto conserva su `dinero.ts` como reexportación (la app añade ahí `tasaRefDe`).

### 3.2 App (W1-APP-UI)

```ts
// src/theme.ts (añade; todo lo demás se conserva)
Colors.accentStrong; Colors.accentStrongForeground; Colors.link /* = infoText */;
export type StatusTone = 'neutral' | 'pending' | 'progress' | 'success' | 'danger' | 'done' | 'brand';
// StatusPalette.done = { bg: surfaceDark, fg: foreground }; StatusPalette.neutral = { bg: white, fg: mutedForeground, border: border }

// src/hooks/useVolver.ts
export function volver(router: Router, padre: Href): void; // canGoBack() ? back() : dismissTo(padre) (si no hay pila: replace(padre))
export function useVolver(padre: Href): () => void;

// src/components/ui/ConfirmSheet.tsx
export interface ConfirmOptions {
  titulo: string;                 // "¿Cancelar este envío?"
  mensaje?: string;               // una línea
  confirmar: string;              // verbo + objeto: "Cancelar envío"
  salir?: string;                 // por defecto D12: "Volver" si confirmar empieza por "Cancelar", si no "Cancelar"
  tono?: 'danger' | 'primary';    // por defecto 'danger'
}
export function ConfirmSheet(p: ConfirmOptions & { visible: boolean; cargando?: boolean; onConfirm(): void; onClose(): void }): JSX.Element;
export function ConfirmProvider(p: { children: React.ReactNode }): JSX.Element; // montado en app/_layout.tsx
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean>;
// useWizardBack conserva su firma; pregunta con useConfirm: "¿Salir sin terminar?" · "Salir sin guardar" / "Seguir editando"

// src/components/ui/Button.tsx
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerGhost'
  | /** @deprecated → primary */ 'accent' | /** @deprecated → primary */ 'gradient' | /** @deprecated → dangerGhost */ 'dangerSoft';
// variant por defecto 'primary'; `glow` @deprecated (no hace nada)

// src/components/ui/Text.tsx
export type TextColorToken = 'foreground' | 'muted' | 'primaryText' | 'successText' | 'warningText' | 'infoText' | 'link'
  | 'dangerText' | 'inverse' | /** @deprecated → link */ 'accent' | /** @deprecated → foreground */ 'secondary' | /** @deprecated → dangerText */ 'danger';
export function TextLink(p: { children: string; onPress(): void; accessibilityLabel?: string }): JSX.Element; // link, semibold, subrayado, ≥ 44 pt

// src/components/ui/Badge.tsx — Badge/StatusBadge: 12 pt semibold, `icon` @deprecated (no se dibuja); tono 'done'
// Chip: selected = accentStrong + blanco; inactivo = surface sin borde. CountPill active = accentStrong.

// src/components/ui/EntityCard.tsx — `initial` y `tone` @deprecated (no se dibujan); `chevron` por defecto true si hay onPress y no es selectable;
// selected = borde 2 accentStrong + CheckCircle fill accentStrong

// src/components/ui/ScreenHeader.tsx — añade
status?: React.ReactNode;  // fila bajo el título (compact); el título no se trunca (numberOfLines 1 + adjustsFontSizeToFit, minimumFontScale 0.85)
// eyebrow numberOfLines 1; steps: "Paso {step} de {totalSteps}"; `subtitle` se conserva pero no se usa en pestañas

// src/components/ui/BottomSheet.tsx — añade
onBack?: () => void;       // flecha ← a la izquierda del título (subpasos)
// pie con paddingBottom Spacing['2xl'] + insets.bottom

// src/components/BrandMark.tsx
export function BrandMark(p: { size?: 32 | 40 | 56; conNombre?: boolean; subtitulo?: string }): JSX.Element; // D6

// src/components/RouteField.tsx
export function RouteField(p: {
  origen: Localidad | null; destino: Localidad | null;
  onOrigen(l: Localidad): void; onDestino(l: Localidad): void;
  onIntercambiar?: () => void;                 // botón ⇅; oculto si falta
  origenes?: Localidad[]; destinos?: Localidad[];
  recientes?: Localidad[]; populares?: Localidad[];
  disabled?: boolean; error?: string | null;
}): JSX.Element; // tarjetas apiladas "Origen"/"Destino", marcador "Elige la ciudad", iconos D10, abre LocationSelector

// src/components/SkeletonLoader.tsx — añade
export function ScreenSkeleton(p: { variante: 'lista' | 'detalle' | 'perfil' }): JSX.Element;
// LoadingState queda @deprecated; PageTransition pasa a ser un passthrough @deprecated
// TransactionCard conserva sus props y se dibuja con EntityCard (insignia + código, título, subtítulo, chevron, sin icono)
// CedulaField: añade `tone?: FieldTone`; ayuda a todo el ancho bajo la fila
```

### 3.3 Panel: componentes (W1-PANEL-UI)

```ts
// components/ui/dialog.tsx
DialogContent: props actuales + { tamano?: "confirmar" | "formulario" | "flujo" }   // D18
// components/ui/sheet.tsx: SheetContent side="right" → w-full sm:max-w-xl (único ancho)
// components/ui/button.tsx: variants default | outline | secondary | ghost | destructive | link (§2.3); rounded-full
// components/ui/badge.tsx: default | secondary (bg-muted text-foreground) | outline | destructive (bg-destructive-light text-destructive-deep) | link
// components/ui/tabs.tsx: TabsList h-auto, overflow-x-auto sin envolver; TabsTrigger acepta render={<Link …/>}

// components/status-badge.tsx
export function StatusBadge(p: { status: string | null | undefined; dominio?: Dominio; audiencia?: "operador" | "pasajero"; className?: string }): JSX.Element;
export function TonoBadge(p: { tono: Tono; children: React.ReactNode; className?: string }): JSX.Element;
// Dominio (lib/estados.ts, W1-SHARED) += "cuenta" | "recurso" | "tarifa" | "prioridad" | "reputacion" | "retencion"

// components/page-header.tsx
interface PageHeaderProps { title: string; description?: string; estado?: React.ReactNode; children?: React.ReactNode;
  /** @deprecated D15: usar <MigaObjeto> */ migas?: Array<{ label: string; href?: string }> }

// components/empty-state.tsx
interface EmptyStateProps { icon: Icon; title: string; description?: string; action?: React.ReactNode; compacto?: boolean }
// components/fila-vacia.tsx
export function FilaVacia(p: { colSpan: number; icon?: Icon; titulo: string; accion?: React.ReactNode }): JSX.Element; // TableRow h-32
// components/error-state.tsx: misma firma; icono WarningCircle regular
// components/aviso-error.tsx
export function AvisoError(p: { children: React.ReactNode; className?: string }): JSX.Element; // role="alert", destructive-light/deep, WarningCircle fill
// components/tabla-skeleton.tsx
export function TablaSkeleton(p: { columnas: number; filas?: number /* 6 */; conFiltros?: boolean }): JSX.Element;
// components/kpi-card.tsx (generaliza components/admin/dashboard/kpi-card.tsx; mismas props)
export function KpiCard(p: { title: string; value: React.ReactNode; icon: Icon; variant?: "default" | "warning"; description?: string;
  detail?: string | null; delta?: DeltaKPI | null; href?: string; accion?: string; grande?: boolean }): JSX.Element;
// components/opcion-tile.tsx
export function GrupoOpciones(p: { etiqueta: string; children: React.ReactNode; className?: string }): JSX.Element; // role="radiogroup", flechas
export function OpcionTile(p: { seleccionado: boolean; onSelect(): void; titulo: React.ReactNode; detalle?: React.ReactNode;
  icono?: Icon; disabled?: boolean; className?: string }): JSX.Element; // role="radio"; rounded-md p-4; seleccionado = border-accent-strong ring-1 ring-accent-strong bg-accent-light + CheckCircle fill

// hooks/use-param-url.ts
export function useParamUrl(param: string, defecto?: string): [string, (v: string | null) => void];
// router.replace(…, { scroll: false }); quita el parámetro si v es null o === defecto; al cambiar un filtro borra ?pagina=
// components/barra-filtros.tsx
export type OpcionFiltro = { valor: string; etiqueta: string };
export function BarraFiltros(p: {
  busqueda?: { etiqueta: string; placeholder?: string; param?: string /* "q" */ };
  selects?: Array<{ param: string; etiqueta: string; opciones: OpcionFiltro[]; todas?: string /* "Todas" */ }>;
  fechas?: Array<{ param: string; etiqueta: string }>;
  children?: React.ReactNode; className?: string;
}): JSX.Element; // Label visible, lupa, debounce 300 ms; Select h-9 text-sm; "Limpiar filtros" ghost al final si hay alguno activo; sin botón "Buscar"
export function TabsUrl(p: { param: string; defecto: string; opciones: Array<{ valor: string; etiqueta: string; conteo?: number }>; className?: string }): JSX.Element;
// components/paginacion-tabla.tsx
export function usePaginacion<T>(items: T[], porPagina?: number /* 25 */): { pagina: number; paginas: number; visibles: T[]; ir(p: number): void }; // ?pagina=
export function PaginacionTabla(p: { pagina: number; paginas: number; onCambio(p: number): void }): JSX.Element | null; // "Página 2 de 47"; null si 1

// lib/avisos.ts
export function avisarError(mensaje: string): void; // persistente, con cierre
export function avisarExito(mensaje: string): void; // 3 s
export function avisarInfo(mensaje: string): void;  // 3 s
// confirm-dialog.tsx: misma firma; tamano "confirmar"; destructivo = Button destructive; textoCancelar por defecto según D12; error con AvisoError
```

### 3.4 Panel: shells y navegación (W1-PANEL-SHELL)

```ts
// lib/navigation.ts
export const INICIO = "/cooperativas/dashboard";
export type ClaveContador = "pagos_por_verificar" | "reembolsos_por_devolver" | "encomiendas_en_camino" | "encomiendas_por_vencer";
export type NavItem = { title: string; href: string; icon: Icon; roles: RolPanel[]; contador?: ClaveContador; tonoContador?: "neutro" | "aviso" };
export type NavGrupo = { titulo?: string; items: NavItem[] };
export const NAV_GRUPOS: NavGrupo[];   // §2.1
export const NAV_PIE: NavItem[];       // Impresora y lector
export const ICONO_SECCION: { resumen: Icon; taquillaBoletos: Icon; taquillaEncomiendas: Icon; pagos: Icon; reembolsos: Icon; despacho: Icon;
  recepcion: Icon; entrega: Icon; viajes: Icon; rutas: Icon; empleados: Icon; configuracion: Icon; impresora: Icon; unidad: Icon; escanear: Icon };
// Rutas = MapTrifold, Despacho = TruckTrailer, Recepción = DownloadSimple, Unidad = Bus, Escanear = QrCode (el resto, los de hoy)
export function navParaRol(rol: RolPanel): NavGrupo[];
export function seccionDe(pathname: string): { grupo?: string; item: NavItem } | null;
/** @deprecated */ export const NAV_ITEMS: NavItem[];

// lib/admin-navigation.ts
export type ClaveContadorAdmin = "solicitudes" | "incidencias";
export const ADMIN_NAV_GRUPOS: Array<{ titulo?: string; items: Array<{ title: string; href: string; icon: Icon; contador?: ClaveContadorAdmin }> }>; // §2.1; "Buscar encomienda" → "Encomiendas"
/** @deprecated */ export const ADMIN_NAV_ITEMS;

// lib/data/contadores-menu.ts ("use server")
export async function contadoresCooperativa(): Promise<Partial<Record<ClaveContador, number>>>; // fn_bandeja_cooperativa
export async function contadoresAdmin(): Promise<Record<ClaveContadorAdmin, number>>;           // mismas consultas que el sidebar y el KPI
// los sidebars los piden al montar, al cambiar de ruta y cada 60 s; 0 no se dibuja

// components/miga-objeto.tsx (cliente)
export function MigaObjeto(p: { label: string }): null; // registra "Sección › {label}" en la barra superior; se limpia al desmontar
// components/auth-layout.tsx
export function AuthLayout(p: { zona: "cooperativas" | "admin"; titulo: string; descripcion?: string; children: React.ReactNode; pie?: React.ReactNode }): JSX.Element;
// lg+: panel izquierdo bg-muted con BrandMark lg conNombre + zona; tarjeta max-w-md `border-0 bg-transparent shadow-none lg:border lg:bg-card`; titulo = h1 en todos los anchos
// components/brand-mark.tsx
export function BrandMark(p: { tamano?: "sm" | "md" | "lg" /* 32 | 40 | 48 */; conNombre?: boolean; zona?: "Cooperativas" | "Administración"; className?: string }): JSX.Element;
// components/impresora-chip.tsx — usa useImpresora() sin cambiar su firma; punto verde/ámbar/gris + "Impresora" (solo icono < sm), enlace a /cooperativas/hardware
// TasaBCVChip: < sm "BCV 245,67" (texto completo en title); ámbar si desactualizada; en el admin enlaza a /admin/tarifas#tasa-bcv
// lib/supabase/cached.ts: UserProfile += sucursal_nombre: string | null
```
Login: el layout de cooperativas, con sesión de otra zona, redirige a `/admin/dashboard` (super_admin) o a `/cooperativas/login?motivo=sin-acceso`; el middleware no redirige `/cooperativas/login` cuando trae `motivo`.

### 3.5 Contratos entre clusters de la oleada 2

| Contrato | Lo produce | Lo consume |
|---|---|---|
| `/(tabs)/encomiendas?vista=enviadas\|para-mi` abre ese segmento | W2-APP-ENCOMIENDAS | padres de `useVolver` (W1-APP-UI) y fin del asistente en `nueva.tsx` (AN-05) |
| `/login?volver=<ruta interna>` | W1-APP-UI (`_layout.tsx` lo añade) | W2-APP-CUENTA (`login.tsx` lo lee) |
| `/cooperativas/login?motivo=sin-acceso` y `?error=auth-callback-failed` | W1-PANEL-SHELL | W2-PANEL-GESTION (login muestra el aviso y, con `motivo`, hace `signOut()`) |
| `/cooperativas/taquilla/encomiendas?estado=PAGADA` abre la pestaña "Lista para despacho" | W2-PANEL-MOSTRADOR | W2-PANEL-GESTION (bandeja, PN-15) |
| `components/viajes/viaje-sheet.tsx`: `ViajeSheet(p: { viajeId: string \| null; onOpenChange(o: boolean): void })` | W2-PANEL-MOSTRADOR | interno (Viajes y Taquilla de boletos) |
| `/admin/solicitudes?id=<cooperativaId>` abre la hoja | W2-ADMIN | interno (Resumen, detalle de cooperativa) |
| `id="tasa-bcv"` en la tarjeta de tasa de `/admin/tarifas` | W2-ADMIN | W1-PANEL-SHELL (enlace del chip) |
| `/admin/comisiones?cooperativa=<id>&estado=pendiente` | W2-ADMIN | interno |

## 4. Oleadas y clusters

**Criterio común (todos):** `npx tsc --noEmit` y lint del proyecto sin errores en los archivos propios; `node shared/generar.mjs --check` OK; los `*.generated.*` no se editan a mano; firmas de §3 sin cambiar; ningún `catch` que termine solo en `console.*`; textos según §2.4. Un cluster que necesite cambiar un archivo ajeno lo anota en sus notas y no lo edita. "Apoyo" = otro cluster aplica la parte que cae en sus archivos; el dueño del ID verifica el resultado al final.

**Barrido app (cada cluster W2-APP en sus archivos; en W1-APP-UI ya como reglas de lint `warn`):** `grep -rn "Alert.alert"` = 0 · `router.back()` solo en `useVolver.ts` · ningún `variant="accent"|"gradient"|"dangerSoft"`, `glow`, `color="accent"|"secondary"|"danger"` · ningún `textTransform: 'capitalize'` · ningún `timeOnly|dateTime|dateFull|hour12: false|new Intl.DateTimeFormat` fuera de `formatters.ts` · ningún `PageTransition` ni `LoadingState` de pantalla · ningún `right={<StatusBadge` · ningún `Spacing.<x> ± n` · ningún `"Desde"`/`"Hacia"` · confirmaciones con `useConfirm`/`ConfirmSheet`, sin "Sí, …" · toda animación con `useReducedMotion` · marcadores solo "Ej. …" · ← con `useVolver`.

**Barrido panel (cada cluster W2-PANEL y W2-ADMIN en sus archivos):** `npx eslint` sin avisos en sus archivos · ningún `toast.error(` (usar `avisarError`) · ningún estado pintado a mano (`<Badge className="…bg-(success|warning|destructive|info)…">` = 0; `StatusBadge`/`TonoBadge`) · `DialogContent`/`SheetContent` sin `max-w-*`/`max-h-*` propios (usar `tamano`) · ningún `mr-1|mr-2` en iconos, `h-4 w-4`, `weight="duotone"`, `weight="bold"` en botones · raíz de página `flex flex-col gap-6` sin `animate-in`/`space-y-6` · H2 `text-lg font-semibold`, ningún `text-xl` · sin `uppercase tracking-*` en microetiquetas · sin spinner de página ni "Cargando…" (`TablaSkeleton`), sin error ni vacío a mano · filtros y objetos abiertos en la URL · ningún `migas=` (usar `MigaObjeto`) · fechas solo con `ve.ts` · cédula, teléfono, RIF con `@/lib/ve` · tablas según §2.3, paginación > 25 filas · ningún `bg-accent`/`hover:bg-accent` · `rounded` suelto → `rounded-sm` · vocabulario §2.4.

**Capturas (al cerrar cada cluster W2 y en la integración):** con `qa/shot.mjs`, app a 390 y 360 (pasajero y anon) y panel a 1440, 1024 y 390 (taquillero, admincoop, superadmin, anon) de cada pantalla tocada, en claro y en oscuro (web). Si una cuenta sigue sin rol, se anota y se revisa por código.

### Oleada 1 (fundamentos, en paralelo; solo dependen de contratos de §3 y de exportaciones actuales)

**W1-SHARED** — tokens, formatos, catálogos y vocabulario
- Archivos: `shared/{tokens.json,ve.ts,artefactos.ts,generar.mjs,README.md}`, nuevos `shared/{errores.ts,dinero.ts}`; todos los `*.generated.*` (actuales y los nuevos `errores.generated.ts`, `dinero.generated.ts` en los tres proyectos); `PanelCooperativas/src/app/globals.css`; `EnBusApp/src/utils/{formatters,dinero,errores}.ts`; `PanelCooperativas/src/lib/{dinero,errores,estados,utils,fechas,ve}.ts`, `PanelCooperativas/src/lib/types/pagos.ts`; `LandingEnBus/lib/dinero.ts`; `supabase/config.toml`; `Specs/00_General/Glosario.md`.
- IDs: SY-06, SY-07, SY-10, SY-11 (apoyo W1-APP-UI: `tone: 'progress'` en la app), SY-12, SY-30, SY-32, SY-34, PU-41, PN-33. (10)
- Aceptación: §3.1 completo; `globals.css` mapea `--color-accent-strong` y `--color-accent-strong-foreground` y ya no escribe `--radius-*`; `grep -rn "radius-4xl"` en `globals.css` = 0; `formatters.timeOnly/dateTime/dateFull` y `lib/utils dateFormatter*` quedan como alias 12 h sobre `ve.ts`; `formatSalidaCorta` = `formatFechaHoraCortaVE`; `lib/estados.ts` con los dominios de §2.4, cooperativa SUSPENDIDA `peligro`, `TONO_PASAJERO.incidencia.ABIERTA = "info"`, `super_admin: "Administrador EnBus"`; `minimum_password_length = 8`; Glosario §3–4 actualizado (tonos, cuenta, "Impresora y lector", "Sucursales", verbos de §2.4); tsc de los tres proyectos OK.

**W1-MARCA** — marca, iconos y landing
- Archivos: `shared/marca/**` (nuevos `eb.svg`, `generar-iconos.mjs`); `EnBusApp/assets/images/**`; `EnBusApp/app.json` (solo `name`, `icon`, `android.adaptiveIcon`, `web.favicon`, plugin `expo-splash-screen`); `PanelCooperativas/public/**`; `PanelCooperativas/src/app/{favicon.ico,icon.png,apple-icon.png}`; `LandingEnBus/**` salvo `*.generated.*` y `lib/dinero.ts`.
- IDs: SY-01, SY-04 (apoyo W1-APP-UI y W1-PANEL-SHELL: sus `BrandMark`), AU-06 (apoyo W1-APP-UI: arranque y login; W2-APP-VIAJES: Inicio), SY-21, SY-33. (5)
- Apoyo en la landing: botón `default` amarillo salvo el del héroe, título `"%s · EnBus"` y enlace `info-text` (de los IDs de sistema de W1-APP-UI, W1-PANEL-SHELL y W1-PANEL-UI).
- Aceptación: `node shared/marca/generar-iconos.mjs` regenera `icon.png` 1024, `android-icon-{foreground,background,monochrome}.png`, `splash-icon.png`, `favicon.png` (app), `icon-192/512.png`, `favicon.ico` (16/32/48) y `apple-icon.png` (panel y landing) sin dependencias nuevas; `app.json` `name: "EnBus"`, adaptive `backgroundColor: "#FFC757"`, splash `#FFFFFF` (oscuro `#141414`); `manifest.json` `theme_color: "#FFC757"`, `background_color: "#FFFFFF"`; caché de `sw.js` versionada; borrados `react-logo*`, `partial-react-logo.png` y los SVG de plantilla de `public/` sin uso (`gradient-1.png` se borra en la integración si W2-APP-VIAJES deja de usarlo); landing con `components/brand-mark.tsx` (geometría D6) en navbar y footer, `formatCiudad`/`normalizarTracking` en lugar de `nombreLocalidad`/`normalizarCodigoSeguimiento` (borrados), botones y `.campo-control` `rounded-full`, sin `--radius-*` a mano; capturas del icono a 1024/192/32.

**W1-APP-UI** — primitivas, navegación y tema de la app
- Archivos: `EnBusApp/src/theme.ts`, `src/utils/estados.ts`; `src/components/ui/**` (incluido el nuevo `ConfirmSheet.tsx`); `src/components/{Toast,PageTransition,PressableScale,SkeletonLoader,StaggerItem,CardSkeleton,HeaderActions,ErrorBoundary,StatusTimeline,StarRating,QRCodeViewer,CalendarModal,LocationSelector,CedulaField,TelefonoField,TransactionCard}.tsx`, nuevos `src/components/{BrandMark,RouteField}.tsx`; `src/hooks/useWizardBack.ts`, nuevo `src/hooks/useVolver.ts`; `app/_layout.tsx`, `app/(tabs)/_layout.tsx`; `EnBusApp/eslint.config.js`; `EnBusApp/DESIGN.md`.
- IDs: AN-01, AN-02, AN-04, AN-08, AN-11, AN-23, AN-33, AU-02, AU-04, AU-05, AU-08, AU-09, AU-10, AU-21, AU-25, AU-26, AU-27, AU-33, AU-35, AU-36, AU-40, AU-42, AU-45, AU-46, AU-47, AU-48, AU-49, SY-02, SY-09 (apoyo W1-PANEL-UI: `connectivity-banner`), SY-15, SY-22, SY-23 (apoyo W1-PANEL-UI), SY-24 (apoyo W1-PANEL-UI), SY-25 (copy en `useWizardBack`; el resto por barrido), SY-31. (35)
- Aceptación: §3.2 completo; `unstable_settings` y transiciones únicas en `_layout.tsx` (sin `slide_from_bottom`); `ConfirmProvider` montado; banner sin conexión ámbar + toast "Conexión restaurada"; arranque y login con `BrandMark`; `Tabs.Screen` en orden index · boletos · encomiendas, etiqueta `xs`, contador `primary` + `ink`; `HeaderActions` ambos `regular`; `CalendarModal` sobre `BottomSheet` (chips "Hoy", "Mañana", "jue. 5" con margen final); `LocationSelector` sin icono repetido en filas; `InfoRow` y etiquetas sin mayúsculas; `Monto sm` → `caption`; `Field` borde `borderStrong`, error `dangerText`, `outlineStyle: 'none'` en web; animaciones de StatusTimeline, StarRating, QRCodeViewer, SegmentedControl, StepDot, indicador de pestañas y pulso de arranque con `useReducedMotion` y `Motion`; lint con las reglas del barrido app en `warn`; `DESIGN.md` con §2 (ejemplos "Mis boletos"/"Mis encomiendas", SY-36 en documentación); tsc 0 errores (alias D25 en uso por pantallas permitidos).

**W1-PANEL-UI** — primitivas y componentes comunes del panel
- Archivos: `PanelCooperativas/src/components/ui/**`; `src/components/{status-badge,page-header,empty-state,error-state,confirm-dialog,connectivity-banner,monto,celda-enlace,ve-fields}.tsx`; nuevos `src/components/{fila-vacia,aviso-error,tabla-skeleton,kpi-card,opcion-tile,barra-filtros,paginacion-tabla}.tsx`, `src/hooks/use-param-url.ts`, `src/lib/avisos.ts`; `PanelCooperativas/eslint.config.mjs`.
- IDs: SY-08, SY-17, SY-18, SY-20, SY-26, PU-01, PU-03, PU-04, PU-05, PU-06, PU-07, PU-08, PU-09, PU-10, PU-13, PU-15, PU-17, PU-19, PU-24, PN-27. (20)
- Aceptación: §3.3 completo; `grep -n "focus:bg-accent\|text-accent-foreground" src/components/ui` = 0 y prueba de foco (ítem señalado legible, como `qa/panel_ui/selfocus.mjs`); `border-input-border` y `bg-background` en input, select, textarea y checkbox; casilla, interruptor y radio marcados en `accent-strong`; radios por rol D9 en todos los `ui/*` (sin `rounded-4xl`/`rounded-3xl`); `Card` sin `ring`; `CardTitle`/`DialogTitle`/`PageHeader` `font-semibold`; `sonner.tsx` según §2.3; `connectivity-banner` ámbar con los textos de §2.3; `ConfirmDialog` con `Button destructive` y `AvisoError`; `StatusBadge` `text-xs font-semibold` con las clases de `sistema.md` §4.1; reglas `no-restricted-syntax` del barrido panel en `warn` (`weight="duotone"`, `h-[3-6] w-[3-6]`, `toast.error`, `bg-accent`, `rounded` suelto); tsc y eslint 0 errores.

**W1-PANEL-SHELL** — shells, menús, títulos, rutas de entrada y auth común
- Archivos: `PanelCooperativas/src/app/{layout,page}.tsx`; `src/app/cooperativas/page.tsx`; `src/app/cooperativas/(panel)/{layout,loading,error,not-found}.tsx`; nuevo `src/app/admin/layout.tsx`; `src/app/admin/page.tsx`; `src/app/admin/(panel)/{layout,loading,error,not-found}.tsx`; `src/components/{panel-shell,app-sidebar,admin-shell,admin-sidebar,tasa-bcv-provider,theme-provider,service-worker-registrar}.tsx`, nuevos `src/components/{miga-objeto,auth-layout,brand-mark,impresora-chip}.tsx`; `src/lib/{navigation,admin-navigation}.ts`, nuevo `src/lib/data/contadores-menu.ts`; `src/lib/supabase/{middleware,cached,auth-guards}.ts`; `src/proxy.ts`; `src/hooks/{use-mobile.ts,use-user.tsx}`.
- IDs: SY-19, PN-01, PN-02, PN-03, PN-04 (apoyo W2-PANEL-GESTION: login, invitación, restablecer), PN-05 (apoyo W2-PANEL-MOSTRADOR: quitar el botón "Pagos por verificar (n)"), PN-06, PN-07 (apoyo W2-PANEL-MOSTRADOR), PN-11, PN-13, PN-18 (apoyo W2: columnas `hidden lg:table-cell`), PN-20, PN-21, PN-25, PN-30, PU-23, PU-36, PU-37, PU-38, AD5-03, AD5-05, AD5-06 (apoyo W2-ADMIN: quitar `TasaBCVCard` del Resumen), AD5-40, AD5-41, AD5-42, AD5-43. (26)
- Aceptación: §3.4 completo; menús según §2.1 con `SidebarGroupLabel`, contadores (0 no se dibuja), `aria-current`, `aria-hidden`, `collapsible="icon"`; cabecera del menú "Cooperativa · Sucursal" sin `max-w-[150px]`; barra superior D15 + `TasaBCVChip` + `ImpresoraChip` en ambos shells (el admin sin impresora); `<title>` "<Sección> · EnBus" desde `seccionDe` y plantilla `"%s · EnBus"` en `app/layout.tsx`; `ThemeProvider` raíz con `Toaster` dentro; `INICIO` en middleware, `cooperativas/page.tsx`, 404 ("No encontramos esta página." + "Ir al Resumen") y error; `loading.tsx` de ambas zonas = `PageHeader` + filtros + `TablaSkeleton` a ancho completo; bucle de PN-01 imposible (probar con sesión de super_admin en `/cooperativas/dashboard`: termina en `/admin/dashboard`); menú de usuario `w-(--anchor-width)` y tema con `DropdownMenuRadioItem`; "Saltar al contenido" en ambos; capturas de shell a 1440/1024/390.

### Oleada 2 (pantallas, en paralelo, cuando termine la 1)

**W2-APP-VIAJES** — Inicio, Mis boletos, búsqueda, compra y boleto
- Archivos: `EnBusApp/app/(tabs)/{index,boletos}.tsx`; `app/boletos/**`; `app/viajes/[id].tsx`; `src/components/{SearchForm,SeatSelector,PasajerosForm,PaymentFlow,ProximoViajeCard}.tsx`, nuevo `src/components/ReservaTimer.tsx`; `src/hooks/{useCheckoutBoletos,useProximoViaje}.ts`.
- IDs: AN-03, AN-05 (apoyo W2-APP-ENCOMIENDAS: `nueva.tsx`), AN-09, AN-10, AN-12, AN-13 (apoyo W2-APP-ENCOMIENDAS), AN-14, AN-21, AN-22, AN-24, AN-26, AN-32, AU-01, AU-07 (apoyo W2-APP-CUENTA: perfil "Tu cuenta"), AU-11, AU-12 (apoyo W2-APP-CUENTA: avatar), AU-13, AU-14, AU-15, AU-16, AU-17 (apoyo W2-APP-ENCOMIENDAS: "Creada mar. 3 nov."), AU-18, AU-19, AU-20, AU-22, AU-28 (apoyo ENCOMIENDAS y CUENTA), AU-30, AU-31, AU-32, AU-34 (apoyo ENCOMIENDAS), AU-41, AU-50, SY-13, SY-16, SY-27 (apoyo W2-PANEL-MOSTRADOR: `venta-flow`), SY-28, SY-36. (37)
- Aceptación: barrido app; `FloatingBar` en los 4 pasos de `buscar` con resumen de una línea; `RouteField` en Inicio y paso 1; sin `PASOS_RESUMEN`, sin `CompactLocation`, sin `initial`; `PaymentFlow` con `metodo` controlado desde `buscar` (← lo cierra primero) y `embebido` en la hoja de `boletos/[id]` (título de hoja por paso + `onBack`); fin de compra `dismissTo('/(tabs)/boletos')` + `push(compra)`; boleto: ceja y botón según AN-09, `status` en cabecera, sin pagar = "Registrar pago" en `FloatingBar` y "Cancelar reserva" `dangerGhost`, pagado = QR tras la cabecera, `TasaCambiadaSheet` en lugar de alerta; `ReservaTimer` en paso 3, detalle y hoja; mapa de asientos sin scroll interno y según D24; "Quedan N" `pending`; valoración neutra con `Star` fill `primaryText`; Inicio sin imagen bajo el formulario, "Tu actividad" solo con `count > 0`, saludo sin correo; `formatDiaVE`/`formatHoraVE` en todo; capturas de Inicio, búsqueda (4 pasos), Tu compra y boleto (sin pagar y pagado) a 390 y 360.

**W2-APP-ENCOMIENDAS** — Mis encomiendas, asistente de envío y detalles
- Archivos: `EnBusApp/app/(tabs)/encomiendas.tsx`; `app/encomiendas/**`; `src/hooks/useEncomiendas.ts`.
- IDs: AN-06, AN-07, AN-15, AN-18, AN-19, AN-20, AN-25, AN-30, AN-31, AU-03, AU-23, AU-24, AU-29 (apoyo VIAJES: `PasajerosForm`; CUENTA: login y contraseña), AU-43, SY-14. (15)
- Aceptación: barrido app; segmentos "Enviadas | Para mí", inicial = el que tiene activas, `?vista=`; ceja = segmento ("Enviada" / "Para mí") e iconos `UploadSimple`/`DownloadSimple` en segmento y fila; vacío "Nada para ti todavía" + "Te encuentran por V-… o 04…"; `RouteField` en el paso 1; `SectionLabel` fuera de las tarjetas ("Quién paga"); sin `reviewBlock` ni título repetido; aviso final "La taquilla calcula el costo al pesar el paquete."; "Editar" → "Volver al resumen"; fin de envío `dismissTo('/(tabs)/encomiendas?vista=enviadas')` + `push(detalle)`; `recibir` sin `hint` del remitente y sin `AvisoCobro`; fondos `background` + tarjetas `sunken`; "Cancelar envío" con `useConfirm` (D3); capturas de lista, 3 pasos y ambos detalles a 390 y 360.

**W2-APP-CUENTA** — acceso, perfil, notificaciones, ayuda y cuenta
- Archivos: `EnBusApp/app/(auth)/**`; `app/auth/callback.tsx`; `app/{perfil,notificaciones,ayuda}.tsx`; `app/cuenta/**`; `src/components/CompletarPerfilSheet.tsx`; `src/hooks/usePerfil.ts`; `src/contexts/{AuthContext,ActivityContext}.tsx`; `src/utils/notificaciones.ts`.
- IDs: AN-16, AN-17, AN-27, AN-28, AN-29, AU-37, AU-38, AU-39, AU-44, SY-35. (10)
- Aceptación: barrido app; login con `BrandMark`, segmento "Entrar | Crear cuenta", "Correo", sin lema ni marcador de contraseña, enlace `TextLink`, lee `?volver=` (solo rutas que empiezan por `/` y no por `//`); `CLAVE_MINIMO/AYUDA/ERROR` en login, contraseña y restablecer; recuperar, revisa-correo y restablecer con `ScreenHeader compact` + ← + contenido arriba + `EmptyState` para mensajes; perfil: "Avisos que recibes", fila "Ayuda", sin fila de WhatsApp, "Cerrar sesión" como fila (`SignOut`) con `useConfirm`, un solo rojo ("Eliminar mi cuenta"), `ListRow` único, `activeThumbColor`, avatar neutro; notificaciones con `IconButton Checks` en `right`; eliminar cuenta "Motivo (opcional)" y chips `surface`; capturas de login, recuperar, revisa-correo, restablecer, perfil, notificaciones, ayuda y cuenta/* a 390.

**W2-PANEL-MOSTRADOR** — taquillas, despacho, recepción, entrega, viajes e impresora
- Archivos: `PanelCooperativas/src/app/cooperativas/(panel)/{taquilla,despacho,recepcion-destino,entrega,viajes,hardware}/**`; `src/app/cooperativas/(panel)/configuracion/hardware/page.tsx`; `src/components/{boletos,encomiendas,entrega}/**`, nuevo `src/components/viajes/**`; `src/components/{camera-qr-scanner,scan-input,ultimo-escaneo}.tsx`; `src/hooks/{use-barcode-scan,use-encomiendas-realtime,use-impresora}.ts` (firma de `useImpresora` congelada); `src/lib/printing/**`; `src/lib/types/{boletos,encomiendas,operacion,configuracion}.ts`.
- IDs: PN-08 (apoyo W2-PANEL-GESTION: reembolsos y configuración), PN-09, PN-16, PN-17, PN-19 (apoyo GESTION: Pagos), PN-22, PN-23, PN-24 (apoyo GESTION: Pagos), PN-26 (apoyo GESTION: bandeja y empleados), PN-28 (apoyo GESTION: registro y verificar pago), PU-02, PU-11 (apoyo GESTION), PU-12, PU-14 (apoyo GESTION: Pagos y KPI), PU-16, PU-20 (apoyo GESTION: rutas), PU-25, PU-26, PU-28, PU-29, PU-30, PU-31 (apoyo GESTION: Resumen), PU-33, PU-34 (apoyo GESTION: verificar pago), PU-35 (apoyo GESTION: Resumen y Pagos), PU-39. (26)
- Aceptación: barrido panel; venta, cobro, entrega y recepción en lote con `tamano="flujo"` (medir 672 px a 1440 y margen a 390, como `qa/panel_ui/dlgw.mjs`); métodos de pago con `OpcionTile` en `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`; cabeceras con una sola primaria, sin "Ir a Despacho", sin impresora, sin "Pagos por verificar (n)"; Boletos: `TabsUrl ?estado=` (Todos · Reserva sin pagar · Pago por verificar · Pagado · Embarcado), `CeldaEnlace` que abre `ViajeSheet`, columna "Acciones" con "Verificar pago" / "Cobrar"; Viajes con `TabsUrl`/`TabsTrigger render={<Link>}` y `ViajeSheet` (con "Marcar salida" e "Ir a Despacho"); Despacho escribe `?viaje=`; encomiendas de Recepción y de la hoja del viaje abren su detalle; `?estado=PAGADA` en Taquilla de encomiendas; asientos D24; "Atrás"/"Listo"/"Cancelar" según D12; escáner sin doble cierre y con `Spinner`; capturas a 1440, 1024 y 390.

**W2-PANEL-GESTION** — Resumen, pagos, reembolsos, rutas, empleados, configuración y auth de cooperativas
- Archivos: `PanelCooperativas/src/app/cooperativas/(panel)/{dashboard,pagos,reembolsos,rutas,empleados}/**`; `src/app/cooperativas/(panel)/configuracion/{page,actions,tab-datos,tab-metodos-pago,tab-sucursales}.tsx`; `src/app/cooperativas/{login,recuperar,restablecer,registro,invite,auth}/**`; `src/components/{activity-chart,checklist-puesta-en-marcha,estado-cooperativa-banner}.tsx`; `src/components/pagos/verificar-pago-dialog.tsx`; `src/lib/types/reembolsos.ts`.
- IDs: SY-03 (apoyo W2-ADMIN vía AD5-23), SY-05 (apoyo W2-ADMIN: login del admin), PN-10, PN-12, PN-14, PN-15, PN-29, PN-32, PU-18, PU-21, PU-22, PU-27 (apoyo MOSTRADOR: Impresora y lector), PU-32 (apoyo MOSTRADOR: retención en Entrega), PU-40. (14)
- Aceptación: barrido panel; login, recuperar, restablecer, registro e invitación sobre `AuthLayout` (tarjeta `max-w-md`, "Correo", botón "Entrar", `AlertTitle` concreto, avisos de `?error=` y `?motivo=`, "Volver a iniciar sesión" en restablecer, `FieldDescription` "Mínimo 8 caracteres.", marcador "Ej.: Expresos Los Andes"); redirecciones con `INICIO`; Empleados, Configuración y Rutas redirigen al taquillero; gráfico D20; Resumen con `KpiCard` bajo H2 "Hoy" y tarjeta "listas para despachar" → `?estado=PAGADA`; aviso de comisión sin fondo `warning-light`; Configuración `max-w-4xl` sin `mx-auto`, pestañas Sucursales · Métodos de pago · Datos con `?tab=`, sin `metadata.title` propio (igual en Reembolsos); rutas y empleados con `StatusBadge` `recurso`/`cuenta` ("Suspender cuenta"); capturas a 1440, 1024 y 390.

**W2-ADMIN** — panel del superadministrador
- Archivos: `PanelCooperativas/src/app/admin/**` salvo `app/admin/layout.tsx`, `app/admin/page.tsx` y `app/admin/(panel)/{layout,loading,error,not-found}.tsx`; `src/components/admin/**`; `src/lib/data/admin-*.ts`; `src/lib/types/admin-*.ts`; `src/lib/email.ts`.
- IDs: AD5-01, AD5-02, AD5-04, AD5-07, AD5-08, AD5-09, AD5-10, AD5-11, AD5-12, AD5-13, AD5-14, AD5-15, AD5-16, AD5-17, AD5-18, AD5-19, AD5-20, AD5-21, AD5-22, AD5-23, AD5-24, AD5-25, AD5-26, AD5-27, AD5-28, AD5-29, AD5-30, AD5-31, AD5-32, AD5-33, AD5-34, AD5-35, AD5-36, AD5-37, AD5-38, AD5-39, AD5-44, AD5-45, AD5-46, AD5-47, SY-29 (apoyo GESTION: `verificar-pago-dialog`). (41)
- Aceptación: barrido panel; `?id=` abre y cierra la hoja de solicitud (Atrás funciona); detalle de cooperativa PENDIENTE/RECHAZADA con `SolicitudAcciones` en la cabecera y sin `PendienteAprobacion`; acciones de cabecera (1 `default` + "Más" con `Prohibit` para Desactivar) e incidencia con acciones en `PageHeader` y H1 = código; `MigaObjeto` en los tres detalles; `BarraFiltros`/`TabsUrl` en las cinco listas (Comisiones y Solicitudes en la URL); `KpiCard` común (se borra `components/admin/dashboard/kpi-card.tsx`), sin `TasaBCVCard` en el Resumen; `id="tasa-bcv"` en Tarifas; `<Monto>` en pagos de ciclo y seguro; `AvisoError` en todos los diálogos (sin toasts de error); `PIN_MAX_INTENTOS` interpolado; login del admin sobre `AuthLayout` ("Correo", marcador "tu@correo.com", foco correo → contraseña → Entrar); capturas a 1440, 1024 y 390 con superadmin (o por código si sigue sin rol).

**Recuento:** 240 hallazgos (SY 36 · AN 33 · AU 50 · PN 33 · PU 41 · AD5 47). Asignados 239: W1-SHARED 10 · W1-MARCA 5 · W1-APP-UI 35 · W1-PANEL-UI 20 · W1-PANEL-SHELL 26 · W2-APP-VIAJES 37 · W2-APP-ENCOMIENDAS 15 · W2-APP-CUENTA 10 · W2-PANEL-MOSTRADOR 26 · W2-PANEL-GESTION 14 · W2-ADMIN 41. Fuera de alcance 1: PN-31 (D26).

## 5. Integración, pasos manuales y riesgos

**Integración (orquestador, tras la oleada 2):**
1. Con los barridos en cero, borrar los alias de D25 (`Button` `accent|gradient|dangerSoft|glow`, `Text` `accent|secondary|danger`, `PageTransition`, `LoadingState`, `EntityCard initial|tone`, `PageHeader migas`, `formatters.timeOnly|dateTime|dateFull`, `lib/utils dateFormatter*`, `NAV_ITEMS`, `ADMIN_NAV_ITEMS`) y pasar a `error` las reglas de lint añadidas en `warn`.
2. Borrar `gradient-1.png` si ya no se usa; `node shared/generar.mjs --check`; tsc, lint y `npm run build` de panel y landing; `npx expo lint` y tsc de la app.
3. Pasada de capturas completa (§4) y comparación lado a lado app ↔ panel ↔ landing de: marca, botón principal, enlace, insignias, campo, vacío, error, toast, sin conexión.

**Pasos manuales del dueño:**
1. Dar rol a `qa.taquillero`, `qa.admincoop` y `qa.superadmin` (SQL pendiente) antes de la oleada 2: tres auditorías no pudieron ver el interior del panel.
2. Supabase (proyecto real) → Authentication → Policies: longitud mínima de contraseña 8 (`config.toml` solo cubre el entorno local).
3. Build nuevo de la app en EAS (nombre "EnBus", iconos y splash solo cambian en un build nativo) y revisión del icono en iOS y Android (máscara adaptativa).
4. Desplegar panel y landing; comprobar en un teléfono que la PWA instalada toma el icono nuevo (puede requerir desinstalar y volver a instalar).

**Riesgos:**
- **Cambio de color de la acción principal (D1):** toda la app cambia de azul a amarillo; revisar que no queden dos amarillos compitiendo (caja de monto `primaryLight` + botón) en la misma vista.
- **Alias `@deprecated`:** si la integración no los borra, el sistema vuelve a admitir variantes viejas; el lint en `error` lo impide.
- **`formatFechaHoraVE` cambia su salida** (", " → " · "): cualquier texto o prueba que compare la cadena exacta debe actualizarse.
- **Contadores del menú:** una llamada a `fn_bandeja_cooperativa` por cambio de ruta y cada 60 s por usuario; vigilar carga. El admin hace dos `count` ligeros.
- **`ImpresoraChip` en el shell:** `useImpresora` se monta en todas las pantallas; si intenta reconectar por Bluetooth en cada montaje, el cluster SHELL debe usar solo el estado guardado (sin abrir el selector del navegador).
- **ThemeProvider raíz:** las pantallas públicas pasan a respetar el tema oscuro; revisar contraste de login y registro en oscuro.
- **Iconos generados con Playwright:** depende de la instalación global y de la fuente `RoobertVF.ttf`; si falta, el script debe fallar con un mensaje claro (no generar iconos con otra fuente).
- **Oleada 2 sin roles QA:** sin el paso manual 1, la verificación del panel interior vuelve a ser solo por código.
