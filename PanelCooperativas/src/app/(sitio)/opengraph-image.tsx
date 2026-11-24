import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "EnBus: tu pasaje de bus, sin colas y con tu asiento asegurado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [bold, extra] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Onest-Bold.ttf")),
    readFile(join(process.cwd(), "public/fonts/Onest-ExtraBold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0f1b33",
          backgroundImage: "radial-gradient(circle at 92% 8%, rgba(255,199,87,0.28), rgba(255,199,87,0) 45%)",
          color: "#f3f5f9",
          fontFamily: "Onest",
        }}
      >
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>
          <span>En</span>
          <span style={{ color: "#ffc757" }}>Bus</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              width: 96,
              height: 10,
              borderRadius: 5,
              background: "#ffc757",
            }}
          />
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3 }}>
            Tu pasaje de bus, sin colas y con tu asiento asegurado
          </div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#b9c3d6" }}>
            Pasajes y encomiendas con cooperativas verificadas de Venezuela
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Onest", data: bold, weight: 700, style: "normal" },
        { name: "Onest", data: extra, weight: 800, style: "normal" },
      ],
    }
  );
}
