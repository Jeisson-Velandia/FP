import test from "node:test";
import assert from "node:assert/strict";
import { analyze, adviceReply, isInterestLike, isLoanLikeIncome } from "../src/lib/advisor.js";
import { parseMessage } from "../src/lib/messageParser.js";
import { applyCommand } from "../src/lib/quickEntry.js";

const TODAY = "2026-11-20";
const base = () => ({
  incomes: [{ id: "i1", name: "Sueldo", amount: 3000000, frequency: "mensual" }],
  debts: [
    { id: "d1", name: "Tarjeta", kind: "tarjeta", balance: 4000000, rate: 27, minPayment: 600000, limit: 5000000 },
    { id: "d2", name: "Addi", kind: "prestamo", balance: 3500000, rate: 29, minPayment: 0 },
  ],
  budgets: { comida: 500000, entretenimiento: 200000 },
  transactions: [],
  savingsGoals: { monthly: 0, annual: 0 },
});
const keys = (res) => res.alerts.map((a) => a.key);

test("cuenta vacía: invita a registrar", () => {
  const res = analyze({ incomes: [], debts: [], budgets: {}, transactions: [] }, TODAY);
  assert.deepEqual(keys(res), ["empty"]);
});

test("presupuesto excedido genera alerta con cifras", () => {
  const d = base();
  d.transactions = [{ id: "t1", type: "gasto", category: "comida", amount: 700000, date: "2026-11-05", description: "mercado" }];
  const a = analyze(d, TODAY).alerts.find((x) => x.key === "budget-over");
  assert.ok(a && a.severity === "alta");
  assert.match(a.detail, /700\.000/);
});

test("deuda que crece el mes anterior es alerta alta y nombra el mayor consumo", () => {
  const d = base();
  d.transactions = [
    { id: "p", type: "gasto", category: "deuda", amount: 1000000, date: "2026-10-03", debtId: "d1", debtDelta: -1000000, description: "pago" },
    { id: "c", type: "gasto", category: "comida", amount: 2500000, date: "2026-10-10", chargeDebtId: "d1", debtDelta: 2500000, description: "Viaje" },
  ];
  const a = analyze(d, TODAY).alerts.find((x) => x.key === "debt-growth:2026-10");
  assert.ok(a && a.severity === "alta");
  assert.match(a.detail, /Viaje/);
});

test("ingreso tipo crédito se pregunta con empatía y no se cuenta como ingreso real", () => {
  const d = base();
  d.transactions = [{ id: "l", type: "ingreso", category: "ingreso", amount: 245000, date: "2026-10-28", description: "Crédito Lulo" }];
  assert.ok(isLoanLikeIncome(d.transactions[0]));
  const a = analyze(d, TODAY).alerts.find((x) => x.key === "loan:l");
  assert.ok(a);
  assert.match(a.tip, /mínimo de una tarjeta es una salida válida/);
  assert.equal(analyze(d, TODAY).months[1].loanIncome, 245000);
});

test("intereses mal categorizados se detectan", () => {
  const d = base();
  const t = { id: "x", type: "gasto", category: "otros", amount: 150000, date: "2026-11-02", chargeDebtId: "d2", debtDelta: 150000, description: "Intereses Addi" };
  assert.ok(isInterestLike(t));
  d.transactions = [t];
  assert.ok(keys(analyze(d, TODAY)).includes("interest-misfiled"));
  t.category = "intereses";
  assert.ok(!keys(analyze(d, TODAY)).includes("interest-misfiled"));
});

test("tasa cobrada mayor a la registrada se señala", () => {
  const d = base();
  d.transactions = [{ id: "x", type: "gasto", category: "intereses", amount: 160000, date: "2026-11-02", chargeDebtId: "d2", debtDelta: 160000, description: "Intereses Addi" }];
  assert.ok(keys(analyze(d, TODAY)).includes("rate:d2"));
});

test("faltan mínimos y plan inviable", () => {
  const d = base();
  assert.ok(keys(analyze(d, TODAY)).includes("no-min"));
  d.debts[1].minPayment = 10000;
  d.debts[0].minPayment = 10000;
  assert.ok(keys(analyze(d, TODAY)).includes("plan-infeasible"));
});

test("descartar oculta por mes y restaurar vuelve", () => {
  const d = base();
  const first = analyze(d, TODAY).alerts.find((a) => a.key === "no-min");
  d.advisorDismissed = [first.id];
  assert.ok(!keys(analyze(d, TODAY)).includes("no-min"));
  assert.ok(keys(analyze(d, "2026-12-02")).includes("no-min"));
});

test("alertas ordenadas por severidad y nunca lanza con datos incompletos", () => {
  const res = analyze({}, TODAY);
  assert.ok(Array.isArray(res.alerts));
  const d = base();
  d.transactions = [{ id: "t", type: "gasto", category: "comida", amount: 900000, date: "2026-11-01" }];
  const sev = analyze(d, TODAY).alerts.map((a) => a.severity);
  const rank = { alta: 0, media: 1, info: 2, bien: 3 };
  assert.deepEqual(sev, [...sev].sort((a, b) => rank[a] - rank[b]));
});

test("chat: 'como voy' devuelve consejos sin modificar datos; 'intereses' se reconoce", () => {
  assert.equal(parseMessage("Cómo voy").kind, "advice");
  const r = applyCommand(base(), parseMessage("como voy"), { today: TODAY, newId: () => "1", source: "chat" });
  assert.equal(r.data, null);
  assert.match(r.reply, /Asesor/);
  assert.match(adviceReply(base(), TODAY), /Asesor/);
  const c = parseMessage("40000 intereses tarjeta");
  assert.equal(c.category, "intereses");
});
