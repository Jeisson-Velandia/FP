/**
 * Lógica de deudas: consumos a tarjeta, pagos, cupo disponible e historial por deuda.
 *
 * Todo aquí son funciones puras (sin React, sin Firestore): reciben datos y devuelven datos
 * nuevos, así se pueden probar solas y reutilizar (por ejemplo, desde el bot de WhatsApp).
 *
 * Modelo de una transacción respecto a las deudas:
 *  - Pago a deuda:      type "gasto", category "deuda", debtId = id de la deuda  → baja el saldo.
 *  - Consumo a crédito: type "gasto", category cualquiera (comida, transporte...),
 *                       chargeDebtId = id de la deuda                            → sube el saldo.
 *  - `debtDelta` guarda cuánto cambió REALMENTE el saldo al registrar la transacción. Se usa
 *    para revertir exacto al editar o borrar (si pagas $1.000.000 a una deuda de $600.000,
 *    el saldo cambió -600.000, no -1.000.000, y revertir debe devolver 600.000).
 *
 * @typedef {"tarjeta"|"prestamo"} DebtKind
 *
 * @typedef {Object} Debt
 * @property {string} id
 * @property {string} name
 * @property {number} balance       - saldo pendiente
 * @property {number} rate          - tasa de interés anual (%)
 * @property {number} minPayment    - pago mínimo mensual
 * @property {DebtKind} [kind]      - "tarjeta" (rotativa, nunca se borra sola) o "prestamo" (por defecto)
 * @property {number} [limit]       - cupo total; solo tiene sentido en tarjetas (0 o ausente = sin cupo)
 *
 * @typedef {Object} DebtTx
 * @property {string} id
 * @property {"ingreso"|"gasto"} type
 * @property {number} amount
 * @property {string} category
 * @property {string} date
 * @property {string} [description]
 * @property {string|null} [debtId]
 * @property {string|null} [chargeDebtId]
 * @property {number|null} [debtDelta]
 */

const EPS = 0.01;

/** ¿Es un pago/abono a una deuda? @param {DebtTx} tx */
export function isDebtPayment(tx) {
  return tx?.type === "gasto" && tx.category === "deuda" && !!tx.debtId;
}

/** ¿Es un consumo cargado a una tarjeta/deuda? @param {DebtTx} tx */
export function isCreditCharge(tx) {
  return tx?.type === "gasto" && tx.category !== "deuda" && !!tx.chargeDebtId;
}

/** Una tarjeta es rotativa: se queda en la lista aunque llegue a $0. @param {Debt} debt */
export function isRevolving(debt) {
  return debt?.kind === "tarjeta";
}

/**
 * Cambio que una transacción produce (o produjo) sobre el saldo de su deuda.
 * Usa `debtDelta` si existe; si no (datos anteriores a esta versión) lo infiere del monto.
 * @param {DebtTx} tx
 * @returns {number} negativo = baja el saldo (pago), positivo = lo sube (consumo)
 */
export function txDebtDelta(tx) {
  if (typeof tx?.debtDelta === "number") return tx.debtDelta;
  if (isDebtPayment(tx)) return -Number(tx.amount) || 0;
  if (isCreditCharge(tx)) return Number(tx.amount) || 0;
  return 0;
}

/**
 * Aplica el efecto de una transacción nueva sobre la lista de deudas.
 *
 * @param {Debt[]} debts
 * @param {DebtTx} tx
 * @returns {{ debts: Debt[], settledDebt: Debt|null, delta: number|null }}
 *   - delta: cambio real aplicado al saldo (null si la transacción no toca ninguna deuda)
 *   - settledDebt: el préstamo que quedó en $0 y se eliminó (las tarjetas nunca se eliminan)
 */
export function applyTxToDebts(debts, tx) {
  const targetId = isDebtPayment(tx) ? tx.debtId : isCreditCharge(tx) ? tx.chargeDebtId : null;
  const target = targetId ? debts.find((d) => d.id === targetId) : null;
  if (!target) return { debts, settledDebt: null, delta: null };

  const amount = Number(tx.amount) || 0;
  const wanted = isDebtPayment(tx) ? -amount : amount;
  const newBalance = Math.max(0, Number(target.balance) + wanted);
  const delta = newBalance - Number(target.balance); // el real: un pago no puede dejar saldo negativo

  const updated = debts.map((d) => (d.id === target.id ? { ...d, balance: newBalance } : d));
  const settles = newBalance <= EPS && !isRevolving(target) && isDebtPayment(tx);
  if (settles) {
    return { debts: updated.filter((d) => d.id !== target.id), settledDebt: target, delta };
  }
  return { debts: updated, settledDebt: null, delta };
}

