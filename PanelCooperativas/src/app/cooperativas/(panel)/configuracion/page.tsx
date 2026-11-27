import { createClient } from "@/lib/supabase/server";
import { leerCooperativasPrivadas } from "@/lib/supabase/cooperativas-privadas";
import { exigirRolPanel } from "@/lib/supabase/auth-guards";
import { PageHeader } from "@/components/page-header";
import { humanizeError } from "@/lib/errores";
import { DatosCooperativaTab } from "./tab-datos";
import { MetodosPagoTab } from "./tab-metodos-pago";
import { SucursalesTab } from "./tab-sucursales";
import { NoLaborablesTab } from "./tab-no-laborables";
import { PestanasConfiguracion, type Pestana } from "./pestanas";
import type { CooperativaData, MetodoPagoCooperativa } from "@/lib/types/configuracion";
import type { DiaNoLaborable } from "@/lib/types/horarios";
import type { SucursalGuardada } from "./actions";

export default async function ConfiguracionPage() {
  // Solo el administrador configura la cooperativa (PN-12).
  const user = await exigirRolPanel(["admin_cooperativa"]);

  const supabase = await createClient();

  const [cooperativaResult, metodosResult, sucursalesResult, perfilResult, diasResult] = await Promise.all([
    // RIF: por la RPC (no es legible en la tabla).
    leerCooperativasPrivadas(supabase, (cooperativas) =>
      cooperativas.select("id, nombre, rif, logo_url, estado").eq("id", user.cooperativa_id).single()
    ),
    supabase
      .from("metodos_pago_cooperativa")
      .select("*")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sucursales")
      .select("*")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("nombre", { ascending: true }),
    supabase.from("profiles").select("sucursal_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("dias_no_laborables")
      .select("id, cooperativa_id, fecha, nombre, cada_anio, created_at")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("fecha", { ascending: true })
      .limit(500),
  ]);

  const cooperativa = cooperativaResult.data as (CooperativaData & { estado?: string | null }) | null;
  const metodos = (metodosResult.data ?? []) as MetodoPagoCooperativa[];
  const sucursales = (sucursalesResult.data ?? []) as SucursalGuardada[];
  const miSucursalId = (perfilResult.data?.sucursal_id as string | null | undefined) ?? null;

  if (cooperativaResult.error) console.error("[ConfiguracionPage] cooperativa:", cooperativaResult.error);
  if (metodosResult.error) console.error("[ConfiguracionPage] métodos de pago:", metodosResult.error);
  if (sucursalesResult.error) console.error("[ConfiguracionPage] sucursales:", sucursalesResult.error);
  if (diasResult.error) console.error("[ConfiguracionPage] días no laborables:", diasResult.error);
  const diasNoLaborables = (diasResult.data ?? []) as DiaNoLaborable[];

  if (!cooperativa) {
    // Se lanza para que error.tsx muestre "Reintentar" (sin texto técnico).
    throw new Error(humanizeError(cooperativaResult.error, "cargar los datos de la cooperativa"));
  }

  // Mientras la cooperativa está en revisión o rechazada, lo primero son sus datos (PN-32).
  const estado = cooperativa.estado ?? user.cooperativa_estado ?? null;
  const defecto: Pestana = estado === "PENDIENTE" || estado === "RECHAZADA" ? "datos" : "sucursales";

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <PageHeader title="Configuración" />

      <PestanasConfiguracion
        defecto={defecto}
        paneles={{
          sucursales: (
            <SucursalesTab
              sucursales={sucursales}
              miSucursalId={miSucursalId}
              errorCarga={sucursalesResult.error ? humanizeError(sucursalesResult.error, "cargar las sucursales") : null}
            />
          ),
          "metodos-pago": (
            <MetodosPagoTab
              metodos={metodos}
              errorCarga={metodosResult.error ? humanizeError(metodosResult.error, "cargar los métodos de pago") : null}
            />
          ),
          "no-laborables": (
            <NoLaborablesTab
              dias={diasNoLaborables}
              errorCarga={diasResult.error ? humanizeError(diasResult.error, "cargar los días no laborables") : null}
            />
          ),
          datos: <DatosCooperativaTab cooperativa={cooperativa} estado={estado} />,
        }}
      />
    </div>
  );
}
