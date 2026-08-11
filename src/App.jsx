import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  LayoutDashboard, Settings2, ListChecks, Mountain, Save, Home, Utensils,
  Car, Film, HeartPulse, MoreHorizontal, PlusCircle, Trash2, Pencil, X,
  Download, Upload, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  CheckCircle2, Snowflake, RotateCcw, Copy, Check, CreditCard,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

/* ---------------------------------- data ---------------------------------- */

const CATEGORIES = [
  { id: "vivienda", label: "Vivienda", icon: Home, color: "#C9A227" },
  { id: "comida", label: "Comida", icon: Utensils, color: "#4F9D69" },
  { id: "transporte", label: "Transporte", icon: Car, color: "#5C8AA6" },
  { id: "entretenimiento", label: "Entretenimiento", icon: Film, color: "#B5533C" },
  { id: "salud", label: "Salud", icon: HeartPulse, color: "#9C6BB0" },
  { id: "deuda", label: "Deuda", icon: CreditCard, color: "#D9A441" },
  { id: "otros", label: "Otros", icon: MoreHorizontal, color: "#9CA6A8" },
];
const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[6];
const FREQ_FACTORS = { mensual: 1, quincenal: 2, semanal: 4.33, variable: 1 };
const FREQ_LABEL = { mensual: "Mensual", quincenal: "Quincenal", semanal: "Semanal", variable: "Variable" };

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) =>
  "$" + Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthKey = () => new Date().toISOString().slice(0, 7);

const emptyState = { incomes: [], debts: [], budgets: {}, transactions: [] };
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
    verde: { text: "SALUDABLE", color: "var(--green)" },
    amarillo: { text: "PRECAUCIÓN", color: "var(--amber)" },
    rojo: { text: "ALERTA", color: "var(--red)" },
  };
  const s = map[status];
  return (
    <div
      className="stamp shrink-0 w-32 h-32 flex items-center justify-center text-center px-3"
      style={{ color: s.color }}
    >
      <span className="font-display text-sm tracking-widest leading-tight">{s.text}</span>
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
      className="flex flex-1 flex-col items-center justify-center gap-1 py-2"
      style={{ color: active ? "var(--brass)" : "var(--ink-dim)" }}
    >
      <Icon size={20} />
      <span className="text-[10px] font-medium leading-none text-center">{label}</span>
    </button>
  );
}

/* ---------------------------------- app ------------------------------------ */

