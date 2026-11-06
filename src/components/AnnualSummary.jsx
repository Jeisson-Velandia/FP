import React, { useMemo, useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { fmt, thisYear, thisMonthIndex } from "../lib/format.js";
import {
  buildMonthlySummaries, computeVariation, getAvailableYears, summarizeYear,
} from "../lib/annualSummary.js";
import { getCategoryHex } from "../lib/categoryColors.js";

// Mismos verdes/rojos que usa el resto del dashboard (var(--green)/var(--red) en index.css),
// repetidos aquí en hex literal porque Recharts no resuelve variables CSS en el atributo `fill`
// de forma confiable — es la misma convención que ya usaba el gráfico de presupuesto original.
const SERIES_COLORS = {
  ingresos: "#34D399",
  gastos: "#F87171",
  balance: "#E7EAF3",
  ahorro: getCategoryHex("ahorro"),
};

/** $3.500.000 → "$3,5M", $450.000 → "$450k" (ejes de la gráfica). */
const compact = (n) => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${a}`;
};

/**
 * @param {{ transactions: import("../lib/annualSummary.js").Transaction[], monthlyIncomeTotal?: number }} props
 */
export default function AnnualSummary({ transactions, monthlyIncomeTotal = 0 }) {
  const availableYears = useMemo(() => getAvailableYears(transactions), [transactions]);
  const [year, setYear] = useState(thisYear());

  const months = useMemo(
    () => buildMonthlySummaries(transactions, year, { fixedMonthlyIncome: monthlyIncomeTotal }),
    [transactions, year, monthlyIncomeTotal]
  );
  const yearTotals = useMemo(() => summarizeYear(months), [months]);

  // Solo se muestran los meses con actividad: desde el primer mes con datos hasta el mes actual (año en
  // curso) o hasta el último mes con datos (años pasados). Así las barras no quedan diminutas entre
  // meses vacíos cuando apenas empiezas a usar la app.
  const isCurrentYear = year === thisYear();
  const firstIdx = Math.max(0, months.findIndex((m) => m.hasData));
  const lastWithData = months.reduce((last, m, i) => (m.hasData ? i : last), firstIdx);
  const lastIdx = isCurrentYear ? Math.max(thisMonthIndex(), lastWithData) : lastWithData;
  const visibleMonths = months.slice(firstIdx, lastIdx + 1);

  const chartData = visibleMonths.map((m) => ({
    name: m.monthLabel,
    Ingresos: Math.round(m.ingresos),
    Gastos: Math.round(m.gastos),
    Ahorro: Math.round(m.ahorro),
    Balance: Math.round(m.balance),
  }));

  return (
    <div className="space-y-6">
      <div className="ledger-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} style={{ color: "var(--brass)" }} />
          <h3 className="font-display text-base">Consolidado histórico {year}</h3>
        </div>
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-dim)" }}>
          <span>Año</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ledger-card p-5">
        <h4 className="font-display text-base mb-4">Ingresos, gastos, ahorro y balance por mes</h4>
        {yearTotals.mesesConDatos === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Todavía no hay movimientos registrados en {year}.
          </p>
        ) : (
          <>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--ink-dim)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--ink-dim)", fontSize: 11 }} tickFormatter={compact} width={52} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  contentStyle={{ background: "#1A2234", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, color: "#E7EAF3" }}
                  formatter={(value) => fmt(/** @type {number} */ (value))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingresos" fill={SERIES_COLORS.ingresos} radius={[4, 4, 0, 0]} maxBarSize={42} />
                <Bar dataKey="Gastos" fill={SERIES_COLORS.gastos} radius={[4, 4, 0, 0]} maxBarSize={42} />
                <Bar dataKey="Ahorro" fill={SERIES_COLORS.ahorro} radius={[4, 4, 0, 0]} maxBarSize={42} />
                <Line type="linear" dataKey="Balance" stroke={SERIES_COLORS.balance} strokeWidth={2} dot={{ r: 3, fill: SERIES_COLORS.balance }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {monthlyIncomeTotal > 0 && (
            <p className="text-xs mt-3" style={{ color: "var(--ink-dim)" }}>
              Los ingresos fijos de Configuración ({fmt(monthlyIncomeTotal)}/mes) se cuentan en cada mes desde tu primer movimiento, igual que en el Tablero. Si además registras tu sueldo como movimiento de ingreso, se contará dos veces: usa uno u otro.
            </p>
          )}
          </>
        )}
      </div>

      <div className="ledger-card p-5">
        <h4 className="font-display text-base mb-4">Resumen mensual con variación</h4>
        {visibleMonths.every((m) => !m.hasData) ? (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Todavía no hay movimientos registrados en {year}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b hairline" style={{ color: "var(--ink-dim)" }}>
                  <th className="py-2 pr-3 font-normal">Mes</th>
                  <th className="py-2 pr-3 font-normal text-right">Ingresos</th>
                  <th className="py-2 pr-3 font-normal text-right">Gastos</th>
                  <th className="py-2 pr-3 font-normal text-right">Ahorro</th>
                  <th className="py-2 pl-3 font-normal text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {visibleMonths.map((m, i) => {
                  const previous = i > 0 ? visibleMonths[i - 1] : undefined;
                  const variation = computeVariation(m, previous);
                  return (
                    <tr key={m.monthIndex} className="border-b hairline">
                      <td className="py-2 pr-3 font-display">{m.monthLabel}</td>
                      <td className="py-2 pr-3 text-right">
                        <MoneyWithVariation value={m.ingresos} pct={variation.ingresosPct} polarity="up-good" />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <MoneyWithVariation value={m.gastos} pct={variation.gastosPct} polarity="up-bad" />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <MoneyWithVariation value={m.ahorro} pct={variation.ahorroPct} polarity="up-good" />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <MoneyWithVariation
                          value={m.balance}
                          pct={variation.balancePct}
                          polarity="up-good"
                          valueColor={m.balance >= 0 ? "var(--green)" : "var(--red)"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 hairline font-medium">
                  <td className="py-2 pr-3 font-display">Total {year}</td>
                  <td className="py-2 pr-3 text-right font-mono-num" style={{ color: "var(--green)" }}>
                    {fmt(yearTotals.ingresos)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono-num" style={{ color: "var(--red)" }}>
                    {fmt(yearTotals.gastos)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono-num" style={{ color: SERIES_COLORS.ahorro }}>
                    {fmt(yearTotals.ahorro)}
                  </td>
                  <td
                    className="py-2 pl-3 text-right font-mono-num"
                    style={{ color: yearTotals.balance >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {fmt(yearTotals.balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Celda de dinero + variación porcentual respecto al mes anterior.
 *
 * `polarity` decide si un incremento es una buena o mala noticia para esa métrica:
 * - "up-good": subir es positivo (Ingresos, Ahorro, Balance) → sube en verde, baja en rojo.
 * - "up-bad":  subir es negativo (Gastos) → sube en rojo, baja en verde.
 *
 * @param {{ value: number, pct: number|null, polarity: "up-good"|"up-bad", valueColor?: string }} props
 */
function MoneyWithVariation({ value, pct, polarity, valueColor }) {
  const isGoodDirection = polarity === "up-good" ? (pct ?? 0) > 0 : (pct ?? 0) < 0;
  const isBadDirection = polarity === "up-good" ? (pct ?? 0) < 0 : (pct ?? 0) > 0;
  const color = pct === null || pct === 0 ? "var(--ink-dim)" : isGoodDirection ? "var(--green)" : isBadDirection ? "var(--red)" : "var(--ink-dim)";
  const Icon = pct === null || pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono-num" style={{ color: valueColor }}>
        {fmt(value)}
      </span>
      {pct !== null && (
        <span className="flex items-center gap-1 text-[11px] font-mono-num" style={{ color }}>
          <Icon size={10} />
          {Math.abs(pct) < 0.1 ? "0" : Math.abs(pct).toFixed(1)}%
        </span>
      )}
    </div>
  );
}
