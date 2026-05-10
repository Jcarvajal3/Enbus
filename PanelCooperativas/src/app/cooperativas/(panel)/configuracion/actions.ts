"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { revalidatePath } from "next/cache";
import type {
  TipoMetodoPago,
  MetodoPagoCooperativa,
  Sucursal,
} from "@/lib/types/configuracion";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const user = await getUserProfile();
  if (!user) throw new Error("No autenticado");
  if (user.role !== "admin_cooperativa") throw new Error("Sin permisos");
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooperativa — logo upload
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadLogo(formData: FormData): Promise<{ url: string }> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Archivo inválido");

  const ext = file.name.split(".").pop() ?? "png";
  const path = `${user.cooperativa_id}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("logos-cooperativas")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from("logos-cooperativas").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`; // cache-bust

  const { error: updateError } = await supabase
    .from("cooperativas")
    .update({ logo_url: url })
    .eq("id", user.cooperativa_id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/cooperativas/configuracion");
  return { url };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métodos de Pago
// ─────────────────────────────────────────────────────────────────────────────

type MetodoPagoInput = {
  tipo: TipoMetodoPago;
  banco: string | null;
  titular: string;
  numero_cuenta: string | null;
  cedula_rif: string | null;
  email_zelle: string | null;
  instrucciones: string | null;
};

export async function crearMetodoPago(input: MetodoPagoInput): Promise<MetodoPagoCooperativa> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("metodos_pago_cooperativa")
    .insert({ ...input, cooperativa_id: user.cooperativa_id, activo: true })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/cooperativas/configuracion");
  return data as MetodoPagoCooperativa;
}

export async function actualizarMetodoPago(
  id: string,
  input: Partial<MetodoPagoInput & { activo: boolean }>
): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("metodos_pago_cooperativa")
    .update(input)
    .eq("id", id)
    .eq("cooperativa_id", user.cooperativa_id);

  if (error) throw new Error(error.message);
  revalidatePath("/cooperativas/configuracion");
}

export async function eliminarMetodoPago(id: string): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("metodos_pago_cooperativa")
    .delete()
    .eq("id", id)
    .eq("cooperativa_id", user.cooperativa_id);

  if (error) throw new Error(error.message);
  revalidatePath("/cooperativas/configuracion");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sucursales
// ─────────────────────────────────────────────────────────────────────────────

type SucursalInput = {
  nombre: string;
  estado: string;
  ciudad: string;
  direccion: string | null;
  telefono: string | null;
};

export async function crearSucursal(input: SucursalInput): Promise<Sucursal> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sucursales")
    .insert({ ...input, cooperativa_id: user.cooperativa_id, activa: true })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/cooperativas/configuracion");
  return data as Sucursal;
}

export async function actualizarSucursal(
  id: string,
  input: Partial<SucursalInput & { activa: boolean }>
): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("sucursales")
    .update(input)
    .eq("id", id)
    .eq("cooperativa_id", user.cooperativa_id);

  if (error) throw new Error(error.message);
  revalidatePath("/cooperativas/configuracion");
}

export async function eliminarSucursal(id: string): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("sucursales")
    .delete()
    .eq("id", id)
    .eq("cooperativa_id", user.cooperativa_id);

  if (error) throw new Error(error.message);
  revalidatePath("/cooperativas/configuracion");
}
