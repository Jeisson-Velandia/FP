// Copia los módulos puros de src/lib a functions/lib para que la Cloud Function use EXACTAMENTE
// la misma lógica que la app (una sola fuente de verdad). Firebase solo sube la carpeta functions/,
// por eso no se puede importar directamente desde ../src. Se ejecuta en `predeploy` (firebase.json).
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["debts.js", "format.js", "messageParser.js", "monthly.js", "quickEntry.js"];
mkdirSync(join(root, "functions", "lib"), { recursive: true });
for (const f of files) copyFileSync(join(root, "src", "lib", f), join(root, "functions", "lib", f));
console.log(`sync: ${files.length} módulos copiados a functions/lib`);
