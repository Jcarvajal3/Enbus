import type { ReactNode } from "react";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import s from "./compra.module.css";

export interface AvisoFlujo {
  tono: "error" | "info";
  texto: string;
}

/** Aviso dentro del flujo (nunca un toast): se lee donde ocurrió. */
export function AvisoCompra({ tono, children }: { tono: AvisoFlujo["tono"]; children: ReactNode }) {
  return (
    <div className={s.aviso} data-tono={tono} role={tono === "error" ? "alert" : "status"}>
      {tono === "error" ? <WarningCircleIcon weight="fill" aria-hidden /> : <InfoIcon weight="fill" aria-hidden />}
      <div className={s.avisoCuerpo}>{children}</div>
    </div>
  );
}
