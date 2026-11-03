import { redirect } from "next/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

export const dynamic = "force-dynamic";

export default function AdminRootPage() {
  redirect(INICIO_ADMIN);
}
