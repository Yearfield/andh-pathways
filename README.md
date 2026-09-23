# JAD clinical pathways — offline reference app

Reference only. No patient details are stored anywhere in this app.

## Put it online (GitHub Pages, free)

GitHub Pages is free for **public** repositories. The site is public, which is fine here:
the app holds no patient data, and the guideline PDFs are **not** uploaded — they are loaded
onto your phone from inside the app and never leave it.

1. Create a free account at github.com.
2. New repository → name it e.g. `andh-pathways` → **Public** → Create.
3. On the repository page: **Add file → Upload files**. Drag in *everything inside* this
   folder (index.html, app.js, style.css, sw.js, manifest.webmanifest, .nojekyll, and the
   data, fonts, icons and vendor folders). Commit.
   (If the web uploader hides `.nojekyll`, create it with **Add file → Create new file**,
   name `.nojekyll`, leave it empty.)
4. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*,
   Branch = `main`, folder `/ (root)` → Save.
5. After a minute or two the address appears at the top of that page:
   `https://<your-username>.github.io/andh-pathways/`

## Install on Android

1. Open that address in **Chrome** (with signal).
2. Menu ⋮ → **Add to Home screen / Install app**.
3. Open it once from the home screen while online so it saves itself. From then on it works
   with no signal.
4. In the app: open a diagnosis → **Sources** tab → **Load PDF** for each guideline
   (from your phone's Downloads). They stay on the phone for offline use.

## Using it

- **Arrival**: the 11 admission sections; the numbered chips jump between them.
- **Days**: one day (or time block) per screen — tap the strip, use the ‹ › buttons, or swipe.
- **Doses**: drug boxes, escalation, discharge criteria, follow-up.
- **Nursing**: what is monitored, how often, when to call the doctor.
- **Amber tags** (e.g. `IMCI 2022 p33`) open the guideline at that printed page.
  If a tag lands on the wrong page, set the **page offset** for that guideline in Sources
  (PDF page number minus the page number printed on the page).
- **Verify**: turns on a ✓ next to every item and a progress bar. Ticks are saved on the
  phone with the date. If an item's text or source is later edited, its tick clears
  automatically so it has to be checked again.
- **†** = clinical or local addition, not in the SA guideline.

## Updating content

Each diagnosis is one file in `data/` (e.g. `data/sam.json`), listed in `data/index.json`.
Edit or add files on GitHub (pencil icon → edit → Commit). The phone picks up the change
next time the app is opened with signal. No reinstall needed.

If you change app files (app.js, style.css, index.html, sw.js), also change
`VERSION` at the top of `sw.js` (e.g. `andh-v1` → `andh-v2`) so phones refresh their saved copy.

### Item format in the data files

`t` text · `s` source as `sourceid:printedpage` (ids in `data/sources.json`) ·
`d` † flag · `b` bold · `k` kind (`check`, `value`, `yn`, `info`, `sub`) · `h` heading.

## Licences

PDF.js (Apache 2.0) in `vendor/pdfjs/`; IBM Plex Sans/Serif and Caveat fonts (SIL OFL) in `fonts/`.
