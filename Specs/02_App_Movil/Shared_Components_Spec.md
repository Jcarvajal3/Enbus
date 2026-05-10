# App Móvil: Componentes Compartidos

## 1. Objetivo
Catálogo de componentes reutilizables entre los módulos de la App. Cada componente se implementa **una sola vez** y se consume con props/parámetros según el contexto.

---

## 2. `<SearchForm />`
**Módulo de Búsqueda y Acción Rápida**

### Uso
| Consumidor | Contexto |
|---|---|
| Tab Inicio | Widget central (toggle Boletos/Encomiendas) |
| Tab Boletos | Pantalla de búsqueda al presionar "Viajar" |
| Wizard Encomiendas Paso 1 | Selección de origen/destino (pre-llenado si viene de Inicio) |

### Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `mode` | `'boletos' \| 'encomiendas'` | `'boletos'` | Determina campos visibles y texto del CTA |
| `showModeToggle` | `boolean` | `false` | Muestra el Segmented Control para alternar modo |
| `initialOrigen` | `{ estado, ciudad }?` | — | Pre-llenar origen |
| `initialDestino` | `{ estado, ciudad }?` | — | Pre-llenar destino |
| `initialFecha` | `Date?` | — | Pre-llenar fecha |
| `onSubmit` | `(data) => void` | — | Callback con los datos del formulario |

### Campos
| Campo | Visible en Boletos | Visible en Encomiendas | Componente |
|---|---|---|---|
| Toggle Boletos/Encomiendas | ✅ (si `showModeToggle`) | ✅ (si `showModeToggle`) | `<SegmentedControl />` |
| Origen | ✅ | ✅ | `<LocationSelector />` |
| Destino | ✅ | ✅ | `<LocationSelector />` |
| Fecha | ✅ | ❌ | `<DatePicker />` |

### Botón CTA
| Modo | Texto | Acción |
|---|---|---|
| `boletos` | **"Buscar"** | Navega a `<ResultsList mode="boletos" />` |
| `encomiendas` | **"Enviar"** | Navega a `<ResultsList mode="encomiendas" />` |

---

## 3. `<LocationSelector />`
**Selector de Estado / Ciudad de Venezuela**

### Uso
Utilizado en `<SearchForm />`, Wizard de Encomiendas (pasos 1 y 2), y Calculadora Pública.

### Comportamiento
1. Al presionar, abre un **modal de búsqueda** con campo de texto para filtrar.
2. Los datos se obtienen de un catálogo estático de estados y ciudades de Venezuela (no de DB, embebido en la app).
3. Paso 1: Seleccionar **Estado** (ej: "Distrito Capital"). Paso 2: Seleccionar **Ciudad** (ej: "Caracas").
4. Muestra el valor seleccionado en formato "Ciudad, Estado" (ej: "Caracas, Distrito Capital").

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `label` | `string` | "Origen" o "Destino" |
| `value` | `{ estado, ciudad }?` | Valor actual |
| `onChange` | `(value) => void` | Callback |
| `placeholder` | `string` | Texto placeholder |

---

## 4. `<ResultsList />`
**Lista de Resultados de Viajes/Buses**

### Uso
| Consumidor | Contexto |
|---|---|
| Tab Inicio → Buscar | Resultados de búsqueda de boletos |
| Tab Inicio → Enviar | Resultados de rutas para encomiendas |
| Tab Boletos → Viajar → Buscar | Resultados de búsqueda de boletos |
| Detalle Envío (estado PENDIENTE_DE_ESCANEO) | Lista corta de próximas salidas |

### Arquitectura
El componente `<ResultsList />` es un **componente de presentación puro** (dumb component). No realiza fetch de datos internamente. La pantalla padre es responsable de obtener los datos de Supabase y pasarlos pre-transformados.

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `data` | `ResultItem[]` | Array de resultados pre-transformados por la pantalla padre |
| `onSelect` | `(item: ResultItem) => void` | Callback al seleccionar un resultado. La pantalla padre decide la navegación (ej: navegar a `/viajes/[id]` para boletos, o al Wizard para encomiendas). |

### ResultItem (Interface)
```typescript
interface ResultItem {
  id: string;                    // viaje_id
  cooperativa_nombre: string;
  cooperativa_logo_url?: string;
  calificacion_promedio?: number;
  hora_salida: string;           // ISO timestamp
  hora_llegada_est: string;      // ISO timestamp
  duracion_min: number;
  asientos_disponibles?: number; // Solo modo boletos
  precio?: number;               // Solo modo boletos
  origen: string;                // "Ciudad, Estado"
  destino: string;               // "Ciudad, Estado"
}
```

