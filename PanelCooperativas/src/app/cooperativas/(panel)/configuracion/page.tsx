import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { humanizeError } from "@/lib/errores";
import { DatosCooperativaTab } from "./tab-datos";
import { MetodosPagoTab } from "./tab-metodos-pago";
import { SucursalesTab } from "./tab-sucursales";
import type { CooperativaData, MetodoPagoCooperativa } from "@/lib/types/configuracion";
import type { SucursalGuardada } from "./actions";

export const metadata = {
  title: "Configuración | EnBus Panel",
  description: "Datos de la cooperativa, métodos de pago, sucursales e impresora",
};

const PESTANAS = ["datos", "metodos-pago", "sucursales"] as const;

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab = (PESTANAS as readonly string[]).includes(tab ?? "") ? (tab as string) : "datos";

  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  // Solo el administrador configura la cooperativa
  if (user.role !== "admin_cooperativa") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-muted-foreground text-sm">
          Solo el administrador de la cooperativa puede ver la configuración.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [cooperativaResult, metodosResult, sucursalesResult] = await Promise.all([
    supabase
      .from("cooperativas")
      .select("id, nombre, rif, logo_url, comision_porcentaje, estado")
      .eq("id", user.cooperativa_id)
      .single(),
    supabase
      .from("metodos_pago_cooperativa")
      .select("*")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("sucursales")
      .select("*")
      .eq("cooperativa_id", user.cooperativa_id)
      .order("nombre", { ascending: true }),
  ]);

  const cooperativa = cooperativaResult.data as (CooperativaData & { estado?: string | null }) | null;
  const metodos = (metodosResult.data ?? []) as MetodoPagoCooperativa[];
  const sucursales = (sucursalesResult.data ?? []) as SucursalGuardada[];

  if (cooperativaResult.error) console.error("[ConfiguracionPage] cooperativa:", cooperativaResult.error);
  if (metodosResult.error) console.error("[ConfiguracionPage] métodos de pago:", metodosResult.error);
  if (sucursalesResult.error) console.error("[ConfiguracionPage] sucursales:", sucursalesResult.error);

  if (!cooperativa) {
    // Se lanza para que error.tsx muestre "Reintentar" (sin texto técnico).
    throw new Error(humanizeError(cooperativaResult.error, "cargar los datos de la cooperativa"));
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <PageHeader
        title="Configuración"
        description="Datos de tu cooperativa, métodos de pago, sucursales e impresora."
      />

      <Tabs key={defaultTab} defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="metodos-pago">Métodos de pago</TabsTrigger>
          <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
          <Link
            href="/cooperativas/configuracion/hardware"
            className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/70 transition-all hover:text-foreground"
          >
            Impresora y lector
          </Link>
        </TabsList>

        <TabsContent value="datos">
          <DatosCooperativaTab cooperativa={cooperativa} estado={cooperativa.estado ?? user.cooperativa_estado ?? null} />
        </TabsContent>

        <TabsContent value="metodos-pago">
          <MetodosPagoTab
            metodos={metodos}
            errorCarga={metodosResult.error ? humanizeError(metodosResult.error, "cargar los métodos de pago") : null}
          />
        </TabsContent>

        <TabsContent value="sucursales">
          <SucursalesTab
            sucursales={sucursales}
            errorCarga={sucursalesResult.error ? humanizeError(sucursalesResult.error, "cargar las sucursales") : null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
