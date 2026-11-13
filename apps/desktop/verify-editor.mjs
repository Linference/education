#!/usr/bin/env node
// Editor + edit/read mode verification
//
// Questions to answer:
//   1. Can clicking "编辑" (Edit) open the editor? Can you actually type? Does it save to disk?
//   2. Can clicking "阅读" (Read) return to the rendered view? Are changes preserved?
//   3. Does the unsaved marker show? Does switching tabs lose content?
//   4. ★ Does the new-file/folder UI entry point work?
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

console.log("=== Editor and mode-switch verification ===\n");

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
  console.log("── Open and modes ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), TARGET);
  await page.waitForTimeout(900);

  const readMode = await page.evaluate(() => ({
    hasRendered: document.body.innerText.includes("原始的一段话"),
    hasEditor: Boolean(document.querySelector(".cm-editor")),
    readBtn: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "阅读"),
    editBtn: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "编辑"),
  }));
  check("★ defaults to read mode on open (rendered content)", readMode.hasRendered && !readMode.hasEditor);
  check("★ has the '阅读 / 编辑' (Read / Edit) toggle buttons", readMode.readBtn && readMode.editBtn);

  // ---- 2. 切到编辑模式 ----
  console.log("\n── Edit mode ──");
  const editBtn = page.locator("button", { hasText: "编辑" }).first();
  await editBtn.click();
  await page.waitForTimeout(1200);

  const inEdit = await page.evaluate(() => ({
    hasEditor: Boolean(document.querySelector(".cm-editor")),
    hasContent: document.querySelector(".cm-content")?.textContent?.includes("原始的一段话") ?? false,
    hasGutters: Boolean(document.querySelector(".cm-gutters")),
    text: (document.querySelector(".cm-content")?.textContent ?? "").slice(0, 60),
  }));
  check("★ can enter the editor (CodeMirror mounted)", inEdit.hasEditor);
  check("editor shows the file's original content", inEdit.hasContent, JSON.stringify(inEdit.text));
  check("editor has a gutter (line numbers)", inEdit.hasGutters);

  // ---- 3. 真的能输入 ----
  console.log("\n── Typing and saving ──");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n新增的一行内容。");
  await page.waitForTimeout(500);

  const typed = await page.evaluate(() => document.querySelector(".cm-content")?.textContent ?? "");
  check("★ can actually type text", typed.includes("新增的一行内容"), JSON.stringify(typed.slice(-30)));

  const dirtyMark = await page.evaluate(() => ({
    saveBtn: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "保存"),
  }));
  check("★ a '保存' (Save) button appears (there are unsaved changes)", dirtyMark.saveBtn);

  // The unsaved marker in the file tree: the row must first **exist in the DOM**.
  // ⚠️ This file was opened directly by the test hook, never clicked in the tree,
  //    and the 笔记/ folder was never expanded, so the row isn't in the tree at all.
  //    The first version queried .tree-row.dirty directly and always came up empty —
  //    a false failure. So expand the folder first, then query.
  const beforeExpand = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".tree-row")].map((r) => ({
      name: r.querySelector(".nm")?.textContent,
      isDir: r.classList.contains("is-dir"),
    })),
  }));
  console.log(`       [diag] before expand: ${JSON.stringify(beforeExpand.rows)}`);

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".tree-row.is-dir")];
    const note = rows.find((r) => r.querySelector(".nm")?.textContent === "笔记");
    if (!note) {
      // Fallback: click the first directory
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
  console.log(`       [diag] after expand: ${JSON.stringify(treeDirty.rows)}`);
  check("after expanding the folder the tree shows the file's row", treeDirty.hasRow);
  check("★ file tree shows the unsaved marker", treeDirty.dirty && treeDirty.dot,
    `dirty=${treeDirty.dirty} dot=${treeDirty.dot}`);

  // Ctrl+S 保存
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(900);

  const onDisk = fs.readFileSync(TARGET, "utf8");
  check("★ Ctrl+S really wrote to disk", onDisk.includes("新增的一行内容"), JSON.stringify(onDisk.slice(-30)));

  const afterSave = await page.evaluate(() => ({
    saveBtnGone: ![...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "保存"),
    notice: document.body.innerText.includes("已保存"),
  }));
  check("after saving the '保存' (Save) button disappears (no unsaved changes)", afterSave.saveBtnGone);

  // ---- 4. 切回阅读模式，能看到刚写的内容 ----
  const readBtn = page.locator("button", { hasText: "阅读" }).first();
  await readBtn.click();
  await page.waitForTimeout(800);
  const backToRead = await page.evaluate(() => ({
    hasEditor: Boolean(document.querySelector(".cm-editor")),
    text: document.body.innerText,
  }));
  check("★ can switch back to read mode", !backToRead.hasEditor);
  check("★ read mode shows the just-typed content", backToRead.text.includes("新增的一行内容"));

  // ---- 5. 切换标签不丢草稿 ----
  console.log("\n── Switching tabs keeps the draft ──");
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
  check("★ switch away and back, the unsaved draft is still there", draftKept.hasDraft,
    draftKept.hasDraft ? "" : "draft lost");

  // 草稿不该被写进磁盘
  const diskAfterDraft = fs.readFileSync(TARGET, "utf8");
  check("the unsaved draft was **not** written to disk", !diskAfterDraft.includes("未保存的草稿"),
    "file should be untouched unless saved");

  // ---- 6. 新建文件 / 文件夹的界面入口 ----
  console.log("\n── New-item entry point ──");
  const createBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".panel-head button")];
    return btns.map((b) => b.getAttribute("title") ?? "");
  });
  check("★ panel header has a '新建文件' (New File) button",
    createBtns.some((t) => t.includes("新建文件")), createBtns.join(" | "));
  check("★ panel header has a '新建文件夹' (New Folder) button",
    createBtns.some((t) => t.includes("新建文件夹")));

  // 用按钮真的建一个
  await page.locator('.panel-head button[title*="新建文件"]').first().click();
  await page.waitForTimeout(500);
  const hasInlineInput = await page.evaluate(() =>
    Boolean(document.querySelector('input[placeholder*="新文件名"]')));
  check("★ clicking New shows an inline input box", hasInlineInput);

  if (hasInlineInput) {
    await page.locator('input[placeholder*="新文件名"]').first().fill("界面新建的笔记");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1800);   // create file + refresh tree + auto-open, allow enough time
    const created = fs.existsSync(path.join(vault, "界面新建的笔记.md"));
    check("the file created in the UI really landed on disk", created);

    const afterCreate = await page.evaluate(() => ({
      hasEditor: Boolean(document.querySelector(".cm-editor")),
      tabs: [...document.querySelectorAll(".tab .tname")].map((n) => n.textContent),
      activeTab: document.querySelector(".tab.active .tname")?.textContent ?? "",
      treeHas: [...document.querySelectorAll(".tree-row .nm")].some((n) => n.textContent === "界面新建的笔记.md"),
      bodySnippet: document.body.innerText.slice(0, 150).replace(/\n/g, " | "),
    }));
    check("the new file appears in the file tree", afterCreate.treeHas, afterCreate.tabs.join(", "));
    check("the new file auto-opens as a tab",
      afterCreate.tabs.includes("界面新建的笔记.md"), afterCreate.tabs.join(", "));
    check("★ the new file auto-enters edit mode (ready to type)",
      afterCreate.hasEditor,
      afterCreate.hasEditor ? "" : `active tab = ${afterCreate.activeTab}`);
  }

  await page.screenshot({ path: path.join(OUT, "ui-editor.png") });
  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\nScreenshot: 产出/ui-editor.png`);
process.exit(passed === results.length ? 0 : 1);
