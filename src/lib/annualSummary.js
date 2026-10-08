import { MONTH_LABELS } from "./format.js";
import { isCreditCharge } from "./debts.js";

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {"ingreso"|"gasto"} type
 * @property {number} amount
 * @property {string} category
 * @property {string} date - formato "YYYY-MM-DD"
 * @property {string} [description]
 */

/**
 * @typedef {Object} MonthlySummary
 * @property {number} monthIndex    - 0 (enero) a 11 (diciembre)
 * @property {string} monthLabel    - "Ene", "Feb", ...
 * @property {number} ingresos
 * @property {number} gastos        - gastos del mes SIN contar la categoría "ahorro"
 * @property {number} ahorro        - total asignado a la categoría "ahorro" ese mes
 * @property {number} balance       - ingresos - gastos - ahorro
 * @property {boolean} hasData      - true si hubo al menos una transacción ese mes
 */

/**
 * Agrega las transacciones de un año en 12 resúmenes mensuales (enero a diciembre).
 *
 * Decisión de modelo: el "ahorro" se trata como una asignación, no como un gasto perdido —
 * por eso se calcula aparte de `gastos` y se resta del balance igual que un gasto (el dinero
 * sale de la cuenta corriente), pero se reporta en su propia serie para que el usuario vea
 * cuánto destinó a ahorrar cada mes.
 *
 * @param {Transaction[]} transactions
 * @param {number} year - ej. 2026
 * @returns {MonthlySummary[]} longitud 12, en orden enero → diciembre
 */
export function buildMonthlySummaries(transactions, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    monthLabel: MONTH_LABELS[i],
    ingresos: 0,
    gastos: 0,
    ahorro: 0,
    balance: 0,
    hasData: false,
  }));

  for (const t of transactions) {
    if (!t?.date || t.date.slice(0, 4) !== String(year)) continue;
    const monthIndex = Number(t.date.slice(5, 7)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;

    const bucket = months[monthIndex];
    bucket.hasData = true;
    const amount = Number(t.amount) || 0;

    if (t.type === "ingreso") {
      bucket.ingresos += amount;
    } else if (t.category === "ahorro") {
      bucket.ahorro += amount;
    } else if (isCreditCharge(t)) {
      // Consumo cargado a una tarjeta: el dinero aún no salió de tu cuenta. Se refleja en
      // "gastos" cuando lo pagas (movimiento de categoría "deuda"); contarlo aquí también
      // lo duplicaría. Sigue visible en el presupuesto por categoría y en el historial de la tarjeta.
    } else {
      bucket.gastos += amount;
    }
  }

  months.forEach((m) => {
    m.balance = m.ingresos - m.gastos - m.ahorro;
  });

  return months;
}

/**
 * @typedef {Object} MonthlyVariation
 * @property {number|null} ingresosPct
 * @property {number|null} gastosPct
 * @property {number|null} ahorroPct
 * @property {number|null} balancePct
 */

/**
 * Variación porcentual de cada métrica del mes `current` contra el mes `previous`.
 * Devuelve `null` cuando no hay una base de comparación significativa (mes anterior sin
 * datos, o división por cero), en vez de mostrar un falso "+Infinity%" o "-100%" engañoso.
 *
 * @param {MonthlySummary} current
 * @param {MonthlySummary | undefined} previous
 * @returns {MonthlyVariation}
 */
export function computeVariation(current, previous) {
  /** @param {number} curr @param {number} prev @returns {number|null} */
  const pct = (curr, prev) => {
    if (!previous || !previous.hasData) return null;
    if (prev === 0) return curr === 0 ? 0 : null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };
  return {
    ingresosPct: pct(current.ingresos, previous?.ingresos ?? 0),
    gastosPct: pct(current.gastos, previous?.gastos ?? 0),
    ahorroPct: pct(current.ahorro, previous?.ahorro ?? 0),
    balancePct: pct(current.balance, previous?.balance ?? 0),
  };
}

/**
 * Años distintos presentes en las transacciones, para poblar el selector de año.
 * Siempre incluye el año en curso, aunque todavía no tenga transacciones.
 *
 * @param {Transaction[]} transactions
 * @returns {number[]} años en orden descendente (más reciente primero)
 */
export function getAvailableYears(transactions) {
  const years = new Set([new Date().getFullYear()]);
  transactions.forEach((t) => {
    if (t?.date) years.add(Number(t.date.slice(0, 4)));
  });
  return Array.from(years).sort((a, b) => b - a);
}

/**
 * Totales acumulados de un año completo (útil para tarjetas de resumen anual y,
 * más adelante, para el run rate de ahorro del Requerimiento 3).
 *
 * @param {MonthlySummary[]} months
 * @returns {{ ingresos: number, gastos: number, ahorro: number, balance: number, mesesConDatos: number }}
 */
export function summarizeYear(months) {
  return months.reduce(
    (acc, m) => ({
      ingresos: acc.ingresos + m.ingresos,
      gastos: acc.gastos + m.gastos,
      ahorro: acc.ahorro + m.ahorro,
      balance: acc.balance + m.balance,
      mesesConDatos: acc.mesesConDatos + (m.hasData ? 1 : 0),
    }),
    { ingresos: 0, gastos: 0, ahorro: 0, balance: 0, mesesConDatos: 0 }
  );
}
