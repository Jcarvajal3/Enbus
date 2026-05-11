import { Skeleton } from "@/components/ui/skeleton";

export default function TaquillaLoading() {
  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <Skeleton className="h-8 w-56 mb-2" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      <div className="flex-1 rounded-md border bg-card p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
