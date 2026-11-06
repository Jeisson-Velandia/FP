/**
 * Asesor financiero: revisa los datos de UNA cuenta y devuelve alertas y sugerencias personalizadas
 * con las cifras reales del usuario. Es puro (sin React ni Firestore): lo usan la pestaña "Asesor"
 * de la app, el chat de registro rápido ("cómo voy") y el bot de WhatsApp.
 *
 * Reglas generales (nada está pensado para una sola persona): presupuestos excedidos o inalcanzables,
 * deuda que crece, pagar y volver a cargar, peso de los intereses, razón de endeudamiento, cupo usado,
 * tasas que no cuadran, ingresos que parecen créditos, movimientos duplicados y refuerzos positivos.
 *
 * @typedef {"alta"|"media"|"info"|"bien"} Severity
 * @typedef {{
 *   key: string, id?: string, severity: Severity, title: string, detail: string, tip?: string,
 *   action?: { tab: "config"|"movimientos"|"deudas"|"ahorro", label: string },
 * }} Alert
 * @typedef {{
 *   key: string, label: string, ingresoFijo: number, otherIncome: number, loanIncome: number,
 *   ingresos: number, consumo: number, creditConsumo: number, interest: number, pagos: number,
 *   ahorro: number, debtDelta: number, balance: number, hasData: boolean,
 * }} MonthReview
 */
import { normalize } from "./messageParser.js";
import { txDebtDelta, isCreditCharge, debtMetrics } from "./debts.js";
import { monthlyIncomeTotal, monthBalance } from "./monthly.js";
import { simulatePayoff } from "./debtStrategies.js";
import { fmt } from "./format.js";

const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const LABEL = {
  vivienda: "Vivienda", comida: "Comida", transporte: "Transporte", entretenimiento: "Entretenimiento",
  salud: "Salud", deuda: "Deuda", ahorro: "Ahorro", intereses: "Intereses y comisiones", otros: "Otros",
};
const SEVERITY_RANK = { alta: 0, media: 1, info: 2, bien: 3 };

const INTEREST_RE = /\b(interes|intereses|manejo|seguro|comision|comisiones|mora)\b/;
const LOAN_INCOME_RE = /\b(credito|prestamo|desembolso|avance|lulo)\b/;

const monthOf = (d) => String(d).slice(0, 7);
const amountOf = (t) => Number(t.amount) || 0;
const pct = (x) => `${Math.round(x * 100)}%`;
const monthName = (key) => MONTHS_ES[Number(key.slice(5, 7)) - 1];
const prevKey = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};
const daysInMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Cargo de intereses, cuotas de manejo, seguros o comisiones de una tarjeta/deuda. */
export function isInterestLike(t) {
  if (!isCreditCharge(t)) return false;
  return t.category === "intereses" || INTEREST_RE.test(normalize(t.description));
}

/** Ingreso que por su descripción parece un crédito recibido ("Crédito Lulo", "préstamo"...). */
export function isLoanLikeIncome(t) {
  return t?.type === "ingreso" && LOAN_INCOME_RE.test(normalize(t.description));
}

/**
 * Resumen de un mes: separa ingresos reales de créditos, consumo de intereses y pagos de deuda,
 * y calcula cuánto cambió la deuda (un consumo a tarjeta la sube, un pago la baja).
 * @returns {MonthReview}
 */
export function reviewMonth(data, key) {
  const txs = (data.transactions || []).filter((t) => monthOf(t.date) === key);
  const r = { loanIncome: 0, otherIncome: 0, interest: 0, consumo: 0, creditConsumo: 0, pagos: 0, ahorro: 0, debtDelta: 0 };
  for (const t of txs) {
    const amt = amountOf(t);
    if (t.type === "ingreso") {
      if (isLoanLikeIncome(t)) r.loanIncome += amt;
      else r.otherIncome += amt;
      continue;
    }
    r.debtDelta += txDebtDelta(t);
    if (t.category === "deuda") r.pagos += amt;
    else if (t.category === "ahorro") r.ahorro += amt;
    else if (isInterestLike(t)) r.interest += amt;
    else {
      r.consumo += amt;
      if (isCreditCharge(t)) r.creditConsumo += amt;
    }
  }
  const ingresoFijo = monthlyIncomeTotal(data.incomes);
  return {
    key, label: monthName(key), ingresoFijo, ...r,
    ingresos: ingresoFijo + r.otherIncome + r.loanIncome,
    balance: monthBalance(data, key).balance,
    hasData: txs.length > 0,
  };
}

