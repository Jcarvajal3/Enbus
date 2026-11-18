# Rediseño del panel web con el sistema "Amanecer"

Objetivo: que el panel de cooperativas y el super admin sean tan claros y fáciles de usar
como la app. Fuente de verdad del estilo: `EnBusApp/DESIGN.md`. Este documento traduce esas
reglas a la web (Next.js + Tailwind v4 + base-ui) y reparte el trabajo en fases.

## 1. Principios trasladados de la app

| Regla de la app | En el panel |
|:---|:---|
| Una sola cosa manda por pantalla; un solo amarillo | Un único `Button` `default` (amarillo) por vista o diálogo. Lo demás `outline`/`secondary`/`ghost`. |
| Figura y fondo: `canvas` → blanco → `surface` | Fondo de página `canvas`; el contenido flota en tarjetas blancas; los campos vacíos son pozos `surface` dentro de las tarjetas. |
| Volúmenes por tono y sombra, no por líneas | `Card` sin borde, radio `xl` (24), sombra teñida de noche. Las líneas solo separan filas. |
| La noche manda y navega | Menú lateral en `night`; ítem activo = pastilla blanca con texto tinta (el amarillo se reserva a la acción). |
| Controles generosos | Botón 44 px (default), 48 (lg), 56 (xl para la acción de taquilla). Campos 48 px. Icono 44. Filas de tabla ≥ 56. |
| Campo: vacío = pozo, con valor = blanco con borde, foco = borde azul + anillo | `placeholder-shown:` para el pozo; foco `accent-strong`. Radio `md` (16), no `full`. Etiqueta 13/medium a 8 px del control. |
| Escala tipográfica, no negrita | Título de página 32 semibold tracking negativo · sección 22 · título de tarjeta 17 · cuerpo 15 · apoyo 13 · meta 12. |
| Ritmo | Margen de página 20 (móvil) / 32 (escritorio) · entre tarjetas 16 · entre secciones 32 · dentro de tarjeta 20–24. |
| Color con propósito | `accent-strong` = selección/activo · coral (`secondary`) = encomiendas · semánticos solo para estado. `IconTile` duotono para dar color a listas y KPIs. |
| Pestañas internas | `SegmentedControl`: pista `surface-dark`, pastilla blanca. |
| Vacío / error | `EmptyState`: título + 1 línea + 1 acción. Errores inline en el campo. |

## 2. Nuevo menú lateral (simplificado)

Cuatro grupos plegables con icono; solo el grupo de la ruta activa abierto por defecto.

**Panel de cooperativas**

- **Resumen** (enlace directo) → `/cooperativas/dashboard`
- **Boletos**: Taquilla de boletos · Pagos por verificar · Reembolsos · Embarque · Viajes
- **Encomiendas**: Taquilla de encomiendas · Despacho · Recepción en destino · Entrega
- **Configuración** (solo admin salvo Impresora): Buses · Rutas · Empleados · Cooperativa (configuración) · Impresora y lector

Los contadores pasan al grupo cuando está plegado (suma, tono aviso si alguno lo es).

**Super admin**: mismo patrón — Resumen · Cooperativas (solicitudes, cooperativas, comisiones, tarifas) · Operación (encomiendas, incidencias) · Usuarios.

## 3. Fases y reparto

