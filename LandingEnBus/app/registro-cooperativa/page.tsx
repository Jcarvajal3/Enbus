import type { Metadata } from "next"

import { RegistroCooperativa } from "./registro-cooperativa"
import { sitioUrl } from "@/lib/urls"

export const metadata: Metadata = {
  title: "Afilia tu cooperativa",
  description:
    "Vende boletos y gestiona encomiendas con EnBus: crea la cuenta de tu cooperativa, configura tu panel y empieza a operar cuando aprobemos tu solicitud.",
  ...(sitioUrl() ? { alternates: { canonical: "/registro-cooperativa" } } : {}),
}

export default function RegistroCooperativaPage() {
  return <RegistroCooperativa />
}
