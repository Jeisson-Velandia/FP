/**
 * Intérprete de mensajes en lenguaje natural (WhatsApp) → comandos tipados.
 *
 * Funciones puras, sin dependencias: se usan desde la Cloud Function (Node) y se pueden probar solas.
 *
 * Formatos que entiende:
 *   "50000 comida almuerzo"              → gasto en Comida
 *   "$120.000 transporte gasolina"       → gasto en Transporte
 *   "200k deuda pago tarjeta"            → pago a la deuda cuyo nombre coincida con "tarjeta"
 *   "35000 comida cena con davivienda"   → consumo a crédito (gasto + suma al saldo de esa tarjeta)
 *   "ingreso 1500000 freelance"          → ingreso
 *   "saldo" / "resumen"                  → consulta del balance del mes
 *   "deshacer"                           → borra el último movimiento registrado por WhatsApp
 *   "vincular 123456"                    → asocia este número con la cuenta que generó el código
 *   "ayuda"                              → instrucciones
 *
 * @typedef {"gasto"|"ingreso"} TxType
 *
 * @typedef {{ kind: "register", type: TxType, amount: number, category: string, description: string }} RegisterCommand
 * @typedef {{ kind: "link", code: string }} LinkCommand
 * @typedef {{ kind: "balance" }} BalanceCommand
 * @typedef {{ kind: "undo" }} UndoCommand
 * @typedef {{ kind: "help" }} HelpCommand
 * @typedef {{ kind: "unknown", reason: string }} UnknownCommand
 * @typedef {RegisterCommand|LinkCommand|BalanceCommand|UndoCommand|HelpCommand|UnknownCommand} Command
 */

/** Categorías válidas (mismos ids que la app). */
export const CATEGORY_IDS = [
  "vivienda", "comida", "transporte", "entretenimiento", "salud", "deuda", "ahorro", "otros",
];

/** Sinónimos → id de categoría. Todo en minúsculas y sin tildes. */
const CATEGORY_ALIASES = {
  vivienda: "vivienda", arriendo: "vivienda", hogar: "vivienda", servicios: "vivienda",
  comida: "comida", mercado: "comida", restaurante: "comida", almuerzo: "comida", supermercado: "comida",
  transporte: "transporte", taxi: "transporte", gasolina: "transporte", bus: "transporte", uber: "transporte",
  entretenimiento: "entretenimiento", ocio: "entretenimiento", diversion: "entretenimiento",
  salud: "salud", medico: "salud", farmacia: "salud",
  deuda: "deuda", deudas: "deuda", pago: "deuda", cuota: "deuda",
  ahorro: "ahorro", ahorros: "ahorro",
  otros: "otros", otro: "otros",
};

/** Quita tildes, pasa a minúsculas y colapsa espacios. @param {string} s */
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convierte un token de monto a número. Acepta "50000", "50.000", "50,000", "$50.000",
 * "50k", "1.5m", "2 mil" no (solo un token). Devuelve null si no es un monto válido.
 * Convención colombiana: "." y "," agrupan miles cuando van seguidos de exactamente 3 dígitos.
 * @param {string} token
 * @returns {number|null}
 */
export function parseAmount(token) {
  let t = normalize(token).replace(/^\$/, "").replace(/\s/g, "");
  if (!t) return null;
  let mult = 1;
  if (/[km]$/.test(t)) {
    mult = t.endsWith("k") ? 1_000 : 1_000_000;
    t = t.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(t)) return null;
  // Separadores: si hay uno y le siguen 3 dígitos al final → miles; si no → decimal.
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(t);
  let n;
  if (grouped) n = Number(t.replace(/[.,]/g, ""));
  else n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const value = Math.round(n * mult);
  return value > 0 ? value : null;
}

const HELP_WORDS = new Set(["ayuda", "help", "hola", "menu", "?"]);
const BALANCE_WORDS = new Set(["saldo", "resumen", "balance", "cuanto me queda"]);
const UNDO_WORDS = new Set(["deshacer", "borrar", "anular", "undo"]);

/**
 * @param {string} text
 * @returns {Command}
 */
export function parseMessage(text) {
  const clean = normalize(text);
  if (!clean) return { kind: "unknown", reason: "vacío" };

  if (HELP_WORDS.has(clean)) return { kind: "help" };
  if (BALANCE_WORDS.has(clean)) return { kind: "balance" };
  if (UNDO_WORDS.has(clean)) return { kind: "undo" };

  const link = clean.match(/^vincular\s+(\d{4,10})$/);
  if (link) return { kind: "link", code: link[1] };

  let words = clean.split(" ");
  let type = /** @type {TxType} */ ("gasto");

  // "ingreso 1500000 freelance" (la palabra puede ir primero)
  if (words[0] === "ingreso" || words[0] === "ingresos") {
    type = "ingreso";
    words = words.slice(1);
  }

  // El monto es el primer token con forma de monto (normalmente el primero).
  const amountIdx = words.findIndex((w) => parseAmount(w) !== null);
  if (amountIdx === -1) {
    return { kind: "unknown", reason: "No encontré un monto. Ejemplo: 50000 comida almuerzo" };
  }
  const amount = /** @type {number} */ (parseAmount(words[amountIdx]));
  const rest = words.filter((_, i) => i !== amountIdx);

  if (type === "ingreso") {
    return { kind: "register", type, amount, category: "ingreso", description: rest.join(" ") };
  }

  if (rest.length === 0) {
    return { kind: "unknown", reason: "Falta la categoría. Ejemplo: 50000 comida almuerzo" };
  }

  // La categoría es la primera palabra que sea una categoría o un sinónimo conocido.
  const catIdx = rest.findIndex((w) => CATEGORY_ALIASES[w]);
  if (catIdx === -1) {
    return {
      kind: "unknown",
      reason: `No reconocí la categoría "${rest[0]}". Usa: ${CATEGORY_IDS.join(", ")}`,
    };
  }
  const category = CATEGORY_ALIASES[rest[catIdx]];
  // Si el usuario escribió un sinónimo ("almuerzo"), se conserva como descripción.
  const keepWord = rest[catIdx] !== category;
  const description = rest.filter((_, i) => i !== catIdx || keepWord).join(" ");

  return { kind: "register", type, amount, category, description };
}

/**
 * Busca la deuda a la que se refiere el texto ("pago tarjeta", "con davivienda").
 * Coincide si el nombre de la deuda (normalizado) aparece en el texto, o si alguna palabra
 * de más de 3 letras del nombre aparece como palabra suelta. Devuelve null si es ambiguo.
 *
 * @template {{ id: string, name: string, kind?: string }} D
 * @param {string} text
 * @param {D[]} debts
 * @returns {D|null}
 */
export function matchDebt(text, debts) {
  const t = normalize(text);
  if (!t || !debts.length) return null;
  const words = new Set(t.split(" "));
  const hits = debts.filter((d) => {
    const name = normalize(d.name);
    if (name && t.includes(name)) return true;
    return name.split(" ").some((w) => w.length > 3 && words.has(w));
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;
  // Sin coincidencia por nombre: si la palabra es genérica ("tarjeta") y solo hay una tarjeta, esa.
  if (words.has("tarjeta")) {
    const cards = debts.filter((d) => d.kind === "tarjeta");
    if (cards.length === 1) return cards[0];
  }
  return null;
}
