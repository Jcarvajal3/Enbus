import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que el primer paso: botón ←, progreso, título y las opciones (PU-13).
export default function NuevaEncomiendaLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <Skeleton className="h-2 flex-1 rounded-full" />
      </div>
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-14 w-full rounded-md" />
      <div className="grid gap-2 md:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