| Fase | Alcance | Archivos | Dependencia |
|:---|:---|:---|:---|
| 1. Fundaciones | Tokens `canvas`, `night*`, sombras; kit `components/ui/*` (button, input, select, textarea, label, field, card, badge, tabs, table, dialog, sheet, switch, checkbox, toggle-group); componentes comunes (`page-header`, `kpi-card`, `empty-state`, `error-state`, `barra-filtros`, `paginacion-tabla`, `tabla-skeleton`, `fila-vacia`, `opcion-tile`, `status-badge`, `aviso-error`, `auth-layout`) + nuevos `icon-tile`, `section-label`, `segmented-control`. `PanelCooperativas/DESIGN.md`. | `shared/tokens.json`, generados, `globals.css`, `src/components/ui/*` (salvo sidebar), componentes comunes | — |
| 2. Navegación | `lib/navigation.ts` (grupos nuevos), `app-sidebar`, `admin-sidebar`, `ui/sidebar.tsx` (noche, ítems 44 px), `panel-shell`, `admin-shell` (fondo canvas, barra superior) | esos archivos | en paralelo con 1 |
| 3A. Resumen + Boletos | dashboard, taquilla/boletos, pagos, reembolsos, embarque, viajes y sus componentes de dominio | `app/cooperativas/(panel)/{dashboard,taquilla/boletos,pagos,reembolsos,embarque,viajes}`, `components/{boletos,pagos,embarque,viajes}` | 1 y 2 |
| 3B. Encomiendas | taquilla/encomiendas, despacho, recepción, entrega | `app/cooperativas/(panel)/{taquilla/encomiendas,despacho,recepcion-destino,entrega}`, `components/{encomiendas,entrega}` | 1 y 2 |
| 3C. Configuración + acceso | buses, rutas, empleados, configuración (+hardware), hardware, login/registro/recuperar/restablecer/invite | `app/cooperativas/(panel)/{buses,rutas,empleados,configuracion,hardware}`, `app/cooperativas/{login,registro,recuperar,restablecer,invite}` | 1 y 2 |
| 3D. Super admin | todas las páginas de `app/admin` | `app/admin/**`, `components/admin` | 1 y 2 |
| 4. Verificación | `tsc`, `eslint`, `next build`, revisión visual en navegador | — | 3 |

Reglas para todas las fases: no cambiar lógica de datos ni server actions; no editar
`*.generated.*` a mano; respetar cambios sin confirmar del árbol (configuración/sucursales);
no tocar archivos de otra fase; no ejecutar `next build` en las fases en paralelo (solo `tsc` y `eslint`).

---

# Etapa 2: modo oscuro en negro y panel móvil como app

## Modo oscuro

En oscuro no hay azul noche: `night`, `night-raised`, `sidebar*` y `canvas` pasan a negros y
grises neutros (menú y barra de pestañas negros, pastilla activa blanca). El modo claro no cambia.
El azul queda solo como color de selección y foco (`accent-strong`).

## Móvil (< 768 px) como la app

| Pieza | Comportamiento |
|:---|:---|
| Navegación | Sin menú lateral. **Barra de pestañas inferior** fija (negra/noche, pastilla blanca): Resumen · Boletos · Encomiendas · Configuración (super admin: Resumen · Cooperativas · Operación · Usuarios). Una pestaña de grupo abre una **hoja inferior** con sus secciones (iconos grandes, contadores). |
| Cabecera | Barra superior compacta (56 px): título de la sección; en un detalle, ← que vuelve a la lista. Usuario, tema y cerrar sesión en un botón de avatar. |
| Listas | Las tablas se convierten en **lista de tarjetas** (`EntityCard`: IconTile + título + subtítulo + estado + meta), toda la fila tocable. |
| Diálogos | Se abren como **hoja inferior** a pantalla casi completa, con pie fijo y área segura. |
| Acción principal | En una **barra fija inferior** (sobre la barra de pestañas), botón a todo el ancho. |
| Filtros | Búsqueda visible; el resto en un botón "Filtros" que abre una hoja. |
| Formularios | Una columna, campos de 48 px, teclado adecuado (`inputMode`, `autoComplete`). |
| Toque | Objetivos ≥ 44 px, sin hover como única pista, sin scroll horizontal de página. |
| PWA | `viewport-fit=cover`, áreas seguras, `theme-color` por tema, manifest standalone. |

## Fases

| Fase | Alcance | Dependencia |
|:---|:---|:---|
| R1a. Oscuro + shell móvil | `shared/tokens.json` (grupo oscuro), `globals.css`, `layout.tsx` (viewport), `manifest.json`, `navigation`, sidebars, shells, `ui/sidebar`, nuevos `barra-pestanas-movil`, `hoja-grupo-movil`, `cabecera-movil` | — |
| R1b. Primitivas responsive | `ui/dialog`, `ui/alert-dialog`, `ui/sheet`, `ui/table`, `page-header`, `barra-filtros`, `paginacion-tabla`, `confirm-dialog`, nuevos `entity-card`, `lista-responsive`, `barra-accion-fija`; sección "Móvil" de `DESIGN.md` | en paralelo con R1a |
| R2A–D. Páginas | Resumen+Boletos · Encomiendas · Configuración+acceso · Super admin, aplicando los patrones | R1a y R1b |
| R3. Verificación | `eslint`, `next build`, revisión a 375 px y escritorio | R2 |
