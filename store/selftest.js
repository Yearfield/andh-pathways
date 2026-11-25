// CI only (SELFTEST=1 npm run build): runs inside the real Android / iOS webview and prints results to the native log,
// where .github/workflows/store-apps.yml reads them. Never part of a release build.
const log = (...a) => console.log("SELFTEST", ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(200); } return null; };
const go = async h => { location.hash = h; await sleep(1200); };
const inked = c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 200) n++; return n > 50; };
let pass = 0, fail = 0; const ok = (name, v, extra = "") => { v ? pass++ : fail++; log(name, v ? "PASS" : "FAIL", extra); };
const shot = async name => { log("SHOT", name); await sleep(7000); };

(async () => {
  try {
    await until(() => document.querySelector(".tiles"), 30000);
    log("START", navigator.userAgent);
    ok("altmed-tile-hidden", !document.querySelector('[data-go="#/altmed"]'));
    await shot("home");
    await go("#/altmed"); ok("altmed-route-goes-home", location.hash === "#/" || location.hash === "");

    // 1) printable card PDF (bundled file, opened by store.js in PDF.js)
    await go("#/score/wells-pe");
    const a = await until(() => document.querySelector('a[href$=".pdf"]'));
    a?.click();
    const c1 = await until(() => document.querySelector(".viewer canvas"));
    ok("card-pdf-renders", c1 && inked(c1), c1 ? `${c1.width}x${c1.height}` : document.querySelector(".viewer")?.textContent);
    await shot("card-pdf");
    document.querySelector(".viewer [data-x]")?.click();

    // 2) guideline PDF loaded by the user: same "Load PDF" input and IndexedDB storage, then a source tag opens it
    await go("#/dx/sam/sources");
    const inp = await until(() => document.querySelector('input[data-load="imam2015"]'));
    const blob = await (await fetch("cards/rass.pdf")).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], "imam2015.pdf", { type: "application/pdf" }));
    inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(1500);
    await go("#/dx/sam/arrival");
    (await until(() => document.querySelector('[data-src="imam2015:3"]')))?.click();
    const c2 = await until(() => document.querySelector(".viewer canvas"));
    ok("guideline-pdf-renders", c2 && inked(c2), c2 ? `${c2.width}x${c2.height}` : document.querySelector(".viewer")?.textContent);
    await shot("guideline-pdf");
    document.querySelector(".viewer [data-x]")?.click();
  } catch (e) { ok("no-exception", false, e.message); }
  log("DONE", `pass=${pass}`, `fail=${fail}`);
})();
