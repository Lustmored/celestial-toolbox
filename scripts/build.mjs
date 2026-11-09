import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
// W GitHub Actions numer buildu trafia do wersji, więc menedżer userscriptów widzi każdą aktualizację.
const version = process.env.GITHUB_RUN_NUMBER ? `${pkg.version}.${process.env.GITHUB_RUN_NUMBER}` : pkg.version;
// Adres, z którego userscript się aktualizuje (GitHub Pages repozytorium).
const base = (process.env.TOOLBOX_BASE_URL || pkg.config?.baseUrl || "").replace(/\/$/, "");

// Userscript jest tylko loaderem: przy każdym wejściu do gry pobiera aktualny bundle z Pages,
// więc nowe makra są widoczne po zwykłym odświeżeniu strony. Wersję loadera podbijamy tylko,
// gdy zmienia się sam loader (Violentmonkey aktualizuje go rzadko).
const LOADER_VERSION = "1.0.0";
const header = `// ==UserScript==
// @name         Celestial Toolbox
// @namespace    celestial-toolbox
// @version      ${base ? LOADER_VERSION : version}
// @description  Panel makr QoL do Celestial Incremental
// @match        https://icecreamdudes.github.io/celestial_incremental/*
// @grant        none
// @inject-into  page
// @run-at       document-idle
${base ? `// @updateURL    ${base}/celestial-toolbox.meta.js\n// @downloadURL  ${base}/celestial-toolbox.user.js\n` : ""}// ==/UserScript==
`;

mkdirSync("dist", { recursive: true });
const common = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: "es2020",
  define: { __VERSION__: JSON.stringify(version) },
  legalComments: "none",
};
await build({ ...common, outfile: "dist/celestial-toolbox.js", minify: true });
const { writeFileSync } = await import("node:fs");
if (base) {
  writeFileSync("dist/celestial-toolbox.user.js", header + `
(() => {
  if (window.CelestialToolbox) return;
  const s = document.createElement("script");
  s.src = ${JSON.stringify(base + "/celestial-toolbox.js")} + "?t=" + Date.now();
  s.onerror = () => console.error("[Toolbox] Nie udało się pobrać toolboxa z " + s.src);
  (document.head || document.documentElement).append(s);
})();
`);
} else {
  // Lokalnie (bez adresu Pages): pełny bundle w userscripcie.
  await build({ ...common, outfile: "dist/celestial-toolbox.user.js", banner: { js: header } });
}
writeFileSync("dist/celestial-toolbox.meta.js", header);

// Strona instalacyjna na GitHub Pages: link do userscriptu + bookmarklet awaryjny.
const src = base ? base + "/celestial-toolbox.js" : "celestial-toolbox.js";
const bookmarklet = `javascript:(()=>{if(window.CelestialToolbox)return;const s=document.createElement('script');s.src='${src}?'+Date.now();document.body.append(s)})()`;
writeFileSync("dist/index.html", `<!doctype html><meta charset="utf-8"><title>Celestial Toolbox</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;background:#15161c;color:#ddd}a{color:#8ab4ff}code{background:#262836;padding:1px 4px;border-radius:3px}</style>
<h1>Celestial Toolbox <small>v${version}</small></h1>
<p><b>Instalacja:</b> z Violentmonkey/Tampermonkey kliknij <a href="celestial-toolbox.user.js">celestial-toolbox.user.js</a>. Skrypt przy każdym wejściu do gry pobiera najnowszą wersję toolboxa — wystarczy odświeżyć stronę.</p>
<p><b>Bez wtyczki:</b> przeciągnij na pasek zakładek: <a href="${bookmarklet.replace(/"/g, "&quot;")}">Celestial Toolbox</a> i kliknij go na stronie gry.</p>
<p>W grze: <code>Alt+M</code> zwija panel, <code>Alt+P</code> pauzuje wszystkie makra.</p>`);
console.log("built v" + version, base ? "(update: " + base + ")" : "(bez updateURL)");
