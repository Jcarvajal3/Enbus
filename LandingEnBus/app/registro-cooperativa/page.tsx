import type { Metadata } from "next"

import { RegistroCooperativa } from "./registro-cooperativa"

export const metadata: Metadata = {
  title: "Afilia tu cooperativa",
  description:
    "Vende boletos y gestiona encomiendas con EnBus: crea la cuenta de tu cooperativa, configura tu panel y empieza a operar cuando aprobemos tu solicitud.",
}

export default function RegistroCooperativaPage() {
  return <RegistroCooperativa />
}
