import React, { useMemo, useState } from "react";
import { Compass, AlertOctagon, AlertTriangle, Info, CheckCircle2, X, ArrowRight, Lightbulb } from "lucide-react";
import { analyze } from "../lib/advisor.js";
import { fmt, todayStr } from "../lib/format.js";

const STYLE = {
  alta: { icon: AlertOctagon, color: "var(--red)", label: "Importante" },
  media: { icon: AlertTriangle, color: "var(--amber, #FBBF24)", label: "Cuidado" },
  info: { icon: Info, color: "var(--ink-dim)", label: "Para tener en cuenta" },
  bien: { icon: CheckCircle2, color: "var(--green, #34D399)", label: "Vas bien" },
};

function AlertCard({ alert, onDismiss, onGo }) {
  const st = STYLE[alert.severity];
  const Icon = st.icon;
  return (
    <div className="ledger-card p-4" style={{ borderLeft: `3px solid ${st.color}` }}>
      <div className="flex items-start gap-3">
        <Icon size={18} style={{ color: st.color, flexShrink: 0, marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide" style={{ color: st.color }}>{st.label}</p>
          <h4 className="font-display text-base leading-snug">{alert.title}</h4>
          <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>{alert.detail}</p>
          {alert.tip && (
            <p className="text-sm mt-2 flex gap-2">
              <Lightbulb size={15} style={{ color: "var(--brass)", flexShrink: 0, marginTop: 3 }} />
              <span>{alert.tip}</span>
            </p>
          )}
          {alert.action && onGo && (
            <button className="text-sm mt-3 inline-flex items-center gap-1" style={{ color: "var(--brass)" }} onClick={() => onGo(alert.action.tab)}>
              {alert.action.label} <ArrowRight size={14} />
            </button>
          )}
        </div>
        {onDismiss && (
          <button aria-label="Descartar" title="Descartar" onClick={() => onDismiss(alert.id)} style={{ color: "var(--ink-dim)" }}>
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Resumen corto para el tablero: titular + las 2 alertas principales. */
export function AdvisorPreview({ data, onOpen }) {
  const res = useMemo(() => analyze(data, todayStr()), [data]);
  const top = res.alerts.filter((a) => a.severity !== "bien").slice(0, 2);
  const color = res.level === "atencion" ? "var(--red)" : res.level === "cuidado" ? "var(--amber, #FBBF24)" : "var(--green, #34D399)";
  return (
    <div className="ledger-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Compass size={17} style={{ color }} />
        <h3 className="font-display text-base">Asesor · {res.headline}</h3>
        <button className="ml-auto text-sm inline-flex items-center gap-1" style={{ color: "var(--brass)" }} onClick={onOpen}>
          Ver todo <ArrowRight size={14} />
        </button>
      </div>
      {top.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>Sin alertas por ahora. Sigue registrando tus movimientos.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((a) => (
            <li key={a.id} className="text-sm">
              <span style={{ color: STYLE[a.severity].color }}>●</span> {a.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Advisor({ data, onDismiss, onRestore, onGo }) {
  const [showDone, setShowDone] = useState(false);
  const res = useMemo(() => analyze(data, todayStr()), [data]);
  const problems = res.alerts.filter((a) => a.severity !== "bien");
  const good = res.alerts.filter((a) => a.severity === "bien");
  const [cur, prev] = res.months;
  const levelColor = res.level === "atencion" ? "var(--red)" : res.level === "cuidado" ? "var(--amber, #FBBF24)" : "var(--green, #34D399)";

  return (
    <div className="space-y-5">
      <div className="ledger-card p-5">
        <div className="flex items-center gap-2">
          <Compass size={20} style={{ color: levelColor }} />
          <h2 className="font-display text-xl">Asesor</h2>
        </div>
        <p className="text-lg mt-1" style={{ color: levelColor }}>{res.headline}</p>
        <p className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
          Revisa tus propios datos y te avisa a tiempo. También puedes escribir <b>cómo voy</b> en el chat.
        </p>
        {prev.hasData && (
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div><p className="text-xs" style={{ color: "var(--ink-dim)" }}>Consumo {prev.label}</p><p className="font-mono-num font-semibold">{fmt(prev.consumo + prev.interest)}</p></div>
            <div><p className="text-xs" style={{ color: "var(--ink-dim)" }}>Pagos a deuda</p><p className="font-mono-num font-semibold">{fmt(prev.pagos)}</p></div>
            <div><p className="text-xs" style={{ color: "var(--ink-dim)" }}>Deuda {prev.debtDelta > 0 ? "subió" : "bajó"}</p><p className="font-mono-num font-semibold" style={{ color: prev.debtDelta > 0 ? "var(--red)" : "var(--green, #34D399)" }}>{fmt(Math.abs(prev.debtDelta))}</p></div>
          </div>
        )}
      </div>

      {problems.map((a) => <AlertCard key={a.id} alert={a} onDismiss={onDismiss} onGo={onGo} />)}
      {problems.length === 0 && <p className="text-sm" style={{ color: "var(--ink-dim)" }}>No hay alertas pendientes. 🎉</p>}
      {good.map((a) => <AlertCard key={a.id} alert={a} onDismiss={onDismiss} onGo={onGo} />)}

      {res.dismissedCount > 0 && (
        <div className="text-center">
          <button className="text-sm" style={{ color: "var(--ink-dim)" }} onClick={() => { onRestore(); setShowDone((v) => !v); }}>
            Mostrar {res.dismissedCount} descartada{res.dismissedCount > 1 ? "s" : ""}
          </button>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
        Son sugerencias generales basadas en lo que registraste, no asesoría financiera profesional.
      </p>
    </div>
  );
}