/**
 * @param {{ incomes?: any[], debts?: any[], budgets?: Record<string, number>, transactions?: any[], savingsGoals?: any, advisorDismissed?: string[] }} data
 * @param {string} today "YYYY-MM-DD"
 * @param {{ includeDismissed?: boolean }} [opts]
 */
export function analyze(data, today, opts = {}) {
  const curKey = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const dim = daysInMonth(curKey);
  const pKey = prevKey(curKey);
  const cur = reviewMonth(data, curKey);
  const prev = reviewMonth(data, pKey);
  const prev2 = reviewMonth(data, prevKey(pKey));
  const income = monthlyIncomeTotal(data.incomes);
  const debts = data.debts || [];
  const active = debts.filter((d) => Number(d.balance) > 0.01);
  const txs = data.transactions || [];
  const budgets = data.budgets || {};

  /** @type {Alert[]} */
  const alerts = [];
  const add = (a) => alerts.push(a);

  if (txs.length === 0 && debts.length === 0) {
    add({ key: "empty", severity: "info", title: "Empieza registrando tus movimientos", detail: "Con unas semanas de datos el asesor te dirá dónde se te va el dinero y cómo salir de deudas.", action: { tab: "movimientos", label: "Registrar" } });
  }

  /* ---- presupuestos del mes ---- */
  const spentBy = {};
  for (const t of txs) if (t.type === "gasto" && monthOf(t.date) === curKey) spentBy[t.category] = (spentBy[t.category] || 0) + amountOf(t);
  const over = [];
  const pace = [];
  const under = [];
  for (const [cat, raw] of Object.entries(budgets)) {
    const limit = Number(raw) || 0;
    if (limit < 1000 || cat === "deuda" || cat === "ahorro") continue;
    const spent = spentBy[cat] || 0;
    if (spent > limit) over.push({ cat, spent, limit });
    else if (day >= 7 && (spent / day) * dim > limit * 1.1) pace.push({ cat, spent, limit, projected: (spent / day) * dim });
    else if (day >= 15 && spent <= limit * 0.6) under.push({ cat, spent, limit });
  }
  over.sort((a, b) => b.spent - b.limit - (a.spent - a.limit));
  if (over.length) {
    const worst = over.some((o) => o.spent > o.limit * 1.25);
    add({
      key: "budget-over", severity: worst ? "alta" : "media",
      title: over.length === 1 ? `Te pasaste del presupuesto de ${LABEL[over[0].cat] || over[0].cat}` : `Te pasaste del presupuesto en ${over.length} categorías`,
      detail: over.slice(0, 3).map((o) => `${LABEL[o.cat] || o.cat}: ${fmt(o.spent)} de ${fmt(o.limit)}`).join(" · "),
      tip: "Pausa esas categorías lo que queda del mes. Si el presupuesto es realista, ese exceso se está pagando con deuda; si no lo es, ajústalo para que refleje tu vida real.",
      action: { tab: "config", label: "Ajustar presupuestos" },
    });
  }
  if (pace.length) {
    add({
      key: "budget-pace", severity: "media",
      title: "A este ritmo te pasarás del presupuesto",
      detail: pace.slice(0, 3).map((p) => `${LABEL[p.cat] || p.cat}: llevas ${fmt(p.spent)} y proyectas ${fmt(p.projected)} (límite ${fmt(p.limit)})`).join(" · "),
      tip: "Aún estás a tiempo: baja el ritmo de gasto en estas categorías esta semana.",
    });
  }

  const budgetTotal = Object.values(budgets).reduce((s, v) => s + (Number(v) >= 1000 ? Number(v) : 0), 0);
  if (income > 0 && budgetTotal > income * 1.02) {
    add({
      key: "budget-total", severity: "media",
      title: "Tus presupuestos suman más que tu ingreso",
      detail: `Suman ${fmt(budgetTotal)} y tu ingreso mensual es ${fmt(income)}: nacen con un déficit de ${fmt(budgetTotal - income)}.`,
      tip: "Un presupuesto que no cabe en el ingreso se cubre con crédito. Recorta primero las categorías flexibles (entretenimiento, otros, comida fuera de casa).",
      action: { tab: "config", label: "Ajustar presupuestos" },
    });
  }
  const typos = Object.entries(budgets).filter(([, v]) => Number(v) > 0 && Number(v) < 1000);
  if (typos.length) {
    add({
      key: "budget-typo", severity: "info",
      title: "Revisa un presupuesto con un valor muy bajo",
      detail: typos.map(([c, v]) => `${LABEL[c] || c}: ${fmt(Number(v))}`).join(" · ") + ". ¿Faltan ceros?",
      action: { tab: "config", label: "Corregir" },
    });
  }
  if (under.length) {
    add({
      key: "budget-under", severity: "bien",
      title: "Vas bien en " + under.slice(0, 3).map((u) => LABEL[u.cat] || u.cat).join(", "),
      detail: under.slice(0, 3).map((u) => `${LABEL[u.cat] || u.cat}: ${fmt(u.spent)} de ${fmt(u.limit)}`).join(" · "),
    });
  }

  /* ---- deuda: crece, baja, pagar y volver a cargar ---- */
  const biggestCharge = (key) =>
    txs.filter((t) => monthOf(t.date) === key && isCreditCharge(t) && !isInterestLike(t)).sort((a, b) => amountOf(b) - amountOf(a))[0];
  const growthFor = (m, isCurrent) => {
    if (!m.hasData) return false;
    if (m.debtDelta > 0 && (!isCurrent || day >= 10)) {
      const big = biggestCharge(m.key);
      const charged = m.creditConsumo + m.interest;
      add({
        key: `debt-growth:${m.key}`, severity: isCurrent ? "media" : "alta",
        title: `Tu deuda creció ${fmt(m.debtDelta)} ${isCurrent ? "este mes" : "en " + m.label}`,
        detail: `Pagaste ${fmt(m.pagos)} pero cargaste ${fmt(charged)} a tarjetas o deudas${big ? `. El mayor consumo: "${(big.description || LABEL[big.category] || "").trim()}" (${fmt(amountOf(big))})` : ""}.`,
        tip: "Para que la deuda baje, lo que pagas tiene que ser mayor que lo que cargas. Congela los consumos a crédito unos meses y deja el crédito para emergencias.",
        action: { tab: "deudas", label: "Ver deudas" },
      });
      return true;
    }
    if (m.debtDelta < -1000 && !isCurrent) {
      add({ key: `debt-down:${m.key}`, severity: "bien", title: `Tu deuda bajó ${fmt(-m.debtDelta)} en ${m.label}`, detail: "Así se sale de deudas: pagando más de lo que se vuelve a cargar. Sigue igual." });
    }
    return false;
  };
  const grewPrev = growthFor(prev, false);
  growthFor(cur, true);
  if (!grewPrev && prev.pagos > 0 && prev.creditConsumo > prev.pagos * 0.4) {
    add({
      key: `pay-and-charge:${prev.key}`, severity: "media",
      title: "Pagas deuda con una mano y la vuelves a cargar con la otra",
      detail: `En ${prev.label} pagaste ${fmt(prev.pagos)} y cargaste ${fmt(prev.creditConsumo)} en consumos a crédito: por cada $100 que pagas, cargas $${Math.round((prev.creditConsumo / prev.pagos) * 100)}.`,
      tip: "Por eso la deuda no baja aunque pagues mucho. Mientras tengas deuda cara, intenta pagar los gastos del día a día con efectivo o débito.",
    });
  }

  /* ---- intereses y cuotas ---- */
  const interestMonth = Math.max(prev.interest, cur.interest);
  if (interestMonth > 0 && income > 0) {
    const share = interestMonth / income;
    add({
      key: "interest-burden", severity: share >= 0.05 ? "media" : "info",
      title: `Pagas ~${fmt(interestMonth)} al mes en intereses y cuotas`,
      detail: `Es el ${pct(share)} de tu ingreso mensual y no baja tu deuda.`,
      tip: "Cada peso extra que abones al capital de la deuda más cara reduce estos cobros el mes siguiente.",
    });
  }
  const misfiled = txs.filter((t) => isInterestLike(t) && t.category !== "intereses" && daysBetween(t.date, today) <= 62 && daysBetween(t.date, today) >= 0);
  if (misfiled.length) {
    const cats = [...new Set(misfiled.map((t) => LABEL[t.category] || t.category))];
    add({
      key: "interest-misfiled", severity: "info",
      title: `${misfiled.length} cargo${misfiled.length > 1 ? "s" : ""} de intereses o cuotas en otras categorías`,
      detail: `Suman ${fmt(misfiled.reduce((s, t) => s + amountOf(t), 0))} y están en ${cats.join(", ")}: inflan esos presupuestos.`,
      tip: 'Edítalos (lápiz en Movimientos) y cámbialos a la categoría "Intereses y comisiones". Mantén "Cargar a tarjeta" para que el saldo siga igual.',
      action: { tab: "movimientos", label: "Ir a Movimientos" },
    });
  }

  /* ---- ingresos que parecen créditos ---- */
  for (const t of txs.filter((x) => isLoanLikeIncome(x) && daysBetween(x.date, today) <= 90 && daysBetween(x.date, today) >= 0)) {
    const m = reviewMonth(data, monthOf(t.date));
    add({
      key: `loan:${t.id}`, severity: "media",
      title: `¿"${(t.description || "").trim()}" fue un crédito?`,
      detail: `Registraste ${fmt(amountOf(t))} como ingreso el ${t.date}. Un crédito entra a tu cuenta, pero hay que devolverlo con intereses.`,
      tip: `Si lo fue, regístralo como deuda en Configuración (saldo ${fmt(amountOf(t))}) para que cuente en tu deuda total y en las estrategias. Tu ingreso real ese mes fue ${fmt(m.ingresoFijo + m.otherIncome)}. Usar un crédito para cubrir el mínimo de una tarjeta es una salida válida de un mes difícil, pero mueve la deuda de lugar y suma intereses: planea desde ya cómo pagarlo.`,
      action: { tab: "config", label: "Registrar deuda" },
    });
  }

  /* ---- carga de deuda frente al ingreso ---- */
  const sumMin = active.reduce((s, d) => s + (Number(d.minPayment) || 0), 0);
  if (income > 0 && sumMin > 0) {
    const ratio = sumMin / income;
    if (ratio >= 0.3) {
      add({
        key: "service-ratio", severity: ratio >= 0.4 ? "alta" : "media",
        title: `Tus pagos mínimos son el ${pct(ratio)} de tu ingreso`,
        detail: `Pagas ${fmt(sumMin)} al mes solo en mínimos de ${fmt(income)} de ingreso.`,
        tip: "Por encima del 30–35% queda poco margen: un imprevisto te empuja a más crédito. Evita nuevos cargos a crédito hasta bajar ese porcentaje.",
        action: { tab: "deudas", label: "Ver estrategias" },
      });
    }
  }
  const noMin = active.filter((d) => !(Number(d.minPayment) > 0));
  if (noMin.length) {
    add({
      key: "no-min", severity: "info",
      title: `Falta el pago mínimo de ${noMin.map((d) => d.name).join(" y ")}`,
      detail: "Sin ese dato las simulaciones de pago no son realistas. Puedes poner lo que pagas normalmente al mes.",
      action: { tab: "config", label: "Editar deuda" },
    });
  }
  for (const d of active) {
    const m = debtMetrics(d);
    if (m.hasLimit && m.status !== "verde") {
      add({
        key: `util:${d.id}`, severity: m.status === "rojo" ? "media" : "info",
        title: `${d.name} usa el ${Math.round(m.utilizationPct)}% de su cupo`,
        detail: `Te quedan ${fmt(m.available)} de ${fmt(m.limit)}.${m.overLimit ? " Superaste el cupo." : ""}`,
        tip: "Mantener el uso del cupo bajo el 30% cuida tu historial crediticio y te deja margen para emergencias.",
      });
    }
  }
  // Tasa real cobrada vs. tasa registrada
  for (const d of active) {
    const interest = txs
      .filter((t) => isCreditCharge(t) && t.chargeDebtId === d.id && /\binteres/.test(normalize(t.description)) && daysBetween(t.date, today) <= 35 && daysBetween(t.date, today) >= 0)
      .reduce((s, t) => s + amountOf(t), 0);
    if (interest > 0 && Number(d.balance) > 0) {
      const monthly = interest / Number(d.balance);
      const ea = Math.pow(1 + monthly, 12) - 1;
      if (ea > ((Number(d.rate) || 0) / 100) * 1.3 + 0.02) {
        add({
          key: `rate:${d.id}`, severity: "media",
          title: `${d.name} te cobra más de lo que registraste`,
          detail: `Intereses de ${fmt(interest)} sobre un saldo de ${fmt(d.balance)} son ~${(monthly * 100).toFixed(1)}% mensual (≈${Math.round(ea * 100)}% E.A.), y tienes anotado ${d.rate}% E.A.`,
          tip: "Verifícalo en la app del banco: si es correcto, corrige la tasa de la deuda y prioriza pagar esta primero; es la que más te cuesta.",
          action: { tab: "config", label: "Editar deuda" },
        });
      }
    }
  }

  /* ---- plan para salir de deudas ---- */
  if (active.length && noMin.length === 0) {
    const base = simulatePayoff(active, 0, "avalanche");
    if (!base.feasible) {
      add({
        key: "plan-infeasible", severity: "alta",
        title: "Con tus pagos actuales la deuda no se termina",
        detail: `Solo los intereses son ~${fmt(base.firstMonthInterest)} al mes y tus mínimos suman ${fmt(base.budget)}.`,
        tip: "Sube el pago mensual por encima de los intereses para que el saldo empiece a bajar.",
        action: { tab: "deudas", label: "Ver plan" },
      });
    } else {
      const plus = simulatePayoff(active, 100000, "avalanche");
      add({
        key: "plan", severity: "info",
        title: `Sin nuevos cargos, terminas de pagar en ${base.months} ${base.months === 1 ? "mes" : "meses"}`,
        detail: `Pagando solo tus mínimos (${fmt(base.budget)}/mes) y con ~${fmt(base.totalInterest)} de intereses. Con $100.000 extra al mes terminarías en ${plus.months} y ahorrarías ${fmt(base.totalInterest - plus.totalInterest)}.`,
        action: { tab: "deudas", label: "Ver estrategias" },
      });
    }
  }

  /* ---- ahorro y tendencia ---- */
  const goals = data.savingsGoals || {};
  if (active.length && income > 0 && cur.ahorro + prev.ahorro === 0 && !(Number(goals.monthly) > 0)) {
    add({
      key: "no-savings", severity: "info",
      title: "Aún no apartas para emergencias",
      detail: `Mientras pagas deudas caras, separa aunque sea el 3% de tu ingreso (${fmt(Math.round((income * 0.03) / 1000) * 1000)} al mes) como colchón.`,
      tip: "Así un imprevisto no termina otra vez en la tarjeta.",
      action: { tab: "ahorro", label: "Definir meta" },
    });
  }
  if (prev2.hasData && prev.hasData && prev2.consumo > 0 && prev.consumo > prev2.consumo * 1.2 && prev.consumo - prev2.consumo > 100000) {
    add({
      key: "spend-trend", severity: "info",
      title: `Tu consumo subió ${pct(prev.consumo / prev2.consumo - 1)} en ${prev.label}`,
      detail: `${fmt(prev.consumo)} frente a ${fmt(prev2.consumo)} en ${prev2.label}.`,
    });
  }

  // Descartar una alerta con mes en su clave ("debt-growth:2026-10") es permanente; las demás
  // se descartan solo por el mes en curso, para que vuelvan a avisar si el problema reaparece.
  const dismissed = new Set(data.advisorDismissed || []);
  for (const a of alerts) a.id = a.key.includes(":") ? a.key : `${a.key}@${curKey}`;
  const shown = alerts
    .filter((a) => opts.includeDismissed || !dismissed.has(a.id))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => SEVERITY_RANK[x.a.severity] - SEVERITY_RANK[y.a.severity] || x.i - y.i)
    .map((x) => x.a);

  const count = (s) => shown.filter((a) => a.severity === s).length;
  const level = count("alta") ? "atencion" : count("media") ? "cuidado" : "bien";
  const headline =
    level === "atencion"
      ? `${count("alta")} ${count("alta") === 1 ? "alerta importante" : "alertas importantes"}`
      : level === "cuidado"
        ? `${count("media")} ${count("media") === 1 ? "punto" : "puntos"} de cuidado`
        : "Vas por buen camino";

  return { level, headline, alerts: shown, months: [cur, prev, prev2], dismissedCount: alerts.length - shown.length };
}

const ICON = { alta: "🔴", media: "🟡", info: "🔵", bien: "🟢" };

/** Respuesta corta del asesor para el chat y WhatsApp ("cómo voy"). */
export function adviceReply(data, today) {
  const res = analyze(data, today);
  const main = res.alerts.filter((a) => a.severity !== "bien").slice(0, 4);
  const good = res.alerts.find((a) => a.severity === "bien");
  const lines = [`🧭 *Asesor* · ${res.headline}`];
  for (const a of main) lines.push(`${ICON[a.severity]} *${a.title}*\n${a.detail}`);
  if (main[0]?.tip) lines.push(`💡 ${main[0].tip}`);
  if (good) lines.push(`${ICON.bien} ${good.title}`);
  if (!main.length && !good) lines.push("No tengo alertas por ahora. Sigue registrando tus movimientos.");
  lines.push("Abre la pestaña *Asesor* en la app para ver el detalle.");
  return lines.join("\n");
}
