"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";
import type { SpendRow } from "@/lib/types";

/**
 * Gasto por clasificación.
 *
 * Recharts NO acepta className en sus primitivas, así que acá SÍ se usan
 * `var(--color-*)` — es la excepción documentada a la regla de Tailwind del
 * proyecto. `ChartContainer` de shadcn genera esas variables a partir del
 * `config`, así el gráfico respeta el tema (incluido modo oscuro) sin
 * hardcodear un solo color.
 */
const CONFIG = {
  total: { label: "Gasto" },
  MATERIALES: { label: "Materiales", color: "var(--chart-1)" },
  EQUIPOS: { label: "Equipos", color: "var(--chart-2)" },
  DOTACION: { label: "Dotación", color: "var(--chart-3)" },
  CONSUMIBLES: { label: "Consumibles", color: "var(--chart-4)" },
} satisfies ChartConfig;

const CATEGORIES = [
  "MATERIALES",
  "EQUIPOS",
  "DOTACION",
  "CONSUMIBLES",
] as const;

export function SpendChart({ spend }: { spend: SpendRow[] }) {
  // Se completan las 4 categorías aunque una tenga 0: un gráfico que cambia
  // de forma según los datos es imposible de comparar entre contratos.
  const data = CATEGORIES.map((category) => ({
    category,
    label: CONFIG[category].label,
    total: spend.find((s) => s.category === category)?.total ?? 0,
    fill: CONFIG[category].color,
  }));

  const hayDatos = data.some((d) => d.total > 0);

  if (!hayDatos) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Todavía no hay gasto aprobado en este rango.
      </div>
    );
  }

  return (
    <ChartContainer config={CONFIG} className="h-[220px] w-full">
      <BarChart data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={72}
          tickFormatter={(v: number) => formatCurrency(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatCurrency(Number(value))}
            />
          }
        />
        <Bar dataKey="total" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}
