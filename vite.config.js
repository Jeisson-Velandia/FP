import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: change "NOMBRE-DEL-REPO" below to match your GitHub repository name
// e.g. if your repo is github.com/tuusuario/finanzas, use base: "/finanzas/"
export default defineConfig({
  plugins: [react()],
  base: "/FP/",
});
