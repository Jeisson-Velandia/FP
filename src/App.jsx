import React, { useState, useMemo, useRef, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "./firebase";
import { useAuth } from "./useAuth";
import AuthScreen from "./AuthScreen.jsx";
import { getCategoryColor } from "./lib/categoryColors.js";
import { CategoryBadge } from "./components/CategoryVisuals.jsx";
import { fmt, todayStr, thisMonthKey, thisYear, thisMonthIndex } from "./lib/format.js";
import { buildMonthlySummaries } from "./lib/annualSummary.js";
import AnnualSummary from "./components/AnnualSummary.jsx";
import SavingsGoalsModule from "./components/SavingsGoals.jsx";
import ChatBox from "./components/ChatBox.jsx";
import WhatsAppLink from "./components/WhatsAppLink.jsx";
import DebtManager from "./components/DebtManager.jsx";
import { applyTxToDebts, reverseTxOnDebts, isCreditCharge } from "./lib/debts.js";
import {
  LayoutDashboard, Settings2, ListChecks, Mountain, Save, Home, Utensils,
  Car, Film, HeartPulse, MoreHorizontal, PlusCircle, Trash2, Pencil, X,
  Download, Upload, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  CheckCircle2, Snowflake, RotateCcw, Copy, Check, CreditCard, LogOut, CloudOff,
  PiggyBank, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

/* ---------------------------------- data ---------------------------------- */

// El color de cada categoría viene de la paleta centralizada en lib/categoryColors.js
// (Requerimiento 1) — aquí solo se añade el ícono, que es un detalle de esta UI concreta.
const CATEGORIES = [
  { id: "vivienda", label: "Vivienda", icon: Home, color: getCategoryColor("vivienda").hex },
  { id: "comida", label: "Comida", icon: Utensils, color: getCategoryColor("comida").hex },
  { id: "transporte", label: "Transporte", icon: Car, color: getCategoryColor("transporte").hex },
  { id: "entretenimiento", label: "Entretenimiento", icon: Film, color: getCategoryColor("entretenimiento").hex },
  { id: "salud", label: "Salud", icon: HeartPulse, color: getCategoryColor("salud").hex },
  { id: "deuda", label: "Deuda", icon: CreditCard, color: getCategoryColor("deuda").hex },
  { id: "ahorro", label: "Ahorro", icon: PiggyBank, color: getCategoryColor("ahorro").hex },
  { id: "otros", label: "Otros", icon: MoreHorizontal, color: getCategoryColor("otros").hex },
];
const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const FREQ_FACTORS = { mensual: 1, quincenal: 2, semanal: 4.33, variable: 1 };
const FREQ_LABEL = { mensual: "Mensual", quincenal: "Quincenal", semanal: "Semanal", variable: "Variable" };

// JSON con llaves ordenadas: Firestore no garantiza el orden de las llaves, y sin esto dos objetos
// idénticos podrían parecer distintos al compararlos.
const stableStringify = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x
  );

const uid = () => Math.random().toString(36).slice(2, 10);
// fmt, todayStr y thisMonthKey ahora viven en ./lib/format.js (ver imports arriba)

const EMPTY_DEBT_FORM = { id: null, name: "", balance: "", rate: "", minPayment: "", kind: "prestamo", limit: "" };
const EMPTY_TX_FORM = () => ({ id: null, type: "gasto", amount: "", category: "comida", date: todayStr(), description: "", debtId: "", chargeDebtId: "" });
// Categorías en las que se puede consumir a crédito: un pago a deuda o un ahorro no se "cargan" a una tarjeta.
const CHARGEABLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "deuda" && c.id !== "ahorro");

const emptyState = { incomes: [], debts: [], budgets: {}, transactions: [], savingsGoals: { monthly: 0, annual: 0 } };
const STORAGE_KEY = "finanzas-personales-v1";

/* ------------------------------- debt engine ------------------------------- */

function simulateDebts(debts, extraPayment, strategy) {
  const working = debts.map((d) => ({ ...d }));
  if (working.length === 0) return { months: 0, totalInterest: 0, order: [] };
  const sortFn =
    strategy === "snowball" ? (a, b) => a.balance - b.balance : (a, b) => b.rate - a.rate;
  let months = 0;
  let totalInterest = 0;
  const paidOrder = [];
  const maxMonths = 720;
  while (working.some((d) => d.balance > 0.01) && months < maxMonths) {
    months++;
    working.forEach((d) => {
      if (d.balance > 0) {
        const interest = (d.balance * (d.rate / 100)) / 12;
        totalInterest += interest;
        d.balance += interest;
      }
    });
    working.forEach((d) => {
      if (d.balance > 0) d.balance -= Math.min(d.minPayment, d.balance);
    });
    let extra = extraPayment;
    const targets = working.filter((d) => d.balance > 0).sort(sortFn);
    for (const d of targets) {
      if (extra <= 0) break;
      const pay = Math.min(extra, d.balance);
      d.balance -= pay;
      extra -= pay;
    }
    working.forEach((d) => {
      if (d.balance <= 0.01 && !paidOrder.includes(d.id)) paidOrder.push(d.id);
    });
  }
  return { months, totalInterest, order: paidOrder };
}

