import { redirect } from "next/navigation";
import { INICIO } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export default function CooperativasIndex() {
  redirect(INICIO);
}
