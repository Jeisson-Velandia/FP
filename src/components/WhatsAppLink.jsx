import React, { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, setDoc, deleteDoc, doc } from "firebase/firestore";
import { MessageCircle, Link2, Unlink, Copy, Check, RefreshCw } from "lucide-react";
import { db } from "../firebase";

const CODE_TTL_MS = 10 * 60 * 1000;
// Número de WhatsApp Business del bot (solo dígitos, con código de país). Se define al compilar:
// VITE_WHATSAPP_BOT_NUMBER=573001234567 — si no existe, se oculta el botón "Abrir WhatsApp".
const BOT_NUMBER = import.meta.env.VITE_WHATSAPP_BOT_NUMBER || "";

const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));
/** 573001234567 → +57 300 123 4567 (formato simple, solo para mostrar). */
const maskPhone = (p) => (p.length > 6 ? `+${p.slice(0, 2)} ••• ••• ${p.slice(-4)}` : `+${p}`);

/**
 * Panel para vincular el WhatsApp del usuario con su cuenta (Requerimiento 5).
 *
 * Flujo: la app crea `linkCodes/{código}` con el uid del usuario (vigente 10 min, lo permite
 * firestore.rules solo para el propio uid). El usuario envía "vincular <código>" al bot; la Cloud
 * Function valida el código, crea `phoneLinks/{teléfono}` y lo borra. El número lo certifica
 * WhatsApp, así que nadie puede escribir en tu cuenta sin conocer un código que solo tú ves.
 *
 * @param {{ user: import("firebase/auth").User }} props
 */
export default function WhatsAppLink({ user }) {
  const [phones, setPhones] = useState(/** @type {string[]} */ ([]));
  const [code, setCode] = useState(/** @type {{ value: string, expiresAt: number }|null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadPhones = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, "phoneLinks"), where("uid", "==", user.uid)));
      setPhones(snap.docs.map((d) => d.id));
    } catch {
      setPhones([]);
    }
  }, [user.uid]);

  useEffect(() => {
    loadPhones();
  }, [loadPhones]);

  // Cuenta regresiva del código y refresco de los números enlazados mientras hay un código activo.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => {
      setNow(Date.now());
      loadPhones();
    }, 3000);
    return () => clearInterval(t);
  }, [code, loadPhones]);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      // Reintenta si el código ya existe (la regla prohíbe sobrescribir).
      for (let attempt = 0; attempt < 5; attempt++) {
        const value = randomCode();
        const expiresAt = Date.now() + CODE_TTL_MS;
        try {
          await setDoc(doc(db, "linkCodes", value), { uid: user.uid, expiresAt, createdAt: Date.now() });
          setCode({ value, expiresAt });
          setNow(Date.now());
          return;
        } catch (e) {
          if (attempt === 4) throw e;
        }
      }
    } catch {
      setError("No pude generar el código. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (phone) => {
    if (!window.confirm("¿Desvincular este número de WhatsApp?")) return;
    try {
      await deleteDoc(doc(db, "phoneLinks", phone));
      setPhones((p) => p.filter((x) => x !== phone));
    } catch {
      setError("No pude desvincular el número.");
    }
  };

  const message = code ? `vincular ${code.value}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* el usuario puede copiar el texto a mano */
    }
  };

  const secondsLeft = code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0;
  const expired = code && secondsLeft === 0;

  return (
    <div className="ledger-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={18} style={{ color: "var(--green)" }} />
        <h3 className="font-display text-base">Registrar por WhatsApp</h3>
      </div>
      <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
        Vincula tu número y escribe al bot cosas como <span className="font-mono-num">50000 comida almuerzo</span> o{" "}
        <span className="font-mono-num">200000 deuda pago tarjeta</span>. Te responde con el ID del movimiento y lo que te queda del mes.
      </p>

      {phones.length > 0 && (
        <div className="divide-y hairline">
          {phones.map((p) => (
            <div key={p} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2">
                <Link2 size={14} style={{ color: "var(--green)" }} /> {maskPhone(p)} <span style={{ color: "var(--ink-dim)" }}>vinculado</span>
              </span>
              <button onClick={() => unlink(p)} className="flex items-center gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
                <Unlink size={14} /> Desvincular
              </button>
            </div>
          ))}
        </div>
      )}

      {code && !expired ? (
        <div className="rounded p-4 space-y-3" style={{ border: "1px solid var(--brass)" }}>
          <p className="text-sm">Desde tu WhatsApp, envía este mensaje al bot:</p>
          <div className="flex items-center gap-2">
            <code className="font-mono-num text-lg px-3 py-1 rounded" style={{ background: "rgba(255,255,255,0.06)" }}>{message}</code>
            <button onClick={copy} className="btn-ghost rounded px-2 py-1 text-xs flex items-center gap-1" aria-label="Copiar mensaje">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Vence en {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} y sirve una sola vez.
          </p>
          {BOT_NUMBER && (
            <a
              href={`https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-brass rounded px-3 py-2 text-sm font-medium inline-flex items-center gap-2"
            >
              <MessageCircle size={15} /> Abrir WhatsApp
            </a>
          )}
        </div>
      ) : (
        <button onClick={generate} disabled={busy} className="btn-brass rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
          {expired ? <RefreshCw size={15} /> : <Link2 size={15} />}
          {busy ? "Generando…" : expired ? "Código vencido · generar otro" : phones.length ? "Vincular otro número" : "Generar código de vinculación"}
        </button>
      )}
      {error && (
        <p className="text-xs" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
