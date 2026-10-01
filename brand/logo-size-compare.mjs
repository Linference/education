#!/usr/bin/env node
// 生成 logo 在标题栏各尺寸下的效果对比
//
// 为什么：logo 在 20px 下糊成一团（GZ 两个字母挤在一起）。
// 与其猜哪个尺寸可用，不如把 16/18/20/22/24/28 都渲染出来看。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");           // 本脚本在 brand/ 下，上一级是仓库根
const BRAND = path.join(HERE, "assets");
const SRC = path.join(BRAND, "icon-1024.png");
const MARK = path.join(BRAND, "logo-mark-1024.png");
const OUT = path.join(ROOT, "产出", "logo尺码对比.html");

const b64 = (p) => fs.readFileSync(p).toString("base64");

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>logo 尺寸对比</title>
<style>
  body { margin:0; padding:24px; font:13px -apple-system,"Segoe UI","Microsoft YaHei",sans-serif; background:#f6f6f6; color:#2e3338; }
  h2 { font-size:14px; margin:22px 0 10px; color:#5c5c5c; font-weight:600; }
  .row { display:flex; align-items:flex-end; gap:22px; flex-wrap:wrap; background:#fff; padding:16px 18px; border:1px solid #e0e0e0; border-radius:8px; }
  .item { text-align:center; }
  .item .box { display:inline-grid; place-items:center; }
  .item img { display:block; image-rendering:auto; }
  .item .lbl { margin-top:7px; font-size:11px; color:#8a8a8a; }
  /* 模拟标题栏实际背景 */
  .bar { background:#f6f6f6; }
  .bar .item { background:#f6f6f6; padding:4px; border-radius:5px; }
</style></head>
<body>
  <h2>A. 应用图标（圆角底）—— 各尺寸</h2>
  <div class="row">
    ${[16, 18, 20, 22, 24, 28, 32].map((s) => `
    <div class="item">
      <span class="box"><img src="data:image/png;base64,${b64(SRC)}" width="${s}" height="${s}" style="border-radius:${Math.round(s * 0.22)}px"></span>
      <div class="lbl">${s}px</div>
    </div>`).join("")}
  </div>

  <h2>B. 同上，但放大 4 倍显示（看清像素真相）</h2>
  <div class="row">
    ${[16, 18, 20, 22, 24, 28].map((s) => `
    <div class="item">
      <span class="box"><img src="data:image/png;base64,${b64(SRC)}" width="${s * 4}" height="${s * 4}"
        style="border-radius:${Math.round(s * 4 * 0.22)}px; image-rendering:pixelated"></span>
      <div class="lbl">${s}px ×4</div>
    </div>`).join("")}
  </div>

  <h2>C. 透明底主图标（无圆角）</h2>
  <div class="row">
    ${[16, 20, 24, 28, 32].map((s) => `
    <div class="item">
      <span class="box" style="background:#f6f6f6; padding:2px"><img src="data:image/png;base64,${b64(MARK)}" width="${s}" height="${s}"></span>
      <div class="lbl">${s}px</div>
    </div>`).join("")}
  </div>

  <h2>D. 放进标题栏的样子（模拟真实布局）</h2>
  <div class="row bar" style="gap:0; align-items:center; padding:0">
    ${[20, 24, 28].map((s) => `
    <div class="item" style="display:flex; align-items:center; gap:8px; padding:7px 14px; border-right:1px solid #e0e0e0">
      <img src="data:image/png;base64,${b64(SRC)}" width="${s}" height="${s}" style="border-radius:${Math.round(s * 0.22)}px">
      <span style="font-weight:600; font-size:13.5px; letter-spacing:.5px">格致</span>
      <span style="width:1px;height:16px;background:#d0d0d0"></span>
      <span style="font-size:13px;color:#5c5c5c">我的资料库</span>
      <span style="color:#ababab">›</span>
      <span style="font-size:13px">情态动词.md</span>
      <span style="font-size:10px;color:#ababab;margin-left:6px">${s}px</span>
    </div>`).join("")}
  </div>

  <h2>E. 折叠图标候选（看哪个读得出"折叠侧栏"）</h2>
  <div class="row">
    ${[
      ["竖线+左箭头", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M13 10l-2 2 2 2" stroke-width="2"/></svg>`],
      ["竖线+左箭头(粗)", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 9l-3 3 3 3" stroke-width="2.4"/></svg>`],
      ["双箭头收起", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M14 8l-2.5 4 2.5 4"/></svg>`],
      ["实心侧栏条", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="5.5" y="6.5" width="4" height="11" rx="1.2" fill="#5c5c5c" stroke="none"/></svg>`],
      ["左侧栏高亮", `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#7f6df2" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="5.5" y="6.5" width="4" height="11" rx="1.2" fill="#7f6df2" stroke="none"/><path d="M13 9h5M13 12h5M13 15h5" stroke="#5c5c5c" stroke-width="1.4"/></svg>`],
    ].map(([name, svg]) => `<div class="item"><span class="box">${svg}</span><div class="lbl">${name}</div></div>`).join("")}
  </div>
</body></html>`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`已生成：${path.relative(ROOT, OUT)}`);
console.log("用浏览器打开即可对比各尺寸效果");
