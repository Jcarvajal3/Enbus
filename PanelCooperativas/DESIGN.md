# Panel EnBus — Sistema "Amanecer" en la web

Manual corto del panel de cooperativas y del super admin. La fuente de estilo es
`EnBusApp/DESIGN.md`; aquí está su traducción a Next.js + Tailwind v4 + base-ui. Plan y fases:
`Specs/03_Web_Panel_Cooperativas/Rediseno_Amanecer_Panel.md`.

**Regla de oro:** una página no inventa estilos. Compone componentes del kit
(`@/components/ui/*` y `@/components/*`) y usa tokens. Un `#hex`, un `rgba()` o un tamaño suelto
en una página es un bug del sistema. **Una sola cosa manda por vista:** un único `Button`
`default` (amarillo) por vista o diálogo.

## 1. Tokens

Fuente: `shared/tokens.json` → `node shared/generar.mjs` → `src/app/tokens.generated.css`
(nunca editar a mano). `globals.css` los expone a Tailwind.

| Clase | Uso |
|:---|:---|
| `bg-canvas` | Fondo de toda página (lo más atrás). `#F3F5F9` |
| `bg-card` / `bg-background` | Lo que flota sobre el canvas: tarjeta, diálogo, tabla. Blanco |
| `bg-surface` | **Pozo**: campo o bloque hundido *dentro de algo blanco*. Nunca directo sobre `canvas` |
| `bg-surface-dark` | Inerte: pista del segmentado, deshabilitado, hover de pozo |
| `bg-night` · `bg-night-raised` · `text-night-muted` | La noche: menú lateral, panel de marca, lo protagonista. `#0F1B33` · `#1B2A4A` · blanco 68 % |
| `bg-primary` (+ `shadow-sun`) | El sol: **la** acción principal. Texto `text-primary-foreground` |
| `accent-strong` | Selección y estado activo: foco, casilla, interruptor, opción elegida |
| `bg-secondary-light` / `text-chart-2` | Coral: dominio de encomiendas |
| `success` `warning` `info` `destructive` (`-light`, `-text`, `-deep`) | Solo estado, nunca decorativos |
| `text-foreground` / `text-muted-foreground` | Tinta / texto secundario |
| `border-border` | Solo separa filas dentro de algo. Las tarjetas **no** llevan borde |
| `border-input-border` | Borde de campos con valor |

Sombras (teñidas de noche, utilidades de tema): `shadow-subtle` (pastilla del segmentado),
`shadow-card` (tarjeta sobre canvas), `shadow-raised` (protagonista, tarjeta flotante),
`shadow-overlay` (diálogos, hojas, menús), `shadow-sun` (botón amarillo; ya incluida en `Button`).

Radios (escala generada): `rounded-md` 16 = campo y bloque interno · `rounded-xl` 24 = tarjeta ·
`rounded-3xl` 36 = diálogo y hoja · `rounded-2xl` 28 = IconTile y menús · `rounded-full` =
botón, chip, insignia, pista del segmentado.

## 2. Tipografía (Onest, `font-heading` = misma familia)

| Rol | Clases |
|:---|:---|
| Título de página (H1, `PageHeader`) | `text-[26px] sm:text-[32px] font-semibold tracking-tight` |
| Título de diálogo/hoja | `text-[22px] font-semibold tracking-tight` |
| Sección (`SectionLabel`) y título de tarjeta (`CardTitle`) | `text-[17px] font-semibold` |
| Cuerpo | `text-[15px]` |
| Apoyo, etiquetas, cabecera de tabla | `text-[13px]` (`font-medium` en etiquetas) |
| Meta | `text-xs` |
| Cifras | `tabular-nums`; KPI `text-[28px]` semibold, protagonista `text-[40px]` |

Jerarquía por escala, no por negrita. Sin mayúsculas diminutas ni `uppercase`: frase normal.

## 3. Ritmo

- Margen de página: `px-5 sm:px-8`. Contenedor: `mx-auto w-full max-w-7xl`.
- Entre tarjetas: `gap-4`. Entre secciones: `gap-8`. Dentro de tarjeta: `p-5`–`p-6`.
- Etiqueta → control: 8 px (`gap-2`, ya en `Field`). Entre campos: `gap-5`.

