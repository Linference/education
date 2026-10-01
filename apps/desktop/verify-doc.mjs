#!/usr/bin/env node
// 界面里的 .doc 打开验证（用用户机器上的真实 .doc 文件）
//
// 为什么用真实文件：造的样本只能证明"我实现的东西能读我自己写的格式"，
// 证明不了真实的 Word 输出能被读。这里直接拿用户硬盘上的物理竞赛题集、
// 数学建模模板来测。
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

// 用户机器上的真实 .doc
const REAL_DOCS = [
  {
    p: "D:/Users/LINKIT/Desktop/math_model/samples/2024_CUMCM_A/format2024.doc",
    label: "数模国赛格式模板",
    expect: ["数学建模", "摘要"],
  },
  {
    p: "D:/Users/LINKIT/Desktop/物理竞赛/历屆賽題/全國物理競賽題集/2020高中物理竞赛习题专题五：静电场(Word版含答案).doc",
    label: "物理竞赛静电场",
    expect: ["电场"],
  },
];

const available = REAL_DOCS.filter((d) => fs.existsSync(d.p));
if (available.length === 0) {
  console.error("找不到任何真实 .doc 文件，无法测试");
  process.exit(1);
}

// 造库，把真实 .doc 复制进去
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-doc-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "doc-test", name: "doc 测试库" }), "utf8");

const copied = [];
for (const d of available) {
  const dest = path.join(vault, path.basename(d.p));
  fs.copyFileSync(d.p, dest);
  copied.push({ ...d, dest });
}

console.log("=== 界面 .doc 打开验证 ===\n");
console.log(`  真实文件：${available.map((d) => d.label).join("、")}\n`);

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

  // 文件树里应该能看到 .doc
  const treeRows = await page.evaluate(() =>
    [...document.querySelectorAll(".tree-row")].map((r) => r.querySelector(".nm")?.textContent)
  );
  const docRows = treeRows.filter((n) => n && n.toLowerCase().endsWith(".doc"));
  check("文件树里显示 .doc 文件", docRows.length > 0, `${docRows.length} 个`);

  for (const d of copied) {
    console.log(`\n── ${d.label} ──`);

    // 走 IPC 读（验证主进程解析）
    const r = await page.evaluate((p) => window.gezhi.file.readDoc(p), d.dest);
    check(`${d.label} 主进程能解析`, r.ok === true,
      r.ok ? `${r.text.length} 字，方法 ${r.method}，${r.ms}ms` : String(r.error));
    if (!r.ok) continue;

    const cjk = (r.text.match(/[\u4e00-\u9fff]/g) ?? []).length;
    check(`${d.label} 中文不是乱码`, cjk > 50, `汉字 ${cjk} 个`);
    const hits = d.expect.filter((k) => r.text.includes(k));
    check(`${d.label} 含预期内容`, hits.length > 0, `命中 ${JSON.stringify(hits)}`);
    check(`${d.label} 标记为有损（版式无法还原）`, r.lossy === true);

    // 走界面打开（验证 UI 渲染）
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), d.dest);
    await page.waitForTimeout(1200);

    const dom = await page.evaluate(() => {
      const body = document.querySelector(".markdown-body");
      const notice = document.body.innerText.includes("文字提取模式");
      return {
        hasBody: Boolean(body),
        textLen: body ? body.innerText.length : 0,
        notice,
        firstText: body ? body.innerText.slice(0, 60).replace(/\n/g, " | ") : "",
      };
    });
    check(`${d.label} 界面渲染出正文`, dom.hasBody && dom.textLen > 100, `${dom.textLen} 字`);
    check(`${d.label} 界面显示「文字提取模式」提示`, dom.notice);
    console.log(`       界面首行：${dom.firstText}`);
  }

  await page.screenshot({ path: path.join(OUT, "ui-doc.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
console.log(`\n截图：产出/ui-doc.png`);
process.exit(passed === results.length ? 0 : 1);
