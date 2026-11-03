// ─── Puesta en marcha (#38, P-15) ────────────────────────────────────────────
// Tarjeta del Resumen con los pasos para empezar a vender (datos de
// fn_checklist_cooperativa). Se oculta cuando todo está listo y la cooperativa
// ya está ACTIVA. Componente de servidor: solo enlaces, sin estado.

import Link from "next/link";
import { ArrowRight, CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Respuesta de `fn_checklist_cooperativa()`. */
export type ChecklistCooperativa = {
  estado: string | null;
  motivo_estado: string | null;
  estado_cambiado_at: string | null;
  sucursales: number;
  metodos_pago: number;
  metodos_digitales: number;
  rutas: number;
  viajes_proximos: number;
  taquilleros: number;
  invitaciones_pendientes: number;
};

type Paso = { titulo: string; ayuda: string; href: string; hecho: boolean; opcional?: boolean };

function pasos(c: ChecklistCooperativa): Paso[] {
  return [
    {
      titulo: "Crea tu primera sucursal",
      ayuda: "Cada empleado y cada encomienda pertenecen a una sucursal.",
      href: "/cooperativas/configuracion?tab=sucursales",
      hecho: Number(c.sucursales) > 0,
    },
    {
      titulo: "Agrega un método de pago digital (Pago Móvil, transferencia o Zelle)",
      ayuda: "Es donde los pasajeros te pagan desde la app.",
      href: "/cooperativas/configuracion?tab=metodos-pago",
      hecho: Number(c.metodos_digitales) > 0,
    },
    {
      titulo: "Crea una ruta con su precio",
      ayuda: "El precio va en USD; el pasajero paga en Bs a la tasa BCV del día.",
      href: "/cooperativas/rutas",
      hecho: Number(c.rutas) > 0,
    },
    {
      titulo: "Programa tu primera salida",
      ayuda: "Sin salidas próximas, la app no muestra tus viajes.",
      href: "/cooperativas/viajes",
      hecho: Number(c.viajes_proximos) > 0,
    },
    {
      titulo: "Invita a tus taquilleros",
      ayuda:
        Number(c.invitaciones_pendientes) > 0 && Number(c.taquilleros) === 0
          ? "Tienes invitaciones pendientes: recuérdales crear su cuenta."
          : "Cada uno entra con su propia cuenta.",
      href: "/cooperativas/empleados",
      hecho: Number(c.taquilleros) > 0,
      opcional: true,
    },
  ];
}

export function ChecklistPuestaEnMarcha({ checklist }: { checklist: ChecklistCooperativa }) {
  const lista = pasos(checklist);
  const obligatorios = lista.filter((p) => !p.opcional);
  const hechos = obligatorios.filter((p) => p.hecho).length;
  const completo = hechos === obligatorios.length;

  if (completo && checklist.estado === "ACTIVA") return null;

  return (
    <Card id="puesta-en-marcha" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>
          Puesta en marcha ({hechos}/{obligatorios.length})
        </CardTitle>
        <CardDescription>
          {completo
            ? "Tu panel está listo para vender. Te avisaremos por correo cuando aprobemos tu cooperativa."
            : "Completa estos pasos para empezar a vender boletos y recibir encomiendas."}
        </CardDescription>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Pasos completados"
          aria-valuemin={0}
          aria-valuemax={obligatorios.length}
          aria-valuenow={hechos}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(hechos / obligatorios.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="divide-y rounded-xl border">
          {lista.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="group flex items-center gap-3 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              >
                {p.hecho ? (
                  <CheckCircle className="size-5 shrink-0 text-success-text" weight="fill" aria-hidden />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", p.hecho && "text-muted-foreground line-through decoration-1")}>
                    {p.titulo}
                    {p.opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{p.ayuda}</span>
                  <span className="sr-only">{p.hecho ? "Hecho." : "Pendiente."}</span>
                </span>
                {!p.hecho && (
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                )}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