Esqueleto de página:

```tsx
<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8">
  <PageHeader title="Viajes" description="Salidas programadas de tu cooperativa">
    <Button size="lg">Nuevo viaje</Button>
  </PageHeader>

  <section className="flex flex-col gap-4">
    <SectionLabel>Hoy</SectionLabel>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard title="Boletos vendidos" value="128" icon={Ticket} />
      <KpiCard title="Encomiendas" value="12" icon={Package} tono="coral" />
    </div>
  </section>

  <section className="flex flex-col gap-4">
    <SectionLabel>Salidas</SectionLabel>
    <BarraFiltros busqueda={{ etiqueta: "Buscar" }} />
    <Card className="gap-0 p-0">{/* Table + PaginacionTabla */}</Card>
  </section>
</div>
```

Formulario en tarjeta (los campos vacíos son pozos porque la tarjeta es blanca):

```tsx
<Card>
  <CardHeader><CardTitle>Datos de la ruta</CardTitle><CardDescription>…</CardDescription></CardHeader>
  <CardContent>
    <FieldGroup className="gap-5">
      <Field><FieldLabel htmlFor="n">Nombre</FieldLabel><Input id="n" placeholder="Ej. Mérida – Caracas" /><FieldError>…</FieldError></Field>
    </FieldGroup>
  </CardContent>
  <CardFooter className="justify-end gap-3"><Button variant="outline">Cancelar</Button><Button>Guardar</Button></CardFooter>
</Card>
```

## 4. Kit — cuándo usar cada cosa

**Controles** (`components/ui`)

| Componente | Reglas |
|:---|:---|
| `Button` | `default` amarillo = 1 por vista. `outline`/`secondary` = alternativas, `ghost` = terciario y filas, `destructive` solo en la confirmación. Tamaños: `default` 44 · `sm` 36 (filas, paginación) · `lg` 48 (acciones del `PageHeader`, diálogos) · `xl` 56 (acción de taquilla: cobrar/emitir) · `icon` 44 · `icon-sm` 36 · `icon-lg` 48. Deshabilitado = pozo gris sin opacidad. |
| `Input` `Textarea` `SelectTrigger` `PasswordInput` `InputOTP` | 48 px, `rounded-md`, 15 px. Vacío = pozo `surface` sin borde; con valor = blanco con borde; foco = borde y anillo `accent-strong`; inválido = `aria-invalid`. Siempre dentro de una tarjeta (o `BarraFiltros`). `placeholder` empieza con "Ej. ". |
| `Label` / `Field*` | Etiqueta 13 medium; ayuda `FieldDescription` 13 muted; error `FieldError` 13 inline bajo el campo (no solo toast). |
| `Switch` `Checkbox` | Activo `accent-strong`. Switch 48×28. |
| `Tabs` | Segmentado: pista `surface-dark`, activo pastilla blanca con `shadow-subtle`. Para vistas con contenido propio. |
| `ToggleGroup` (`spacing={0}`) | Mismo aspecto segmentado, para elegir un modo. |
| `Card` | Sin borde, `rounded-xl`, `shadow-card`, `bg-card`. `CardTitle` 17, `CardDescription` 13. Tabla dentro: `Card className="gap-0 p-0"`. |
| `Badge` | Pastilla `full` de 24 px. Para estados usa `StatusBadge`/`TonoBadge` (llevan punto de color). |
| `Table` | Cabecera 13 muted sin mayúsculas, filas ≥ 56 px, separador fino solo entre filas, hover `bg-surface`. |
| `Dialog` `AlertDialog` `Sheet` | `rounded-3xl`, padding 24, título 22, sombra `overlay`, fondo noche translúcido. |

**Comunes** (`components/*`)

