import crypto from "node:crypto";

/** Compara en tiempo constante la firma `X-Hub-Signature-256` con HMAC-SHA256(rawBody, appSecret). */
export function isValidSignature(rawBody, header, appSecret) {
  if (!rawBody || !header || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extrae los mensajes entrantes del payload de Meta (ignora "statuses": entregado/leído). */
export function extractMessages(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        out.push({ from: m.from, wamid: m.id, type: m.type, text: m.text?.body ?? "" });
      }
    }
  }
  return out;
}
