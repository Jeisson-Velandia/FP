/**
 * Utilidades de formato compartidas por toda la app (dashboard, resúmenes, metas, etc.).
 * Centralizar esto evita que cada componente nuevo reinvente su propio formateador de
 * moneda o de fechas con una lógica ligeramente distinta.
 */

/**
 * Formatea un número como moneda en el estilo usado en toda la app:
 * símbolo "$", separador de miles local, sin decimales.
 * @param {number} n
 * @returns {string}
 */
export function fmt(n) {
  return "$" + Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Etiquetas cortas de mes en español, índice 0 = enero. @type {string[]} */
export const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Fecha de hoy en formato "YYYY-MM-DD", lista para un <input type="date">.
 * @returns {string}
 */
export function todayStr() {
  // Fecha LOCAL del usuario (toISOString usa UTC y, de noche en Colombia, daría la fecha de mañana).
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Llave del mes actual en formato "YYYY-MM", usada para filtrar transacciones del mes.
 * @returns {string}
 */
export function thisMonthKey() {
  return todayStr().slice(0, 7);
}

/**
 * Año actual como número, ej. 2026.
 * @returns {number}
 */
export function thisYear() {
  return new Date().getFullYear();
}

/**
 * Índice de mes actual (0-11).
 * @returns {number}
 */
export function thisMonthIndex() {
  return new Date().getMonth();
}
