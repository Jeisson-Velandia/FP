/**
 * Webhook de WhatsApp (Meta WhatsApp Business Cloud API) → registra movimientos en Firestore.
 *
 * Flujo:
 *   WhatsApp → POST /whatsappWebhook → verifica firma → processIncoming() → responde por la Graph API.
 *
 * Secretos (firebase functions:secrets:set NOMBRE):
 *   WHATSAPP_VERIFY_TOKEN  cadena que tú inventas; la pegas también en el panel de Meta al registrar el webhook
 *   WHATSAPP_APP_SECRET    "App Secret" de tu app de Meta (Configuración → Básica) — firma de cada POST
 *   WHATSAPP_TOKEN         token de acceso permanente (usuario del sistema) con permiso whatsapp_business_messaging
 * Parámetro (se pide al desplegar):
 *   WHATSAPP_PHONE_NUMBER_ID  ID del número de teléfono de WhatsApp Business (no es el número en sí)
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { processIncoming } from "./processor.js";
import { isValidSignature, extractMessages } from "./signature.js";

initializeApp();
const db = getFirestore();

const VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");
const ACCESS_TOKEN = defineSecret("WHATSAPP_TOKEN");
const PHONE_NUMBER_ID = defineString("WHATSAPP_PHONE_NUMBER_ID");

const GRAPH_VERSION = "v21.0";

async function sendText(to, body) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID.value()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: false } }),
  });
  if (!res.ok) logger.error("Fallo al enviar respuesta", { status: res.status, detail: await res.text() });
}

export const whatsappWebhook = onRequest(
  { secrets: [VERIFY_TOKEN, APP_SECRET, ACCESS_TOKEN], region: "us-central1", maxInstances: 5 },
  async (req, res) => {
    // 1) Verificación del webhook (Meta hace un GET al registrarlo)
    if (req.method === "GET") {
      if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN.value()) {
        res.status(200).send(String(req.query["hub.challenge"] ?? ""));
      } else {
        res.sendStatus(403);
      }
      return;
    }
    if (req.method !== "POST") {
      res.sendStatus(405);
      return;
    }

    // 2) Autenticidad: solo Meta conoce el App Secret
    if (!isValidSignature(req.rawBody, req.get("x-hub-signature-256"), APP_SECRET.value())) {
      logger.warn("Firma inválida: petición descartada");
      res.sendStatus(401);
      return;
    }

    // 3) Procesar cada mensaje. Siempre se responde 200 al final: si Meta no recibe 200 reintenta,
    //    y los duplicados ya están cubiertos por la idempotencia (waMessages/{wamid}).
    for (const m of extractMessages(req.body)) {
      try {
        const reply =
          m.type === "text"
            ? await processIncoming(db, { from: m.from, text: m.text, wamid: m.wamid })
            : "Por ahora solo entiendo mensajes de texto. Escribe *ayuda* para ver los formatos.";
        if (reply) await sendText(m.from, reply);
      } catch (err) {
        logger.error("Error procesando mensaje", { wamid: m.wamid, err: String(err) });
        await sendText(m.from, "⚠️ Tuve un problema registrando eso. Inténtalo de nuevo en un momento.").catch(() => {});
      }
    }
    res.sendStatus(200);
  }
);
