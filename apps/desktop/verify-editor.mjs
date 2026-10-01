#!/usr/bin/env node
// 编辑器 + 编辑/阅读模式验证
//
// 要回答的问题：
//   1. 点"编辑"能进编辑器吗？能真的输入吗？能保存到磁盘吗？
//   2. 点"阅读"能回到渲染视图吗？改动能保留吗？
//   3. 未保存标记显示吗？切标签会不会丢内容？
//   4. ★ 新建文件/文件夹的界面入口能用吗？
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-edit-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "ed" }), "utf8");
fs.mkdirSync(path.join(vault, "笔记"), { recursive: true });
const TARGET = path.join(vault, "笔记", "可编辑.md");
fs.writeFileSync(TARGET, "# 原始标题\n\n原始的一段话。\n", "utf8");
fs.writeFileSync(path.join(vault, "笔记", "第二篇.md"), "# 第二篇\n\n内容\n", "utf8");

console.log("=== 编辑器与模式切换验证 ===\n");

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
  await page.waitForTimeout(600);

  // ---- 1. 打开文件默认是阅读模式 ----
  console.log("── 打开与模式 ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), TARGET);
  await page.waitForTimeout(900);

  const readMode = await page.evaluate(() => ({
    hasRendered: document.body.innerText.includes("原始的一段话"),
    hasEditor: Boolean(document.querySelector(".cm-editor")),
    readBtn: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "阅读"),
    editBtn: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "编辑"),
  }));
  check("★ 打开后默认是阅读模式（渲染后的内容）", readMode.hasRendered && !readMode.hasEditor);
  check("★ 有「阅读 / 编辑」切换按钮", readMode.readBtn && readMode.editBtn);

  // ---- 2. 切到编辑模式 ----
  console.log("\n── 编辑模式 ──");
  const editBtn = page.locator("button", { hasText: "编辑" }).first();
  await editBtn.click();
  await page.waitForTimeout(1200);

  const inEdit = await page.evaluate(() => ({
    hasEditor: Boolean(document.querySelector(".cm-editor")),
    hasContent: document.querySelector(".cm-content")?.textContent?.includes("原始的一段话") ?? false,
    hasGutters: Boolean(document.querySelector(".cm-gutters")),
    text: (document.querySelector(".cm-content")?.textContent ?? "").slice(0, 60),
  }));
  check("★ 能进入编辑器（CodeMirror 已挂载）", inEdit.hasEditor);
  check("编辑器里是文件原文", inEdit.hasContent, JSON.stringify(inEdit.text));
  check("编辑器有行号栏", inEdit.hasGutters);

  // ---- 3. 真的能输入 ----
  console.log("\n── 输入与保存 ──");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n新增的一行内容。");
  await page.waitForTimeout(500);

  const typed = await page.evaluate(() => document.querySelector(".cm-content")?.textContent ?? "");
  check("★ 能真的输入文字", typed.includes("新增的一行内容"), JSON.stringify(typed.slice(-30)));

  const dirtyMark = await page.evaluate(() => ({
    saveBtn: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "保存"),
  }));
  check("★ 出现「保存」按钮（有未保存改动）", dirtyMark.saveBtn);

  // 文件树里的未保存标记：必须先让那一行**存在于 DOM 里**。
  // ⚠️ 这里是测试钩子直接打开的文件，从没在树里点过，笔记/ 目录没展开，
  //    树里根本没有这一行 —— 第一次写测试时直接查 .tree-row.dirty，
  //    必然找不到，是假失败。所以先展开目录再查。
  const beforeExpand = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".tree-row")].map((r) => ({
      name: r.querySelector(".nm")?.textContent,
      isDir: r.classList.contains("is-dir"),
    })),
  }));
  console.log(`       [诊断] 展开前：${JSON.stringify(beforeExpand.rows)}`);

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".tree-row.is-dir")];
    const note = rows.find((r) => r.querySelector(".nm")?.textContent === "笔记");
    if (!note) {
      // 兜底：把第一个目录点开
      rows[0]?.click();
    } else {
      note.click();
    }
  });
  await page.waitForTimeout(900);

  const treeDirty = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".tree-row")].map((r) => ({
      name: r.querySelector(".nm")?.textContent,
      cls: r.className,
      hasDot: Boolean(r.querySelector(".dot")),
    })),
    hasRow: [...document.querySelectorAll(".tree-row .nm")].some((n) => n.textContent === "可编辑.md"),
    dirty: Boolean(document.querySelector(".tree-row.dirty")),
    dot: Boolean(document.querySelector(".tree-row .dot")),
  }));
  console.log(`       [诊断] 展开后：${JSON.stringify(treeDirty.rows)}`);
  check("展开目录后树里有该文件的行", treeDirty.hasRow);
  check("★ 文件树里显示未保存标记", treeDirty.dirty && treeDirty.dot,
    `dirty=${treeDirty.dirty} dot=${treeDirty.dot}`);

  // Ctrl+S 保存
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(900);

  const onDisk = fs.readFileSync(TARGET, "utf8");
  check("★ Ctrl+S 真的写进磁盘了", onDisk.includes("新增的一行内容"), JSON.stringify(onDisk.slice(-30)));

  const afterSave = await page.evaluate(() => ({
    saveBtnGone: ![...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "保存"),
    notice: document.body.innerText.includes("已保存"),
  }));
  check("保存后「保存」按钮消失（不再有未保存改动）", afterSave.saveBtnGone);

  // ---- 4. 切回阅读模式，能看到刚写的内容 ----
  const readBtn = page.locator("button", { hasText: "阅读" }).first();
  await readBtn.click();
  await page.waitForTimeout(800);
  const backToRead = await page.evaluate(() => ({
    hasEditor: Boolean(document.querySelector(".cm-editor")),
    text: document.body.innerText,
  }));
  check("★ 能切回阅读模式", !backToRead.hasEditor);
  check("★ 阅读模式显示刚写的内容", backToRead.text.includes("新增的一行内容"));

  // ---- 5. 切换标签不丢草稿 ----
  console.log("\n── 切标签不丢草稿 ──");
  await editBtn.click();
  await page.waitForTimeout(900);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n未保存的草稿。");
  await page.waitForTimeout(400);

  // 打开第二个文件再切回来
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), path.join(vault, "笔记", "第二篇.md"));
  await page.waitForTimeout(800);
  await page.locator(".tab", { hasText: "可编辑.md" }).first().click();
  await page.waitForTimeout(1000);

  const draftKept = await page.evaluate(() => {
    const editing = Boolean(document.querySelector(".cm-editor"));
    const text = document.querySelector(".cm-content")?.textContent ?? document.body.innerText;
    return { editing, hasDraft: text.includes("未保存的草稿") };
  });
  check("★ 切走再切回来，未保存的草稿还在", draftKept.hasDraft,
    draftKept.hasDraft ? "" : "草稿丢了");

  // 草稿不该被写进磁盘
  const diskAfterDraft = fs.readFileSync(TARGET, "utf8");
  check("未保存的草稿**没有**被写进磁盘", !diskAfterDraft.includes("未保存的草稿"),
    "没按保存就不该动文件");

  // ---- 6. 新建文件 / 文件夹的界面入口 ----
  console.log("\n── 新建入口 ──");
  const createBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".panel-head button")];
    return btns.map((b) => b.getAttribute("title") ?? "");
  });
  check("★ 面板头有「新建文件」按钮",
    createBtns.some((t) => t.includes("新建文件")), createBtns.join(" | "));
  check("★ 面板头有「新建文件夹」按钮",
    createBtns.some((t) => t.includes("新建文件夹")));

  // 用按钮真的建一个
  await page.locator('.panel-head button[title*="新建文件"]').first().click();
  await page.waitForTimeout(500);
  const hasInlineInput = await page.evaluate(() =>
    Boolean(document.querySelector('input[placeholder*="新文件名"]')));
  check("★ 点新建后出现内联输入框", hasInlineInput);

  if (hasInlineInput) {
    await page.locator('input[placeholder*="新文件名"]').first().fill("界面新建的笔记");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1800);   // 建文件 + 刷新树 + 自动打开，给足时间
    const created = fs.existsSync(path.join(vault, "界面新建的笔记.md"));
    check("界面上新建的文件真的落盘了", created);

    const afterCreate = await page.evaluate(() => ({
      hasEditor: Boolean(document.querySelector(".cm-editor")),
      tabs: [...document.querySelectorAll(".tab .tname")].map((n) => n.textContent),
      activeTab: document.querySelector(".tab.active .tname")?.textContent ?? "",
      treeHas: [...document.querySelectorAll(".tree-row .nm")].some((n) => n.textContent === "界面新建的笔记.md"),
      bodySnippet: document.body.innerText.slice(0, 150).replace(/\n/g, " | "),
    }));
    check("新建的文件出现在文件树里", afterCreate.treeHas, afterCreate.tabs.join(", "));
    check("新建的文件自动打开成标签页",
      afterCreate.tabs.includes("界面新建的笔记.md"), afterCreate.tabs.join(", "));
    check("★ 新建的文件自动进入编辑模式（能直接开始写）",
      afterCreate.hasEditor,
      afterCreate.hasEditor ? "" : `当前活动标签=${afterCreate.activeTab}`);
  }

  await page.screenshot({ path: path.join(OUT, "ui-editor.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-editor.png`);
process.exit(passed === results.length ? 0 : 1);
