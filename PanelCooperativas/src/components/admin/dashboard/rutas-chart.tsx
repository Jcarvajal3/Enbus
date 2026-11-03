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
        <CardTitle>Rutas con más encomiendas</CardTitle>
        <CardDescription>Encomiendas registradas en los últimos 30 días</CardDescription>
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
              layout="vertical"
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            >
              <CartesianGrid horizontal={false} className="stroke-muted/40" />
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
                fill="var(--color-chart-4)"
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
