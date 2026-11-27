// ─── ArmazonFlujoSitio: los asistentes del panel, dentro del sitio público ──
// La compra de boletos y el envío de encomiendas en la web usan el mismo
// armazón que la taquilla (`FlujoPagina` + `BarraFlujo` de `@/components/flujo`)
// para que pasajero y taquillero vean el mismo flujo. Esos componentes cuentan
// con el relleno del shell del panel (20 px / 32 px ≥ lg: la barra lo
// contrarresta con -mx/-mb) y con `--alto-pestanas`; este contenedor los
// reproduce en el sitio, que no tiene shell ni barra de pestañas inferior.
//
//   <ArmazonFlujoSitio>
//     <FlujoPagina titulo=… paso=… total=… barra={<BarraFlujo … />}>…</FlujoPagina>
//   </ArmazonFlujoSitio>

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import s from "./flujo-sitio.module.css";

export function ArmazonFlujoSitio({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(s.armazon, className)}>{children}</div>;
}
