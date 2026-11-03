import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPanelLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6 w-full max-w-6xl mx-auto animate-in fade-in duration-500">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>

      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
