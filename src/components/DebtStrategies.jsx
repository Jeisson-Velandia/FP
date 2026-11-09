import React, { useMemo } from "react";
import { Snowflake, Mountain, AlertTriangle, CalendarClock } from "lucide-react";
import { fmt } from "../lib/format.js";
import { simulatePayoff, requiredMonthlyBudget } from "../lib/debtStrategies.js";

const TARGET_OPTIONS = [2, 3, 4, 6, 9, 12, 18, 24, 36];
const roundTo = (n, step) => Math.max(step, Math.round(n / step) * step);

function duration(months) {
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${months} meses (${y} ${y === 1 ? "año" : "años"}${m ? ` y ${m} ${m === 1 ? "mes" : "meses"}` : ""})`;
}

function StrategyCard({ icon: Icon, title, subtitle, result }) {
  return (
    <div className="ledger-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={17} style={{ color: "var(--brass)" }} />
        <h4 className="font-display text-base">{title}</h4>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ink-dim)" }}>{subtitle}</p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Tiempo estimado</p>
          <p className="font-mono-num text-lg font-semibold">{duration(result.months)}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Interés total pagado</p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: "var(--red)" }}>{fmt(result.totalInterest)}</p>
        </div>
      </div>
      <p className="text-xs mb-2" style={{ color: "var(--ink-dim)" }}>Orden en que se saldan</p>
      <ol className="text-sm space-y-1 list-decimal list-inside">
        {result.payoff.map((p) => (
          <li key={p.id}>
            {p.name} <span style={{ color: "var(--ink-dim)" }}>· queda saldada en el mes {p.month}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Comparación de estrategias de pago (bola de nieve vs avalancha) y plan sugerido.
 * @param {{ activeDebts: import("../lib/debtStrategies.js").SimDebt[], extraPayment: number }} props
 */
export default function DebtStrategies({ activeDebts, extraPayment }) {
  const extra = Number(extraPayment) || 0;
  const sumMin = activeDebts.reduce((s, d) => s + (Number(d.minPayment) || 0), 0);
  // Los métodos solo se diferencian en a qué deuda va el dinero SOBRE los mínimos. Sin pago extra
  // serían idénticos, así que se compara con un ejemplo (~15% de los mínimos) y se avisa.
  const illustrative = extra === 0;
  const simExtra = illustrative ? roundTo(sumMin * 0.15, 50000) : extra;
  const snowball = useMemo(() => simulatePayoff(activeDebts, simExtra, "snowball"), [activeDebts, simExtra]);
  const avalanche = useMemo(() => simulatePayoff(activeDebts, simExtra, "avalanche"), [activeDebts, simExtra]);
  const minsOnly = useMemo(() => simulatePayoff(activeDebts, 0, "avalanche"), [activeDebts]);
  // Metas de plazo que tengan sentido: más cortas que lo que ya logras solo con los mínimos.
  const targets = useMemo(() => {
    if (!minsOnly.feasible) return [12, 24, 36];
    const shorter = TARGET_OPTIONS.filter((t) => t < minsOnly.months);
    return shorter.slice(-3);
  }, [minsOnly]);
  const plan = useMemo(() => targets.map((t) => ({ months: t, budget: requiredMonthlyBudget(activeDebts, t) })), [activeDebts, targets]);
  const withoutMin = activeDebts.filter((d) => !(Number(d.minPayment) > 0));

  const feasible = snowball.feasible && avalanche.feasible;
  const diff = snowball.totalInterest - avalanche.totalInterest;
  const sameOrder = snowball.payoff.map((p) => p.id).join() === avalanche.payoff.map((p) => p.id).join();
  const identical = sameOrder && Math.abs(diff) < 1 && snowball.months === avalanche.months;
  const recommendation =
    diff > Math.max(1000, avalanche.totalInterest * 0.05)
      ? { key: "avalancha", reason: `Ahorras aprox. ${fmt(diff)} en intereses frente a la bola de nieve.` }
      : { key: "bola de nieve", reason: "La diferencia de intereses entre métodos es pequeña; la bola de nieve te da victorias rápidas que ayudan a mantener el hábito." };

  return (
    <>
      {withoutMin.length > 0 && (
        <p className="text-xs flex items-start gap-2" style={{ color: "var(--amber)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            {withoutMin.map((d) => d.name).join(", ")} no tiene{withoutMin.length > 1 ? "n" : ""} pago mínimo registrado. Edita la deuda en Configuración (lápiz) para que la simulación sea realista.
          </span>
        </p>
      )}

      {!feasible ? (
        <div className="ledger-card p-5" style={{ borderColor: "var(--red)" }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} style={{ color: "var(--red)" }} />
            <h3 className="font-display text-base">Con este pago las deudas no se terminan</h3>
          </div>
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            {snowball.budget <= 0
              ? "Todavía no hay pagos definidos: ni pagos mínimos ni pago extra."
              : `Estás pagando ${fmt(snowball.budget)} al mes, pero solo los intereses de tus deudas son ~${fmt(snowball.firstMonthInterest)} al mes, así que el saldo no baja.`}{" "}
            Necesitas pagar <strong style={{ color: "var(--ink)" }}>más de {fmt(Math.ceil(snowball.firstMonthInterest / 1000) * 1000)}</strong> al mes para empezar a reducirlas. Escribe un pago extra arriba para ver la simulación.
          </p>
        </div>
      ) : (
        <>
          <div className="ledger-card p-5" style={{ borderColor: "var(--brass)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Mountain size={18} style={{ color: "var(--brass)" }} />
              <h3 className="font-display text-base">
                Recomendación: método <span style={{ color: "var(--brass)" }}>{recommendation.key}</span>
              </h3>
            </div>
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>{recommendation.reason}</p>
            <p className="text-xs mt-2" style={{ color: "var(--ink-dim)" }}>
              Simulación con {fmt(snowball.budget)} al mes ({fmt(sumMin)} en mínimos{simExtra > 0 ? ` + ${fmt(simExtra)} extra` : ""}). Cuando una deuda se salda, su pago pasa a la siguiente.
            </p>
            {illustrative && (
              <p className="text-xs mt-2" style={{ color: "var(--amber)" }}>
                Ejemplo con {fmt(simExtra)} extra al mes: sin dinero por encima de los mínimos ambos métodos darían el mismo resultado. Escribe tu pago extra arriba para verlo con tu número.
              </p>
            )}
            {identical && !illustrative && (
              <p className="text-xs mt-2" style={{ color: "var(--ink-dim)" }}>
                Coinciden porque la deuda de menor saldo también es la de mayor tasa: ambos métodos pagan en el mismo orden.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StrategyCard icon={Snowflake} title="Bola de nieve" subtitle="Paga primero el saldo más pequeño" result={snowball} />
            <StrategyCard icon={Mountain} title="Avalancha" subtitle="Paga primero la tasa más alta" result={avalanche} />
          </div>
        </>
      )}

      <div className="ledger-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock size={17} style={{ color: "var(--brass)" }} />
          <h4 className="font-display text-base">¿Cuánto pagar para salir de deudas?</h4>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--ink-dim)" }}>
          Pago total mensual necesario (método avalancha, el más barato).
          {minsOnly.feasible && ` Solo con tus mínimos (${fmt(sumMin)}) terminas en ${minsOnly.months} ${minsOnly.months === 1 ? "mes" : "meses"}.`}
        </p>
        {plan.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Con tus mínimos ya terminas en {minsOnly.months} {minsOnly.months === 1 ? "mes" : "meses"}; no hay un plazo más corto que calcular.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plan.map((p) => (
            <div key={p.months} className="rounded-lg p-3" style={{ background: "var(--surface2)" }}>
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>En {p.months} meses</p>
              <p className="font-mono-num text-lg font-semibold">{fmt(p.budget)}<span className="text-xs font-normal" style={{ color: "var(--ink-dim)" }}> /mes</span></p>
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                {p.budget > sumMin
                  ? `${fmt(p.budget - sumMin)} sobre tus mínimos`
                  : minsOnly.feasible
                    ? `con tus mínimos ya terminas en ${minsOnly.months} meses`
                    : "con tus mínimos no alcanza"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
