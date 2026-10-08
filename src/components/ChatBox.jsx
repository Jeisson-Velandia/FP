import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { parseMessage } from "../lib/messageParser.js";
import { applyCommand } from "../lib/quickEntry.js";
import { todayStr } from "../lib/format.js";

const EXAMPLES = ["50000 comida almuerzo", "120000 transporte gasolina", "200000 deuda pago tarjeta", "saldo"];

const HELP =
  "Escríbeme tus movimientos así:\n• `50000 comida almuerzo`\n• `120000 transporte gasolina`\n• `200000 deuda pago tarjeta`\n• `35000 comida cena con davivienda` (consumo a tarjeta)\n• `ingreso 1500000 freelance`\nTambién: `saldo` y `deshacer`.";

const GREETING = "👋 Hola, registra un gasto escribiéndolo como lo dirías. Por ejemplo: `50000 comida almuerzo`.";

const newId = () => Math.random().toString(36).slice(2, 8);

/** Renderiza *negrita* y `código` en una línea de texto. */
function Line({ text }) {
  const parts = text.split(/(\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : p.startsWith("`") ? (
          <code key={i} className="chat-code">
            {p.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

/**
 * Cuadro de chat para registrar movimientos escribiendo en lenguaje natural.
 * Usa el mismo parser y la misma lógica de registro que el bot de WhatsApp (lib/quickEntry.js).
 *
 * @param {{
 *   data: { incomes: any[], debts: any[], budgets: Record<string, number>, transactions: any[] },
 *   onApply: (next: { debts: any[], transactions: any[] }) => void,
 *   compact?: boolean,
 * }} props
 */
export default function ChatBox({ data, onApply, compact = false }) {
  const [messages, setMessages] = useState([{ from: "bot", text: GREETING }]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const send = (raw) => {
    const text = raw.trim();
    if (!text) return;
    const cmd = parseMessage(text);
    let reply;
    if (cmd.kind === "help") reply = HELP;
    else if (cmd.kind === "unknown") reply = `🤔 ${cmd.reason}`;
    else if (cmd.kind === "link") reply = "Para vincular WhatsApp usa el código desde la pestaña Datos y envíalo allá, no aquí.";
    else {
      const result = applyCommand(data, cmd, { today: todayStr(), newId, source: "chat" });
      reply = result.reply;
      if (result.data) onApply(result.data);
    }
    setMessages((m) => [...m, { from: "me", text }, { from: "bot", text: reply }].slice(-40));
    setInput("");
  };

  return (
    <div className="ledger-card chat-card">
      <div className="chat-head">
        <Sparkles size={16} style={{ color: "var(--brass)" }} />
        <h3 className="font-display text-base">Registro rápido</h3>
        <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
          escribe como en WhatsApp
        </span>
      </div>

      <div className="chat-log" style={compact ? { maxHeight: 180 } : undefined} role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            {m.text.split("\n").map((line, j) => (
              <div key={j}>
                <Line text={line} />
              </div>
            ))}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat-chips">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" className="chip" onClick={() => setInput(e)}>
            {e}
          </button>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="50000 comida almuerzo"
          autoComplete="off"
          enterKeyHint="send"
          aria-label="Escribe un movimiento"
        />
        <button type="submit" className="btn-brass chat-send" aria-label="Enviar" disabled={!input.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