| Componente | Para qué |
|:---|:---|
| `PageHeader` | H1 + `estado` + descripción + acciones `size="lg"` (`principal`, `secundarias`, `children`). Uno por página. |
| `ListaResponsive` + `EntityCard` | Tabla en escritorio, lista de tarjetas en móvil (§6.2). |
| `BarraAccionFija` | Acción principal fija abajo en móvil (§6.3). |
| `SectionLabel` | Título de sección (17), con `descripcion` y `accion` opcionales. |
| `KpiCard` | Cifra con `IconTile`. `tono` (`sky` por defecto, `coral` encomiendas), `variant="warning"` para lo que hay que revisar, `href` para enlazar. |
| `IconTile` | Cuadrito duotono: `sky` `coral` `brand` `mint` `neutral` y de estado `success` `warning` `danger` `info`; `size` `sm|md|lg|xl`. Así entra el color en listas y KPIs. |
| `SegmentedControl` | Elegir vista con estado local (`value`/`onChange`/`opciones`/`etiqueta`). En la URL: `TabsUrl`. |
| `EmptyState` / `FilaVacia` | Vacío: título + 1 línea + 1 acción; en tablas, `FilaVacia`. `tono` por dominio. |
| `ErrorState` | Sección que falló al cargar, con Reintentar. |
| `AvisoError` | Error dentro de un diálogo o formulario. |
| `BarraFiltros` / `TabsUrl` | Filtros en la URL. `BarraFiltros` trae su propia tarjeta blanca (los campos son pozos); pasa `plano` solo si ya va dentro de una `Card`. |
| `TablaSkeleton`, `PaginacionTabla`, `usePaginacion` | Carga y paginación de listas. |
| `OpcionTile` + `GrupoOpciones` | Elegir una opción (pago, modalidad): pozo; elegida = borde `accent-strong` + check. |
| `StatusBadge` / `TonoBadge` | Todo estado de dominio, vía `lib/estados`. Nunca pintes un estado a mano. |
| `Monto` | Todo dinero (`size` `sm|md|lg`). |
| `AuthLayout` | Marco de login/registro: panel de marca en noche + formulario. |

## 5. Reglas

1. **Un amarillo por vista.** Lo demás `outline`/`secondary`/`ghost`.
2. **Figura y fondo:** `canvas` → blanco (`Card`) → `surface` (pozo). Nunca un pozo sobre canvas.
3. **Tarjetas sin borde**, con sombra. Las líneas solo separan filas.
4. **Controles generosos:** botón 44/48/56, campo 48, icono-botón 44, fila de tabla ≥ 56.
5. **Pestañas internas** = segmentado (`Tabs`, `TabsUrl`, `SegmentedControl`), nunca subrayado.
6. **Color con propósito:** azul `accent-strong` = selección; coral = encomiendas; semánticos solo
   para estado; `IconTile` para dar color a listas y KPIs.
7. **Vacío:** `EmptyState` con acción; **error:** inline en el campo (`FieldError`) o `AvisoError`.
8. Probar a 360 px de ancho y en oscuro (los tokens ya lo resuelven si no hay colores sueltos).

## 6. Móvil (< md, 768 px): el panel se usa como una app

Cada página se diseña **primero a 360 px** y después se ensancha. Debajo de `md` no hay menú
lateral: hay barra de pestañas inferior y cabecera compacta (las pone el shell). En `≥ md` todo
queda como en §1–§5. Variable CSS del shell: `--alto-pestanas` (alto de la barra de pestañas,
0 px en `≥ md`); úsala siempre como `var(--alto-pestanas, 0px)` junto con
`env(safe-area-inset-bottom)`.

### 6.1 Reglas

1. **Una columna.** Formularios, tarjetas y KPIs apilados: `grid gap-5`. Las rejillas de dos
   columnas empiezan en `md:grid-cols-2`, no en `sm:`. Campos de 48 px.
2. **Teclado correcto.** `type`/`inputMode`/`autoComplete`/`enterKeyHint` en cada campo (§6.7).
3. **Objetivos ≥ 44 px** (`Button` default 44, `lg` 48; icono-botón `icon` 44, no `icon-sm`),
   con ≥ 8 px entre ellos.
