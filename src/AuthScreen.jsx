import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { Wallet, LogIn, UserPlus, AlertTriangle } from "lucide-react";
import { auth } from "./firebase";

const ERROR_MESSAGES = {
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Intenta iniciar sesión.",
  "auth/invalid-email": "Ese correo no parece válido.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/user-not-found": "No hay ninguna cuenta con ese correo.",
  "auth/wrong-password": "Contraseña incorrecta.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a intentar.",
};

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const friendlyError = (err) => ERROR_MESSAGES[err?.code] || "Algo salió mal. Intenta de nuevo.";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email || !password) return;
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError("");
    setNotice("");
    if (!email) {
      setError("Escribe tu correo arriba primero, luego dale a este botón.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice("Te enviamos un correo con instrucciones para restablecer tu contraseña.");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="app-shell min-h-screen w-full flex items-center justify-center p-5">
      <div className="ledger-card p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-1 justify-center">
          <Wallet size={22} style={{ color: "var(--brass)" }} />
          <h1 className="font-display text-xl tracking-wide">Mi Libro Mayor</h1>
        </div>
        <p className="text-xs text-center mb-6" style={{ color: "var(--ink-dim)" }}>
          Tus finanzas, guardadas en la nube y accesibles desde cualquier dispositivo.
        </p>

        <div className="flex mb-5 rounded overflow-hidden border hairline" style={{ borderWidth: 1 }}>
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); setNotice(""); }}
            className="flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2"
            style={{
              background: mode === "login" ? "var(--surface2)" : "transparent",
              color: mode === "login" ? "var(--brass)" : "var(--ink-dim)",
            }}
          >
            <LogIn size={14} /> Ingresar
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); setNotice(""); }}
            className="flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2"
            style={{
              background: mode === "signup" ? "var(--surface2)" : "transparent",
              color: mode === "signup" ? "var(--brass)" : "var(--ink-dim)",
            }}
          >
            <UserPlus size={14} /> Crear cuenta
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
            <span>Correo</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-dim)" }}>
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
            />
          </label>

          {error && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--red)" }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          {notice && (
            <p className="text-xs" style={{ color: "var(--green)" }}>
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-brass w-full rounded px-4 py-2 text-sm font-medium mt-1">
            {busy ? "Un momento..." : mode === "login" ? "Ingresar" : "Crear mi cuenta"}
          </button>
        </form>

        {mode === "login" && (
          <button onClick={resetPassword} className="text-xs mt-4 w-full text-center underline" style={{ color: "var(--ink-dim)" }}>
            Olvidé mi contraseña
          </button>
        )}
      </div>
    </div>
  );
}
