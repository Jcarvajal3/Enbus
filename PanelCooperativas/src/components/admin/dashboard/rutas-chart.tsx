"use client";

import { Package } from "@phosphor-icons/react";
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

// Dominio Encomiendas = chart-2 (D20).
const chartConfig = {
  total: {
    label: "Encomiendas",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

interface RutasChartProps {
  data: { ruta_nombre: string; total: number }[];
}

export function RutasChart({ data }: RutasChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rutas con más encomiendas</CardTitle>
        <CardDescription>Encomiendas registradas en los últimos 30 días</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState compacto icon={Package} title="Sin encomiendas en estos 30 días" />
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <BarChart
              accessibilityLayer
              data={data}
              layout="vertical"
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            >
              <CartesianGrid horizontal={false} className="stroke-border" />
              {/* Barras horizontales: los nombres de las rutas no se solapan (AD-08). */}
              <YAxis
                dataKey="ruta_nombre"
                type="category"
                tickLine={false}
                axisLine={false}
                width={170}
                className="text-xs text-muted-foreground"
              />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} className="text-xs text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="total"
                fill="var(--color-total)"
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
