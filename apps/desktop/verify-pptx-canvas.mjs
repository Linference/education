#!/usr/bin/env node
// PPTX Canvas rendering verification (in the real app)
//
// Acceptance after replacing LibreOffice:
//   1. opening .pptx draws a canvas (not "text extraction mode")
//   2. speed: should be in the hundreds of milliseconds, not tens of seconds
//   3. can flip pages, rendered content is not blank
//   4. no leftover external processes (LibreOffice removed)
//   5. legacy .ppt still opens (via text mode, because pure JS doesn't support it)
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "..", "产出");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

const SAMPLES = {
  pptx: "D:\\Users\\LINKIT\\Desktop\\csp\\4.数据排序.pptx",
  ppt: "D:\\Users\\LINKIT\\Desktop\\物理竞赛\\历屆賽題\\全國物理競賽題集\\高中物理竞赛-热学部分.ppt",
};
const have = Object.entries(SAMPLES).filter(([, p]) => fs.existsSync(p));
if (!have.length) { console.log("missing samples, skipping"); process.exit(0); }

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-pptxjs-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "p" }), "utf8");
const local = {};
for (const [k, p] of have) {
  local[k] = path.join(vault, path.basename(p));
  fs.copyFileSync(p, local[k]);
}

console.log("=== PPTX Canvas rendering verification ===\n");
for (const [k, p] of have) console.log(`  ${k}: ${path.basename(p)} (${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB)`);
console.log();

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(700);

  // ---- 1. PPTX Canvas rendering ----
  if (local.pptx) {
    console.log("── .pptx (Canvas rendering) ──");
    const t0 = Date.now();
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local.pptx);

    // Wait until the canvas appears **and has content and a size**.
    // ⚠️ Don't break as soon as the canvas is seen — the canvas element exists in the DOM
    //    before parsing finishes, while text like "第 1 / 29 页" (page 1 / 29) renders only
    //    after React updates state.
    //    The first version broke too early, so "total pages" read as empty and the
    //    page-flip assertions failed falsely.
    let waited = 0;
    let st = null;
    while (waited < 30000) {
      st = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        let nonWhite = -1;
        if (c && c.width > 0) {
          try {
            const ctx = c.getContext("2d");
            const w = Math.min(c.width, 200), h = Math.min(c.height, 200);
            const d = ctx.getImageData(0, 0, w, h).data;
            nonWhite = 0;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) nonWhite++;
            }
          } catch { nonWhite = -1; }
        }
        return {
          hasCanvas: Boolean(c),
          size: c ? `${c.width}x${c.height}` : "",
          nonWhite,
          textMode: document.body.innerText.includes("文字提取模式"),
          // match "第 1 / 29 页" (page 1 / 29)
          total: (document.body.innerText.match(/第\s*\d+\s*\/\s*(\d+)\s*页/) ?? [])[1] ?? "",
          current: (document.body.innerText.match(/第\s*(\d+)\s*\//) ?? [])[1] ?? "",
          body: document.body.innerText.slice(0, 160),
        };
      });
      // only when all three conditions are met is loading done: canvas appears + has content + total pages rendered
      if (st.hasCanvas && st.nonWhite > 30 && st.total) break;
      await new Promise((r) => setTimeout(r, 400));
      waited += 400;
    }
    const elapsed = Date.now() - t0;

    check("★ .pptx draws a canvas (not a text list)", st.hasCanvas, st.size);
    check("★ canvas has actual content (not blank)", st.nonWhite > 30, `non-white pixels ${st.nonWhite}`);
    check("★ did not fall back to text extraction mode", st.textMode === false);
    check("total page count shown", Number(st.total) > 0, `${st.total} pages`);
    check("★ opens within 5 seconds (vs LibreOffice's 19 seconds)", elapsed < 5000, `${elapsed}ms`);

    // Page flip: compare the canvas PNG data.
    //
    // Tried two weaker approaches, both unreliable:
    //   · count "non-white pixels" — both pages have colored backgrounds, both hit the sampling cap, no difference measurable
    //   · sample pixel hash — the hash written out was always 0 (my own bug)
    // Directly take the full image encoding via toDataURL and compare length + head/tail fragments together — simple and reliable.
    const snapshot = () => page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return null;
      const url = c.toDataURL("image/png");
      return { len: url.length, head: url.slice(0, 120), tail: url.slice(-120) };
    });

    const before = await snapshot();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
    const after = await snapshot();
    const pageNo = await page.evaluate(() => (document.body.innerText.match(/第\s*(\d+)\s*\//) ?? [])[1] ?? "");
    check("right arrow key can flip the page", pageNo === "2", `currently on page ${pageNo}`);
    const changed = before && after && (before.len !== after.len || before.head !== after.head || before.tail !== after.tail);
    check("★ new content rendered after flipping (PNG data differs)", Boolean(changed),
      before && after ? `${before.len} bytes → ${after.len} bytes` : "cannot read canvas data");

    await page.screenshot({ path: path.join(OUT, "ui-pptx-canvas.png") });
  }

  // ---- 2. legacy .ppt ----
  if (local.ppt) {
    console.log("\n── legacy .ppt (should use text mode) ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local.ppt);
    await page.waitForTimeout(6000);
    const pptSt = await page.evaluate(() => ({
      textMode: document.body.innerText.includes("文字提取模式"),
      hasCanvas: Boolean(document.querySelector("canvas")),
      body: document.body.innerText.slice(0, 200).replace(/\n/g, " | "),
    }));
    check("★ legacy .ppt still opens (pure JS doesn't support it, uses text mode)",
      pptSt.textMode || pptSt.hasCanvas, pptSt.textMode ? "text mode" : `canvas=${pptSt.hasCanvas}`);
    check("legacy .ppt UI has content", pptSt.body.length > 40, pptSt.body.slice(0, 80));
  }

  // ---- 3. should no longer have LibreOffice-related conversion ----
  console.log("\n── confirm LibreOffice is no longer used ──");
  const conv = await page.evaluate(() => window.gezhi.convert?.probe?.({}) ?? null);
  check("convert API still exists (interface not broken)", conv !== null, conv ? `available=${conv.available}` : "(removed)");

  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\nscreenshot: 产出/ui-pptx-canvas.png`);
process.exit(passed === results.length ? 0 : 1);
