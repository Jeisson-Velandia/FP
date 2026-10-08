import { test } from "node:test";
import assert from "node:assert/strict";
import { processIncoming } from "../processor.js";
import crypto from "node:crypto";

/** Firestore mínimo en memoria: solo lo que usa processor.js. */
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const ref = (path) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => structuredClone(store.get(path)) }),
  });
  return {
    store,
    doc: ref,
    runTransaction: async (fn) => {
      const writes = [];
      const tx = {
        get: (r) => r.get(),
        set: (r, v) => writes.push(["set", r.path, structuredClone(v)]),
        delete: (r) => writes.push(["del", r.path]),
      };
      const out = await fn(tx);
      for (const [op, path, v] of writes) op === "set" ? store.set(path, v) : store.delete(path);
      return out;
    },
  };
}

const NOW = new Date("2026-10-08T19:30:00Z"); // 14:30 en Bogotá
const profile = () => ({
  incomes: [{ id: "i1", name: "Salario", amount: 3500000, frequency: "mensual" }],
  debts: [
    { id: "d1", name: "Davivienda", balance: 1000000, rate: 24, minPayment: 100000, kind: "tarjeta", limit: 4000000 },
    { id: "d2", name: "Préstamo moto", balance: 300000, rate: 12, minPayment: 50000, kind: "prestamo" },
  ],
  budgets: { comida: 500000 },
  transactions: [],
  savingsGoals: { monthly: 0, annual: 0 },
});
const seed = () => ({ "phoneLinks/573001": { uid: "u1" }, "profiles/u1": profile() });
let n = 0;
const send = (db, text, from = "573001") => processIncoming(db, { from, text, wamid: "w" + ++n, now: NOW });

test("gasto: guarda con ID, fecha de Bogotá y responde con balance restante", async () => {
  const db = fakeDb(seed());
  const r = await send(db, "50000 comida almuerzo");
  const p = db.store.get("profiles/u1");
  assert.equal(p.transactions.length, 1);
  assert.equal(p.transactions[0].source, "whatsapp");
  assert.equal(p.transactions[0].date, "2026-10-08");
  assert.match(r, new RegExp("#" + p.transactions[0].id));
  assert.match(r, /\$3\.450\.000/);
  assert.match(r, /Presupuesto Comida: te quedan \$450\.000/);
});

test("pago a deuda por nombre baja el saldo; préstamo saldado se elimina", async () => {
  const db = fakeDb(seed());
  await send(db, "200000 deuda pago tarjeta");
  assert.equal(db.store.get("profiles/u1").debts.find((d) => d.id === "d1").balance, 800000);
  const r = await send(db, "300000 deuda cuota moto");
  assert.match(r, /saldada/);
  assert.equal(db.store.get("profiles/u1").debts.some((d) => d.id === "d2"), false);
});

test("consumo a crédito: suma al saldo, no resta del balance en efectivo", async () => {
  const db = fakeDb(seed());
  const r = await send(db, "100000 comida cena con davivienda");
  const p = db.store.get("profiles/u1");
  assert.equal(p.debts.find((d) => d.id === "d1").balance, 1100000);
  assert.equal(p.transactions[0].chargeDebtId, "d1");
  assert.match(r, /Cupo disponible: \$2\.900\.000/);
  assert.match(r, /\$3\.500\.000/);
});

test("pago ambiguo pide aclarar y no escribe", async () => {
  const db = fakeDb(seed());
  const r = await send(db, "10000 deuda pago");
  assert.match(r, /cuál deuda/i);
  assert.equal(db.store.get("profiles/u1").transactions.length, 0);
});

test("idempotencia: el mismo wamid no se registra dos veces", async () => {
  const db = fakeDb(seed());
  await processIncoming(db, { from: "573001", text: "1000 comida", wamid: "dup", now: NOW });
  const again = await processIncoming(db, { from: "573001", text: "1000 comida", wamid: "dup", now: NOW });
  assert.equal(again, null);
  assert.equal(db.store.get("profiles/u1").transactions.length, 1);
});

test("deshacer revierte el saldo de la deuda", async () => {
  const db = fakeDb(seed());
  await send(db, "200000 deuda pago tarjeta");
  const r = await send(db, "deshacer");
  assert.match(r, /Deshice/);
  assert.equal(db.store.get("profiles/u1").debts.find((d) => d.id === "d1").balance, 1000000);
  assert.equal(db.store.get("profiles/u1").transactions.length, 0);
});

test("número sin vincular no puede registrar", async () => {
  const db = fakeDb(seed());
  const r = await send(db, "5000 comida", "573999");
  assert.match(r, /no está vinculado/);
});

test("vincular: código válido de un solo uso; inválido se frena a los 5 intentos", async () => {
  const db = fakeDb({ "profiles/u2": profile(), "linkCodes/123456": { uid: "u2", expiresAt: NOW.getTime() + 60000 } });
  assert.match(await send(db, "vincular 123456", "573777"), /vinculado/);
  assert.equal(db.store.get("phoneLinks/573777").uid, "u2");
  assert.equal(db.store.has("linkCodes/123456"), false);
  for (let i = 0; i < 5; i++) assert.match(await send(db, "vincular 000000", "573888"), /inválido/);
  assert.match(await send(db, "vincular 000000", "573888"), /Demasiados/);
});

test("código vencido no vincula", async () => {
  const db = fakeDb({ "linkCodes/111111": { uid: "u2", expiresAt: NOW.getTime() - 1 } });
  assert.match(await send(db, "vincular 111111", "573555"), /inválido o vencido/);
  assert.equal(db.store.has("phoneLinks/573555"), false);
});

test("saldo resume el mes", async () => {
  const db = fakeDb(seed());
  await send(db, "ingreso 500000 freelance");
  assert.match(await send(db, "saldo"), /Balance: \*\$4\.000\.000\*/);
});

test("firma HMAC", async () => {
  const { isValidSignature } = await import("../signature.js");
  const body = Buffer.from('{"a":1}');
  const sig = "sha256=" + crypto.createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(isValidSignature(body, sig, "secret"), true);
  assert.equal(isValidSignature(body, sig, "otro"), false);
  assert.equal(isValidSignature(body, "sha256=abc", "secret"), false);
  assert.equal(isValidSignature(body, undefined, "secret"), false);
});
