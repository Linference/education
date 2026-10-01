#!/usr/bin/env node
// 库内文件操作验证（新建 / 重命名 / 删除 / 保存）
//
// ★ 重点测**安全边界**：所有写操作必须限制在当前库内。
//   如果只测"能新建文件"，那么一个能往 C:\Windows 写文件的实现也会全绿。
//   这里专门构造 `../` 逃逸与库外绝对路径，确认被拒。
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

// 库外面的目标（用来测逃逸是否被拦）
const OUTSIDE = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-outside-"));
fs.writeFileSync(path.join(OUTSIDE, "别动我.txt"), "库外面的文件", "utf8");

console.log("=== 库内文件操作验证 ===\n");
console.log(`  库：${vault}`);
console.log(`  库外：${OUTSIDE}\n`);

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
   * 调用 fsx API。
   *
   * ⚠️ 参数里绝不能出现 undefined —— 结构化克隆会因为 undefined 直接抛
   *    "Cannot clone undefined"，而不是把 undefined 传过去。
   *    表现是测试拿到 undefined、断言全挂，看着像功能坏了（实测踩过）。
   *    所以这里统一用 null 占位，并且把异常也转成 {ok:false} 返回。
   */
  const api = async (fn, arg) => {
    try {
      return await page.evaluate(
        ([f, a]) => window.gezhi.fsx[f](a).catch((e) => ({ ok: false, error: String(e?.message ?? e) })),
        [fn, arg ?? null]
      );
    } catch (e) {
      return { ok: false, error: `测试调用失败：${String(e.message).slice(0, 80)}` };
    }
  };

  // ---- 1. 新建文件 ----
  console.log("── 新建 ──");
  const r1 = await api("createFile", { dir: vault, name: "新笔记" });
  check("★ 能在库根新建文件", r1.ok === true, r1.ok ? path.basename(r1.path) : r1.error);
  check("自动补上 .md 扩展名", r1.ok && r1.name === "新笔记.md", r1.name);
  check("文件真的落盘了", r1.ok && fs.existsSync(r1.path));
  check("新文件带标题骨架（不是空文件）",
    r1.ok && fs.readFileSync(r1.path, "utf8").includes("# 新笔记"),
    r1.ok ? JSON.stringify(fs.readFileSync(r1.path, "utf8").slice(0, 30)) : "");

  // ---- 2. 新建文件夹 ----
  const r2 = await api("createFolder", { dir: vault, name: "新文件夹" });
  check("★ 能在库根新建文件夹", r2.ok === true, r2.ok ? path.basename(r2.path) : r2.error);
  check("文件夹真的是目录", r2.ok && fs.statSync(r2.path).isDirectory());

  // 在子目录里新建
  const r3 = await api("createFile", { dir: path.join(vault, "笔记"), name: "子目录文件.md" });
  check("能在子目录里新建文件", r3.ok === true, r3.ok ? path.basename(r3.path) : r3.error);

  // ---- 3. 重名与非法名 ----
  console.log("\n── 边界与拒绝 ──");
  const dup = await api("createFile", { dir: vault, name: "新笔记" });
  check("重名被拒绝（不覆盖已有文件）", dup.ok === false, String(dup.error));

  const badName = await api("createFile", { dir: vault, name: "非法:名字?.md" });
  check("非法字符被拒绝", badName.ok === false, String(badName.error).slice(0, 40));

  const reserved = await api("createFile", { dir: vault, name: "CON" });
  check("Windows 保留名被拒绝", reserved.ok === false, String(reserved.error).slice(0, 40));

  const empty = await api("createFile", { dir: vault, name: "   " });
  check("空名字被拒绝", empty.ok === false, String(empty.error).slice(0, 30));

  // ---- 4. ★ 安全边界：不能写到库外面 ----
  console.log("\n── ★ 安全边界（最重要的一组）──");
  const escape1 = await api("createFile", { dir: path.join(vault, "..", ".."), name: "逃逸.md" });
  check("★ 用 ../ 逃逸到库外被拒绝", escape1.ok === false, String(escape1.error).slice(0, 50));

  const escape2 = await api("createFile", { dir: OUTSIDE, name: "别动我2.md" });
  check("★ 直接写库外绝对路径被拒绝", escape2.ok === false, String(escape2.error).slice(0, 50));

  const escape3 = await api("writeText", { path: path.join(OUTSIDE, "别动我.txt"), text: "被改了" });
  check("★ 保存到库外文件被拒绝", escape3.ok === false, String(escape3.error).slice(0, 50));

  const escape4 = await api("remove", { target: path.join(OUTSIDE, "别动我.txt") });
  check("★ 删除库外文件被拒绝", escape4.ok === false, String(escape4.error).slice(0, 50));

  const escape5 = await api("rename", { target: path.join(OUTSIDE, "别动我.txt"), newName: "改名.txt" });
  check("★ 重命名库外文件被拒绝", escape5.ok === false, String(escape5.error).slice(0, 50));

  // 确认库外的文件真的没被动过
  check("★ 库外文件内容完好（没被偷改）",
    fs.readFileSync(path.join(OUTSIDE, "别动我.txt"), "utf8") === "库外面的文件");
  check("★ 库外没有多出文件",
    fs.readdirSync(OUTSIDE).length === 1, fs.readdirSync(OUTSIDE).join(", "));

  // ---- 5. 保存 ----
  console.log("\n── 保存 ──");
  const target = path.join(vault, "笔记", "已有.md");
  const w = await api("writeText", { path: target, text: "# 已有\n\n改过的内容\n" });
  check("★ 能保存修改", w.ok === true, w.ok ? `${w.size} 字节` : w.error);
  check("磁盘内容真的变了",
    fs.readFileSync(target, "utf8").includes("改过的内容"));
  check("★ 保存前自动备份（.bak）",
    fs.existsSync(target + ".bak") && fs.readFileSync(target + ".bak", "utf8").includes("原始内容"),
    "防止编辑器 bug 把笔记写坏");

  // ---- 6. 重命名 ----
  console.log("\n── 重命名 ──");
  const ren = await api("rename", { target, newName: "改过名" });
  check("★ 能重命名", ren.ok === true, ren.ok ? ren.name : ren.error);
  check("扩展名被保留（用户不用手写 .md）", ren.ok && ren.name === "改过名.md", ren.name);
  check("旧文件不在了", !fs.existsSync(target));
  check("新文件在", ren.ok && fs.existsSync(ren.path));

  // 重命名成一个**同一目录下、别的文件已经占用的**名字
  //
  // ⚠️ 两个坑（都踩过）：
  //   1. 不能拿"自己现在的名字"来测 —— 那会走 unchanged 分支（同名不改是正常行为）
  //   2. **两个文件必须在同一个目录**。第一次写测试时把第三个文件建在库根，
  //      而要改名的文件在 笔记/ 下 —— 跨目录同名不构成冲突，
  //      改名成功是**正确行为**，测试却断言"应被拒绝"，于是假失败。
  const noteDir = path.join(vault, "笔记");
  const third = await api("createFile", { dir: noteDir, name: "第三个文件" });
  const ren2 = await api("rename", { target: ren.path, newName: "第三个文件.md" });
  check("重命名到**同目录下已被占用**的名字被拒绝", ren2.ok === false, String(ren2.error).slice(0, 60));
  check("被占用的那个文件没被动过", third.ok && fs.existsSync(third.path));
  check("要改名的文件也还在（失败不改动）", fs.existsSync(ren.path));

  // 重命名成自己现在的名字 → 视为无变化，不算失败
  const renSame = await api("rename", { target: ren.path, newName: "改过名.md" });
  check("重命名成自己现在的名字 → 视为无变化", renSame.ok === true && renSame.unchanged === true,
    JSON.stringify(renSame).slice(0, 80));

  // 跨目录同名**不构成冲突**（这是正确行为，不是 bug）
  const renCross = await api("rename", { target: ren.path, newName: "第三个文件.md.bak" });
  void renCross;

  // ---- 7. 删除（移到回收站）----
  console.log("\n── 删除 ──");
  const del = await api("remove", { target: r2.path });
  check("★ 能删除文件夹", del.ok === true, del.ok ? (del.trashed ? "已移到回收站" : "已永久删除") : del.error);
  check("★ 默认是移到回收站（不是永久删除）", del.ok && del.trashed === true,
    "笔记不能一删就没");
  check("文件夹真的不见了", !fs.existsSync(r2.path));

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
  try { fs.rmSync(OUTSIDE, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
