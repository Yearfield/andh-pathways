/* ANDH PocketDoc — WHO anthropometric z-scores (0–19 y).
 * Port of the WHO 'anthro' (0–5 y, 2006 standards) and 'anthroplus' (5–19 y, 2007 reference) R packages.
 * Needs the LMS tables in who_lms.json (same folder). No dependencies; works offline.
 *
 *   AnthroZ.compute(lms, {sex:1|2, dob:'YYYY-MM-DD', date:'YYYY-MM-DD', gaWeeks:null|number,
 *                         weightKg, lenheiCm, measure:'l'|'h'|null, muacCm, oedema:false})
 *   → {ageDays, ageDaysUsed, corrected, ageMonths, table, bmi, clenhei, z:{wfa,lhfa,wflh,bfa,acfa,hfa,...}, flags, notes}
 */
(function (root) {
  'use strict';
  const DAY = 86400000;

  function zPlain(y, l, m, s) { return (Math.pow(y / m, l) - 1) / (s * l); }

  // WHO "restricted" LMS for weight-based indicators: linear extrapolation beyond ±3 SD
  function zAdj(y, l, m, s) {
    const sd = k => m * Math.pow(1 + l * s * k, 1 / l);
    let z = zPlain(y, l, m, s);
    if (z > 3) { const p3 = sd(3); z = 3 + (y - p3) / (p3 - sd(2)); }
    else if (z < -3) { const n3 = sd(-3); z = -3 + (y - n3) / (sd(-2) - n3); }
    return z;
  }
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const roundUp = x => Math.floor(x + 0.5);

  function ageInDays(dob, date) {
    const a = Date.UTC(...dob.split('-').map((v, i) => i === 1 ? +v - 1 : +v));
    const b = Date.UTC(...date.split('-').map((v, i) => i === 1 ? +v - 1 : +v));
    return (b - a) / DAY;
  }

  // Corrected age: preterm (< 37 wk) and chronological age < 24 months → subtract (40 − GA) weeks
  function correctAge(days, gaWeeks) {
    if (gaWeeks == null || gaWeeks >= 37 || days >= 730.5) return { days, corrected: false };
    const d = days - (40 - gaWeeks) * 7;
    return { days: Math.max(d, 0), corrected: true };
  }

  function lmsByIndex(tab, sex, i) { const t = tab[String(sex)]; return (i >= 0 && i < t.length) ? t[i] : null; }

  function lmsInterp(tab, sex, x, start, step) {      // linear interpolation of L, M, S (WFL/H by 0.1 cm; 2007 by month)
    const pos = (x - start) / step, lo = Math.floor(pos + 1e-9), f = pos - lo;
    const a = lmsByIndex(tab, sex, lo); if (!a) return null;
    if (f <= 1e-9) return a;
    const b = lmsByIndex(tab, sex, lo + 1); if (!b) return null;
    return [0, 1, 2].map(k => a[k] + f * (b[k] - a[k]));
  }

  function compute(lms, p) {
    const out = { notes: [], z: {}, flags: {} };
    const sex = +p.sex;
    let days = p.ageDays != null ? p.ageDays : ageInDays(p.dob, p.date || new Date().toISOString().slice(0, 10));
    out.ageDays = days;
    const c = correctAge(days, p.gaWeeks);
    days = c.days; out.corrected = c.corrected; out.ageDaysUsed = days;
    if (c.corrected) out.notes.push(`Corrected for prematurity: ${p.gaWeeks} wk → minus ${(40 - p.gaWeeks) * 7} days`);
    out.ageMonths = days / 30.4375;
    const w = p.weightKg, oed = !!p.oedema;
    if (oed) out.notes.push('Oedema: weight-based z-scores not calculated (WFA, WFL/H, BMI)');

    if (roundUp(days) <= 1856) {                         // ---- WHO 2006 standards, 0–60 months
      out.table = 'WHO 2006';
      const d = roundUp(days);
      let h = p.lenheiCm;
      if (h != null) {                                   // length < 2 y, height ≥ 2 y (0.7 cm rule)
        const meas = (p.measure || (d < 731 ? 'l' : 'h')).toLowerCase();
        if (d < 731 && meas === 'h') { h += 0.7; out.notes.push('Standing height < 2 y: +0.7 cm → length'); }
        if (d >= 731 && meas === 'l') { h -= 0.7; out.notes.push('Lying length ≥ 2 y: −0.7 cm → height'); }
        out.clenhei = r2(h);
        const L = lmsByIndex(lms.lhfa, sex, d); if (L) out.z.lhfa = r2(zPlain(h, ...L));
      }
      if (w != null && !oed) { const W = lmsByIndex(lms.wfa, sex, d); if (W) out.z.wfa = r2(zAdj(w, ...W)); }
      if (w != null && h != null) {
        out.bmi = r2(w / Math.pow(h / 100, 2));
        if (!oed) {
          const B = lmsByIndex(lms.bfa, sex, d); if (B) out.z.bfa = r2(zAdj(w / Math.pow(h / 100, 2), ...B));
          const useL = d < 731, tab = useL ? lms.wfl : lms.wfh, lo = useL ? 45 : 65, hi = useL ? 110 : 120;
          if (h >= lo && h <= hi) {
            const hh = Math.trunc(h * 10 + 1e-9) / 10, f = (h - hh) / 0.1;
            const a = lmsByIndex(tab, sex, Math.round((hh - lo) * 10));
            const b = f > 1e-9 ? lmsByIndex(tab, sex, Math.round((hh - lo) * 10) + 1) : a;
            if (a && b) out.z.wflh = r2(zAdj(w, ...[0, 1, 2].map(k => a[k] + f * (b[k] - a[k]))));
          } else out.notes.push(`WFL/H valid for ${useL ? 'length 45–110' : 'height 65–120'} cm only`);
        }
      }
      if (p.muacCm != null) {
        if (d >= 91) { const A = lmsByIndex(lms.acfa, sex, d - 91); if (A) out.z.acfa = r2(zAdj(p.muacCm, ...A)); }
        else out.notes.push('MUAC-for-age from 3 months (91 days); MUAC cut-offs apply 6–59 months');
      }
    } else {                                             // ---- WHO 2007 reference, 61–228 months
      out.table = 'WHO 2007';
      const mo = out.ageMonths, h = p.lenheiCm;
      if (mo >= 60 && mo < 229) {
        if (h != null) { const H = lmsInterp(lms.hfa2007, sex, mo, 60, 1); if (H) out.z.hfa = r2(zPlain(h, ...H)); out.clenhei = h; }
        if (w != null && !oed && mo < 121) { const W = lmsInterp(lms.wfa2007, sex, mo, 60, 1); if (W) out.z.wfa = r2(zAdj(w, ...W)); }
        if (w != null && mo >= 121) out.notes.push('Weight-for-age not defined > 10 y — use BMI-for-age');
        if (w != null && h != null) {
          out.bmi = r2(w / Math.pow(h / 100, 2));
          if (!oed) { const B = lmsInterp(lms.bfa2007, sex, mo, 60, 1); if (B) out.z.bfa = r2(zAdj(out.bmi && w / Math.pow(h / 100, 2), ...B)); }
        }
        if (p.muacCm != null) out.notes.push('No WHO MUAC-for-age reference > 5 y');
      } else out.notes.push('Outside 0–19 y: use the adult card');
    }
    // WHO biologically implausible flags
    const F = { wfa: [-6, 5], lhfa: [-6, 6], hfa: [-6, 6], wflh: [-5, 5], bfa: [-5, 5], acfa: [-5, 5] };
    for (const k in out.z) if (F[k] && (out.z[k] < F[k][0] || out.z[k] > F[k][1])) out.flags[k] = 'implausible — re-measure';
    return out;
  }

  // Inverse: value at a given z (to draw SD lines or show "−2 SD = x kg")
  function valueAtZ(l, m, s, z) { return m * Math.pow(1 + l * s * z, 1 / l); }

  const api = { compute, zPlain, zAdj, ageInDays, correctAge, valueAtZ };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AnthroZ = api;
})(this);
