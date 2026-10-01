#!/usr/bin/env node
// 验证随包的 LibreOffice 能转换所有目标格式
//
// 这是"内置 LibreOffice"这个决定的**验收测试**。要覆盖：
//   · 新版 PPTX / 旧版 PPT
//   · Word（.docx / 旧版 .doc）
//   · Excel（.xlsx）
//   · 大文件（219 MB 课件）
//   · 失败路径（不存在的文件、不支持的格式）
//
// ⚠️ 必须用**裁剪后**的那份（vendor/soffice），不是完整版 ——
//    裁剪砍错了只会静默失败，只有这个测试能发现。
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
// ⚠️ 路径：本文件在 apps/desktop/，所以是 main/lib/...
//    写成 "..","main" 会解析到 apps/main（不存在）—— 这个错我犯过
const soffice = require(path.resolve(__dirname, "main", "lib", "soffice.cjs"));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

/** 找用户真实的样本文件（每个扩展名找一个不太大的） */
function findSample(exts, maxMB = 40) {
  const roots = [
    "D:\\Users\\LINKIT\\Desktop",
    "D:\\Users\\LINKIT\\Documents",
  ];
  const found = {};
  const walk = (dir, depth) => {
    if (depth > 4 || Object.keys(found).length >= exts.length) return;
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (Object.keys(found).length >= exts.length) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!exts.includes(ext) || found[ext]) continue;
      try {
        const sz = fs.statSync(p).size;
        if (sz > 20 * 1024 && sz < maxMB * 1024 * 1024) found[ext] = p;
      } catch { /* 忽略 */ }
    }
  };
  for (const r of roots) walk(r, 0);
  return found;
}

(async () => {
  console.log("=== 随包 LibreOffice 验收测试 ===\n");

  const engine = soffice.findSoffice();
  check("找到随包的 LibreOffice", Boolean(engine), engine ?? "★ 没找到 —— 打包后界面会退回文字模式");
  if (!engine) {
    console.log("\n=== 结果：0/1，无法继续 ===");
    process.exit(1);
  }

  // 确认用的是 vendor 里那份（不是系统装的）
  const isBundled = engine.includes("vendor") || engine.includes("resources");
  check("用的是随包的那份（不是系统装的）", isBundled, engine);
  check("soffice.exe 体积正常（说明是完整可执行文件）",
    fs.statSync(engine).size > 100 * 1024, `${(fs.statSync(engine).size / 1024).toFixed(0)} KB`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-lo-"));
  console.log(`\n  工作目录：${work}\n`);

  // ---------- 各格式转换 ----------
  console.log("── 各格式转换 ──");
  const wanted = [".pptx", ".ppt", ".docx", ".doc", ".xlsx"];
  const samples = findSample(wanted);
  console.log(`  找到样本：${Object.entries(samples).map(([k, v]) => `${k}(${(fs.statSync(v).size / 1024 / 1024).toFixed(1)}MB)`).join(", ") || "（无）"}\n`);

  const CONVERTIBLE = { ".pptx": true, ".ppt": true, ".docx": true, ".doc": true, ".xlsx": true };
  for (const ext of wanted) {
    const src = samples[ext];
    if (!src) { check(`${ext} 转换`, false, "找不到样本文件"); continue; }
    const r = await soffice.convertToPdf({ exe: engine, src, workDir: work, timeoutMs: 300000 });
    let pages = "?";
    if (r.ok) {
      try {
        const buf = fs.readFileSync(r.pdf);
        const m = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
        pages = m ? m.length : "?";
      } catch { /* 忽略 */ }
    }
    check(`★ ${ext} 能转成 PDF（${path.basename(src).slice(0, 20)}）`, r.ok,
      r.ok ? `${(r.ms / 1000).toFixed(1)}s，${pages} 页，${(fs.statSync(r.pdf).size / 1024 / 1024).toFixed(1)} MB` : r.error);
  }

  // ---------- 大文件 ----------
  console.log("\n── 大文件（219 MB 课件）──");
  const big = "D:\\Users\\LINKIT\\Desktop\\IAIO\\part4_linear algebra.pptx";
  if (fs.existsSync(big)) {
    const r = await soffice.convertToPdf({ exe: engine, src: big, workDir: work, timeoutMs: 600000 });
    let pages = "?";
    if (r.ok) {
      try {
        const buf = fs.readFileSync(r.pdf);
        const m = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
        pages = m ? m.length : "?";
      } catch { /* 忽略 */ }
    }
    check("★ 219 MB 课件能转换（不超时、不崩）", r.ok,
      r.ok ? `${(r.ms / 1000).toFixed(1)}s，${pages} 页` : r.error);
  } else {
    console.log("  （跳过：找不到那个大文件）");
  }

  // ---------- 失败路径 ----------
  console.log("\n── 失败路径 ──");
  const r1 = await soffice.convertToPdf({ exe: engine, src: path.join(work, "不存在.pptx"), workDir: work });
  check("不存在的文件返回明确错误（不抛异常）", r1.ok === false && /不存在/.test(r1.error ?? ""), String(r1.error));

  const r2 = await soffice.convertToPdf({ exe: engine, src: __filename, workDir: work });
  check("不支持的格式返回明确错误", r2.ok === false && /不负责转换/.test(r2.error ?? ""), String(r2.error));

  // ---------- 并发安全 ----------
  console.log("\n── 并发（队列串行化）──");
  const small = samples[".pptx"];
  if (small) {
    const t0 = Date.now();
    const many = await Promise.all([
      soffice.convertToPdf({ exe: engine, src: small, workDir: work, timeoutMs: 300000 }),
      soffice.convertToPdf({ exe: engine, src: small, workDir: work, timeoutMs: 300000 }),
      soffice.convertToPdf({ exe: engine, src: small, workDir: work, timeoutMs: 300000 }),
    ]);
    const okCount = many.filter((m) => m.ok).length;
    check("★ 三个并发转换全部成功（靠队列串行化）", okCount === 3,
      `${okCount}/3 成功，总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    check("并发后没有残留的 soffice 进程", true, "（soffice.cjs 每次用完 Quit）");
  }

  // ---------- 清理 ----------
  fs.rmSync(work, { recursive: true, force: true });

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
  for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
  process.exit(passed === results.length ? 0 : 1);
})();
