/**
 * @typedef {Object} SavingsGoals
 * @property {number} monthly - meta de ahorro mensual, en pesos
 * @property {number} annual  - meta de ahorro anual, en pesos
 */

/**
 * @typedef {"verde"|"amarillo"|"rojo"|"sin-meta"} GoalStatus
 *
 * @typedef {Object} SavingsProjection
 * @property {number} ahorroMesActual          - ahorro registrado en el mes en curso
 * @property {number} ahorroAcumuladoAnio      - ahorro acumulado del año hasta hoy
 * @property {number} mesesTranscurridos       - meses calendario transcurridos del año (incluye el actual)
 * @property {number} runRateMensual           - ritmo promedio de ahorro mensual en lo que va del año
 * @property {number} proyeccion12Meses        - runRateMensual × 12
 * @property {number|null} metaMensualPct      - % de cumplimiento de la meta mensual (null si no hay meta definida)
 * @property {GoalStatus} metaMensualStatus
 * @property {number|null} mesesParaMetaAnual  - meses estimados para alcanzar la meta anual al ritmo actual (null si no aplica)
 * @property {boolean} metaAnualCumplida
 */

/**
 * Calcula el ritmo de ahorro (run rate) del año en curso y proyecta su cumplimiento
 * contra las metas mensual y anual definidas por el usuario.
 *
 * El run rate se calcula como el ahorro acumulado del año dividido entre los meses
 * calendario transcurridos (incluyendo meses en los que no se ahorró nada, que cuentan
 * como $0 y bajan el promedio) — así el número refleja el ritmo real, no solo los meses
 * "buenos".
 *
 * @param {import("./annualSummary.js").MonthlySummary[]} monthsThisYear - ver buildMonthlySummaries(transactions, añoActual)
 * @param {number} currentMonthIndex - 0 a 11
 * @param {SavingsGoals} goals
 * @returns {SavingsProjection}
 */
export function computeSavingsProjection(monthsThisYear, currentMonthIndex, goals) {
  const mesesTranscurridos = currentMonthIndex + 1;
  const mesesHastaHoy = monthsThisYear.slice(0, mesesTranscurridos);

  const ahorroAcumuladoAnio = mesesHastaHoy.reduce((s, m) => s + m.ahorro, 0);
  const ahorroMesActual = monthsThisYear[currentMonthIndex]?.ahorro ?? 0;
  const runRateMensual = mesesTranscurridos > 0 ? ahorroAcumuladoAnio / mesesTranscurridos : 0;
  const proyeccion12Meses = runRateMensual * 12;

  /** @type {number|null} */
  let metaMensualPct = null;
  /** @type {GoalStatus} */
  let metaMensualStatus = "sin-meta";
  if (goals.monthly > 0) {
    metaMensualPct = (ahorroMesActual / goals.monthly) * 100;
    metaMensualStatus = metaMensualPct >= 100 ? "verde" : metaMensualPct >= 60 ? "amarillo" : "rojo";
  }

  const metaAnualCumplida = goals.annual > 0 && ahorroAcumuladoAnio >= goals.annual;
  /** @type {number|null} */
  let mesesParaMetaAnual = null;
  if (goals.annual > 0 && !metaAnualCumplida && runRateMensual > 0) {
    mesesParaMetaAnual = (goals.annual - ahorroAcumuladoAnio) / runRateMensual;
  }

  return {
    ahorroMesActual,
    ahorroAcumuladoAnio,
    mesesTranscurridos,
    runRateMensual,
    proyeccion12Meses,
    metaMensualPct,
    metaMensualStatus,
    mesesParaMetaAnual,
    metaAnualCumplida,
  };
}

/** Meta de ahorro vacía por defecto, para cuentas nuevas. @type {SavingsGoals} */
export const emptySavingsGoals = { monthly: 0, annual: 0 };
