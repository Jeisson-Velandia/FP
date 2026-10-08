/**
 * Lógica del bot de WhatsApp, independiente de Express/HTTP y de la API de Meta:
 *   processIncoming(db, { from, text, wamid, now }) → texto de respuesta (o null si es un duplicado).
 *
 * `db` es un Firestore de firebase-admin (o un doble en memoria en los tests). Solo se usan
 * db.doc(), db.runTransaction() y tx.get/set/delete, para que sea fácil de simular.
 *
 * Modelo de datos (Firestore):
 *   profiles/{uid}        → datos de la app { incomes, debts, budgets, transactions, savingsGoals }
 *   linkCodes/{code}      → { uid, expiresAt }       creado por la app (usuario autenticado)
 *   phoneLinks/{phone}    → { uid, linkedAt }        creado SOLO por esta función (Admin SDK)
 *   waMessages/{wamid}    → { at }                   idempotencia: Meta reintenta entregas
 *   waThrottle/{phone}    → { fails, windowStart }   freno a intentos de adivinar códigos
 */
import { parseMessage, matchDebt } from "./lib/messageParser.js";
import { applyTxToDebts, reverseTxOnDebts, debtMetrics } from "./lib/debts.js";
import { monthBalance } from "./lib/monthly.js";
import { fmt } from "./lib/format.js";

const MAX_LINK_FAILS = 5;
const LINK_WINDOW_MS = 15 * 60 * 1000;
const CATEGORY_LABEL = {
  vivienda: "Vivienda", comida: "Comida", transporte: "Transporte", entretenimiento: "Entretenimiento",
  salud: "Salud", deuda: "Deuda", ahorro: "Ahorro", otros: "Otros", ingreso: "Ingreso",
};

export const HELP_TEXT = [
  "👋 *Finanzas Personales*",
  "Escríbeme tus movimientos así:",
  "• `50000 comida almuerzo`",
  "• `120000 transporte gasolina`",
  "• `200000 deuda pago tarjeta`",
  "• `35000 comida cena con davivienda` (consumo a crédito)",
  "• `ingreso 1500000 freelance`",
  "",
  "Otros comandos: `saldo`, `deshacer`, `ayuda`.",
  "Para conectar tu cuenta: en la app, pestaña *Datos* → WhatsApp, y envía `vincular 123456` con tu código.",
].join("\n");

const NOT_LINKED_TEXT =
  "🔒 Este número aún no está vinculado a una cuenta.\nEn la app abre *Datos → WhatsApp*, genera tu código y envíame: `vincular 123456`";

/** "YYYY-MM-DD" de `now` en la zona horaria dada (la app usa la hora local del usuario). */
export function dateInTz(now, tz = "America/Bogota") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const newId = () => Math.random().toString(36).slice(2, 8);

/**
 * @param {any} db
 * @param {{ from: string, text: string, wamid: string, now?: Date, tz?: string }} msg
 * @returns {Promise<string|null>} respuesta para el usuario; null = mensaje duplicado, no responder.
 */
