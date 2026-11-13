#!/usr/bin/env node
// Generate a comparison of the logo at various sizes in the title bar
//
// Why: at 20px the logo turns into a blur (the G and Z letters crowd together).
// Rather than guessing which size is usable, render 16/18/20/22/24/28 and look.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");           // this script lives in brand/; one level up is the repo root
const BRAND = path.join(HERE, "assets");
const SRC = path.join(BRAND, "icon-1024.png");
const MARK = path.join(BRAND, "logo-mark-1024.png");
const OUT = path.join(ROOT, "产出", "logo尺码对比.html");

const b64 = (p) => fs.readFileSync(p).toString("base64");

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Logo size comparison</title>
<style>
  body { margin:0; padding:24px; font:13px -apple-system,"Segoe UI","Microsoft YaHei",sans-serif; background:#f6f6f6; color:#2e3338; }
  h2 { font-size:14px; margin:22px 0 10px; color:#5c5c5c; font-weight:600; }
  .row { display:flex; align-items:flex-end; gap:22px; flex-wrap:wrap; background:#fff; padding:16px 18px; border:1px solid #e0e0e0; border-radius:8px; }
  .item { text-align:center; }
  .item .box { display:inline-grid; place-items:center; }
  .item img { display:block; image-rendering:auto; }
  .item .lbl { margin-top:7px; font-size:11px; color:#8a8a8a; }
  /* Simulate the title bar's actual background */
  .bar { background:#f6f6f6; }
  .bar .item { background:#f6f6f6; padding:4px; border-radius:5px; }
</style></head>
<body>
  <h2>A. App icon (rounded background) — all sizes</h2>
  <div class="row">
    ${[16, 18, 20, 22, 24, 28, 32].map((s) => `
    <div class="item">
      <span class="box"><img src="data:image/png;base64,${b64(SRC)}" width="${s}" height="${s}" style="border-radius:${Math.round(s * 0.22)}px"></span>
      <div class="lbl">${s}px</div>
    </div>`).join("")}
  </div>

  <h2>B. Same as above, shown at 4× (to see the pixels as they really are)</h2>
  <div class="row">
    ${[16, 18, 20, 22, 24, 28].map((s) => `
    <div class="item">
      <span class="box"><img src="data:image/png;base64,${b64(SRC)}" width="${s * 4}" height="${s * 4}"
        style="border-radius:${Math.round(s * 4 * 0.22)}px; image-rendering:pixelated"></span>
      <div class="lbl">${s}px ×4</div>
    </div>`).join("")}
  </div>

  <h2>C. Master icon on transparent background (no rounded corners)</h2>
  <div class="row">
    ${[16, 20, 24, 28, 32].map((s) => `
    <div class="item">
      <span class="box" style="background:#f6f6f6; padding:2px"><img src="data:image/png;base64,${b64(MARK)}" width="${s}" height="${s}"></span>
      <div class="lbl">${s}px</div>
    </div>`).join("")}
  </div>

  <h2>D. Appearance in the title bar (simulated real layout)</h2>
  <div class="row bar" style="gap:0; align-items:center; padding:0">
    ${[20, 24, 28].map((s) => `
    <div class="item" style="display:flex; align-items:center; gap:8px; padding:7px 14px; border-right:1px solid #e0e0e0">
      <img src="data:image/png;base64,${b64(SRC)}" width="${s}" height="${s}" style="border-radius:${Math.round(s * 0.22)}px">
      <span style="font-weight:600; font-size:13.5px; letter-spacing:.5px">格致</span>
      <span style="width:1px;height:16px;background:#d0d0d0"></span>
      <span style="font-size:13px;color:#5c5c5c">My Library</span>
      <span style="color:#ababab">›</span>
      <span style="font-size:13px">modal-verbs.md</span>
      <span style="font-size:10px;color:#ababab;margin-left:6px">${s}px</span>
    </div>`).join("")}
  </div>

  <h2>E. Collapse-icon candidates (which one reads as "collapse sidebar"?)</h2>
  <div class="row">
    ${[
      ["Vertical line + left arrow", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M13 10l-2 2 2 2" stroke-width="2"/></svg>`],
      ["Vertical line + left arrow (bold)", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 9l-3 3 3 3" stroke-width="2.4"/></svg>`],
      ["Double arrow collapse", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M14 8l-2.5 4 2.5 4"/></svg>`],
      ["Solid sidebar bar", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="5.5" y="6.5" width="4" height="11" rx="1.2" fill="#5c5c5c" stroke="none"/></svg>`],
      ["Highlighted left sidebar", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#7f6df2" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="5.5" y="6.5" width="4" height="11" rx="1.2" fill="#7f6df2" stroke="none"/><path d="M13 9h5M13 12h5M13 15h5" stroke="#5c5c5c" stroke-width="1.4"/></svg>`],
    ].map(([name, svg]) => `<div class="item"><span class="box">${svg}</span><div class="lbl">${name}</div></div>`).join("")}
  </div>
</body></html>`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`Generated: ${path.relative(ROOT, OUT)}`);
console.log("Open it in a browser to compare the sizes");
