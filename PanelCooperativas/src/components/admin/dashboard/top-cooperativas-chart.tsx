"use client";

import { Buildings } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
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

// Serie sin dominio (boletos + encomiendas) = chart-5 (D20).
const chartConfig = {
  total_transacciones: {
    label: "Transacciones",
    color: "var(--color-chart-5)",
  },
} satisfies ChartConfig;

interface TopCooperativasChartProps {
  data: { cooperativa_id: string; nombre: string; total_transacciones: number }[];
}

export function TopCooperativasChart({ data }: TopCooperativasChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cooperativas con más movimiento</CardTitle>
        <CardDescription>Boletos y encomiendas pagados en los últimos 30 días</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState compacto icon={Buildings} title="Sin movimiento en estos 30 días" />
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <BarChart
              accessibilityLayer
              data={data}
              layout="vertical"
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            >
              <CartesianGrid horizontal={false} className="stroke-border" />
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
                fill="var(--color-total_transacciones)"
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
