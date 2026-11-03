import { ImageResponse } from "next/og"

// Vista previa al compartir el enlace (WhatsApp, redes): 1200 × 630, fondo amarillo de marca.
// Satori no lee variables CSS: los colores son los de shared/tokens.json (primary, primary-foreground).
// Usa la fuente por defecto de next/og: RoobertVF.ttf (740 KB, variable) supera el límite de 500 KB.

export const alt = "EnBus: boletos de bus y encomiendas por toda Venezuela"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const AMARILLO = "#FFC757" // --primary
const TINTA = "#202020" // --primary-foreground / --foreground

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          backgroundColor: AMARILLO,
          color: TINTA,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 24,
              backgroundColor: TINTA,
              color: AMARILLO,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            E
          </div>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4 }}>EnBus</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 56, fontWeight: 600, lineHeight: 1.2, maxWidth: 960 }}>
          Boletos de bus y encomiendas por toda Venezuela
        </div>
        <div style={{ marginTop: 28, fontSize: 32, opacity: 0.8 }}>
          Cooperativas verificadas · Pago Móvil o transferencia · Rastreo en línea
        </div>
      </div>
    ),
    { ...size }
  )
}
