"use client";

/**
 * DashboardCharts — Client boundary for lazy-loading Recharts chart components.
 *
 * Recharts registers browser-only APIs (canvas, ResizeObserver) at module load time.
 * Wrapping them in a Client Component with `next/dynamic` + { ssr: false } avoids
 * SSR hydration issues and defers ~280KB of chart code to a separate async chunk.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyActivity, TopCooperativa, RutaPopular } from "@/lib/types/admin-dashboard";

const ChartSkeleton = () => (
  <Skeleton className="h-80 w-full rounded-md" aria-hidden />
);

const ActivityChart = dynamic(
  () => import("./activity-chart").then((m) => ({ default: m.ActivityChart })),
  { loading: ChartSkeleton, ssr: false }
);
const TopCooperativasChart = dynamic(
  () => import("./top-cooperativas-chart").then((m) => ({ default: m.TopCooperativasChart })),
  { loading: ChartSkeleton, ssr: false }
);
const RutasChart = dynamic(
  () => import("./rutas-chart").then((m) => ({ default: m.RutasChart })),
  { loading: ChartSkeleton, ssr: false }
);

interface DashboardChartsProps {
  activityData: DailyActivity[];
  topCooperativas: TopCooperativa[];
  rutasPopulares: RutaPopular[];
}

export function DashboardCharts({ activityData, topCooperativas, rutasPopulares }: DashboardChartsProps) {
  return (
    <>
      <ActivityChart data={activityData} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopCooperativasChart data={topCooperativas} />
        <RutasChart data={rutasPopulares} />
      </div>
    </>
  );
}