/**
 * Deshace el efecto de una transacción sobre las deudas (al editarla o borrarla).
 * Si la deuda ya no existe (un préstamo que se saldó y se eliminó) no se puede restaurar
 * automáticamente: se devuelve la lista sin cambios.
 *
 * @param {Debt[]} debts
 * @param {DebtTx} tx
 * @returns {Debt[]}
 */
export function reverseTxOnDebts(debts, tx) {
  const targetId = isDebtPayment(tx) ? tx.debtId : isCreditCharge(tx) ? tx.chargeDebtId : null;
  if (!targetId || !debts.some((d) => d.id === targetId)) return debts;
  const delta = txDebtDelta(tx);
  return debts.map((d) =>
    d.id === targetId ? { ...d, balance: Math.max(0, Number(d.balance) - delta) } : d
  );
}

/**
 * @typedef {"verde"|"amarillo"|"rojo"|"sin-cupo"} UtilizationStatus
 *
 * @typedef {Object} DebtMetrics
 * @property {boolean} hasLimit
 * @property {number} limit
 * @property {number} available         - cupo disponible (nunca negativo)
 * @property {number|null} utilizationPct - % del cupo usado (null si no hay cupo)
 * @property {boolean} overLimit
 * @property {UtilizationStatus} status  - verde < 30%, amarillo 30–70%, rojo ≥ 70%
 */

/**
 * Cupo disponible y porcentaje de endeudamiento de una deuda.
 * @param {Debt} debt
 * @returns {DebtMetrics}
 */
export function debtMetrics(debt) {
  const limit = Number(debt?.limit) || 0;
  const balance = Number(debt?.balance) || 0;
  if (limit <= 0) {
    return { hasLimit: false, limit: 0, available: 0, utilizationPct: null, overLimit: false, status: "sin-cupo" };
  }
  const pct = (balance / limit) * 100;
  return {
    hasLimit: true,
    limit,
    available: Math.max(0, limit - balance),
    utilizationPct: pct,
    overLimit: balance > limit,
    status: pct < 30 ? "verde" : pct < 70 ? "amarillo" : "rojo",
  };
}

/**
 * @typedef {Object} PortfolioMetrics
 * @property {number} totalBalance        - saldo pendiente de TODAS las deudas
 * @property {number} totalLimit          - suma de cupos de las deudas que tienen cupo
 * @property {number} balanceOnLimited    - saldo de las deudas que tienen cupo
 * @property {number} totalAvailable      - cupo disponible total
 * @property {number|null} utilizationPct - endeudamiento global sobre el cupo (null si no hay cupos)
 */

/**
 * Totales de toda la cartera de deudas. El % de endeudamiento solo compara saldo contra cupo
 * de las deudas que tienen cupo (un préstamo sin cupo no distorsiona el porcentaje).
 *
 * @param {Debt[]} debts
 * @returns {PortfolioMetrics}
 */
export function portfolioMetrics(debts) {
  let totalBalance = 0;
  let totalLimit = 0;
  let balanceOnLimited = 0;
  for (const d of debts) {
    const balance = Number(d.balance) || 0;
    const limit = Number(d.limit) || 0;
    totalBalance += balance;
    if (limit > 0) {
      totalLimit += limit;
      balanceOnLimited += balance;
    }
  }
  return {
    totalBalance,
    totalLimit,
    balanceOnLimited,
    totalAvailable: Math.max(0, totalLimit - balanceOnLimited),
    utilizationPct: totalLimit > 0 ? (balanceOnLimited / totalLimit) * 100 : null,
  };
}

/**
 * @typedef {Object} DebtHistoryItem
 * @property {string} id
 * @property {"consumo"|"pago"} kind
 * @property {string} date
 * @property {number} amount
 * @property {string} category
 * @property {string} description
 * @property {number} delta  - efecto sobre el saldo (+ consumo, − pago)
 */

/**
 * Historial de movimientos asignados a UNA deuda (consumos y pagos), más recientes primero.
 * Se calcula a partir de las transacciones, no se guarda aparte: así nunca se desincroniza.
 *
 * @param {DebtTx[]} transactions
 * @param {string} debtId
 * @returns {DebtHistoryItem[]}
 */
export function getDebtHistory(transactions, debtId) {
  /** @type {DebtHistoryItem[]} */
  const items = [];
  for (const t of transactions) {
    if (isCreditCharge(t) && t.chargeDebtId === debtId) {
      items.push({ id: t.id, kind: "consumo", date: t.date, amount: Number(t.amount) || 0, category: t.category, description: t.description || "", delta: txDebtDelta(t) });
    } else if (isDebtPayment(t) && t.debtId === debtId) {
      items.push({ id: t.id, kind: "pago", date: t.date, amount: Number(t.amount) || 0, category: t.category, description: t.description || "", delta: txDebtDelta(t) });
    }
  }
  // Array.prototype.sort es estable: a igual fecha se conserva el orden de registro (más nuevo primero).
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
