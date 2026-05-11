import { Skeleton } from "@/components/ui/skeleton";

export default function EntregaLoading() {
  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="flex-1 rounded-md border bg-card p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
