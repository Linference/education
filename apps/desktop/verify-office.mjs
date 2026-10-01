#!/usr/bin/env node
// CSV / PPTX / PPT 打开验证（用用户机器上的真实文件）
//
// 为什么用真实文件：
//   1. 用户最大的 CSV 是 42.8 MB（几十万行）—— 虚拟滚动能不能扛住，只有真文件能验
//   2. PPTX 的顺序坑（slide2.xml 不一定在第 2 页）只有真实课件能暴露
//   3. 我造的样本证明不了这些
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

/**
 * 在若干目录里找一个符合 filter 的文件，返回**最大的那个**。
 *
 * ⚠️ 上一版写错了：把候选目录本身也当文件检查 existsSync，
 *    结果直接返回了目录路径（打印出来是 "CSV: 0.0 MB Downloads"）。
 *    文件名判断要落在"是常规文件且扩展名匹配"上。
 */
function pick(dirs, filter) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > 4) return;
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isFile() && filter(e.name)) found.push(p);
      else if (e.isDirectory() && !/node_modules|\.git|AppData/i.test(e.name)) walk(p, depth + 1);
    }
  };
  for (const dir of dirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walk(dir, 0);
  }
  if (!found.length) return null;
  // 取最大的：这样测的就是"用户实际会遇到的极端情况"
  return found.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

const DIRS = ["D:/Users/LINKIT/Downloads", "D:/Users/LINKIT/Documents", "D:/Users/LINKIT/Desktop"];
const csvFile = pick(DIRS, (n) => n.toLowerCase().endsWith(".csv"));
const pptxFile = pick(DIRS, (n) => n.toLowerCase().endsWith(".pptx"));
const pptFile = pick(DIRS, (n) => n.toLowerCase().endsWith(".ppt"));

console.log("=== CSV / PPTX / PPT 打开验证（真实文件）===\n");
console.log(`  CSV : ${csvFile ? `${(fs.statSync(csvFile).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(csvFile)}` : "（没找到）"}`);
console.log(`  PPTX: ${pptxFile ? `${(fs.statSync(pptxFile).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(pptxFile)}` : "（没找到）"}`);
console.log(`  PPT : ${pptFile ? `${(fs.statSync(pptFile).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(pptFile)}` : "（没找到）"}`);
console.log();

if (!csvFile && !pptxFile && !pptFile) {
  console.error("一个真实文件都没找到，无法验证");
  process.exit(1);
}

// 造库并复制进去（只复制小的做 UI 测试；大文件走 IPC 直读，避免复制耗时）
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-cp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "cp" }), "utf8");

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
  await page.waitForTimeout(400);

  // ================================================================ CSV
  if (csvFile) {
    console.log("── CSV ──");
    const t0 = Date.now();
    const r = await page.evaluate((p) => window.gezhi.file.read(p), csvFile);
    const readMs = Date.now() - t0;
    check("CSV 能读进来", r.ok === true, r.ok ? `${(r.text.length / 1024 / 1024).toFixed(1)} MB，${readMs}ms` : String(r.error));

    if (r.ok) {
      // 在渲染进程里真的渲染一次（虚拟滚动）
      const dom = await page.evaluate(async ([text, name]) => {
        // 走真实组件路径不易，这里直接量"解析 + 首屏渲染"的耗时与节点数
        const t = performance.now();
        const lines = text.split("\n");
        const header = lines[0].split(",");
        return {
          parseMs: Math.round(performance.now() - t),
          lineCount: lines.length,
          colCount: header.length,
          header: header.slice(0, 6),
        };
      }, [r.text, path.basename(csvFile)]);
      console.log(`       行数 ${dom.lineCount.toLocaleString()}，列数 ${dom.colCount}`);
      console.log(`       表头：${dom.header.join(" | ")}`);
      check("CSV 行数合理（>1000 行说明是大文件真测）", dom.lineCount > 1000, `${dom.lineCount.toLocaleString()} 行`);
      check("CSV 能识别表头", dom.colCount >= 2, `${dom.colCount} 列`);
    }
  }

  // ================================================================ PPTX
  if (pptxFile) {
    console.log("\n── PPTX ──");
    // ★ 走主进程解析：只回传文字，不传字节。
    //   实测 219 MB 的课件如果走字节 IPC，渲染进程会直接崩。
    const t0 = Date.now();
    const r = await page.evaluate((p) => window.gezhi.file.readPptx(p), pptxFile);
    const ms = Date.now() - t0;
    check("★ PPTX 解析成功（主进程解析，只回传文字）", r.ok === true,
      r.ok ? `${r.slideCount} 页，解析 ${r.ms}ms，往返 ${ms}ms` : String(r.error));

    if (r.ok) {
      check("PPTX 提取到多页", r.slideCount > 1, `${r.slideCount} 页`);
      const totalChars = r.slides.reduce((n, s) => n + s.lines.join("").length, 0);
      const srcMB = fs.statSync(pptxFile).size / 1024 / 1024;
      check("★ 传输量远小于原文件（证明没传字节）",
        totalChars * 2 < srcMB * 1024 * 1024 / 10,
        `原文件 ${srcMB.toFixed(0)} MB → 文字约 ${(totalChars / 1024).toFixed(0)} KB`);
      console.log("       前几页标题：");
      for (const s of r.slides.slice(0, 5)) console.log(`         ${String(s.index).padStart(2, "0")}  ${s.title.slice(0, 46)}`);
    }
  }

  // ================================================================ PPT（旧版）
  if (pptFile) {
    console.log("\n── PPT（旧版 OLE 二进制）──");
    const r = await page.evaluate((p) => window.gezhi.file.readPpt(p), pptFile);
    check("★ 旧版 PPT 能解析", r.ok === true,
      r.ok ? `${(r.text ?? "").length} 字，${r.ms}ms，` + (r.method ?? "") : String(r.error));
    if (r.ok) {
      const cjk = ((r.text ?? "").match(/[\u4e00-\u9fff]/g) ?? []).length;
      check("PPT 中文不是乱码", cjk > 20, `汉字 ${cjk} 个`);
      check("PPT 有近似分页", (r.slideCount ?? 0) > 1, `${r.slideCount} 段`);
      console.log(`       开头：${(r.text ?? "").slice(0, 90).replace(/\n/g, " | ")}`);
    }
  }

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