4. **Sin hover como única pista.** Lo que se descubre al pasar el ratón debe verse o tener
   alternativa táctil (menú "Más", chevron, botón visible).
5. **Sin scroll horizontal de página.** Una tabla ancha nunca se desplaza: en móvil es lista de
   tarjetas. Un segmentado largo (`TabsUrl`) sí se desplaza dentro de sí mismo.
6. **Hoja, no ventana.** Diálogos y filtros se abren como hoja inferior (automático).
7. **La acción principal, al alcance del pulgar** (`BarraAccionFija` o `principal` del `PageHeader`).
8. **Probar a 360 px**, a 768 px y en oscuro; con el teclado abierto en los formularios.

### 6.2 Tabla → lista de tarjetas: `ListaResponsive` + `EntityCard`

Toda tabla que se vea en móvil usa `ListaResponsive`: en `≥ md` dibuja tu tabla, en móvil una
lista de `EntityCard` (gap 12). Solo se monta una de las dos. No cambia datos: pásale lo que ya
filtraste/paginaste (`usePaginacion().visibles`).

```tsx
const { visibles, pagina, paginas, ir } = usePaginacion(filas);

<Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
  <ListaResponsive
    items={visibles}
    clave={(r) => r.id}
    etiqueta="Encomiendas"
    vacio={<EmptyState icon={Package} tono="coral" title="Sin encomiendas" action={<Button>Nueva</Button>} />}
    tabla={(items) => (
      <Table>
        <TableHeader>…</TableHeader>
        <TableBody>
          {items.map((e) => (
            <TableRow key={e.id} className="relative">
              <CeldaEnlace href={`/cooperativas/encomiendas/${e.id}`} etiqueta={`Ver encomienda ${e.codigo}`}>{e.codigo}</CeldaEnlace>
              …
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
    tarjeta={(e) => (
      <EntityCard
        href={`/cooperativas/encomiendas/${e.id}`}
        leading={<IconTile icon={Package} tone="coral" />}
        title={`${e.origen} → ${e.destino}`}      // " → " dibuja la flecha
        subtitle={e.destinatario}
        adorno={<Monto valor={e.monto} size="sm" />}
        badge={<StatusBadge status={e.estado} dominio="encomienda" />}
        meta={e.codigo}
      />
    )}
  />
  <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
</Card>
```

`EntityCard`: `href` → enlace, `onClick` → botón (abre una hoja o un diálogo), ninguno → solo
lectura. Lleva chevron si navega. Alto ≥ 64 px, estado activo al tocar. Una tarjeta = una fila:
título (17) + subtítulo (13) + `adorno` a la derecha; pie con `badge` + `meta`. No metas botones
dentro: si la fila tiene acciones, van en la hoja de detalle o en el menú del detalle.

### 6.3 Acción principal: `PageHeader` o `BarraAccionFija`

| Caso | Usa |
|:---|:---|
| Crear algo desde una lista ("Nueva ruta") | `PageHeader` con `principal` (ancho completo bajo el título en móvil) y `secundarias` (menú "Más" en móvil) |
| Es la razón de la pantalla: cobrar, emitir, confirmar, guardar un formulario largo | `BarraAccionFija` (fija sobre la barra de pestañas) |

```tsx
<PageHeader
  title="Rutas"
  description="Trayectos de tu cooperativa"          // se oculta en móvil
  principal={<Button size="lg" onClick={abrir}><Plus aria-hidden />Nueva ruta</Button>}
  secundarias={[{ etiqueta: "Exportar", icono: DownloadSimple, onClick: exportar }]}
/>

// Flujo de cobro: el botón sigue visible mientras se desplaza el formulario.
<BarraAccionFija resumen={<>Total <Monto valor={total} size="md" /></>}>
  <Button size="xl" disabled={!listo} onClick={cobrar}>Cobrar</Button>
</BarraAccionFija>
```

`BarraAccionFija` deja su propio espaciador (no añadas `pb-*` a la página). Un solo botón
`default` en ella; en `≥ md` va en línea a la derecha (`escritorio="oculta"` si la acción ya
está en el `PageHeader`). Si usas la barra, no repitas esa acción en el `PageHeader`.

