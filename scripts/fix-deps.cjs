/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * postinstall: @react-pdf/hyphenate solo declara la condición "import" en sus exports, lo que impide
 * cargar @react-pdf/renderer desde tsx (seed y worker de jobs, que corren como CommonJS).
 * Se agrega la condición "default" para que Node pueda resolverlo con require(esm).
 */
const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "node_modules", "@react-pdf", "hyphenate", "package.json");
if (fs.existsSync(file)) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  for (const key of Object.keys(pkg.exports ?? {})) {
    const e = pkg.exports[key];
    if (e && typeof e === "object" && e.import && !e.default) {
      e.default = e.import;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
    console.log("[fix-deps] @react-pdf/hyphenate: condición 'default' agregada");
  }
}
