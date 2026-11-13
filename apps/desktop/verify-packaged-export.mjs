#!/usr/bin/env node
// Verify the export feature of the **packaged** app
//
// Why it must be tested separately: export depends on two external resources
//   1. the Typst template templates/typst/handout.typ (gets into resources/ via extraResources)
//   2. the python-docx script templates/docx/md2docx.py
// In development they live in the repo; after packaging they must come via extraResources.
// If missed: the packaged app can open the export menu but fails the moment you export — while dev mode is all green.
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PACKED = path.join(ROOT, "dist", "installer", "win-unpacked");
const EXE = path.join(PACKED, "格致.exe");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

console.log("=== packaged export feature verification ===\n");
if (!fs.existsSync(EXE)) {
  console.error("packaged build not found:", EXE);
  process.exit(1);
}

// ---- static check: are the bundled resources complete ----
const res = path.join(PACKED, "resources");
for (const [rel, label] of [
  ["templates/typst/handout.typ", "Typst handout template"],
  ["templates/typst/gezhi.typ", "Typst font stack"],
  ["typst/typst.exe", "★ bundled Typst executable"],
  ["typst/LICENSE", "Typst license (Apache-2.0 attribution requirement)"],
  ["typst/NOTICE", "Typst NOTICE"],
]) {
  const p = path.join(res, rel);
  check(`resources contains ${label}`, fs.existsSync(p),
    fs.existsSync(p) ? `${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB` : "missing");
}

// the docx library (pure JS Word generation) should be packed into app.asar
const asarPath = path.join(res, "app.asar");
if (fs.existsSync(asarPath)) {
  const sizeMB = fs.statSync(asarPath).size / 1024 / 1024;
  check("app.asar exists and contains runtime deps", sizeMB > 30, `${sizeMB.toFixed(1)} MB`);
}

// ---- dynamic check: actually launch the packaged build and export once ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-pexp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "pexp", name: "打包导出测试" }), "utf8");

const BS = String.fromCharCode(92);
const MD = [
  "---",
  "type: 讲义",
  "---",
  "",
  "# 打包版导出测试",
  "",
  "中文、**粗体**、`代码` 都要正常。",
  "",
  "| 项 | 值 |",
  "| --- | --- |",
  "| 甲 | 1 |",
  "| 乙 | 2 |",
  "",
  "$$" + BS + "frac{a}{b}$$",
  "",
  "行内 $E = mc^2$。",
  "",
  "相关：[[另一篇]]",
].join("\n");
const src = path.join(vault, "打包测试.md");
fs.writeFileSync(src, MD, "utf8");

console.log("\n  launching the packaged app…");
// ★ key test technique: **hide the system Typst**
//   Set GEZHI_TYPST to a non-existent path so findTypst's env-var branch fails,
//   and the system PATH / winget can also be bypassed — the only usable one is the bundled copy.
//   If export still succeeds, it proves "fully bundled" is real, not silently using a system Typst.
const app = await electron.launch({
  executablePath: EXE,
  args: [],
  env: {
    ...process.env,
    GEZHI_TEST: "1",
    GEZHI_TYPST: "C:\\__gezhi_should_not_exist__\\typst.exe",
    // also strip any typst from PATH (findTypst tries PATH)
    PATH: String(process.env.PATH ?? "").split(path.delimiter)
      .filter((p) => !/typst|cargo/i.test(p)).join(path.delimiter),
  },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 40000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  const probe = await page.evaluate(() => window.gezhi.exporter.probe());
  check("★ packaged build detects Typst", probe.pdf.available === true,
    probe.pdf.available ? String(probe.pdf.engine) : String(probe.pdf.reason));
  check("★ uses the **bundled** typst (not a system install)",
    probe.pdf.bundled === true && String(probe.pdf.engine).includes("resources"),
    `${probe.pdf.bundled ? "bundled" : "system"}: ${probe.pdf.engine}`);
  check("★ packaged template path points to resources (not the repo)",
    String(probe.paths.templatePath).includes("resources"),
    probe.paths.templatePath);
  check("★ Word uses the bundled pure-JS converter (no Python dependency)",
    probe.docx.available === true && String(probe.docx.engine).includes("内置"),
    String(probe.docx.engine));

  for (const [fmt, ext, min] of [["pdf", ".pdf", 20000], ["docx", ".docx", 5000]]) {
    const r = await page.evaluate(async ([md, s, f]) => {
      return window.gezhi.exporter.run({ format: f, markdown: md, sourcePath: s, defaultName: "打包测试" });
    }, [MD, src, fmt]);
    check(`★ packaged export of ${fmt} succeeded`, r.ok === true, r.ok ? `${((r.size ?? 0) / 1024).toFixed(1)} KB` : String(r.error));
    if (r.ok && r.path) {
      check(`  packaged ${fmt} file exists and has a reasonable size`, fs.existsSync(r.path) && fs.statSync(r.path).size > min,
        `${(fs.statSync(r.path).size / 1024).toFixed(1)} KB`);
      const raw = fs.readFileSync(r.path);
      check(`  ${fmt} has no product branding`,
        !raw.includes(Buffer.from("格致", "utf8")) && !raw.includes(Buffer.from("格致", "utf16le")));
    }
  }

  check("packaged renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  const out = path.join(ROOT, "产出");
  fs.mkdirSync(out, { recursive: true });
  for (const f of ["打包测试.pdf", "打包测试.docx"]) {
    const p = path.join(vault, f);
    if (fs.existsSync(p)) { try { fs.copyFileSync(p, path.join(out, "打包版-" + f)); } catch { /* ignore */ } }
  }
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
