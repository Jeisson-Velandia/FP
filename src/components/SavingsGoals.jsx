import React, { useState, useEffect } from "react";
import { PiggyBank, Target, TrendingUp, CheckCircle2, AlertTriangle, Save } from "lucide-react";
import { fmt } from "../lib/format.js";
import { computeSavingsProjection } from "../lib/savingsGoals.js";
import { getCategoryHex } from "../lib/categoryColors.js";
import { CategoryProgressBar } from "./CategoryVisuals.jsx";

const AHORRO_HEX = getCategoryHex("ahorro");
const STATUS_COLOR = { verde: "var(--green)", amarillo: "var(--amber)", rojo: "var(--red)", "sin-meta": "var(--ink-dim)" };
const STATUS_ICON = { verde: CheckCircle2, amarillo: AlertTriangle, rojo: AlertTriangle, "sin-meta": Target };

/**
 * Módulo de "Metas y Proyección de Ahorro" (Requerimiento 3).
 *
 * @param {{
 *   monthsThisYear: import("../lib/annualSummary.js").MonthlySummary[],
 *   currentMonthIndex: number,
 *   goals: import("../lib/savingsGoals.js").SavingsGoals,
 *   onSaveGoals: (goals: import("../lib/savingsGoals.js").SavingsGoals) => void,
 * }} props
 */
export default function SavingsGoalsModule({ monthsThisYear, currentMonthIndex, goals, onSaveGoals }) {
  const [form, setForm] = useState({ monthly: goals.monthly || "", annual: goals.annual || "" });

  // Si las metas cambian desde fuera (ej. se cargaron de la nube después del primer render), refleja el valor.
  useEffect(() => {
    setForm({ monthly: goals.monthly || "", annual: goals.annual || "" });
  }, [goals.monthly, goals.annual]);

  const projection = computeSavingsProjection(monthsThisYear, currentMonthIndex, {
    monthly: Number(goals.monthly) || 0,
    annual: Number(goals.annual) || 0,
  });

  const saveGoals = () => {
    onSaveGoals({ monthly: Number(form.monthly) || 0, annual: Number(form.annual) || 0 });
  };

  const StatusIcon = STATUS_ICON[projection.metaMensualStatus];
  const statusColor = STATUS_COLOR[projection.metaMensualStatus];

  return (
    <div className="space-y-6">
      <div className="ledger-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <PiggyBank size={18} style={{ color: AHORRO_HEX }} />
          <h3 className="font-display text-base">Metas de ahorro</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
            <span>Meta mensual ($)</span>
            <input
              type="number"
              placeholder="0"
              value={form.monthly}
              onChange={(e) => setForm({ ...form, monthly: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
            <span>Meta anual ($)</span>
            <input
              type="number"
              placeholder="0"
              value={form.annual}
              onChange={(e) => setForm({ ...form, annual: e.target.value })}
            />
          </label>
          <div className="flex items-end">
            <button onClick={saveGoals} className="btn-brass rounded px-3 py-2 text-sm font-medium flex items-center gap-2 w-full justify-center">
              <Save size={15} /> Guardar metas
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumplimiento del mes en curso */}
        <div className="ledger-card p-5">
          <h4 className="font-display text-base mb-4">Cumplimiento del mes en curso</h4>
          {projection.metaMensualStatus === "sin-meta" ? (
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Define una meta mensual arriba para ver tu avance aquí.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm flex items-center gap-1.5" style={{ color: statusColor }}>
                  <StatusIcon size={14} />
                  {Math.round(projection.metaMensualPct ?? 0)}% de la meta
                </span>
                <span className="font-mono-num text-sm" style={{ color: "var(--ink-dim)" }}>
                  {fmt(projection.ahorroMesActual)} / {fmt(goals.monthly)}
                </span>
              </div>
              <CategoryProgressBar category="ahorro" value={projection.ahorroMesActual} max={Number(goals.monthly) || 0} />
            </>
          )}
        </div>

        {/* Run rate y proyección a 12 meses */}
        <div className="ledger-card p-5">
          <h4 className="font-display text-base mb-4 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: AHORRO_HEX }} />
            Ritmo de ahorro (run rate)
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Promedio mensual {new Date().getFullYear()}
              </p>
              <p className="font-mono-num text-lg font-semibold" style={{ color: AHORRO_HEX }}>
                {fmt(projection.runRateMensual)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Proyección a 12 meses
              </p>
              <p className="font-mono-num text-lg font-semibold" style={{ color: AHORRO_HEX }}>
                {fmt(projection.proyeccion12Meses)}
              </p>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--ink-dim)" }}>
            Basado en {projection.mesesTranscurridos} {projection.mesesTranscurridos === 1 ? "mes transcurrido" : "meses transcurridos"} de {new Date().getFullYear()}, con un acumulado de{" "}
            <span className="font-mono-num">{fmt(projection.ahorroAcumuladoAnio)}</span>.
          </p>
        </div>
      </div>

      {/* Tiempo estimado para la meta anual */}
      <div className="ledger-card p-5">
        <h4 className="font-display text-base mb-3 flex items-center gap-2">
          <Target size={16} style={{ color: AHORRO_HEX }} />
          Meta anual
        </h4>
        {!goals.annual ? (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Define una meta anual arriba para ver una estimación de cuándo la alcanzarías.
          </p>
        ) : projection.metaAnualCumplida ? (
          <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--green)" }}>
            <CheckCircle2 size={14} /> ¡Meta anual cumplida! Ya ahorraste {fmt(projection.ahorroAcumuladoAnio)} de {fmt(goals.annual)}.
          </p>
        ) : projection.mesesParaMetaAnual === null ? (
          <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--amber)" }}>
            <AlertTriangle size={14} />
            Con tu ritmo actual ($0 de ahorro promedio) no es posible estimar cuándo alcanzarías la meta. Registra algún abono a "Ahorro" para activar la proyección.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Vas en <span className="font-mono-num" style={{ color: AHORRO_HEX }}>{fmt(projection.ahorroAcumuladoAnio)}</span> de{" "}
              <span className="font-mono-num">{fmt(goals.annual)}</span>. Al ritmo actual, la alcanzarías en aproximadamente:
            </p>
            <p className="font-mono-num text-2xl font-semibold" style={{ color: AHORRO_HEX }}>
              {Math.ceil(projection.mesesParaMetaAnual)} {Math.ceil(projection.mesesParaMetaAnual) === 1 ? "mes" : "meses"}
            </p>
            <CategoryProgressBar category="ahorro" value={projection.ahorroAcumuladoAnio} max={Number(goals.annual) || 0} />
          </div>
        )}
      </div>
    </div>
  );
}
