import assert from "node:assert/strict";
import { simulatePayoff, requiredMonthlyBudget, monthlyRate } from "../src/lib/debtStrategies.js";
const D = [
  { id: "a", name: "Addi", balance: 2471351, rate: 29, minPayment: 0 },
  { id: "t", name: "Tarjeta", balance: 2938519, rate: 27, minPayment: 0 },
];
// 1) sin pagos: no es viable y no inventa billones
let r = simulatePayoff(D, 0, "snowball");
assert.equal(r.feasible, false); assert.equal(r.totalInterest, 0);
// 2) mínimos que no cubren intereses (≈112k/mes de interés)
r = simulatePayoff(D.map((d) => ({ ...d, minPayment: 20000 })), 0, "avalanche");
assert.equal(r.feasible, false); assert.ok(r.firstMonthInterest > 100000 && r.firstMonthInterest < 125000);
// 3) con 600k/mes sí termina, en un tiempo razonable, e interés << capital
r = simulatePayoff(D, 600000, "avalanche");
assert.equal(r.feasible, true); assert.ok(r.months >= 9 && r.months <= 11, "meses=" + r.months); assert.ok(r.totalInterest < 800000);
assert.equal(r.payoff.length, 2);
// 4) avalancha paga menos interés que bola de nieve cuando la deuda más chica NO es la de mayor tasa
const E = [
  { id: "x", name: "Chica barata", balance: 500000, rate: 10, minPayment: 20000 },
  { id: "y", name: "Grande cara", balance: 4000000, rate: 36, minPayment: 100000 },
];
const sn = simulatePayoff(E, 300000, "snowball"), av = simulatePayoff(E, 300000, "avalanche");
assert.ok(sn.feasible && av.feasible); assert.ok(av.totalInterest < sn.totalInterest, `${av.totalInterest} vs ${sn.totalInterest}`);
// 5) bola de nieve salda primero la chica
assert.equal(sn.payoff[0].id, "x");
// 6) los mínimos liberados ruedan hacia la deuda objetivo y las estrategias difieren sin pago extra
const F = [
  { id: "s", name: "S", balance: 200000, rate: 10, minPayment: 100000 },
  { id: "m", name: "M", balance: 1000000, rate: 12, minPayment: 30000 },
  { id: "h", name: "H", balance: 3000000, rate: 35, minPayment: 30000 },
];
const s1 = simulatePayoff(F, 0, "snowball"), a1 = simulatePayoff(F, 0, "avalanche");
assert.ok(s1.feasible && a1.feasible); assert.ok(a1.totalInterest < s1.totalInterest);
// 7) conservación: total pagado ≈ capital + interés
// 8) tasa mensual E.A.
assert.ok(Math.abs(monthlyRate(29) - 0.02147) < 0.0003);
// 9) presupuesto requerido
const need12 = requiredMonthlyBudget(D, 12), need24 = requiredMonthlyBudget(D, 24);
assert.ok(need12 > need24 && need24 > r.firstMonthInterest);
assert.ok(simulatePayoff(D, need12, "avalanche").months <= 12);
assert.equal(requiredMonthlyBudget([], 12), null);
// 10) sin deudas
assert.deepEqual(simulatePayoff([], 0, "snowball").months, 0);
// 11) con mínimos altos, el presupuesto requerido nunca baja de los mínimos
const M = D.map((d, i) => ({ ...d, minPayment: i ? 650000 : 600000 }));
assert.equal(requiredMonthlyBudget(M, 36), 1250000);
assert.ok(requiredMonthlyBudget(M, 3) > 1250000);
console.log("ok", { m600: r.months, i600: Math.round(r.totalInterest), need12, need24 });

// 12: con 2 deudas y sin dinero extra ambos métodos coinciden; con extra, la avalancha ahorra intereses
{
  const d = [
    { id: "t", name: "Tarjeta", balance: 4453397, rate: 27, minPayment: 600000 },
    { id: "a", name: "Addi", balance: 3527602, rate: 24.9, minPayment: 887147 },
  ];
  const s0 = simulatePayoff(d, 0, "snowball");
  const a0 = simulatePayoff(d, 0, "avalanche");
  assert.equal(Math.round(s0.totalInterest), Math.round(a0.totalInterest));
  const s1 = simulatePayoff(d, 200000, "snowball");
  const a1 = simulatePayoff(d, 200000, "avalanche");
  assert.ok(a1.totalInterest < s1.totalInterest);
  assert.notEqual(s1.payoff[0].month, a1.payoff[0].month);
  console.log("ok 12: métodos coinciden sin extra y difieren con extra");
}
