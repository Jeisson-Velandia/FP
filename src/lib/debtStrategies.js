/**
 * Simulación de estrategias de pago de deudas (bola de nieve y avalancha).
 *
 * Reglas del modelo:
 *  - Presupuesto mensual FIJO = suma de pagos mínimos + pago extra. Cuando una deuda se salda, su pago
 *    mínimo NO se pierde: pasa a la siguiente deuda objetivo. Esa "bola" que rueda es lo que diferencia
 *    de verdad a las dos estrategias (sin ella ambas darían casi lo mismo).
 *  - Cada mes: se cargan intereses, se paga el mínimo de cada deuda y todo el sobrante va a la deuda
 *    objetivo (bola de nieve = menor saldo, avalancha = mayor tasa).
 *  - Tasa: se interpreta como efectiva anual (E.A.), la forma en que los bancos colombianos publican
 *    sus tasas: tasa mensual = (1 + EA)^(1/12) − 1.
 *  - Si el presupuesto no alcanza para cubrir los intereses, la deuda no se termina nunca: se devuelve
 *    `feasible: false` y cuánto hace falta, en vez de simular 60 años de intereses absurdos.
 *
 * @typedef {{ id: string, name: string, balance: number, rate: number, minPayment: number }} SimDebt
 * @typedef {"snowball"|"avalanche"} Strategy
 * @typedef {{
 *   feasible: boolean,
 *   months: number,
 *   totalInterest: number,
 *   budget: number,
 *   firstMonthInterest: number,
 *   payoff: { id: string, name: string, month: number }[],
 * }} PayoffResult
 */

export const MAX_MONTHS = 600; // 50 años: más allá se considera que la deuda no se termina

/** Tasa mensual a partir de la tasa efectiva anual en %. @param {number} annualPct */
export function monthlyRate(annualPct) {
  const ea = Number(annualPct) / 100;
  if (!(ea > 0)) return 0;
  return Math.pow(1 + ea, 1 / 12) - 1;
}

/**
 * @param {SimDebt[]} debts
 * @param {number} extraPayment  pago extra mensual sobre los mínimos
 * @param {Strategy} strategy
 * @returns {PayoffResult}
 */
export function simulatePayoff(debts, extraPayment, strategy) {
  const working = debts
    .filter((d) => Number(d.balance) > 0.01)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.balance),
      mr: monthlyRate(d.rate),
      rate: Number(d.rate) || 0,
      min: Math.max(0, Number(d.minPayment) || 0),
    }));

  const budget = working.reduce((s, d) => s + d.min, 0) + Math.max(0, Number(extraPayment) || 0);
  const firstMonthInterest = working.reduce((s, d) => s + d.balance * d.mr, 0);
  if (working.length === 0) {
    return { feasible: true, months: 0, totalInterest: 0, budget, firstMonthInterest: 0, payoff: [] };
  }
  if (budget <= 0) {
    return { feasible: false, months: 0, totalInterest: 0, budget, firstMonthInterest, payoff: [] };
  }

  const byStrategy =
    strategy === "snowball" ? (a, b) => a.balance - b.balance : (a, b) => b.rate - a.rate || a.balance - b.balance;

  let months = 0;
  let totalInterest = 0;
  /** @type {{ id: string, name: string, month: number }[]} */
  const payoff = [];

  while (working.some((d) => d.balance > 0.01) && months < MAX_MONTHS) {
    months++;
    for (const d of working) {
      if (d.balance > 0.01) {
        const interest = d.balance * d.mr;
        d.balance += interest;
        totalInterest += interest;
      }
    }
    let available = budget;
    for (const d of working) {
      if (d.balance > 0.01) {
        const pay = Math.min(d.min, d.balance);
        d.balance -= pay;
        available -= pay;
      }
    }
    for (const d of working.filter((x) => x.balance > 0.01).sort(byStrategy)) {
      if (available <= 0.005) break;
      const pay = Math.min(available, d.balance);
      d.balance -= pay;
      available -= pay;
    }
    for (const d of working) {
      if (d.balance <= 0.01 && !payoff.some((p) => p.id === d.id)) payoff.push({ id: d.id, name: d.name, month: months });
    }
  }

  const feasible = !working.some((d) => d.balance > 0.01);
  return { feasible, months, totalInterest, budget, firstMonthInterest, payoff };
}

/**
 * Pago total mensual (mínimos + extra) necesario para terminar todas las deudas en `targetMonths` meses,
 * con la estrategia dada. Búsqueda binaria sobre el presupuesto.
 *
 * @param {SimDebt[]} debts
 * @param {number} targetMonths
 * @param {Strategy} [strategy]
 * @returns {number|null} pesos por mes (redondeado hacia arriba a miles), o null si no hay deudas
 */
export function requiredMonthlyBudget(debts, targetMonths, strategy = "avalanche") {
  const active = debts.filter((d) => Number(d.balance) > 0.01);
  if (active.length === 0) return null;
  const sumMin = active.reduce((s, d) => s + Math.max(0, Number(d.minPayment) || 0), 0);
  const totalBalance = active.reduce((s, d) => s + Number(d.balance), 0);
  let lo = 0;
  let hi = totalBalance * 1.5 + 1; // pagar todo el primer mes siempre alcanza
  const fits = (budget) => {
    const r = simulatePayoff(active, Math.max(0, budget - sumMin), strategy);
    return r.feasible && r.months <= targetMonths;
  };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 1000) * 1000;
}
