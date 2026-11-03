"use client";

import { ChartLine } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Colores de dominio (D20): Boletos = chart-3 (azul), Encomiendas = chart-2 (coral).
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

interface ActivityChartProps {
  data: { fecha: string; encomiendas: number; boletos: number }[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  // Format date from YYYY-MM-DD to DD/MM for display
  const formattedData = data.map((item) => {
    const parts = item.fecha.split("-");
    const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : item.fecha;
    return {
      ...item,
      displayDate: label,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad de los últimos 30 días</CardTitle>
        <CardDescription>Boletos pagados y encomiendas registradas por día</CardDescription>
      </CardHeader>
      <CardContent>
        {data.every((d) => !d.boletos && !d.encomiendas) ? (
          <EmptyState compacto icon={ChartLine} title="Sin actividad en estos 30 días" />
        ) : (
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <LineChart accessibilityLayer data={formattedData} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              className="text-xs text-muted-foreground"
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} className="text-xs text-muted-foreground" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="boletos"
              stroke="var(--color-boletos)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="encomiendas"
              stroke="var(--color-encomiendas)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
