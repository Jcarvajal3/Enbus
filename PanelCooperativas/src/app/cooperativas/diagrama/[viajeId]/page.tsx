import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { DiagramaAsientos } from "@/components/viajes/diagrama-asientos";
import { identidadViaje } from "@/components/viajes/marcar-viaje-dialogs";
import { formatFechaVE } from "@/lib/fechas";

export const metadata = { title: "Asientos del viaje" };

// Pantalla completa del diagrama de asientos, sin menú: para la terminal.
export default async function DiagramaPantallaPage({ params }: { params: Promise<{ viajeId: string }> }) {
  const { viajeId } = await params;
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");
  if ((user.role !== "admin_cooperativa" && user.role !== "taquillero") || !user.cooperativa_id) notFound();

  const supabase = await createClient();
  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, fecha_hora_salida, asientos_totales, numero_unidad, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino)")
    .eq("id", viajeId)
    .eq("cooperativa_id", user.cooperativa_id)
    .maybeSingle();
  if (!viaje) notFound();

  const ruta = (Array.isArray(viaje.ruta) ? viaje.ruta[0] : viaje.ruta) as
    | { ciudad_origen: string; ciudad_destino: string }
    | null;

  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-background p-6 md:p-10">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
          {identidadViaje({ origen: ruta?.ciudad_origen, destino: ruta?.ciudad_destino, salida: viaje.fecha_hora_salida })}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground md:text-2xl">
          {formatFechaVE(viaje.fecha_hora_salida)}
          {viaje.numero_unidad ? ` · Unidad ${viaje.numero_unidad}` : ""}
        </p>
      </header>
      <DiagramaAsientos viajeId={viaje.id} totalAsientos={viaje.asientos_totales} modo="pantalla" />
    </main>
  );
}
