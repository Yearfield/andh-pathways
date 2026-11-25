// Store build (Android / iOS) only: tools/build-store.mjs adds this script to www/index.html. The GitHub Pages site never loads it.
// Phone webviews cannot open a bundled PDF the way a browser tab does (Android shows nothing, iOS has no tab to open it in),
// so the printable cards (cards/*.pdf) open in the same PDF.js viewer the app already uses for guideline PDFs.
let pdfjs = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function openCard(href, title) {
  const v = document.createElement("div"); v.className = "viewer";
  v.innerHTML = `<div class="vbar"><button data-x>Close</button><span class="vt">${esc(title)}</span>
    <button data-p="-1" aria-label="Previous page">‹</button><button data-p="1" aria-label="Next page">›</button>
    <button data-z="-1" aria-label="Zoom out">−</button><button data-z="1" aria-label="Zoom in">+</button></div><div class="stage"></div>`;
  document.body.appendChild(v); const stage = v.querySelector(".stage");
  v.querySelector("[data-x]").onclick = () => v.remove();
  try {
    pdfjs = pdfjs || await import("./vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.mjs";
    const buf = await (await fetch(href)).arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf, standardFontDataUrl: "vendor/pdfjs/standard_fonts/" }).promise;
    let page = 1, zoom = 1;
    const draw = async () => {
      const p = await doc.getPage(page), base = p.getViewport({ scale: 1 });
      const scale = (stage.clientWidth - 16) / base.width * zoom, dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr }), c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height; c.style.width = vp.width / dpr + "px";
      await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      stage.replaceChildren(c); v.querySelector(".vt").textContent = `${title} · page ${page}/${doc.numPages}`;
    };
    v.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { page = Math.min(doc.numPages, Math.max(1, page + +b.dataset.p)); draw(); });
    v.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zoom = Math.min(3, Math.max(.6, zoom * (b.dataset.z > 0 ? 1.3 : 1 / 1.3))); draw(); });
    await draw();
  } catch (e) { stage.innerHTML = `<div class="msg">Could not open the PDF: ${esc(e.message)}</div>`; }
}

document.addEventListener("click", e => {
  const a = e.target.closest?.("a[href]"); if (!a) return;
  const url = new URL(a.getAttribute("href"), location.href);
  if (url.origin !== location.origin || !/\.pdf$/i.test(url.pathname)) return; // online links keep their normal behaviour
  e.preventDefault(); e.stopPropagation();
  openCard(url.href, (a.textContent || "Card").trim());
}, true);
