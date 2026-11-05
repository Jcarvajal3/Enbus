import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

// Vista previa al compartir el enlace (WhatsApp, redes): 1200 × 630, fondo blanco con franja amarilla.
// Satori no lee variables CSS: los colores son los de shared/tokens.json (primary, foreground).
// Usa la fuente por defecto de next/og (no carga ningún archivo de fuente).
// Por eso la marca va como imagen: app/icon.png (bloque "EB", de shared/marca/eb.svg).

export const alt = "EnBus: boletos de bus y encomiendas por toda Venezuela"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const AMARILLO = "#FFC757" // --primary
const TINTA = "#202020" // --primary-foreground / --foreground
const BLANCO = "#FFFFFF" // --background

export default async function Image() {
  const marca = `data:image/png;base64,${(await readFile(join(process.cwd(), "app/icon.png"))).toString("base64")}`
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
          backgroundColor: BLANCO,
          borderBottom: `24px solid ${AMARILLO}`,
          color: TINTA,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori (next/og) no admite next/image. */}
          <img src={marca} width={112} height={112} alt="" />
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4 }}>EnBus</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 56, fontWeight: 600, lineHeight: 1.2, maxWidth: 960 }}>
          Boletos de bus y encomiendas por toda Venezuela
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#666666" }}>
          Cooperativas verificadas · Pago Móvil o transferencia · Rastreo en línea
        </div>
      </div>
    ),
    { ...size }
  )
}
