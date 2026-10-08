import { isCreditCharge } from "./debts.js";

/**
 * Cálculo del balance del mes en curso, idéntico al de la app (App.jsx) pero reutilizable
 * desde la Cloud Function de WhatsApp.
 *
 * Balance = ingresos fijos (normalizados a mes) + ingresos extra − gastos en efectivo.
 * Los consumos a tarjeta NO restan hasta que se paga la tarjeta (categoría "deuda").
 */

export const FREQ_FACTORS = { mensual: 1, quincenal: 2, semanal: 4.33, variable: 1 };

/** @param {{ amount: number|string, frequency?: string }[]} incomes */
export function monthlyIncomeTotal(incomes) {
  return (incomes || []).reduce((s, i) => s + Number(i.amount) * (FREQ_FACTORS[i.frequency] || 1), 0);
}

/**
 * @param {{ incomes?: any[], transactions?: any[] }} data
 * @param {string} monthKey - "YYYY-MM"
 * @returns {{ ingresos: number, gastos: number, consumosCredito: number, balance: number }}
 */
export function monthBalance(data, monthKey) {
  const tx = (data.transactions || []).filter((t) => String(t.date).slice(0, 7) === monthKey);
  const extra = tx.filter((t) => t.type === "ingreso").reduce((s, t) => s + Number(t.amount), 0);
  const gastos = tx
    .filter((t) => t.type === "gasto" && !isCreditCharge(t))
    .reduce((s, t) => s + Number(t.amount), 0);
  const consumosCredito = tx.filter(isCreditCharge).reduce((s, t) => s + Number(t.amount), 0);
  const ingresos = monthlyIncomeTotal(data.incomes) + extra;
  return { ingresos, gastos, consumosCredito, balance: ingresos - gastos };
}
