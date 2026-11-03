"use client";

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

const chartConfig = {
  encomiendas: {
    label: "Encomiendas",
    color: "var(--color-chart-1)",
  },
  boletos: {
    label: "Boletos",
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
    <Card className="col-span-1 lg:col-span-3">
      <CardHeader>
        <CardTitle>Actividad de los últimos 30 días</CardTitle>
        <CardDescription>Encomiendas registradas y boletos pagados por día</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <LineChart accessibilityLayer data={formattedData} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/40" />
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
              dataKey="encomiendas"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="boletos"
              stroke="var(--color-chart-2)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
