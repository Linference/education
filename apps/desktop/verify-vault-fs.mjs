#!/usr/bin/env node
// In-vault file operation verification (create / rename / delete / save)
//
// ★ Focus on **safety boundaries**: all write operations must be confined to the current vault.
//   If you only test "can create a file", then an implementation that can write to C:\Windows
//   would also pass everything. Here we specifically construct `../` escapes and absolute paths
//   outside the vault to confirm they are rejected.
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-fs-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "fs" }), "utf8");
fs.mkdirSync(path.join(vault, "笔记"), { recursive: true });
fs.writeFileSync(path.join(vault, "笔记", "已有.md"), "# 已有\n\n原始内容\n", "utf8");

// Target outside the vault (used to test whether escapes are blocked)
const OUTSIDE = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-outside-"));
fs.writeFileSync(path.join(OUTSIDE, "别动我.txt"), "库外面的文件", "utf8");

console.log("=== In-vault file operation verification ===\n");
console.log(`  vault: ${vault}`);
console.log(`  outside: ${OUTSIDE}\n`);

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

  /**
   * Call the fsx API.
   *
   * ⚠️ The arguments must never contain undefined — structured clone throws
   *    "Cannot clone undefined" directly instead of passing undefined through.
   *    The symptom is that the test receives undefined and all assertions fail,
   *    looking like the feature is broken (I hit this in practice). So here we
   *    uniformly use null as a placeholder, and also convert exceptions into
   *    {ok:false} on return.
   */
  const api = async (fn, arg) => {
    try {
      return await page.evaluate(
        ([f, a]) => window.gezhi.fsx[f](a).catch((e) => ({ ok: false, error: String(e?.message ?? e) })),
        [fn, arg ?? null]
      );
    } catch (e) {
      return { ok: false, error: `test call failed: ${String(e.message).slice(0, 80)}` };
    }
  };

  // ---- 1. Create file ----
  console.log("── Create ──");
  const r1 = await api("createFile", { dir: vault, name: "新笔记" });
  check("★ a file can be created at the vault root", r1.ok === true, r1.ok ? path.basename(r1.path) : r1.error);
  check("automatically adds the .md extension", r1.ok && r1.name === "新笔记.md", r1.name);
  check("the file is really written to disk", r1.ok && fs.existsSync(r1.path));
  check("the new file has a title skeleton (not an empty file)",
    r1.ok && fs.readFileSync(r1.path, "utf8").includes("# 新笔记"),
    r1.ok ? JSON.stringify(fs.readFileSync(r1.path, "utf8").slice(0, 30)) : "");

  // ---- 2. Create folder ----
  const r2 = await api("createFolder", { dir: vault, name: "新文件夹" });
  check("★ a folder can be created at the vault root", r2.ok === true, r2.ok ? path.basename(r2.path) : r2.error);
  check("the folder really is a directory", r2.ok && fs.statSync(r2.path).isDirectory());

  // Create inside a subdirectory
  const r3 = await api("createFile", { dir: path.join(vault, "笔记"), name: "子目录文件.md" });
  check("a file can be created in a subdirectory", r3.ok === true, r3.ok ? path.basename(r3.path) : r3.error);

  // ---- 3. Duplicate and illegal names ----
  console.log("\n── Boundaries & rejection ──");
  const dup = await api("createFile", { dir: vault, name: "新笔记" });
  check("duplicate names are rejected (existing files are not overwritten)", dup.ok === false, String(dup.error));

  const badName = await api("createFile", { dir: vault, name: "非法:名字?.md" });
  check("illegal characters are rejected", badName.ok === false, String(badName.error).slice(0, 40));

  const reserved = await api("createFile", { dir: vault, name: "CON" });
  check("Windows reserved names are rejected", reserved.ok === false, String(reserved.error).slice(0, 40));

  const empty = await api("createFile", { dir: vault, name: "   " });
  check("empty names are rejected", empty.ok === false, String(empty.error).slice(0, 30));

  // ---- 4. ★ Safety boundary: must not write outside the vault ----
  console.log("\n── ★ Safety boundary (the most important group) ──");
  const escape1 = await api("createFile", { dir: path.join(vault, "..", ".."), name: "逃逸.md" });
  check("★ escaping outside the vault with ../ is rejected", escape1.ok === false, String(escape1.error).slice(0, 50));

  const escape2 = await api("createFile", { dir: OUTSIDE, name: "别动我2.md" });
  check("★ writing directly to an absolute path outside the vault is rejected", escape2.ok === false, String(escape2.error).slice(0, 50));

  const escape3 = await api("writeText", { path: path.join(OUTSIDE, "别动我.txt"), text: "被改了" });
  check("★ saving to a file outside the vault is rejected", escape3.ok === false, String(escape3.error).slice(0, 50));

  const escape4 = await api("remove", { target: path.join(OUTSIDE, "别动我.txt") });
  check("★ deleting a file outside the vault is rejected", escape4.ok === false, String(escape4.error).slice(0, 50));

  const escape5 = await api("rename", { target: path.join(OUTSIDE, "别动我.txt"), newName: "改名.txt" });
  check("★ renaming a file outside the vault is rejected", escape5.ok === false, String(escape5.error).slice(0, 50));

  // Confirm the file outside the vault really was not touched
  check("★ the file outside the vault is intact (not secretly modified)",
    fs.readFileSync(path.join(OUTSIDE, "别动我.txt"), "utf8") === "库外面的文件");
  check("★ no extra files appeared outside the vault",
    fs.readdirSync(OUTSIDE).length === 1, fs.readdirSync(OUTSIDE).join(", "));

  // ---- 5. Save ----
  console.log("\n── Save ──");
  const target = path.join(vault, "笔记", "已有.md");
  const w = await api("writeText", { path: target, text: "# 已有\n\n改过的内容\n" });
  check("★ modifications can be saved", w.ok === true, w.ok ? `${w.size} bytes` : w.error);
  check("the on-disk content really changed",
    fs.readFileSync(target, "utf8").includes("改过的内容"));
  check("★ auto-backup (.bak) before saving",
    fs.existsSync(target + ".bak") && fs.readFileSync(target + ".bak", "utf8").includes("原始内容"),
    "prevents editor bugs from corrupting the note");

  // ---- 6. Rename ----
  console.log("\n── Rename ──");
  const ren = await api("rename", { target, newName: "改过名" });
  check("★ can rename", ren.ok === true, ren.ok ? ren.name : ren.error);
  check("the extension is preserved (users don't have to type .md)", ren.ok && ren.name === "改过名.md", ren.name);
  check("the old file is gone", !fs.existsSync(target));
  check("the new file exists", ren.ok && fs.existsSync(ren.path));

  // Rename to a name that is **already taken by another file in the same directory**
  //
  // ⚠️ Two pitfalls (both hit):
  //   1. Don't test with "its own current name" — that takes the unchanged branch
  //      (keeping the same name is normal behavior)
  //   2. **The two files must be in the same directory**. The first time I wrote this test I
  //      created the third file at the vault root, while the file to rename was under 笔记/ —
  //      same name across directories is not a conflict, so a successful rename is **correct
  //      behavior**, yet the test asserted it "should be rejected", producing a false failure.
  const noteDir = path.join(vault, "笔记");
  const third = await api("createFile", { dir: noteDir, name: "第三个文件" });
  const ren2 = await api("rename", { target: ren.path, newName: "第三个文件.md" });
  check("renaming to a name already taken in the same directory is rejected", ren2.ok === false, String(ren2.error).slice(0, 60));
  check("the file whose name was taken was not touched", third.ok && fs.existsSync(third.path));
  check("the file to rename also remains (no change on failure)", fs.existsSync(ren.path));

  // Renaming to its own current name → treated as no change, not a failure
  const renSame = await api("rename", { target: ren.path, newName: "改过名.md" });
  check("renaming to its own current name is treated as no change", renSame.ok === true && renSame.unchanged === true,
    JSON.stringify(renSame).slice(0, 80));

  // Same name across directories **is not a conflict** (this is correct behavior, not a bug)
  const renCross = await api("rename", { target: ren.path, newName: "第三个文件.md.bak" });
  void renCross;

  // ---- 7. Delete (move to trash) ----
  console.log("\n── Delete ──");
  const del = await api("remove", { target: r2.path });
  check("★ can delete a folder", del.ok === true, del.ok ? (del.trashed ? "moved to trash" : "permanently deleted") : del.error);
  check("★ the default is moving to trash (not permanent deletion)", del.ok && del.trashed === true,
    "notes must not vanish on a single delete");
  check("the folder really is gone", !fs.existsSync(r2.path));

  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(OUTSIDE, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
