import React from "react";
import { getCategoryColor } from "../lib/categoryColors.js";

/**
 * @typedef {Object} CategoryBadgeProps
 * @property {string} category - id de la categoría (ej. "comida", "ahorro")
 * @property {string} [label] - texto a mostrar; si se omite, usa el label de la paleta
 * @property {"xs"|"sm"} [size]
 */

/**
 * Badge/pill de categoría con el color centralizado de categoryColors.js.
 * @param {CategoryBadgeProps} props
 */
export function CategoryBadge({ category, label, size = "sm" }) {
  const c = getCategoryColor(category);
  const padding = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${c.classes.bgSoft} ${c.classes.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.classes.bg}`} />
      {label ?? c.label}
    </span>
  );
}

/**
 * Punto de color simple (para leyendas, filas de tabla, etc.)
 * @param {{ category: string, size?: number }} props
 */
export function CategoryDot({ category, size = 8 }) {
  const c = getCategoryColor(category);
  return (
    <span
      className={`inline-block rounded-full ${c.classes.bg}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/**
 * @typedef {Object} CategoryProgressBarProps
 * @property {string} category
 * @property {number} value   - valor actual (ej. gastado)
 * @property {number} max     - valor máximo (ej. presupuesto); 0 o undefined = sin límite
 * @property {string} [trackClassName] - clase del riel de fondo (para encajar con el tema oscuro del ledger)
 */

/**
 * Barra de progreso coloreada por categoría. No decide semáforo (verde/amarillo/rojo) —
 * ese criterio de negocio vive en App.jsx; este componente es puramente visual y
 * siempre usa el color de la categoría, para que la identidad visual sea consistente
 * en toda la app (dashboard, presupuestos, resúmenes).
 *
 * @param {CategoryProgressBarProps} props
 */
export function CategoryProgressBar({ category, value, max, trackClassName = "bg-white/10" }) {
  const c = getCategoryColor(category);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  return (
    <div className={`h-2 w-full rounded-full overflow-hidden ${trackClassName}`}>
      <div
        className={`h-full rounded-full transition-all ${c.classes.bg}`}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
