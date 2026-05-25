import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatosCooperativaTab } from "./tab-datos";
import { MetodosPagoTab } from "./tab-metodos-pago";
import { SucursalesTab } from "./tab-sucursales";
import type {
  CooperativaData,
  MetodoPagoCooperativa,
  Sucursal,
} from "@/lib/types/configuracion";

export const metadata = {
  title: "Configuración | EnBus Panel",
  description: "Configuración de datos, métodos de pago, sucursales y hardware",
};

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab = tab || "datos";

  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  // Solo admins pueden acceder a configuración
  if (user.role !== "admin_cooperativa") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-muted-foreground text-sm">
          No tienes permisos para acceder a esta sección.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // Fetch en paralelo — cooperativa + métodos de pago + sucursales
  const [cooperativaResult, metodosResult, sucursalesResult] = await Promise.all([
    supabase
      .from("cooperativas")
      .select("id, nombre, rif, logo_url, comision_porcentaje")
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

  const cooperativa = cooperativaResult.data as CooperativaData | null;
  const metodos = (metodosResult.data ?? []) as MetodoPagoCooperativa[];
  const sucursales = (sucursalesResult.data ?? []) as Sucursal[];

  if (!cooperativa) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-muted-foreground text-sm">
          No se encontraron los datos de la cooperativa.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-1">
          Administre los datos, métodos de pago, sucursales y hardware de su cooperativa.
        </p>
      </div>

      <Tabs key={defaultTab} defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="metodos-pago">Métodos de Pago</TabsTrigger>
          <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
          <Link
            href="/cooperativas/configuracion/hardware"
            className="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground"
          >
            Hardware ↗
          </Link>
        </TabsList>

        <TabsContent value="datos">
          <DatosCooperativaTab cooperativa={cooperativa} />
        </TabsContent>

        <TabsContent value="metodos-pago">
          <MetodosPagoTab metodos={metodos} />
        </TabsContent>

        <TabsContent value="sucursales">
          <SucursalesTab sucursales={sucursales} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
