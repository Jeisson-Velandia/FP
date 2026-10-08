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
import { parseMessage } from "./lib/messageParser.js";
import { applyCommand } from "./lib/quickEntry.js";

const MAX_LINK_FAILS = 5;
const LINK_WINDOW_MS = 15 * 60 * 1000;

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

    // La lógica de registrar / consultar / deshacer es la misma que usa el chat de la app.
    const result = applyCommand(data, cmd, { today, newId, source: "whatsapp" });
    tx.set(dedupeRef, { at: now.getTime() }); // se marca como procesado aunque no haya cambios
    if (result.data) tx.set(profileRef, result.data);
    return result.reply;
  });
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
