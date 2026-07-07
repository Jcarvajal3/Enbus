"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  total: {
    label: "Encomiendas",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig;

interface RutasChartProps {
  data: { ruta_nombre: string; total: number }[];
}

export function RutasChart({ data }: RutasChartProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Distribución por Ruta</CardTitle>
        <CardDescription>Rutas más populares del mes (encomiendas)</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
            Sin envíos registrados.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <BarChart
              accessibilityLayer
              data={data}
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            >
              <CartesianGrid vertical={false} className="stroke-muted/40" />
              <XAxis
                dataKey="ruta_nombre"
                tickLine={false}
                axisLine={false}
                className="text-[10px] sm:text-xs text-muted-foreground"
              />
              <YAxis tickLine={false} axisLine={false} className="text-xs text-muted-foreground" hide />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="total"
                fill="var(--color-chart-4)"
                radius={[4, 4, 0, 0]}
                barSize={30}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
