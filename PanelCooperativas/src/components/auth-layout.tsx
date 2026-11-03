import { BrandMark } from "@/components/brand-mark";

// ─── Marco común de las pantallas de acceso (login, recuperar, restablecer,
// registro, invitación) del panel y del admin ─────────────────────────────────
// lg+: panel izquierdo con la marca y la zona; a la derecha, la tarjeta. En
// teléfono la tarjeta se funde con el fondo y la marca va encima. El título es
// siempre el H1 de la pantalla. Sigue el tema elegido (D14).

const ZONA = { cooperativas: "Cooperativas", admin: "Administración" } as const;

export function AuthLayout({
  zona,
  titulo,
  descripcion,
  children,
  pie,
}: {
  zona: "cooperativas" | "admin";
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  const nombreZona = ZONA[zona];

  return (
    <div className="flex min-h-svh w-full flex-1 bg-background">
      <aside className="hidden w-2/5 max-w-xl shrink-0 flex-col justify-between border-r border-border bg-muted p-10 lg:flex">
        <BrandMark tamano="lg" conNombre zona={nombreZona} />
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} EnBus</p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6">
        <div className="w-full max-w-md lg:hidden">
          <BrandMark tamano="md" conNombre zona={nombreZona} />
        </div>
        <div className="flex w-full max-w-md flex-col gap-6 rounded-md border-0 bg-transparent shadow-none lg:border lg:border-border lg:bg-card lg:p-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{titulo}</h1>
            {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
          </div>
          {children}
          {pie && <div className="text-center text-sm text-muted-foreground">{pie}</div>}
        </div>
      </main>
    </div>
  );
}
