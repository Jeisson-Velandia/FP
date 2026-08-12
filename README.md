<div align="center">

# 💰 Mi Libro Mayor

### Organiza tus finanzas personales, controla tus deudas y toma mejores decisiones con tu dinero.

[![Hecho con React](https://img.shields.io/badge/Hecho%20con-React-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=white)](https://firebase.google.com)
[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-green)](#-licencia)

**[🚀 Pruébala ahora — es gratis](https://jeisson-velandia.github.io/FP/)**

</div>

---

## ¿Qué es esto?

**Mi Libro Mayor** es una aplicación web gratuita para llevar el control de tus finanzas
personales: cuánto ganas, cuánto gastas, cuánto debes y cómo salir de tus deudas más rápido —
todo en un tablero simple, con tus datos guardados de forma privada en la nube y accesibles
desde cualquier dispositivo.

Crea tu cuenta con tu correo, y en menos de dos minutos tienes tu situación financiera
organizada y bajo control.

## ✨ Qué puedes hacer

- 📊 **Tablero visual** con un semáforo de salud financiera (verde/amarillo/rojo) y gráficos de
  presupuesto vs. gasto real por categoría.
- 💵 **Registra ingresos y gastos** día a día, con categorías (vivienda, comida, transporte,
  entretenimiento, salud, deuda y más).
- 🎯 **Define presupuestos límite** por categoría y recibe una alerta visual cuando te estás
  acercando o ya te pasaste.
- 💳 **Controla tus deudas**: registra el saldo, la tasa de interés y el pago mínimo de cada una.
- 🧠 **Estrategia de pago inteligente**: la app compara automáticamente los métodos *Bola de
  Nieve* y *Avalancha*, y te recomienda cuál te conviene según tus números.
- 🔗 **Pagos de deuda vinculados**: cuando registras un abono a una tarjeta o préstamo, se
  descuenta solo del saldo correspondiente — y si la terminas de pagar, se marca como saldada
  automáticamente.
- ☁️ **Cuenta en la nube**: tus datos están asociados a tu perfil, no a un dispositivo. Inicia
  sesión desde tu celular o tu computador y ves la misma información, siempre privada.
- 📱 **Pensada para el celular**: en pantallas pequeñas el menú se convierte en una barra fija
  abajo, como cualquier app nativa. Agrégala a tu pantalla de inicio y úsala como una app más.

## 🔒 Privacidad

Tus datos financieros son tuyos. Cada cuenta solo puede leer y escribir su propia información —
nadie más puede ver tus ingresos, deudas o movimientos, ni siquiera con acceso a la base de
datos. La app no vende, comparte ni analiza tus datos con terceros.

## 🛠️ Hecha con

React · Tailwind CSS · Recharts · Firebase (Authentication + Firestore) · Vite · GitHub Pages

---

<details>
<summary><strong>🚀 ¿Quieres desplegar tu propia copia? (para desarrolladores)</strong></summary>

Este proyecto es de código abierto. Si quieres correrlo tú mismo con tu propia base de datos,
necesitas Node.js instalado y una cuenta gratuita de Firebase.

### 0. Crea tu proyecto de Firebase (gratis)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto
   nuevo (puedes desactivar Google Analytics, no lo necesitas).
2. **Authentication** → pestaña "Sign-in method" → habilita **Correo electrónico/contraseña**.
3. **Firestore Database** → "Crear base de datos" → cualquier región cercana → modo de
   producción.
4. En Firestore, pestaña **Reglas**, reemplaza el contenido por esto y publica:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /profiles/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

   Esto garantiza que cada usuario solo pueda leer y escribir su propio documento.

5. **Configuración del proyecto** (ícono de engranaje) → "Tus apps" → ícono `</>` (Web) →
   regístrala → copia el objeto `firebaseConfig` que te muestra.
6. Pega esos valores en `src/firebase.js`, reemplazando los de ejemplo.

### 1. Sube el proyecto a GitHub

```bash
git init
git add .
git commit -m "Primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/NOMBRE-DEL-REPO.git
git push -u origin main
```

### 2. Ajusta el nombre del repositorio

En `vite.config.js`, cambia:

```js
base: "/NOMBRE-DEL-REPO/",
```

por el nombre real de tu repositorio.

### 3. Activa GitHub Pages

En tu repositorio: **Settings → Pages → Source → GitHub Actions**. El workflow en
`.github/workflows/deploy.yml` compila y publica la app automáticamente en cada `push` a `main`.
Después del primer despliegue (1–2 min), tu app queda en:

```
https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/
```

### Desarrollo local

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

</details>

---

<div align="center">

Hecho por **Jeisson Velandia** · [Conéctate en LinkedIn]([https://www.linkedin.com/in/TU-USUARIO/](https://www.linkedin.com/in/jeisson-velandia-535298236/))

Si te sirvió, una ⭐ en el repositorio ayuda a que más personas lo encuentren.

</div>
