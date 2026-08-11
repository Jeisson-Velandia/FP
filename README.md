# Mi Libro Mayor — Finanzas Personales

App de finanzas personales (ingresos, gastos, presupuestos y estrategia de deudas), lista para
publicar gratis en GitHub Pages y abrir desde el celular como si fuera una app.

- En escritorio, el menú aparece a la izquierda.
- En celular, el menú aparece como una **barra fija abajo**, estilo app nativa.
- Tus datos se guardan automáticamente en el navegador de tu celular (localStorage) — no se
  pierden al cerrar la pestaña. También puedes exportarlos/importarlos como JSON desde la
  pestaña "Datos".

## 1. Sube este proyecto a GitHub

1. Crea un repositorio nuevo en GitHub (puede ser público o privado — GitHub Pages funciona
   igual, aunque en cuentas gratuitas Pages para repos privados requiere GitHub Pro).
2. Sube todos estos archivos a ese repositorio (arrastrándolos en la web de GitHub, o con git):

   ```bash
   git init
   git add .
   git commit -m "Primera versión de la app de finanzas"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/NOMBRE-DEL-REPO.git
   git push -u origin main
   ```

## 2. Ajusta el nombre del repositorio en la configuración

Abre `vite.config.js` y cambia esta línea:

```js
base: "/NOMBRE-DEL-REPO/",
```

por el nombre real de tu repositorio, por ejemplo:

```js
base: "/mis-finanzas/",
```

Esto es necesario porque GitHub Pages publica tu app en una subcarpeta
(`tuusuario.github.io/mis-finanzas/`), no en la raíz del dominio.

## 3. Activa GitHub Pages

1. En tu repositorio en GitHub, ve a **Settings → Pages**.
2. En "Build and deployment", selecciona la fuente **GitHub Actions**.
3. Cada vez que hagas `git push` a la rama `main`, el workflow en
   `.github/workflows/deploy.yml` va a compilar y publicar la app automáticamente.
4. Después del primer despliegue (tarda 1–2 minutos), tu app va a estar disponible en:

   ```
   https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/
   ```

## 4. Ábrela desde el celular

Abre esa URL en el navegador de tu celular (Chrome, Safari, etc.). Para que se sienta como una
app real:

- **Android (Chrome):** menú (⋮) → "Añadir a pantalla de inicio".
- **iPhone (Safari):** botón de compartir → "Añadir a pantalla de inicio".

Con eso queda un ícono en tu celular que abre la app en pantalla completa, sin la barra del
navegador, con el menú fijo abajo.

## Desarrollo local (opcional)

Si quieres probar cambios antes de subirlos:

```bash
npm install
npm run dev
```

Y para generar la versión de producción manualmente:

```bash
npm run build
npm run preview
```
