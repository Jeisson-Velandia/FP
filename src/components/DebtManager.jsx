import React, { useMemo, useState } from "react";
import { CreditCard, Landmark, Plus, History, ChevronDown, ChevronUp, AlertTriangle, X } from "lucide-react";
import { fmt, todayStr } from "../lib/format.js";
import { debtMetrics, portfolioMetrics, getDebtHistory } from "../lib/debts.js";
import { CategoryBadge } from "./CategoryVisuals.jsx";

const STATUS_COLOR = {
  verde: "var(--green)",
  amarillo: "var(--amber)",
  rojo: "var(--red)",
  "sin-cupo": "var(--ink-dim)",
};

/** Barra de uso del cupo, coloreada por el semáforo de endeudamiento. */
function UtilizationBar({ pct, status }) {
  return (
    <div className="h-2 w-full rounded-full overflow-hidden progress-track">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct ?? 0)}%`, background: STATUS_COLOR[status] }}
        role="progressbar"
        aria-valuenow={Math.round(pct ?? 0)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

/**
 * Resumen de toda la cartera: deuda total, cupo total, disponible y % de endeudamiento.
 * @param {{ debts: import("../lib/debts.js").Debt[] }} props
 */
function PortfolioSummary({ debts }) {
  const p = useMemo(() => portfolioMetrics(debts), [debts]);
  const status = p.utilizationPct === null ? "sin-cupo" : p.utilizationPct < 30 ? "verde" : p.utilizationPct < 70 ? "amarillo" : "rojo";

  return (
    <div className="ledger-card p-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Deuda total pendiente</p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: "var(--red)" }}>{fmt(p.totalBalance)}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Cupo total</p>
          <p className="font-mono-num text-lg font-semibold">{p.totalLimit > 0 ? fmt(p.totalLimit) : "—"}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Cupo disponible</p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: "var(--green)" }}>{p.totalLimit > 0 ? fmt(p.totalAvailable) : "—"}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Endeudamiento</p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: STATUS_COLOR[status] }}>
            {p.utilizationPct === null ? "—" : `${p.utilizationPct.toFixed(1)}%`}
          </p>
        </div>
      </div>
      {p.utilizationPct !== null && (
        <div className="mt-4">
          <UtilizationBar pct={p.utilizationPct} status={status} />
          <p className="text-[11px] mt-1.5" style={{ color: "var(--ink-dim)" }}>
            Por debajo de 30% se considera saludable; por encima de 70% es zona de riesgo.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Formulario compacto para cargar un consumo a una deuda (registro doble).
 * @param {{
 *   debt: import("../lib/debts.js").Debt,
 *   categories: { id: string, label: string }[],
 *   onSubmit: (data: { amount: number, category: string, date: string, description: string }) => void,
 *   onCancel: () => void,
 * }} props
 */
function ChargeForm({ debt, categories, onSubmit, onCancel }) {
  const [form, setForm] = useState({ amount: "", category: categories[0]?.id ?? "otros", date: todayStr(), description: "" });
  const amount = Number(form.amount) || 0;
  const after = debtMetrics({ ...debt, balance: Number(debt.balance) + amount });

  const submit = () => {
    if (amount <= 0 || !form.date) return;
    onSubmit({ amount, category: form.category, date: form.date, description: form.description });
  };

  return (
    <div className="mt-4 pt-4 border-t hairline space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
          <span>Monto del consumo</span>
          <input type="number" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
          <span>Categoría del gasto</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
          <span>Fecha</span>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
          <span>Descripción</span>
          <input placeholder="Opcional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
      </div>

      {amount > 0 && (
        <p className="text-xs" style={{ color: after.overLimit ? "var(--red)" : "var(--ink-dim)" }}>
          {after.overLimit && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
          El saldo pasará de <span className="font-mono-num">{fmt(debt.balance)}</span> a{" "}
          <span className="font-mono-num">{fmt(Number(debt.balance) + amount)}</span>
          {after.hasLimit &&
            (after.overLimit
              ? ". Este consumo supera tu cupo."
              : `, y te quedarán ${fmt(after.available)} de cupo (${after.utilizationPct.toFixed(1)}% usado).`)}
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={submit} className="btn-brass rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
          <Plus size={15} /> Registrar consumo
        </button>
        <button onClick={onCancel} className="btn-ghost rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
          <X size={15} /> Cancelar
        </button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--ink-dim)" }}>
        Se registra como gasto de la categoría elegida (cuenta en tu presupuesto) y se suma al saldo de esta deuda. No resta de tu efectivo hasta que pagues la deuda.
      </p>
    </div>
  );
}

/** Historial de consumos y pagos de una deuda. */
function DebtHistory({ items }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 pt-4 border-t hairline text-sm" style={{ color: "var(--ink-dim)" }}>
        Esta deuda aún no tiene consumos ni pagos registrados.
      </p>
    );
  }
  return (
    <div className="mt-4 pt-4 border-t hairline divide-y hairline">
      {items.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono-num text-xs shrink-0" style={{ color: "var(--ink-dim)" }}>{h.date}</span>
            {h.kind === "pago" ? (
              <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(79,157,105,0.15)", color: "var(--green)" }}>
                Pago
              </span>
            ) : (
              <CategoryBadge category={h.category} size="xs" />
            )}
            <span className="truncate" style={{ color: "var(--ink-dim)" }}>{h.description || "—"}</span>
          </div>
          <span className="font-mono-num shrink-0" style={{ color: h.delta > 0 ? "var(--red)" : "var(--green)" }}>
            {h.delta > 0 ? "+" : "−"}{fmt(Math.abs(h.delta))}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Tarjeta de una deuda: saldo, tasa, cupo, acciones, formulario de consumo e historial.
 */
function DebtCard({ debt, transactions, categories, onAddCharge }) {
  const [panel, setPanel] = useState(null); // null | "charge" | "history"
  const metrics = debtMetrics(debt);
  const history = useMemo(() => getDebtHistory(transactions, debt.id), [transactions, debt.id]);
  const isCard = debt.kind === "tarjeta";
  const Icon = isCard ? CreditCard : Landmark;
  const settled = Number(debt.balance) <= 0.01;

  const toggle = (name) => setPanel((p) => (p === name ? null : name));

  return (
    <div className="ledger-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={18} style={{ color: "var(--brass)" }} className="shrink-0" />
          <div className="min-w-0">
            <h4 className="font-display text-base truncate">{debt.name}</h4>
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              {isCard ? "Tarjeta de crédito" : "Préstamo"} · {debt.rate}% anual · mín. {fmt(debt.minPayment)}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Saldo</p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: settled ? "var(--green)" : "var(--red)" }}>
            {fmt(debt.balance)}
          </p>
        </div>
      </div>

      {settled && (
        <p className="text-xs mt-2" style={{ color: "var(--green)" }}>Sin saldo pendiente. La tarjeta sigue activa para nuevos consumos.</p>
      )}

      {metrics.hasLimit ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span style={{ color: STATUS_COLOR[metrics.status] }}>
              {metrics.overLimit && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
              {metrics.utilizationPct.toFixed(1)}% del cupo usado
            </span>
            <span className="font-mono-num" style={{ color: "var(--ink-dim)" }}>
              Disponible {fmt(metrics.available)} de {fmt(metrics.limit)}
            </span>
          </div>
          <UtilizationBar pct={metrics.utilizationPct} status={metrics.status} />
        </div>
      ) : (
        isCard && (
          <p className="text-xs mt-3" style={{ color: "var(--ink-dim)" }}>
            Agrega el cupo de esta tarjeta en Configuración para ver tu cupo disponible y tu porcentaje de endeudamiento.
          </p>
        )
      )}

      <div className="flex flex-wrap gap-3 mt-4">
        <button onClick={() => toggle("charge")} className="btn-brass rounded px-3 py-2 text-sm font-medium flex items-center gap-2">
          <Plus size={15} /> Añadir consumo
        </button>
        <button onClick={() => toggle("history")} className="btn-ghost rounded px-3 py-2 text-sm font-medium flex items-center gap-2">
          <History size={15} /> Historial ({history.length})
          {panel === "history" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {panel === "charge" && (
        <ChargeForm
          debt={debt}
          categories={categories}
          onSubmit={(data) => {
            onAddCharge(debt.id, data);
            setPanel("history");
          }}
          onCancel={() => setPanel(null)}
        />
      )}
      {panel === "history" && <DebtHistory items={history} />}
    </div>
  );
}

/**
 * Módulo de gestión dinámica de deudas (Requerimiento 4).
 *
 * @param {{
 *   debts: import("../lib/debts.js").Debt[],
 *   transactions: import("../lib/debts.js").DebtTx[],
 *   categories: { id: string, label: string }[],  - categorías en las que se puede consumir a crédito
 *   onAddCharge: (debtId: string, data: { amount: number, category: string, date: string, description: string }) => void,
 * }} props
 */
export default function DebtManager({ debts, transactions, categories, onAddCharge }) {
  return (
    <div className="space-y-6">
      <PortfolioSummary debts={debts} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {debts.map((d) => (
          <DebtCard key={d.id} debt={d} transactions={transactions} categories={categories} onAddCharge={onAddCharge} />
        ))}
      </div>
    </div>
  );
}