### Herramientas del Listado
| Herramienta | Descripción |
|---|---|
| **Filtro por Cooperativa** | Dropdown para filtrar resultados por cooperativa específica |
| **Ordenar** | Ordenar por: Próxima salida (default), Precio |

### Card de Resultado

#### Modo Boletos (`<ViajeCard mode="boletos" />`)
| Dato | Descripción |
|---|---|
| Logo + Nombre Cooperativa | Con calificación promedio (★ 4.2) |
| Hora de Salida | Hora de partida |
| Hora Estimada Llegada | Hora estimada de arribo |
| Duración | Tiempo estimado del viaje |
| Asientos Disponibles | Cuántos quedan |
| Precio | Precio del boleto |

#### Modo Encomiendas (`<ViajeCard mode="encomiendas" />`)
| Dato | Descripción |
|---|---|
| Logo + Nombre Cooperativa | — |
| Hora de Salida | Próxima salida |
| Hora Estimada Llegada | — |
| Duración | Tiempo estimado |

> **Nota**: En modo encomiendas **NO** se muestra precio de pasaje, asientos disponibles, número de bus ni nombre de chófer. Solo la ruta y horario.

### Acción al seleccionar un item
| Modo | Acción |
|---|---|
| `boletos` | Navega a **Detalle Viaje + Selector de Asientos** (`/viajes/[id]`) ⏳ Pendiente |
| `encomiendas` | Navega al **Wizard de Encomiendas** con Paso 1 pre-llenado (origen, destino, cooperativa) |

---

## 5. `<SeatSelector />`
**Selector Visual de Asientos del Bus**

### Uso
Pantalla de Detalle de Viaje (solo para boletos).

### UI
- Vista superior (planta) del interior del bus.
- Filas de asientos renderizadas como grid.
- **Estados visuales de cada asiento**:
  | Estado | Color | Interacción |
  |---|---|---|
  | Disponible | Gris claro / outline | Seleccionable (tap) |
  | Seleccionado (por el usuario) | Color primario (sólido) | Deseleccionable (tap) |
  | Ocupado | Gris oscuro / relleno | No interactuable |
- Número de asiento visible en cada cuadro.
- Debajo del mapa de asientos: resumen con asiento(s) seleccionado(s) y precio total.
- Botón CTA: **"Continuar al Pago"** (habilitado solo si hay al menos 1 asiento seleccionado).

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `viaje_id` | `string` | ID del viaje para obtener mapa de asientos |
| `asientosTotales` | `number` | Capacidad del bus |
| `asientosOcupados` | `string[]` | Lista de asientos ya vendidos |
| `precioUnitario` | `number` | Precio por asiento |
| `onConfirm` | `(asientos: string[]) => void` | Callback con asientos seleccionados |

### Datos del Viaje Mostrados en esta Pantalla
| Dato | Visibilidad |
|---|---|
| Cooperativa (logo + nombre) | Siempre |
| Ruta (origen → destino) | Siempre |
| Fecha y hora de salida | Siempre |
| Duración estimada | Siempre |
| Calificación promedio (★) | Siempre |
| Número de unidad (bus) | **Solo después de pagar** |
| Nombre del chófer | **Solo después de pagar** |

---

## 6. `<StatusTimeline />`
**Timeline Vertical de Estados**

### Uso
| Consumidor | Descripción |
|---|---|
| Detalle de Envío (App) | Seguimiento de encomienda enviada |
| Detalle de Recepción (App) | Seguimiento de encomienda recibida |
| Track & Trace (Landing Web) | Seguimiento público |

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `estados` | `EstadoItem[]` | Lista de estados con timestamps |
| `estadoActual` | `string` | Estado actual de la encomienda |
| `tipo` | `'encomienda' \| 'boleto'` | Para determinar los pasos |

### EstadoItem
```typescript
{
  estado: string;          // Nombre del estado
  label: string;           // Label amigable (ej: "En camino")
  timestamp?: string;      // Cuándo ocurrió (null si no ha ocurrido)
  descripcion?: string;    // Texto adicional
  activo: boolean;         // Si es el estado actual
  completado: boolean;     // Si ya pasó
}
```