export async function processIncoming(db, { from, text, wamid, now = new Date(), tz = "America/Bogota" }) {
  const cmd = parseMessage(text);

  if (cmd.kind === "help") return HELP_TEXT;
  if (cmd.kind === "unknown") return `🤔 ${cmd.reason}\n\nEscribe *ayuda* para ver los formatos.`;
  if (cmd.kind === "link") return linkPhone(db, from, cmd.code, now);

  // Desde aquí hace falta una cuenta vinculada: el número (verificado por WhatsApp) identifica al usuario.
  const linkSnap = await db.doc(`phoneLinks/${from}`).get();
  if (!linkSnap.exists) return NOT_LINKED_TEXT;
  const uid = linkSnap.data().uid;
  const profileRef = db.doc(`profiles/${uid}`);
  const dedupeRef = db.doc(`waMessages/${wamid}`);
  const today = dateInTz(now, tz);

  return db.runTransaction(async (tx) => {
    const [dedupe, profileSnap] = await Promise.all([tx.get(dedupeRef), tx.get(profileRef)]);
    if (dedupe.exists) return null; // Meta reintentó este mensaje: ya fue procesado
    if (!profileSnap.exists) return "No encontré los datos de tu cuenta. Abre la app una vez e inicia sesión.";
    const data = profileSnap.data();
    const debts = data.debts || [];
    const transactions = data.transactions || [];

    if (cmd.kind === "balance") {
      tx.set(dedupeRef, { at: now.getTime() });
      return balanceReply(data, today);
    }

    if (cmd.kind === "undo") {
      const last = transactions.find((t) => t.source === "whatsapp");
      tx.set(dedupeRef, { at: now.getTime() });
      if (!last) return "No tengo movimientos registrados por WhatsApp para deshacer.";
      tx.set(profileRef, {
        ...data,
        debts: reverseTxOnDebts(debts, last),
        transactions: transactions.filter((t) => t.id !== last.id),
      });
      const b = monthBalance({ incomes: data.incomes, transactions: transactions.filter((t) => t.id !== last.id) }, today.slice(0, 7));
      return `↩️ Deshice #${last.id} (${fmt(last.amount)} · ${CATEGORY_LABEL[last.category] || last.category}).\n📊 Balance del mes: ${fmt(b.balance)}`;
    }

    // ---- registro de un movimiento ----
    let debtId = null;
    let chargeDebtId = null;
    let linked = null;
    if (cmd.type === "gasto" && cmd.category === "deuda" && debts.length) {
      linked = matchDebt(cmd.description, debts);
      if (!linked && debts.length === 1) linked = debts[0];
      if (!linked) {
        tx.set(dedupeRef, { at: now.getTime() });
        return `¿A cuál deuda va el pago? Incluye su nombre, por ejemplo: \`${cmd.amount} deuda pago ${debts[0].name.toLowerCase()}\`.\nTus deudas: ${debts.map((d) => d.name).join(", ")}.`;
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
      source: "whatsapp",
    };
    const applied = applyTxToDebts(debts, record);
    record.debtDelta = applied.delta;

    const nextTransactions = [record, ...transactions];
    tx.set(profileRef, { ...data, debts: applied.debts, transactions: nextTransactions });
    tx.set(dedupeRef, { at: now.getTime() });

    return registerReply({ record, linked, applied, data: { ...data, transactions: nextTransactions }, today });
  });
}

/** @returns {string} */
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

/** @returns {string} */
function balanceReply(data, today) {
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

/** Vincula un número de WhatsApp con la cuenta que generó el código en la app. */
async function linkPhone(db, from, code, now) {
  const throttleRef = db.doc(`waThrottle/${from}`);
  const codeRef = db.doc(`linkCodes/${code}`);
  const linkRef = db.doc(`phoneLinks/${from}`);

  return db.runTransaction(async (tx) => {
    const [th, codeSnap] = await Promise.all([tx.get(throttleRef), tx.get(codeRef)]);
    const t = th.exists ? th.data() : { fails: 0, windowStart: now.getTime() };
    const windowOpen = now.getTime() - t.windowStart < LINK_WINDOW_MS;
    const fails = windowOpen ? t.fails : 0;
    if (fails >= MAX_LINK_FAILS) return "⛔ Demasiados intentos fallidos. Espera 15 minutos y genera un código nuevo en la app.";

    const c = codeSnap.exists ? codeSnap.data() : null;
    if (!c || c.expiresAt < now.getTime() || !c.uid) {
      tx.set(throttleRef, { fails: fails + 1, windowStart: windowOpen ? t.windowStart : now.getTime() });
      return "❌ Código inválido o vencido. Genera uno nuevo en la app (Datos → WhatsApp).";
    }
    tx.set(linkRef, { uid: c.uid, linkedAt: now.getTime() });
    tx.delete(codeRef); // un código sirve una sola vez
    tx.delete(throttleRef);
    return "✅ ¡Listo! Tu número quedó vinculado.\nYa puedes escribirme, por ejemplo: `50000 comida almuerzo`";
  });
}
