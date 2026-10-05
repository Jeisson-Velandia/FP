/**
 * Paleta centralizada de colores por categoría de ingreso/gasto.
 *
 * Única fuente de verdad para el color de cada categoría — la usan los Badges,
 * los gráficos (Recharts) y las barras de progreso, para que nunca se desincronicen
 * entre sí. Este módulo no depende de React a propósito: es dato puro, reutilizable
 * también desde Node (por ejemplo, el futuro bot de WhatsApp) o desde pruebas unitarias.
 *
 * @typedef {"vivienda"|"comida"|"transporte"|"entretenimiento"|"salud"|"deuda"|"ahorro"|"otros"} CategoryId
 *
 * @typedef {Object} CategoryColorClasses
 * @property {string} bg      - fondo sólido, ej. para un punto de color o un ícono circular
 * @property {string} bgSoft  - fondo suave (15% opacidad), ideal para el fondo de un Badge
 * @property {string} text    - color de texto a juego
 * @property {string} border  - color de borde a juego
 * @property {string} ring    - color de anillo/focus a juego
 *
 * @typedef {Object} CategoryColor
 * @property {CategoryId} id
 * @property {string} label
 * @property {string} hex     - hexadecimal, para Recharts, SVG o estilos inline
 * @property {string} tw      - nombre base del color en Tailwind (sin intensidad), ej. "yellow"
 * @property {CategoryColorClasses} classes
 */

/** @type {Record<CategoryId, CategoryColor>} */
export const CATEGORY_PALETTE = {
  vivienda: {
    id: "vivienda",
    label: "Vivienda",
    hex: "#EAB308",
    tw: "yellow",
    classes: {
      bg: "bg-yellow-500",
      bgSoft: "bg-yellow-500/15",
      text: "text-yellow-500",
      border: "border-yellow-500",
      ring: "ring-yellow-500",
    },
  },
  comida: {
    id: "comida",
    label: "Comida",
    hex: "#F97316",
    tw: "orange",
    classes: {
      bg: "bg-orange-500",
      bgSoft: "bg-orange-500/15",
      text: "text-orange-500",
      border: "border-orange-500",
      ring: "ring-orange-500",
    },
  },
  transporte: {
    id: "transporte",
    label: "Transporte",
    hex: "#3B82F6",
    tw: "blue",
    classes: {
      bg: "bg-blue-500",
      bgSoft: "bg-blue-500/15",
      text: "text-blue-500",
      border: "border-blue-500",
      ring: "ring-blue-500",
    },
  },
  entretenimiento: {
    id: "entretenimiento",
    label: "Entretenimiento",
    hex: "#22C55E",
    tw: "green",
    classes: {
      bg: "bg-green-500",
      bgSoft: "bg-green-500/15",
      text: "text-green-500",
      border: "border-green-500",
      ring: "ring-green-500",
    },
  },
  salud: {
    id: "salud",
    label: "Salud",
    hex: "#A855F7",
    tw: "purple",
    classes: {
      bg: "bg-purple-500",
      bgSoft: "bg-purple-500/15",
      text: "text-purple-500",
      border: "border-purple-500",
      ring: "ring-purple-500",
    },
  },
  deuda: {
    id: "deuda",
    label: "Deuda",
    hex: "#EF4444",
    tw: "red",
    classes: {
      bg: "bg-red-500",
      bgSoft: "bg-red-500/15",
      text: "text-red-500",
      border: "border-red-500",
      ring: "ring-red-500",
    },
  },
  ahorro: {
    id: "ahorro",
    label: "Ahorro",
    hex: "#06B6D4",
    tw: "cyan",
    classes: {
      bg: "bg-cyan-500",
      bgSoft: "bg-cyan-500/15",
      text: "text-cyan-500",
      border: "border-cyan-500",
      ring: "ring-cyan-500",
    },
  },
  otros: {
    id: "otros",
    label: "Otros",
    hex: "#94A3B8",
    tw: "slate",
    classes: {
      bg: "bg-slate-400",
      bgSoft: "bg-slate-400/15",
      text: "text-slate-400",
      border: "border-slate-400",
      ring: "ring-slate-400",
    },
  },
};

/** @type {CategoryId[]} */
export const CATEGORY_IDS = /** @type {CategoryId[]} */ (Object.keys(CATEGORY_PALETTE));

/**
 * Devuelve la configuración de color para una categoría. Si la categoría no existe
 * en la paleta (dato legado, corrupto, o una categoría que ya no existe) cae de
 * vuelta a "otros" en lugar de lanzar un error — la UI nunca se debe romper por esto.
 *
 * @param {string} category
 * @returns {CategoryColor}
 */
export function getCategoryColor(category) {
  return CATEGORY_PALETTE[category] || CATEGORY_PALETTE.otros;
}

/**
 * Color hexadecimal listo para usar en series de Recharts, SVG o estilos inline.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryHex(category) {
  return getCategoryColor(category).hex;
}

/**
 * Clases Tailwind listas para un Badge (fondo suave + texto a juego).
 * @param {string} category
 * @returns {string} ej. "bg-yellow-500/15 text-yellow-500"
 */
export function getCategoryBadgeClasses(category) {
  const c = getCategoryColor(category);
  return `${c.classes.bgSoft} ${c.classes.text}`;
}

/**
 * Construye el arreglo de colores en el orden exacto de una lista de categorías,
 * listo para pasarle a `<Pie>`/`<Cell>` o a `<Bar fill>` de Recharts.
 *
 * @param {string[]} categoryIds
 * @returns {string[]} hexadecimales en el mismo orden
 */
export function getChartColors(categoryIds) {
  return categoryIds.map(getCategoryHex);
}
