"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Colores de dominio (D20, SY-03): Boletos = azul (chart-3), Encomiendas = coral
// (chart-2), igual que en la app. Boletos va antes que Encomiendas (D2).
const chartConfig = {
  boletos: {
    label: "Boletos",
    color: "var(--color-chart-3)",
  },
  encomiendas: {
    label: "Encomiendas",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

export function ActivityChart({ data }: { data: { date: string; encomiendas: number; boletos: number }[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Actividad</CardTitle>
        <CardDescription>Últimos 7 días</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="boletos" stackId="a" fill="var(--color-boletos)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="encomiendas" stackId="a" fill="var(--color-encomiendas)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