/* --------------------------------- pieces ---------------------------------- */

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Stamp({ status }) {
  const map = {
    verde: { text: "Saludable", sub: "Vas dentro de tu presupuesto", color: "var(--green)", icon: CheckCircle2 },
    amarillo: { text: "Precaución", sub: "Alguna categoría está cerca del límite", color: "var(--amber)", icon: AlertTriangle },
    rojo: { text: "Alerta", sub: "Superaste un límite o tu balance", color: "var(--red)", icon: AlertTriangle },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <div className="stamp shrink-0 w-full sm:w-44 flex sm:flex-col items-center justify-center gap-2 text-center px-4 py-4" style={{ color: s.color }}>
      <Icon size={28} />
      <div>
        <span className="font-display text-base block leading-tight">{s.text}</span>
        <span className="text-[11px] leading-tight block" style={{ color: "var(--ink-dim)" }}>{s.sub}</span>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`tab-btn flex items-center gap-3 px-4 py-3 w-full text-left text-sm transition-colors ${
        active ? "active" : ""
      }`}
      style={{ color: active ? "var(--brass)" : "var(--ink-dim)" }}
    >
      <Icon size={17} />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function BottomNavButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 ${active ? "on" : ""}`}
      style={{ color: active ? "var(--brass)" : "var(--ink-dim)" }}
    >
      <Icon size={21} />
      <span className="text-[11px] font-medium leading-none text-center">{label}</span>
    </button>
  );
}

/* ---------------------------------- app ------------------------------------ */

function FinanzasApp({ user, onLogout }) {
  const [state, setState] = useState(() => {
    // Carga instantánea desde la caché local (evita pantalla en blanco) mientras llega la nube
    try {
      const cached = localStorage.getItem(STORAGE_KEY + "-" + user.uid);
      return cached ? { ...emptyState, ...JSON.parse(cached) } : emptyState;
    } catch {
      return emptyState;
    }
  });
  const [cloudReady, setCloudReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const fileInputRef = useRef(null);

  // Sincronización en vivo con Firestore. Además de la carga inicial, escuchamos cambios remotos porque
  // el bot de WhatsApp también escribe en este documento: sin esto, un movimiento registrado por el
  // celular quedaría pisado por el siguiente guardado de la app abierta.
  const lastSyncedRef = useRef(null); // JSON estable de lo último que coincide con la nube
  const dirtyRef = useRef(false); // hay cambios locales aún sin confirmar en la nube
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let active = true;
    const unsub = onSnapshot(
      doc(db, "profiles", user.uid),
      (snap) => {
        if (!active) return;
        if (snap.exists() && !snap.metadata.hasPendingWrites && !dirtyRef.current) {
          const remote = { ...emptyState, ...snap.data() };
          const json = stableStringify(remote);
          if (json !== lastSyncedRef.current) {
            lastSyncedRef.current = json;
            setState(remote);
          }
        }
        setCloudReady(true);
      },
      () => {
        if (!active) return;
        setSyncError("No se pudo conectar con la nube. Tus cambios se están guardando solo en este dispositivo por ahora.");
        setCloudReady(true);
      }
    );
    return () => {
      active = false;
      unsub();
    };
  }, [user.uid]);

  // Autosave: caché local instantánea + sincronización a la nube (con pequeño debounce)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY + "-" + user.uid, JSON.stringify(state));
    } catch {
      /* almacenamiento local no disponible, ignorar */
    }
    if (!cloudReady) return; // evita sobrescribir la nube con el estado vacío antes de que llegue la primera carga
    const json = stableStringify(state);
    if (json === lastSyncedRef.current) return; // ya está en la nube (p. ej. llegó desde WhatsApp)
    dirtyRef.current = true;
    const timeout = setTimeout(() => {
      setDoc(doc(db, "profiles", user.uid), state)
        .then(() => {
          lastSyncedRef.current = json;
          if (stableStringify(stateRef.current) === json) dirtyRef.current = false;
        })
        .catch(() => {
          setSyncError("No se pudo guardar en la nube. Revisa tu conexión — tus datos siguen a salvo en este dispositivo.");
        });
    }, 600);
    return () => clearTimeout(timeout);
  }, [state, cloudReady, user.uid]);

  /* ---- setup forms ---- */
  const [incomeForm, setIncomeForm] = useState({ name: "", amount: "", frequency: "mensual" });
  const [debtForm, setDebtForm] = useState(EMPTY_DEBT_FORM);
  const [extraPayment, setExtraPayment] = useState(0);

  /* ---- transaction form ---- */
  const [txForm, setTxForm] = useState(EMPTY_TX_FORM);
  const [copyState, setCopyState] = useState("idle");

  /* ------------------------------ derived data ------------------------------ */

  const monthlyIncomeTotal = useMemo(
    () => state.incomes.reduce((sum, i) => sum + Number(i.amount) * (FREQ_FACTORS[i.frequency] || 1), 0),
    [state.incomes]
  );

  const monthTx = useMemo(
    () => state.transactions.filter((t) => t.date.slice(0, 7) === thisMonthKey()),
    [state.transactions]
  );
  const extraIncomeMes = useMemo(
    () => monthTx.filter((t) => t.type === "ingreso").reduce((s, t) => s + Number(t.amount), 0),
    [monthTx]
  );
  // Gasto en efectivo: lo que realmente salió de tu cuenta. Los consumos con tarjeta aún no salieron;
  // saldrán cuando pagues la tarjeta (movimiento de categoría "deuda").
  const gastoMes = useMemo(
    () => monthTx.filter((t) => t.type === "gasto" && !isCreditCharge(t)).reduce((s, t) => s + Number(t.amount), 0),
    [monthTx]
  );
  const creditChargesMes = useMemo(
    () => monthTx.filter(isCreditCharge).reduce((s, t) => s + Number(t.amount), 0),
    [monthTx]
  );
  const ingresoMes = monthlyIncomeTotal + extraIncomeMes;
  const balanceMes = ingresoMes - gastoMes;

  // Resumen mensual del año en curso, reutilizado por el módulo de Metas de Ahorro (Requerimiento 3).
  // El histórico anual completo (Requerimiento 2) vive dentro de <AnnualSummary>, que recalcula por su
  // cuenta según el año que el usuario elija en su propio selector.
  const monthsThisYear = useMemo(
    () => buildMonthlySummaries(state.transactions, thisYear()),
    [state.transactions]
  );
  const setSavingsGoals = (goals) => setState((s) => ({ ...s, savingsGoals: goals }));

  const categorySpend = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => (map[c.id] = 0));
    monthTx
      .filter((t) => t.type === "gasto")
      .forEach((t) => (map[t.category] = (map[t.category] || 0) + Number(t.amount)));
    return map;
  }, [monthTx]);

  const budgetRows = CATEGORIES.map((c) => {
    const limit = Number(state.budgets[c.id] || 0);
    const spent = categorySpend[c.id] || 0;
    const pct = limit > 0 ? spent / limit : spent > 0 ? 2 : 0;
    const status = limit === 0 ? (spent > 0 ? "amarillo" : "verde") : pct >= 1 ? "rojo" : pct >= 0.75 ? "amarillo" : "verde";
    return { ...c, limit, spent, pct, status };
  });

  const overallStatus = useMemo(() => {
    if (balanceMes < 0 || budgetRows.some((b) => b.status === "rojo")) return "rojo";
    if (budgetRows.some((b) => b.status === "amarillo")) return "amarillo";
    return "verde";
  }, [budgetRows, balanceMes]);

  // Una tarjeta en $0 sigue existiendo (es rotativa) pero no entra en las estrategias de pago.
  const activeDebts = useMemo(() => state.debts.filter((d) => Number(d.balance) > 0.01), [state.debts]);
  const totalDebt = useMemo(() => state.debts.reduce((s, d) => s + Number(d.balance), 0), [state.debts]);

  const snowball = useMemo(() => simulateDebts(activeDebts, Number(extraPayment) || 0, "snowball"), [activeDebts, extraPayment]);
  const avalanche = useMemo(() => simulateDebts(activeDebts, Number(extraPayment) || 0, "avalanche"), [activeDebts, extraPayment]);
  const recommendation = useMemo(() => {
    if (activeDebts.length === 0) return null;
    const diff = snowball.totalInterest - avalanche.totalInterest;
    if (diff > Math.max(50, avalanche.totalInterest * 0.05)) {
      return { key: "avalancha", reason: `Ahorras aprox. ${fmt(diff)} en intereses frente al método bola de nieve.` };
    }
    return { key: "bola de nieve", reason: "La diferencia de interés entre métodos es pequeña; la bola de nieve te da victorias rápidas que ayudan a mantener el hábito." };
  }, [activeDebts, snowball, avalanche]);

  /* --------------------------------- actions --------------------------------- */

  const addIncome = () => {
    if (!incomeForm.name || !incomeForm.amount) return;
    setState((s) => ({ ...s, incomes: [...s.incomes, { id: uid(), name: incomeForm.name, amount: Number(incomeForm.amount), frequency: incomeForm.frequency }] }));
    setIncomeForm({ name: "", amount: "", frequency: "mensual" });
  };
  const removeIncome = (id) => setState((s) => ({ ...s, incomes: s.incomes.filter((i) => i.id !== id) }));

  // Crea una deuda nueva o, si debtForm.id existe, actualiza la existente (permite convertir una deuda
  // antigua en tarjeta y ponerle cupo).
  const addDebt = () => {
    if (!debtForm.name || debtForm.balance === "") return;
    const data = {
      name: debtForm.name,
      balance: Number(debtForm.balance) || 0,
      rate: Number(debtForm.rate) || 0,
      minPayment: Number(debtForm.minPayment) || 0,
      kind: debtForm.kind === "tarjeta" ? "tarjeta" : "prestamo",
      limit: debtForm.kind === "tarjeta" ? Number(debtForm.limit) || 0 : 0,
    };
    setState((s) => ({
      ...s,
      debts: debtForm.id
        ? s.debts.map((d) => (d.id === debtForm.id ? { ...d, ...data } : d))
        : [...s.debts, { id: uid(), ...data }],
    }));
    setDebtForm(EMPTY_DEBT_FORM);
  };
  const editDebt = (d) =>
    setDebtForm({
      id: d.id,
      name: d.name,
      balance: String(d.balance),
      rate: String(d.rate ?? ""),
      minPayment: String(d.minPayment ?? ""),
      kind: d.kind === "tarjeta" ? "tarjeta" : "prestamo",
      limit: d.limit ? String(d.limit) : "",
    });
  const removeDebt = (id) => setState((s) => ({ ...s, debts: s.debts.filter((d) => d.id !== id) }));

  const setBudget = (catId, val) =>
    setState((s) => ({ ...s, budgets: { ...s.budgets, [catId]: val === "" ? "" : Number(val) } }));

  /**
   * Punto único por donde pasa todo movimiento nuevo o editado. Garantiza el "doble registro":
   * la transacción queda guardada con su categoría y, si apunta a una deuda, el saldo se ajusta
   * en la misma actualización de estado (nunca quedan desincronizados).
   * `replacingId`: si se está editando, primero se revierte el efecto de la versión anterior.
   */
  const commitTransaction = (tx, replacingId = null) => {
    let debts = state.debts;
    let transactions = state.transactions;
    if (replacingId) {
      const prev = state.transactions.find((t) => t.id === replacingId);
      if (prev) debts = reverseTxOnDebts(debts, prev);
      transactions = transactions.filter((t) => t.id !== replacingId);
    }
    const applied = applyTxToDebts(debts, tx);
    const saved = { ...tx, debtDelta: applied.delta };
    const idx = replacingId ? state.transactions.findIndex((t) => t.id === replacingId) : -1;
    transactions = idx >= 0
      ? [...transactions.slice(0, idx), saved, ...transactions.slice(idx)]
      : [saved, ...transactions];
    if (applied.settledDebt) {
      const name = applied.settledDebt.name;
      setTimeout(() => alert(`¡Bien hecho! "${name}" quedó saldada y se eliminó automáticamente de tus deudas.`), 100);
    }
    setState((s) => ({ ...s, debts: applied.debts, transactions }));
  };

  const submitTx = () => {
    if (!txForm.amount || !txForm.date) return;
    const category = txForm.type === "ingreso" ? "ingreso" : txForm.category;
    const isPayment = txForm.type === "gasto" && category === "deuda" && !!txForm.debtId;
    const isCharge = txForm.type === "gasto" && category !== "deuda" && category !== "ahorro" && !!txForm.chargeDebtId;
    const debtId = isPayment ? txForm.debtId : null;
    const chargeDebtId = isCharge ? txForm.chargeDebtId : null;
    const linked = state.debts.find((d) => d.id === (debtId || chargeDebtId));
    commitTransaction(
      {
        id: txForm.id || uid(),
        type: txForm.type,
        amount: Number(txForm.amount),
        category,
        date: txForm.date,
        description:
          txForm.description ||
          (isPayment ? `Abono a ${linked?.name || "deuda"}` : isCharge ? `Consumo con ${linked?.name || "tarjeta"}` : ""),
        debtId,
        chargeDebtId,
      },
      txForm.id || null
    );
    setTxForm(EMPTY_TX_FORM());
  };

  // Consumo adicional registrado desde la ficha de una tarjeta (pestaña Deudas).
  const addChargeToDebt = (debtId, { amount, category, date, description }) => {
    const debt = state.debts.find((d) => d.id === debtId);
    commitTransaction({
      id: uid(),
      type: "gasto",
      amount: Number(amount),
      category,
      date,
      description: description || `Consumo con ${debt?.name || "tarjeta"}`,
      debtId: null,
      chargeDebtId: debtId,
    });
  };

  const editTx = (t) =>
    setTxForm({
      ...EMPTY_TX_FORM(),
      ...t,
      category: t.category === "ingreso" ? "comida" : t.category,
      debtId: t.debtId || "",
      chargeDebtId: t.chargeDebtId || "",
    });
  const removeTx = (id) => {
    const tx = state.transactions.find((t) => t.id === id);
    setState((s) => ({
      ...s,
      debts: tx ? reverseTxOnDebts(s.debts, tx) : s.debts,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
  };

  const [moreOpen, setMoreOpen] = useState(false);
  const applyQuick = (next) => setState((s) => ({ ...s, debts: next.debts, transactions: next.transactions }));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finanzas_backup_${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyData = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch (e) {
      setCopyState("error");
    }
  };
  const importFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setState({ ...emptyState, ...parsed });
      } catch (err) {
        alert("El archivo no contiene JSON válido.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  const [pasteText, setPasteText] = useState("");
  const importPaste = () => {
    try {
      const parsed = JSON.parse(pasteText);
      setState({ ...emptyState, ...parsed });
      setPasteText("");
    } catch (err) {
      alert("El texto pegado no es JSON válido.");
    }
  };
  const resetAll = () => {
    if (confirm("¿Borrar todos los datos? Esta acción no se puede deshacer.")) setState(emptyState);
  };

  const PRIMARY_TABS = ["dashboard", "movimientos", "deudas", "ahorro"];
  const NAV = [
    { id: "dashboard", label: "Tablero", short: "Inicio", icon: LayoutDashboard },
    { id: "config", label: "Configuración", icon: Settings2 },
    { id: "movimientos", label: "Movimientos", short: "Movim.", icon: ListChecks },
    { id: "deudas", label: "Deudas", icon: CreditCard },
    { id: "ahorro", label: "Ahorro", icon: PiggyBank },
    { id: "historico", label: "Histórico", icon: BarChart3 },
    { id: "datos", label: "Datos", icon: Save },
  ];

  /* ---------------------------------- render --------------------------------- */

  return (
    <div className="app-shell min-h-screen w-full flex flex-col">
      {/* Masthead */}
      <header className="flex items-center justify-between px-6 py-4 border-b hairline gap-3" style={{ borderBottomWidth: 1 }}>
        <div className="flex items-center gap-3 min-w-0">
          <Wallet size={22} style={{ color: "var(--brass)" }} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-xl">Finanzas Personales</h1>
            <p className="text-xs truncate" style={{ color: "var(--ink-dim)" }}>
              {syncError ? (
                <span className="flex items-center gap-1" style={{ color: "var(--amber)" }}>
                  <CloudOff size={11} /> {syncError}
                </span>
              ) : (
                <>{user.email} · {new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Balance del mes
            </p>
            <p className="font-mono-num text-lg font-semibold" style={{ color: balanceMes >= 0 ? "var(--green)" : "var(--red)" }}>
              {fmt(balanceMes)}
            </p>
          </div>
          <button
            onClick={() => signOut(auth)}
            title="Cerrar sesión"
            className="btn-ghost rounded p-2 flex items-center justify-center"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar nav - desktop only */}
        <nav className="hidden md:flex md:w-56 shrink-0 md:border-r hairline md:flex-col">
          {NAV.map((n) => (
            <NavButton key={n.id} active={tab === n.id} onClick={() => setTab(n.id)} icon={n.icon} label={n.label} />
          ))}
        </nav>

        {/* Main content - extra bottom padding on mobile so the bottom bar never overlaps content */}
        <main className="flex-1 p-5 md:p-8 space-y-6 max-w-6xl pb-28 md:pb-8 min-w-0">
          {(tab === "dashboard" || tab === "movimientos") && <ChatBox data={state} onApply={applyQuick} compact={tab === "movimientos"} />}
          {tab === "dashboard" && (
            <DashboardTab
              ingresoMes={ingresoMes}
              gastoMes={gastoMes}
              balanceMes={balanceMes}
              budgetRows={budgetRows}
              overallStatus={overallStatus}
              categorySpend={categorySpend}
              creditChargesMes={creditChargesMes}
            />
          )}

          {tab === "config" && (
            <ConfigTab
              state={state}
              incomeForm={incomeForm}
              setIncomeForm={setIncomeForm}
              addIncome={addIncome}
              removeIncome={removeIncome}
              debtForm={debtForm}
              setDebtForm={setDebtForm}
              addDebt={addDebt}
              removeDebt={removeDebt}
              editDebt={editDebt}
              setBudget={setBudget}
              monthlyIncomeTotal={monthlyIncomeTotal}
            />
          )}

          {tab === "movimientos" && (
            <MovimientosTab
              txForm={txForm}
              setTxForm={setTxForm}
              submitTx={submitTx}
              editTx={editTx}
              removeTx={removeTx}
              transactions={state.transactions}
              debts={state.debts}
            />
          )}

          {tab === "deudas" && (
            <DeudasTab
              debts={state.debts}
              activeDebts={activeDebts}
              transactions={state.transactions}
              onAddCharge={addChargeToDebt}
              extraPayment={extraPayment}
              setExtraPayment={setExtraPayment}
              snowball={snowball}
              avalanche={avalanche}
              recommendation={recommendation}
              totalDebt={totalDebt}
            />
          )}

          {tab === "ahorro" && (
            <SavingsGoalsModule
              monthsThisYear={monthsThisYear}
              currentMonthIndex={thisMonthIndex()}
              goals={state.savingsGoals}
              onSaveGoals={setSavingsGoals}
            />
          )}

          {tab === "historico" && <AnnualSummary transactions={state.transactions} />}

          {tab === "datos" && (
            <>
            <WhatsAppLink user={user} />
            <DatosTab
              exportData={exportData}
              copyData={copyData}
              copyState={copyState}
              fileInputRef={fileInputRef}
              importFile={importFile}
              pasteText={pasteText}
              setPasteText={setPasteText}
              importPaste={importPaste}
              resetAll={resetAll}
              state={state}
            />
            </>
          )}
        </main>
      </div>

      {/* Bottom tab bar - mobile only, fixed to viewport bottom */}
      {moreOpen && (
        <div className="more-sheet md:hidden" role="menu">
          {NAV.filter((n) => !PRIMARY_TABS.includes(n.id)).map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "on" : ""}
              style={{ color: tab === n.id ? "var(--brass)" : "var(--ink)" }}
              onClick={() => {
                setTab(n.id);
                setMoreOpen(false);
              }}
            >
              <n.icon size={20} /> {n.label}
            </button>
          ))}
        </div>
      )}
      <nav className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 flex z-50">
        {NAV.filter((n) => PRIMARY_TABS.includes(n.id)).map((n) => (
          <BottomNavButton
            key={n.id}
            active={tab === n.id}
            onClick={() => {
              setTab(n.id);
              setMoreOpen(false);
            }}
            icon={n.icon}
            label={n.short || n.label}
          />
        ))}
        <BottomNavButton active={moreOpen || !PRIMARY_TABS.includes(tab)} onClick={() => setMoreOpen((o) => !o)} icon={MoreHorizontal} label="Más" />
      </nav>
    </div>
  );
}

/* ------------------------------- root wrapper ------------------------------- */

export default function App() {
  const user = useAuth();

  if (user === undefined) {
    return (
      <div className="app-shell min-h-screen w-full flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Cargando...
        </p>
      </div>
    );
  }

  if (user === null) {
    return <AuthScreen />;
  }

  return <FinanzasApp user={user} />;
}

/* ------------------------------- dashboard tab ------------------------------ */

function DashboardTab({ ingresoMes, gastoMes, balanceMes, budgetRows, overallStatus, categorySpend, creditChargesMes }) {
  const barData = budgetRows.map((b) => ({ name: b.label, Presupuesto: b.limit, Gastado: b.spent }));
  const pieData = budgetRows.filter((b) => b.spent > 0).map((b) => ({ name: b.label, value: b.spent, color: b.color }));

  const statusIcon = { verde: CheckCircle2, amarillo: AlertTriangle, rojo: AlertTriangle };

  return (
    <div className="space-y-6">
      <div className="ledger-card p-5 flex flex-col sm:flex-row items-center gap-5">
        <Stamp status={overallStatus} />
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          <Metric label="Ingreso del mes" value={ingresoMes} icon={TrendingUp} color="var(--green)" />
          <Metric label="Gasto del mes" value={gastoMes} icon={TrendingDown} color="var(--red)" />
          <Metric label="Balance" value={balanceMes} icon={Wallet} color={balanceMes >= 0 ? "var(--green)" : "var(--red)"} />
        </div>
      </div>

      {creditChargesMes > 0 && (
        <p className="text-xs flex items-center gap-2" style={{ color: "var(--ink-dim)" }}>
          <CreditCard size={14} />
          Este mes cargaste <span className="font-mono-num">{fmt(creditChargesMes)}</span> a tarjetas/deudas: cuentan en tus presupuestos por categoría, pero solo salen de tu balance cuando pagues la tarjeta.
        </p>
      )}

      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-4">Semáforo de presupuesto por categoría</h3>
        <div className="space-y-3">
          {budgetRows.map((b) => {
            const Icon = statusIcon[b.status];
            const color = b.status === "verde" ? "var(--green)" : b.status === "amarillo" ? "var(--amber)" : "var(--red)";
            const width = Math.min(100, (b.pct || 0) * 100);
            return (
              <div key={b.id} className="flex items-center gap-3">
                <b.icon size={16} style={{ color: b.color }} />
                <span className="text-sm w-28 shrink-0">{b.label}</span>
                <div className="flex-1 h-2 rounded-full progress-track overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
                </div>
                <span className="font-mono-num text-xs w-32 text-right" style={{ color }}>
                  {fmt(b.spent)} / {b.limit ? fmt(b.limit) : "sin límite"}
                </span>
                <Icon size={14} style={{ color }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="ledger-card p-5">
          <h3 className="font-display text-base mb-4">Presupuesto vs. gastado</h3>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
                <XAxis dataKey="name" tick={{ fill: "var(--ink-dim)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--ink-dim)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#1A2234", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, color: "#E7EAF3" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Presupuesto" fill="#8B93A8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Gastado" fill="#10B981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ledger-card p-5">
          <h3 className="font-display text-base mb-4">Distribución del gasto</h3>
          {pieData.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Aún no hay gastos registrados este mes.
            </p>
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1A2234", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, color: "#E7EAF3" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--surface2)" }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
          {label}
        </p>
        <p className="font-mono-num text-lg font-semibold" style={{ color }}>
          {fmt(value)}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------- config tab -------------------------------- */

function ConfigTab({ state, incomeForm, setIncomeForm, addIncome, removeIncome, debtForm, setDebtForm, addDebt, removeDebt, editDebt, setBudget, monthlyIncomeTotal }) {
  return (
    <div className="space-y-6">
      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-1">Ingresos fijos y variables</h3>
        <p className="text-xs mb-4" style={{ color: "var(--ink-dim)" }}>
          Total mensualizado: <span className="font-mono-num" style={{ color: "var(--green)" }}>{fmt(monthlyIncomeTotal)}</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <Field label="Nombre">
            <input placeholder="Salario, freelance..." value={incomeForm.name} onChange={(e) => setIncomeForm({ ...incomeForm, name: e.target.value })} />
          </Field>
          <Field label="Monto">
            <input type="number" placeholder="0" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
          </Field>
          <Field label="Frecuencia">
            <select value={incomeForm.frequency} onChange={(e) => setIncomeForm({ ...incomeForm, frequency: e.target.value })}>
              {Object.keys(FREQ_LABEL).map((k) => (
                <option key={k} value={k}>
                  {FREQ_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button onClick={addIncome} className="btn-brass rounded px-3 py-2 text-sm font-medium flex items-center gap-2 w-full justify-center">
              <PlusCircle size={15} /> Añadir
            </button>
          </div>
        </div>
        <div className="divide-y hairline">
          {state.incomes.length === 0 && (
            <p className="text-sm py-2" style={{ color: "var(--ink-dim)" }}>
              No has registrado ingresos todavía.
            </p>
          )}
          {state.incomes.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {i.name} <span style={{ color: "var(--ink-dim)" }}>· {FREQ_LABEL[i.frequency]}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono-num" style={{ color: "var(--green)" }}>
                  {fmt(i.amount)}
                </span>
                <button onClick={() => removeIncome(i.id)} style={{ color: "var(--ink-dim)" }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-4">{debtForm.id ? "Editar deuda" : "Deudas activas"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Field label="Nombre">
            <input placeholder="Tarjeta, préstamo..." value={debtForm.name} onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <select value={debtForm.kind} onChange={(e) => setDebtForm({ ...debtForm, kind: e.target.value })}>
              <option value="prestamo">Préstamo (se elimina al saldarse)</option>
              <option value="tarjeta">Tarjeta de crédito (rotativa)</option>
            </select>
          </Field>
          {debtForm.kind === "tarjeta" && (
            <Field label="Cupo total">
              <input type="number" placeholder="0" value={debtForm.limit} onChange={(e) => setDebtForm({ ...debtForm, limit: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <Field label="Saldo total">
            <input type="number" placeholder="0" value={debtForm.balance} onChange={(e) => setDebtForm({ ...debtForm, balance: e.target.value })} />
          </Field>
          <Field label="Tasa interés anual %">
            <input type="number" placeholder="0" value={debtForm.rate} onChange={(e) => setDebtForm({ ...debtForm, rate: e.target.value })} />
          </Field>
          <Field label="Pago mínimo">
            <input type="number" placeholder="0" value={debtForm.minPayment} onChange={(e) => setDebtForm({ ...debtForm, minPayment: e.target.value })} />
          </Field>
          <div className="flex items-end gap-2">
            <button onClick={addDebt} className="btn-brass rounded px-3 py-2 text-sm font-medium flex items-center gap-2 flex-1 justify-center">
              <PlusCircle size={15} /> {debtForm.id ? "Guardar cambios" : "Añadir"}
            </button>
            {debtForm.id && (
              <button onClick={() => setDebtForm(EMPTY_DEBT_FORM)} className="btn-ghost rounded px-3 py-2 text-sm" aria-label="Cancelar edición">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="divide-y hairline">
          {state.debts.length === 0 && (
            <p className="text-sm py-2" style={{ color: "var(--ink-dim)" }}>
              No has registrado deudas todavía.
            </p>
          )}
          {state.debts.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {d.name}{" "}
                <span style={{ color: "var(--ink-dim)" }}>
                  · {d.kind === "tarjeta" ? `tarjeta${d.limit ? ` · cupo ${fmt(d.limit)}` : ""}` : "préstamo"} · {d.rate}% anual · mín. {fmt(d.minPayment)}
                </span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono-num" style={{ color: "var(--red)" }}>
                  {fmt(d.balance)}
                </span>
                <button onClick={() => editDebt(d)} style={{ color: "var(--ink-dim)" }} aria-label="Editar deuda">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeDebt(d.id)} style={{ color: "var(--ink-dim)" }} aria-label="Eliminar deuda">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-4">Presupuestos límite por categoría</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((c) => (
            <Field key={c.id} label={c.label}>
              <input
                type="number"
                placeholder="0"
                value={state.budgets[c.id] ?? ""}
                onChange={(e) => setBudget(c.id, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ movimientos tab ------------------------------ */

function MovimientosTab({ txForm, setTxForm, submitTx, editTx, removeTx, transactions, debts }) {
  const selectedDebt = txForm.debtId ? debts.find((d) => d.id === txForm.debtId) : null;
  const canCharge = txForm.type === "gasto" && txForm.category !== "deuda" && txForm.category !== "ahorro";
  const chargeDebt = canCharge && txForm.chargeDebtId ? debts.find((d) => d.id === txForm.chargeDebtId) : null;
  const chargeAfter = chargeDebt ? Number(chargeDebt.balance) + (Number(txForm.amount) || 0) : 0;
  const chargeOverLimit = chargeDebt && Number(chargeDebt.limit) > 0 && chargeAfter > Number(chargeDebt.limit);
  const debtById = (id) => debts.find((d) => d.id === id);
  return (
    <div className="space-y-6">
      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-4">{txForm.id ? "Editar movimiento" : "Registrar movimiento"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Field label="Tipo">
            <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </Field>
          <Field label="Monto">
            <input type="number" placeholder="0" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
          </Field>
          {txForm.type === "gasto" && (
            <Field label="Categoría">
              <select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value, debtId: "", chargeDebtId: "" })}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Fecha">
            <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
          </Field>
          <Field label="Descripción">
            <input placeholder="Opcional" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} />
          </Field>
          {txForm.type === "gasto" && txForm.category === "deuda" && (
            <Field label="Deuda a abonar">
              <select value={txForm.debtId || ""} onChange={(e) => setTxForm({ ...txForm, debtId: e.target.value })}>
                <option value="">Selecciona una deuda</option>
                {debts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · saldo {fmt(d.balance)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {canCharge && debts.length > 0 && (
            <Field label="Cargar a tarjeta / deuda (opcional)">
              <select value={txForm.chargeDebtId || ""} onChange={(e) => setTxForm({ ...txForm, chargeDebtId: e.target.value })}>
                <option value="">No, pagué en efectivo / débito</option>
                {debts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · saldo {fmt(d.balance)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {chargeDebt && Number(txForm.amount) > 0 && (
          <p className="text-xs mt-2" style={{ color: chargeOverLimit ? "var(--red)" : "var(--ink-dim)" }}>
            Saldo de "{chargeDebt.name}" después de este consumo: <span className="font-mono-num">{fmt(chargeAfter)}</span>
            {Number(chargeDebt.limit) > 0 && (
              <> · cupo disponible <span className="font-mono-num">{fmt(Math.max(0, chargeDebt.limit - chargeAfter))}</span></>
            )}
            {chargeOverLimit && " · ¡supera el cupo de la tarjeta!"}
            . No descuenta tu balance de efectivo hasta que pagues la tarjeta.
          </p>
        )}
        {txForm.type === "gasto" && txForm.category === "deuda" && !txForm.debtId && (
          <p className="text-xs mt-2" style={{ color: "var(--amber)" }}>
            Si no eliges a qué deuda corresponde, el pago se registrará como gasto pero no descontará ningún saldo.
          </p>
        )}
        {selectedDebt && Number(txForm.amount) > 0 && (
          <p className="text-xs mt-2" style={{ color: "var(--ink-dim)" }}>
            Saldo de "{selectedDebt.name}" después de este pago:{" "}
            <span className="font-mono-num" style={{ color: "var(--green)" }}>
              {fmt(Math.max(0, selectedDebt.balance - Number(txForm.amount)))}
            </span>
          </p>
        )}
        <div className="flex gap-3 mt-4">
          <button onClick={submitTx} className="btn-brass rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
            <PlusCircle size={15} /> {txForm.id ? "Guardar cambios" : "Añadir movimiento"}
          </button>
          {txForm.id && (
            <button
              onClick={() => setTxForm(EMPTY_TX_FORM())}
              className="btn-ghost rounded px-4 py-2 text-sm font-medium flex items-center gap-2"
            >
              <X size={15} /> Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-4">Últimos movimientos</h3>
        {transactions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Aún no has registrado movimientos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b hairline" style={{ color: "var(--ink-dim)" }}>
                  <th className="py-2 pr-3 font-normal">Fecha</th>
                  <th className="py-2 pr-3 font-normal">Categoría</th>
                  <th className="py-2 pr-3 font-normal">Descripción</th>
                  <th className="py-2 pr-3 font-normal text-right">Monto</th>
                  <th className="py-2 pl-3 font-normal text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const c = t.type === "ingreso" ? null : catById(t.category);
                  return (
                    <tr key={t.id} className="border-b hairline">
                      <td className="py-2 pr-3 font-mono-num">{t.date}</td>
                      <td className="py-2 pr-3">
                        {t.type === "ingreso" ? (
                          <span style={{ color: "var(--green)" }}>Ingreso</span>
                        ) : (
                          <CategoryBadge category={t.category} label={c.label} size="xs" />
                        )}
                      </td>
                      <td className="py-2 pr-3" style={{ color: "var(--ink-dim)" }}>
                        {t.description || "—"}
                        {isCreditCharge(t) && (
                          <span className="ml-2 text-xs" style={{ color: "var(--amber)" }}>
                            · a crédito ({debtById(t.chargeDebtId)?.name || "deuda saldada"})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono-num" style={{ color: t.type === "ingreso" ? "var(--green)" : isCreditCharge(t) ? "var(--amber)" : "var(--red)" }}>
                        {t.type === "ingreso" ? "+" : "-"}
                        {fmt(t.amount)}
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => editTx(t)} style={{ color: "var(--ink-dim)" }}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => removeTx(t.id)} style={{ color: "var(--ink-dim)" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- deudas tab --------------------------------- */

function DeudasTab({ debts, activeDebts, transactions, onAddCharge, extraPayment, setExtraPayment, snowball, avalanche, recommendation, totalDebt }) {
  return (
    <div className="space-y-6">
      <div className="ledger-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base">Deuda total pendiente</h3>
          <p className="font-mono-num text-2xl font-semibold" style={{ color: "var(--red)" }}>
            {fmt(totalDebt)}
          </p>
        </div>
        <Field label="Pago extra disponible al mes (además de mínimos)">
          <input type="number" placeholder="0" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} className="w-48" />
        </Field>
      </div>

      {debts.length === 0 ? (
        <div className="ledger-card p-5">
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Registra tus deudas en la pestaña de Configuración para ver la estrategia recomendada.
          </p>
        </div>
      ) : (
        <>
          <DebtManager debts={debts} transactions={transactions} categories={CHARGEABLE_CATEGORIES} onAddCharge={onAddCharge} />

          {activeDebts.length === 0 ? (
            <div className="ledger-card p-5">
              <p className="text-sm flex items-center gap-2" style={{ color: "var(--green)" }}>
                <CheckCircle2 size={15} /> No tienes saldo pendiente: no hay estrategia de pago que simular.
              </p>
            </div>
          ) : (
            <>
              {recommendation && (
                <div className="ledger-card p-5" style={{ borderColor: "var(--brass)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Mountain size={18} style={{ color: "var(--brass)" }} />
                    <h3 className="font-display text-base">
                      Recomendación: método <span style={{ color: "var(--brass)" }}>{recommendation.key}</span>
                    </h3>
                  </div>
                  <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
                    {recommendation.reason}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <StrategyCard icon={Snowflake} title="Bola de nieve" subtitle="Paga primero el saldo más pequeño" result={snowball} debts={activeDebts} order="snowball" />
                <StrategyCard icon={Mountain} title="Avalancha" subtitle="Paga primero la tasa más alta" result={avalanche} debts={activeDebts} order="avalanche" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StrategyCard({ icon: Icon, title, subtitle, result, debts, order }) {
  const sorted = [...debts].sort(order === "snowball" ? (a, b) => a.balance - b.balance : (a, b) => b.rate - a.rate);
  return (
    <div className="ledger-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={17} style={{ color: "var(--brass)" }} />
        <h4 className="font-display text-base">{title}</h4>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ink-dim)" }}>
        {subtitle}
      </p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Tiempo estimado
          </p>
          <p className="font-mono-num text-lg font-semibold">{result.months} meses</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Interés total pagado
          </p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: "var(--red)" }}>
            {fmt(result.totalInterest)}
          </p>
        </div>
      </div>
      <p className="text-xs mb-2" style={{ color: "var(--ink-dim)" }}>
        Orden de pago sugerido
      </p>
      <ol className="text-sm space-y-1 list-decimal list-inside">
        {sorted.map((d) => (
          <li key={d.id}>
            {d.name} <span style={{ color: "var(--ink-dim)" }}>({fmt(d.balance)} · {d.rate}%)</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* --------------------------------- datos tab --------------------------------- */

function DatosTab({ exportData, copyData, copyState, fileInputRef, importFile, pasteText, setPasteText, importPaste, resetAll, state }) {
  return (
    <div className="space-y-6">
      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-2">Sincronización en la nube</h3>
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Tus datos se guardan automáticamente en la nube, asociados a tu cuenta. Puedes iniciar sesión desde
          cualquier dispositivo con el mismo correo y vas a ver la misma información. Aun así, exportar de vez en
          cuando es una buena idea como respaldo adicional.
        </p>
      </div>

      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-2">Exportar datos</h3>
        <p className="text-sm mb-4" style={{ color: "var(--ink-dim)" }}>
          Descarga un archivo JSON con todo tu progreso, o cópialo como respaldo o para pasarlo a otro dispositivo.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportData} className="btn-brass rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
            <Download size={15} /> Descargar JSON
          </button>
          <button onClick={copyData} className="btn-ghost rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
            {copyState === "done" ? <Check size={15} /> : <Copy size={15} />}
            {copyState === "done" ? "Copiado" : "Copiar al portapapeles"}
          </button>
        </div>
        <textarea readOnly value={JSON.stringify(state, null, 2)} className="w-full mt-4 h-40 text-xs font-mono-num" />
      </div>

      <div className="ledger-card p-5">
        <h3 className="font-display text-base mb-2">Importar datos</h3>
        <p className="text-sm mb-4" style={{ color: "var(--ink-dim)" }}>
          Carga un archivo JSON exportado previamente, o pega el texto directamente.
        </p>
        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
            <Upload size={15} /> Elegir archivo .json
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={importFile} className="hidden" />
        </div>
        <textarea
          placeholder="Pega aquí el JSON copiado en tu sesión anterior..."
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          className="w-full h-32 text-xs font-mono-num"
        />
        <button onClick={importPaste} className="btn-brass rounded px-4 py-2 text-sm font-medium mt-3 flex items-center gap-2">
          <Upload size={15} /> Importar desde texto
        </button>
      </div>

      <div className="ledger-card p-5" style={{ borderColor: "var(--red)" }}>
        <h3 className="font-display text-base mb-2">Zona de riesgo</h3>
        <p className="text-sm mb-4" style={{ color: "var(--ink-dim)" }}>
          Borra todos los datos guardados en este dispositivo.
        </p>
        <button onClick={resetAll} className="rounded px-4 py-2 text-sm font-medium flex items-center gap-2" style={{ border: "1px solid var(--red)", color: "var(--red)" }}>
          <RotateCcw size={15} /> Restablecer todo
        </button>
      </div>
    </div>
  );
}
