import { Skeleton } from "@/components/ui/skeleton";

export default function BoletosLoading() {
  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-4">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>
      <div className="flex-1 rounded-md border bg-card p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
