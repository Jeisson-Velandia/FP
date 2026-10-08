/**
 * Registro rápido por texto: convierte un comando ya interpretado (messageParser) en cambios sobre
 * los datos de la cuenta y en una respuesta para el usuario.
 *
 * Es PURO (no toca Firestore ni React): lo usan el cuadro de chat de la app y el bot de WhatsApp,
 * así los dos registran y responden exactamente igual.
 *
 * @typedef {{ incomes?: any[], debts?: any[], budgets?: Record<string, number>, transactions?: any[] }} AccountData
 */
import { matchDebt } from "./messageParser.js";
import { applyTxToDebts, reverseTxOnDebts, debtMetrics } from "./debts.js";
import { monthBalance } from "./monthly.js";
import { fmt } from "./format.js";

export const CATEGORY_LABEL = {
  vivienda: "Vivienda", comida: "Comida", transporte: "Transporte", entretenimiento: "Entretenimiento",
  salud: "Salud", deuda: "Deuda", ahorro: "Ahorro", otros: "Otros", ingreso: "Ingreso",
};

/** Fuentes que cuentan como "registrado por texto" y se pueden deshacer. */
export const QUICK_SOURCES = ["chat", "whatsapp"];

/**
 * @param {AccountData} data
 * @param {import("./messageParser.js").Command} cmd  register | balance | undo
 * @param {{ today: string, newId: () => string, source: "chat"|"whatsapp" }} ctx
 * @returns {{ reply: string, data: AccountData|null }}  data = null cuando no hay nada que guardar
 */
export function applyCommand(data, cmd, { today, newId, source }) {
  const debts = data.debts || [];
  const transactions = data.transactions || [];

  if (cmd.kind === "balance") return { reply: balanceReply(data, today), data: null };

  if (cmd.kind === "undo") {
    const last = transactions.find((t) => QUICK_SOURCES.includes(t.source));
    if (!last) return { reply: "No tengo movimientos registrados por texto para deshacer.", data: null };
    const next = { ...data, debts: reverseTxOnDebts(debts, last), transactions: transactions.filter((t) => t.id !== last.id) };
    const b = monthBalance(next, today.slice(0, 7));
    return {
      reply: `↩️ Deshice #${last.id} (${fmt(last.amount)} · ${CATEGORY_LABEL[last.category] || last.category}).\n📊 Balance del mes: ${fmt(b.balance)}`,
      data: next,
    };
  }

  if (cmd.kind !== "register") return { reply: "No entendí ese mensaje.", data: null };

  let debtId = null;
  let chargeDebtId = null;
  let linked = null;
  if (cmd.type === "gasto" && cmd.category === "deuda" && debts.length) {
    linked = matchDebt(cmd.description, debts);
    if (!linked && debts.length === 1) linked = debts[0];
    if (!linked) {
      return {
        reply: `¿A cuál deuda va el pago? Incluye su nombre, por ejemplo: \`${cmd.amount} deuda pago ${debts[0].name.toLowerCase()}\`.\nTus deudas: ${debts.map((d) => d.name).join(", ")}.`,
        data: null,
      };
    }
    debtId = linked.id;
  } else if (cmd.type === "gasto" && cmd.category !== "deuda" && cmd.category !== "ahorro") {
    // Solo tarjetas admiten "consumo a crédito" por texto (evita cargar "gasolina moto" a un préstamo).
    linked = matchDebt(cmd.description, debts.filter((d) => d.kind === "tarjeta"));
    if (linked) chargeDebtId = linked.id;
  }

  const record = {
    id: newId(),
    type: cmd.type,
    amount: cmd.amount,
    category: cmd.category,
    date: today,
    description: cmd.description || (debtId ? `Abono a ${linked.name}` : chargeDebtId ? `Consumo con ${linked.name}` : ""),
    debtId,
    chargeDebtId,
    source,
  };
  const applied = applyTxToDebts(debts, record);
  record.debtDelta = applied.delta;

  const next = { ...data, debts: applied.debts, transactions: [record, ...transactions] };
  return { reply: registerReply({ record, linked, applied, data: next, today }), data: next };
}

function registerReply({ record, linked, applied, data, today }) {
  const b = monthBalance(data, today.slice(0, 7));
  const label = CATEGORY_LABEL[record.category] || record.category;
  const lines = [`✅ Registrado *#${record.id}*`];
  lines.push(`${record.type === "ingreso" ? "💰" : "💸"} ${fmt(record.amount)} · ${label}${record.description ? ` (${record.description})` : ""}`);

  if (applied.settledDebt) {
    lines.push(`🎉 ¡"${applied.settledDebt.name}" quedó saldada y se eliminó de tus deudas!`);
  } else if (record.debtId && linked) {
    const d = applied.debts.find((x) => x.id === record.debtId);
    lines.push(`📉 Saldo de ${linked.name}: ${fmt(d?.balance ?? 0)}`);
  } else if (record.chargeDebtId && linked) {
    const d = applied.debts.find((x) => x.id === record.chargeDebtId);
    const m = d ? debtMetrics(d) : null;
    lines.push(`💳 Cargado a ${linked.name} · saldo ${fmt(d?.balance ?? 0)}`);
    if (m?.hasLimit) lines.push(`   Cupo disponible: ${fmt(m.available)} (${Math.round(m.utilizationPct)}% usado)${m.overLimit ? " ⚠️ supera el cupo" : ""}`);
  }

  if (record.type === "gasto" && record.category !== "ahorro" && record.category !== "deuda") {
    const budget = Number(data.budgets?.[record.category]) || 0;
    if (budget > 0) {
      const spent = data.transactions
        .filter((t) => t.type === "gasto" && t.category === record.category && String(t.date).slice(0, 7) === today.slice(0, 7))
        .reduce((s, t) => s + Number(t.amount), 0);
      lines.push(`🎯 Presupuesto ${label}: ${spent > budget ? "te pasaste por " + fmt(spent - budget) : "te quedan " + fmt(budget - spent)}`);
    }
  }
  lines.push(`📊 Te quedan *${fmt(b.balance)}* este mes${b.balance < 0 ? " ⚠️" : ""}`);
  return lines.join("\n");
}

export function balanceReply(data, today) {
  const b = monthBalance(data, today.slice(0, 7));
  const lines = [
    "📊 *Resumen del mes*",
    `Ingresos: ${fmt(b.ingresos)}`,
    `Gastos (efectivo): ${fmt(b.gastos)}`,
    `Balance: *${fmt(b.balance)}*${b.balance < 0 ? " ⚠️" : ""}`,
  ];
  if (b.consumosCredito > 0) lines.push(`💳 Consumos a crédito del mes: ${fmt(b.consumosCredito)} (se descuentan al pagar la tarjeta)`);
  const total = (data.debts || []).reduce((s, d) => s + Number(d.balance), 0);
  if (total > 0) lines.push(`Deuda total: ${fmt(total)}`);
  return lines.join("\n");
}