### Visual
- Línea vertical con círculos en cada estado.
- Estados completados: círculo verde con ✓.
- Estado actual: círculo con animación de pulso.
- Estados futuros: círculo gris outline.

---

## 7. `<PaymentFlow />`
**Flujo de Pago Unificado**

### Uso
Compartido entre Encomiendas (pago origen/destino) y Boletos (pago de pasaje).

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `cooperativa_id` | `string` | Para obtener métodos de pago |
| `monto` | `number` | Monto a pagar |
| `concepto` | `string` | "Encomienda EB-260412-00123" o "Boleto BOL-00456" |
| `onPaymentSubmitted` | `(data) => void` | Callback con datos del pago |

### Flujo de Pantallas
1. **Métodos de Pago**: Lista de métodos activos de la cooperativa (transferencia, pago móvil, Zelle).
2. **Confirmación de Pago**: Formulario con campos:
   - Número de referencia (texto, obligatorio)
   - Fecha de transacción (date picker, obligatorio)
   - Banco emisor (selector de lista de bancos, obligatorio)
3. **Estado de Verificación**: Pantalla de espera indicando "Pago enviado. La cooperativa verificará tu pago."

---

## 8. `<TransactionCard />`
**Card Genérica de Transacción**

### Uso
Listados en Encomiendas (Enviar/Recibir) y Boletos.

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `type` | `'encomienda_envio' \| 'encomienda_recepcion' \| 'boleto'` | Variante |
| `id` | `string` | Tracking ID o código de boleto |
| `estado` | `string` | Estado actual |
| `titulo` | `string` | Nombre del destinatario/remitente/ruta |
| `subtitulo` | `string` | Fecha o info adicional |
| `onPress` | `() => void` | Navegar al detalle |

### Visual por Tipo
| Dato | Encomienda Envío | Encomienda Recepción | Boleto |
|---|---|---|---|
| Línea 1 | Tracking ID | Tracking ID | Ruta (Caracas → Valencia) |
| Línea 2 | Destinatario | Remitente (parcialmente oculto) | Fecha + Hora |
| Línea 3 | Fecha | Fecha | Asiento + Cooperativa |
| Badge estado | ✅ | ✅ | ✅ |
| Color del badge | Según estado encomienda | Según estado encomienda | Según estado boleto |

### Colores de Estado (Encomienda)
| Estado | Color |
|---|---|
| `PENDIENTE_DE_ESCANEO` | Amarillo |
| `EN_RECEPCION` | Naranja |
| `POR_PAGAR` | Rojo |
| `PAGADA` | Azul |
| `EN_TRANSITO` | Azul oscuro |
| `EN_OFICINA_DESTINO` | Verde claro |
| `ENTREGADA` | Verde |
| `CANCELADA` | Gris |
| `DEVUELTA` | Púrpura |

### Colores de Estado (Boleto)
| Estado | Color |
|---|---|
| `RESERVADO` | Amarillo |
| `PAGADO` | Verde |
| `USADO` | Gris |
| `CANCELADO` | Rojo |
| `EXPIRADO` | Gris oscuro |

---

## 9. `<StarRating />`
**Componente de Calificación por Estrellas**

### Uso
Post-viaje en módulo de Boletos.

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `value` | `number` | Calificación actual (0-5) |
| `onChange` | `(value: number) => void` | Callback al seleccionar |
| `readonly` | `boolean` | Si es solo lectura |
| `size` | `'sm' \| 'md' \| 'lg'` | Tamaño de las estrellas |

### Variantes de Uso
| Contexto | Modo | Tamaño |
|---|---|---|
| Modal de calificación post-viaje | Editable | `lg` |
| Información de cooperativa en resultados | Solo lectura | `sm` |
| Detalle de boleto ya calificado | Solo lectura | `md` |

---

## 10. `<QRCodeViewer />`
**Visualizador de Código QR**

### Uso
Detalle de Envío (encomienda), Detalle de Boleto (QR de embarque).

### Props
| Prop | Tipo | Descripción |
|---|---|---|
| `data` | `string` | Datos a codificar |
| `size` | `number` | Tamaño en px |
| `autoMaxBrightness` | `boolean` | Si true, sube brillo de pantalla al máximo |

### Comportamiento
- Al renderizarse con `autoMaxBrightness = true`, el componente sube el brillo de la pantalla al máximo para facilitar el escaneo.
- Al desmontarse, restaura el brillo anterior.
