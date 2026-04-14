# Landing Page: Calculadora Pública

## 1. Objetivo
Widget público para que cualquier persona estime el costo de un envío antes de descargar la app.

## 2. URL
- Embebida en la Home (ver `Home_Spec.md`§3.4).
- Sin página dedicada propia (vive dentro de la Home).

## 3. Interfaz

### 3.1 Formulario
| Campo | Tipo | Obligatorio |
|---|---|---|
| Peso estimado (kg) | Number (0.1 - 25) | Sí |
| Origen (Estado / Ciudad) | `<LocationSelector />` adaptado a web | Sí |
| Destino (Estado / Ciudad) | `<LocationSelector />` adaptado a web | Sí |

- **Alert informativa** (debajo del formulario): "⚠️ Límites referenciales: Peso máximo 25 kg. Dimensiones máximas 50 × 50 × 50 cm."

### 3.2 Resultado
- **Costo estimado**: Monto calculado por la Edge Function `calculadora-publica`.
- **Disclaimer**: "Este es un precio aproximado. El costo final se determina en taquilla según el peso real medido por la cooperativa."
- **CTA**: "¿Listo para enviar? Descarga la App" → Link a stores.

## 4. Implementación
- Llama a la Edge Function `calculadora-publica` (ver `01_Supabase_Backend/Edge_Functions_Spec.md`).
- Rate-limited: 60 requests por IP por minuto.
- No requiere autenticación.
- El cálculo usa la misma fórmula que la app: `peso × tarifa_por_kg × (1 + factor × duración)`.
