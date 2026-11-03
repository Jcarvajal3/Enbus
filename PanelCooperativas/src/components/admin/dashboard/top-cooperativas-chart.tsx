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
  total_transacciones: {
    label: "Transacciones",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

interface TopCooperativasChartProps {
  data: { cooperativa_id: string; nombre: string; total_transacciones: number }[];
}

export function TopCooperativasChart({ data }: TopCooperativasChartProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Cooperativas con más movimiento</CardTitle>
        <CardDescription>Encomiendas y boletos pagados en los últimos 30 días</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
            Sin transacciones registradas.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <BarChart
              accessibilityLayer
              data={data}
              layout="vertical"
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            >
              <CartesianGrid horizontal={false} className="stroke-muted/40" />
              <YAxis
                dataKey="nombre"
                type="category"
                tickLine={false}
                axisLine={false}
                className="text-xs text-muted-foreground"
                width={150}
              />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} className="text-xs text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="total_transacciones"
                fill="var(--color-chart-3)"
                radius={[0, 4, 4, 0]}
                barSize={20}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
