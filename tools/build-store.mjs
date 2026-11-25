// Builds www/: the copy of the app that goes inside the Android and iOS store apps (Capacitor webDir).
// The GitHub Pages site is not changed by this: it keeps serving the repository root as before.
//   node tools/build-store.mjs      (or: npm run build)
// What differs from the website:
//   - Alternative Medicine is left out: no altmed data, a stub altmed.js, no home tile.
//   - No service worker: every file is already inside the app, so there is nothing to save for offline use.
//   - PDF.js is the legacy build (works in older phone webviews).
//   - store/store.js opens the printable card PDFs in the app's own PDF viewer.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "www");
const FILES = ["index.html", "style.css", "app.js", "calc.js", "links.js", "scores.js", "vitals.js", "anthro.js", "anthro_z.js", "formulary.js", "manifest.webmanifest"];
const DIRS = ["data", "cards", "fonts", "icons", "vendor", "wheel"];
const SKIP = [join("data", "altmed")]; // Alternative Medicine data stays out of the store build

rmSync(out, { recursive: true, force: true }); mkdirSync(out);
for (const f of FILES) cpSync(join(root, f), join(out, f));
for (const d of DIRS) cpSync(join(root, d), join(out, d), { recursive: true, filter: src => !SKIP.some(s => src.startsWith(join(root, s))) });
cpSync(join(root, "store", "altmed.js"), join(out, "altmed.js"));
cpSync(join(root, "store", "store.js"), join(out, "store.js"));
// PDF.js: the website's copy needs a recent browser (Chrome 119+, Safari 17.4+). Phone webviews can be older (an Android phone whose
// WebView is not updated, iOS 15-17), so the store apps use the "legacy" build of the same PDF.js version, made for older browsers.
const LEGACY = join(root, "node_modules", "pdfjs-dist", "legacy", "build");
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) cpSync(join(LEGACY, f), join(out, "vendor", "pdfjs", f));
const SELFTEST = process.env.SELFTEST === "1"; // CI only: adds store/selftest.js, which checks PDF loading inside the real app
if (SELFTEST) cpSync(join(root, "store", "selftest.js"), join(out, "selftest.js"));

// Edits to the copied files. Each must match exactly once, so a change in app.js that moves the text stops the build instead of shipping the section.
function edit(file, edits) {
  const p = join(out, file); let s = readFileSync(p, "utf8");
  for (const [what, re, to] of edits) {
    const n = (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
    if (n !== 1) throw new Error(`build-store: ${file}: expected 1 match for "${what}", found ${n}`);
    s = s.replace(re, to);
  }
  writeFileSync(p, s);
}
edit("app.js", [
  ["Alternative Medicine home tile", /\n\s*<button class="tile spring" data-go="#\/altmed">[^\n]*?<\/button>/, ""],
  ["service worker registration", /if \("serviceWorker" in navigator\) \{/, 'if (false && "serviceWorker" in navigator) { // store build: files are bundled, no service worker'],
]);
edit("index.html", [
  ["store script", /<script type="module" src="app.js"><\/script>/, '<script type="module" src="store.js"></script>\n<script type="module" src="app.js"></script>' + (SELFTEST ? '\n<script type="module" src="selftest.js"></script>' : "")],
  ["manifest link", /<link rel="manifest" href="manifest.webmanifest">\n/, ""],
]);

// Checks: nothing of Alternative Medicine may be left in the build.
if (existsSync(join(out, "data", "altmed"))) throw new Error("build-store: data/altmed was copied");
if (/data-go="#\/altmed"/.test(readFileSync(join(out, "app.js"), "utf8"))) throw new Error("build-store: Alternative Medicine tile still present");
console.log((SELFTEST ? "[SELFTEST] " : "") + "www/ built for the store apps (Alternative Medicine left out, no service worker).");