### 6.4 Diálogos = hojas

`Dialog`, `AlertDialog`, `ConfirmDialog` y `Sheet side="bottom"` se anclan abajo a todo el ancho
(radio superior 36, máx. 92 dvh, asa, cuerpo con scroll; `Escape` cierra y el foco queda
atrapado). **No hagas nada especial**: usa la API de siempre.

- Pon los botones en `DialogFooter` / `AlertDialogFooter` / `SheetFooter`: en móvil quedan fijos
  abajo, apilados a todo el ancho y con el área segura. **El botón principal va el último en el
  DOM** (queda arriba en móvil, a la derecha en escritorio): `[Cancelar] [Guardar]`.
- Un solo `default` por hoja. No metas botones de acción dentro del cuerpo.
- Si el contenido es largo, deja que el cuerpo desplace; nunca fijes alturas ni `max-h` propios.
- Un `DialogContent` con `p-0` (visor, cámara) conserva su relleno cero; pon tú el área segura.

### 6.5 Filtros en hoja: `BarraFiltros`

Sin cambios de API. En móvil muestra la búsqueda a ancho completo y un botón **Filtros** (con el
número activo) que abre una hoja con selects, fechas y `children`, y "Aplicar"/"Limpiar". Los
filtros siguen viviendo en la URL (se escriben al pulsar "Aplicar"). Pon la búsqueda en
`busqueda` y todo lo demás en `selects`/`fechas`; no inventes barras de chips propias.

```tsx
<BarraFiltros
  busqueda={{ etiqueta: "Buscar", placeholder: "Ej. código o destinatario" }}
  selects={[{ param: "estado", etiqueta: "Estado", opciones }]}
  fechas={[{ param: "fecha", etiqueta: "Día de salida" }]}
/>
```

### 6.6 Paginación

`PaginacionTabla` se adapta sola: "Página X de Y" y dos botones grandes (Anterior / Siguiente).
Mismo uso con `usePaginacion`.

### 6.7 Formularios y teclado

| Dato | Atributos |
|:---|:---|
| Correo | `type="email" inputMode="email" autoComplete="email" autoCapitalize="none"` |
| Teléfono | `type="tel" inputMode="tel" autoComplete="tel"` |
| Cédula, RIF, códigos numéricos | `inputMode="numeric"` (con letras: `autoCapitalize="characters"`) |
| Monto | `inputMode="decimal"` |
| Nombre / apellido | `autoComplete="name"` / `"given-name"` / `"family-name"` |
| Búsqueda | `type="search" inputMode="search" enterKeyHint="search"` (ya en `BarraFiltros`) |
| Código de un solo uso | `autoComplete="one-time-code" inputMode="numeric"` |
| Último campo de un formulario | `enterKeyHint="done"` |

Campos en una columna dentro de `FieldGroup className="gap-5"`. El botón de guardar va en
`BarraAccionFija` si el formulario es una página, o en el pie de la hoja si es un diálogo.

```tsx
<Field>
  <FieldLabel htmlFor="tel">Teléfono</FieldLabel>
  <Input id="tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ej. 0414 1234567" />
</Field>
```

### 6.8 Vacíos y filas navegables

`EmptyState` apila su acción a todo el ancho en móvil. `CeldaEnlace` es solo de escritorio: en
móvil la fila navegable es una `EntityCard` con `href`.

### 6.9 Lista de comprobación por página

- [ ] A 360 px no hay scroll horizontal de la página.
- [ ] Ninguna tabla se ve en móvil sin `ListaResponsive` (o `hidden md:block` + `md:hidden`).
- [ ] La acción principal está en `PageHeader.principal` o en `BarraAccionFija`.
- [ ] Todo objetivo táctil ≥ 44 px; nada depende de `hover`.
- [ ] Campos con `inputMode`/`autoComplete`; formularios en una columna.
- [ ] Diálogos con pie en `*Footer`, principal último.
- [ ] El final del contenido no queda tapado por la barra de pestañas ni por `BarraAccionFija`.
