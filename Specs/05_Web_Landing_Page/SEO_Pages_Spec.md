# Landing Page: Páginas SEO Dinámicas

## 1. Objetivo
Generar páginas de contenido dinámico para dominar búsquedas locales del tipo "envíos Caracas a Maracaibo", "boletos de bus Valencia a Barquisimeto", etc.

## 2. URLs
- `/envios/{origen}-{destino}` (ej: `/envios/caracas-maracaibo`)
- `/boletos/{origen}-{destino}` (ej: `/boletos/valencia-barquisimeto`)

## 3. Contenido de cada Página

### 3.1 Página de Envíos (`/envios/{origen}-{destino}`)
| Sección | Contenido |
|---|---|
| H1 | "Envíos de {Origen} a {Destino} — EnBus" |
| Descripción | Párrafo SEO sobre el servicio de encomiendas en esta ruta |
| Cooperativas disponibles | Lista de cooperativas con rutas activas para este tramo |
| Precio estimado | Rango de precios basado en pesos comunes (1kg, 5kg, 10kg) |
| Calculadora embebida | Widget de calculadora pre-llenada con origen/destino |
| CTA | "Descarga la App para enviar tu paquete" |

### 3.2 Página de Boletos (`/boletos/{origen}-{destino}`)
| Sección | Contenido |
|---|---|
| H1 | "Boletos de Bus de {Origen} a {Destino} — EnBus" |
| Descripción | Párrafo SEO sobre viajes interurbanos |
| Cooperativas disponibles | Lista con precios de pasaje y calificación ★ |
| Horarios frecuentes | Tabla con horarios comunes de salida |
| CTA | "Descarga la App para comprar tu boleto" |

## 4. Generación
- **SSG (Static Site Generation)**: Las páginas se generan en build time a partir de las rutas activas en DB.
- Se regeneran periódicamente (ISR - Incremental Static Regeneration, cada 24 horas).
- Solo se generan para rutas con cooperativas activas.

## 5. SEO de cada Página
| Tag | Valor |
|---|---|
| `<title>` | "{Tipo} de {Origen} a {Destino} — EnBus" |
| `<meta description>` | Descripción unique por ruta |
| `<h1>` | Un solo H1 descriptivo |
| OpenGraph | Imagen genérica de EnBus + texto de la ruta |
| Canonical URL | Auto-referencial |
| Sitemap | Generado automáticamente con todas las páginas activas |

## 6. Catálogo de Ciudades
Un listado de todas las combinaciones origen-destino disponibles:
- URL: `/rutas`
- Tabla/grid con todas las rutas activas, agrupadas por estado de origen.
- Cada celda enlaza a la página SEO correspondiente.
