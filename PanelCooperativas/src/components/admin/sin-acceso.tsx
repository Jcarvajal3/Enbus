import Link from "next/link";
import { LockKey } from "@phosphor-icons/react/dist/ssr";
import { IconTile } from "@/components/icon-tile";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Sesión abierta con una cuenta que no es de super admin (p. ej. el admin de una
 * cooperativa que entra a /admin). En vez de redirigir al login (que con sesión
 * abierta vuelve al resumen, en bucle) se explica y se ofrece salir.
 */
export function SinAccesoAdmin() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas p-6 text-center text-foreground">
      <IconTile icon={LockKey} tone="neutral" size="xl" />
      <h1 className="text-[26px] font-semibold tracking-tight md:text-[32px]">Esta cuenta no es de administrador de EnBus</h1>
      <p className="max-w-md text-[15px] text-muted-foreground">
        Entra con una cuenta de administrador o usa el panel de tu cooperativa.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/cooperativas/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Ir al panel de cooperativas
        </Link>
        <form action="/admin/auth/salir" method="post">
          <Button type="submit" size="lg">Cerrar sesión</Button>
        </form>
      </div>
    </main>
  );
}