export default function FinanzasApp() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...emptyState, ...JSON.parse(saved) } : emptyState;
    } catch {
      return emptyState;
    }
  });
  const [tab, setTab] = useState("dashboard");
  const fileInputRef = useRef(null);

  // Autosave to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable, ignore */
    }
  }, [state]);

  /* ---- setup forms ---- */
  const [incomeForm, setIncomeForm] = useState({ name: "", amount: "", frequency: "mensual" });
  const [debtForm, setDebtForm] = useState({ name: "", balance: "", rate: "", minPayment: "" });
  const [extraPayment, setExtraPayment] = useState(0);

  /* ---- transaction form ---- */
  const [txForm, setTxForm] = useState({
    id: null,
    type: "gasto",
    amount: "",
    category: "comida",
    date: todayStr(),
    description: "",
  });
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
  const gastoMes = useMemo(
    () => monthTx.filter((t) => t.type === "gasto").reduce((s, t) => s + Number(t.amount), 0),
    [monthTx]
  );
  const ingresoMes = monthlyIncomeTotal + extraIncomeMes;
  const balanceMes = ingresoMes - gastoMes;

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

  const totalDebt = useMemo(() => state.debts.reduce((s, d) => s + Number(d.balance), 0), [state.debts]);

  const snowball = useMemo(() => simulateDebts(state.debts, Number(extraPayment) || 0, "snowball"), [state.debts, extraPayment]);
  const avalanche = useMemo(() => simulateDebts(state.debts, Number(extraPayment) || 0, "avalanche"), [state.debts, extraPayment]);
  const recommendation = useMemo(() => {
    if (state.debts.length === 0) return null;
    const diff = snowball.totalInterest - avalanche.totalInterest;
    if (diff > Math.max(50, avalanche.totalInterest * 0.05)) {
      return { key: "avalancha", reason: `Ahorras aprox. ${fmt(diff)} en intereses frente al método bola de nieve.` };
    }
    return { key: "bola de nieve", reason: "La diferencia de interés entre métodos es pequeña; la bola de nieve te da victorias rápidas que ayudan a mantener el hábito." };
  }, [state.debts, snowball, avalanche]);

  /* --------------------------------- actions --------------------------------- */

  const addIncome = () => {
    if (!incomeForm.name || !incomeForm.amount) return;
    setState((s) => ({ ...s, incomes: [...s.incomes, { id: uid(), name: incomeForm.name, amount: Number(incomeForm.amount), frequency: incomeForm.frequency }] }));
    setIncomeForm({ name: "", amount: "", frequency: "mensual" });
  };
  const removeIncome = (id) => setState((s) => ({ ...s, incomes: s.incomes.filter((i) => i.id !== id) }));

  const addDebt = () => {
    if (!debtForm.name || !debtForm.balance) return;
    setState((s) => ({
      ...s,
      debts: [...s.debts, { id: uid(), name: debtForm.name, balance: Number(debtForm.balance), rate: Number(debtForm.rate) || 0, minPayment: Number(debtForm.minPayment) || 0 }],
    }));
    setDebtForm({ name: "", balance: "", rate: "", minPayment: "" });
  };
  const removeDebt = (id) => setState((s) => ({ ...s, debts: s.debts.filter((d) => d.id !== id) }));

  const setBudget = (catId, val) =>
    setState((s) => ({ ...s, budgets: { ...s.budgets, [catId]: val === "" ? "" : Number(val) } }));

  const submitTx = () => {
    if (!txForm.amount || !txForm.date) return;
    const payload = {
      id: txForm.id || uid(),
      type: txForm.type,
      amount: Number(txForm.amount),
      category: txForm.type === "ingreso" ? "ingreso" : txForm.category,
      date: txForm.date,
      description: txForm.description,
    };
    setState((s) => {
      if (txForm.id) {
        return { ...s, transactions: s.transactions.map((t) => (t.id === txForm.id ? payload : t)) };
      }
      return { ...s, transactions: [payload, ...s.transactions] };
    });
    setTxForm({ id: null, type: "gasto", amount: "", category: "comida", date: todayStr(), description: "" });
  };
  const editTx = (t) => setTxForm({ ...t, type: t.type, category: t.category === "ingreso" ? "comida" : t.category });
  const removeTx = (id) => setState((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }));

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

  const NAV = [
    { id: "dashboard", label: "Tablero", icon: LayoutDashboard },
    { id: "config", label: "Configuración", icon: Settings2 },
    { id: "movimientos", label: "Movimientos", icon: ListChecks },
    { id: "deudas", label: "Deudas", icon: Mountain },
    { id: "datos", label: "Datos", icon: Save },
  ];

  /* ---------------------------------- render --------------------------------- */

  return (
    <div className="app-shell min-h-screen w-full flex flex-col">
      <style>{`
        :root {
          --bg:#12181B; --surface:#1B2428; --surface2:#212C31; --ink:#ECE7DA; --ink-dim:#8FA09D;
          --brass:#C9A227; --green:#4F9D69; --red:#B5533C; --amber:#D9A441; --rule: rgba(201,162,39,0.28);
        }
        .app-shell { background:var(--bg); color:var(--ink); font-family: -apple-system, "Segoe UI", Inter, sans-serif; }
        .font-display { font-family: Georgia, "Times New Roman", serif; }
        .font-mono-num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
        .ledger-card { background:var(--surface); border:1px solid var(--rule); border-radius:3px; }
        .hairline { border-color: var(--rule) !important; }
        .tab-btn { border-left: 2px solid transparent; }
        .tab-btn.active { border-left-color: var(--brass); background: var(--surface2); }
        .stamp { border: 3px double currentColor; border-radius: 999px; transform: rotate(-8deg); }
        input, select, textarea {
          background: var(--surface2); border:1px solid var(--rule); color: var(--ink);
          border-radius: 3px; padding: 6px 8px; outline:none;
        }
        input:focus, select:focus, textarea:focus { border-color: var(--brass); }
        ::placeholder { color: #5C6C69; }
        .btn-brass { background: var(--brass); color: #12181B; }
        .btn-brass:hover { background: #DBB439; }
        .btn-ghost { background: transparent; border:1px solid var(--rule); color: var(--ink); }
        .btn-ghost:hover { border-color: var(--brass); color: var(--brass); }
        .progress-track { background: var(--surface2); }
        table th, table td { border-color: var(--rule); }
        ::-webkit-scrollbar { width: 8px; height:8px; }
        ::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 4px; }
        .bottom-nav {
          background: var(--surface);
          border-top: 1px solid var(--rule);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>

      {/* Masthead */}
      <header className="flex items-center justify-between px-6 py-4 border-b hairline" style={{ borderBottomWidth: 1 }}>
        <div className="flex items-center gap-3">
          <Wallet size={22} style={{ color: "var(--brass)" }} />
          <div>
            <h1 className="font-display text-xl tracking-wide">Mi Libro Mayor</h1>
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Ledger personal · {new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Balance del mes
          </p>
          <p className="font-mono-num text-lg font-semibold" style={{ color: balanceMes >= 0 ? "var(--green)" : "var(--red)" }}>
            {fmt(balanceMes)}
          </p>
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
        <main className="flex-1 p-5 md:p-8 space-y-6 max-w-6xl pb-24 md:pb-8">
          {tab === "dashboard" && (
            <DashboardTab
              ingresoMes={ingresoMes}
              gastoMes={gastoMes}
              balanceMes={balanceMes}
              budgetRows={budgetRows}
              overallStatus={overallStatus}
              categorySpend={categorySpend}
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
            />
          )}

          {tab === "deudas" && (
            <DeudasTab
              debts={state.debts}
              extraPayment={extraPayment}
              setExtraPayment={setExtraPayment}
              snowball={snowball}
              avalanche={avalanche}
              recommendation={recommendation}
              totalDebt={totalDebt}
            />
          )}

          {tab === "datos" && (
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
          )}
        </main>
      </div>

      {/* Bottom tab bar - mobile only, fixed to viewport bottom */}
      <nav className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 flex z-50">
        {NAV.map((n) => (
          <BottomNavButton key={n.id} active={tab === n.id} onClick={() => setTab(n.id)} icon={n.icon} label={n.label} />
        ))}
      </nav>
    </div>
  );
}

/* ------------------------------- dashboard tab ------------------------------ */

function DashboardTab({ ingresoMes, gastoMes, balanceMes, budgetRows, overallStatus, categorySpend }) {
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
                <Tooltip contentStyle={{ background: "#1B2428", border: "1px solid var(--rule)", color: "#ECE7DA" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Presupuesto" fill="#8FA09D" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Gastado" fill="#C9A227" radius={[2, 2, 0, 0]} />
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
                  <Tooltip contentStyle={{ background: "#1B2428", border: "1px solid var(--rule)", color: "#ECE7DA" }} />
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

function ConfigTab({ state, incomeForm, setIncomeForm, addIncome, removeIncome, debtForm, setDebtForm, addDebt, removeDebt, setBudget, monthlyIncomeTotal }) {
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
        <h3 className="font-display text-base mb-4">Deudas activas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4">
          <Field label="Nombre">
            <input placeholder="Tarjeta, préstamo..." value={debtForm.name} onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })} />
          </Field>
          <Field label="Saldo total">
            <input type="number" placeholder="0" value={debtForm.balance} onChange={(e) => setDebtForm({ ...debtForm, balance: e.target.value })} />
          </Field>
          <Field label="Tasa interés anual %">
            <input type="number" placeholder="0" value={debtForm.rate} onChange={(e) => setDebtForm({ ...debtForm, rate: e.target.value })} />
          </Field>
          <Field label="Pago mínimo">
            <input type="number" placeholder="0" value={debtForm.minPayment} onChange={(e) => setDebtForm({ ...debtForm, minPayment: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <button onClick={addDebt} className="btn-brass rounded px-3 py-2 text-sm font-medium flex items-center gap-2 w-full justify-center">
              <PlusCircle size={15} /> Añadir
            </button>
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
                {d.name} <span style={{ color: "var(--ink-dim)" }}>· {d.rate}% anual · mín. {fmt(d.minPayment)}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono-num" style={{ color: "var(--red)" }}>
                  {fmt(d.balance)}
                </span>
                <button onClick={() => removeDebt(d.id)} style={{ color: "var(--ink-dim)" }}>
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

function MovimientosTab({ txForm, setTxForm, submitTx, editTx, removeTx, transactions }) {
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
              <select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}>
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
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={submitTx} className="btn-brass rounded px-4 py-2 text-sm font-medium flex items-center gap-2">
            <PlusCircle size={15} /> {txForm.id ? "Guardar cambios" : "Añadir movimiento"}
          </button>
          {txForm.id && (
            <button
              onClick={() => setTxForm({ id: null, type: "gasto", amount: "", category: "comida", date: todayStr(), description: "" })}
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
                          <span className="flex items-center gap-1.5">
                            <c.icon size={13} style={{ color: c.color }} /> {c.label}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3" style={{ color: "var(--ink-dim)" }}>
                        {t.description || "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono-num" style={{ color: t.type === "ingreso" ? "var(--green)" : "var(--red)" }}>
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

function DeudasTab({ debts, extraPayment, setExtraPayment, snowball, avalanche, recommendation, totalDebt }) {
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
            <StrategyCard icon={Snowflake} title="Bola de nieve" subtitle="Paga primero el saldo más pequeño" result={snowball} debts={debts} order="snowball" />
            <StrategyCard icon={Mountain} title="Avalancha" subtitle="Paga primero la tasa más alta" result={avalanche} debts={debts} order="avalanche" />
          </div>

          <div className="ledger-card p-5">
            <h3 className="font-display text-base mb-4">Tus deudas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b hairline" style={{ color: "var(--ink-dim)" }}>
                    <th className="py-2 pr-3 font-normal">Nombre</th>
                    <th className="py-2 pr-3 font-normal text-right">Saldo</th>
                    <th className="py-2 pr-3 font-normal text-right">Tasa anual</th>
                    <th className="py-2 pl-3 font-normal text-right">Pago mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d) => (
                    <tr key={d.id} className="border-b hairline">
                      <td className="py-2 pr-3">{d.name}</td>
                      <td className="py-2 pr-3 text-right font-mono-num">{fmt(d.balance)}</td>
                      <td className="py-2 pr-3 text-right font-mono-num">{d.rate}%</td>
                      <td className="py-2 pl-3 text-right font-mono-num">{fmt(d.minPayment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
        <h3 className="font-display text-base mb-2">Guardado automático</h3>
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Tus datos se guardan automáticamente en este dispositivo cada vez que haces un cambio. No necesitas exportar
          nada para no perder información — pero sí es buena idea exportar de vez en cuando como respaldo, o si quieres
          pasar tus datos a otro dispositivo.
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
