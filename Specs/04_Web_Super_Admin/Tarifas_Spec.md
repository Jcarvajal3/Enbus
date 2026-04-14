# Super Admin: Tarifas Estandarizadas

## 1. Objetivo
Gestión de las tarifas de encomiendas, que son uniformes para todas las cooperativas.

## 2. Interfaz
- URL: `/admin/tarifas`

### 2.1 Tarifa Vigente
Card principal mostrando la tarifa actualmente activa:
| Campo | Valor actual |
|---|---|
| Tarifa por Kg | $ X.XX |
| Factor de distancia (por minuto) | 0.XXXX |
| Peso máximo por encomienda (kg) | 25 |
| Dimensiones máximas referenciales (cm por lado) | 50 |
| Vigente desde | DD/MM/YYYY |

### 2.2 Crear Nueva Tarifa
- Botón: **"Actualizar Tarifa"**.
- Formulario:
  | Campo | Tipo | Descripción |
  |---|---|---|
  | Tarifa por Kg | Number (decimal) | Precio base por kilogramo |
  | Factor de distancia por minuto | Number (4 decimales) | Multiplicador por minuto de recorrido |
  | Peso máximo por encomienda (kg) | Number (decimal) | Peso máx. permitido por envío |
  | Dimensiones máximas referenciales (cm) | Number | Máximo referencial por lado (informativo) |
  | Vigente desde | DateTime | Cuándo entra en vigor |

- Al crear, la tarifa anterior se desactiva (`activa = false`).
- **Solo puede haber una tarifa activa** (constraint en DB).
- Los cambios **no son retroactivos**: solo aplican a encomiendas nuevas.

### 2.3 Historial de Tarifas
Tabla con todas las tarifas históricas: valores, quién la creó, vigencia.

### 2.4 Simulador
- Input: Peso (kg), Ruta (origen-destino para calcular duración).
- Output: Costo estimado usando la tarifa vigente.
- Útil para verificar antes de publicar una tarifa.

## 3. Fórmula de Cálculo
```
costo_envio = peso_kg × tarifa_por_kg × (1 + factor_distancia_por_min × duracion_estimada_min)
```
