// 格致 · 库内的文件操作（新建 / 重命名 / 删除 / 保存）
//
// 为什么这些必须在主进程：渲染进程没有 fs（contextIsolation 已开）。
//
// ★ 安全约束（很重要，不能省）：
//   所有路径操作都必须**限制在当前打开的库目录之内**。
//   否则渲染进程被注入一段脚本，就能让主进程往 C:\Windows 里写文件。
//   这里用 realpath 解析后做前缀比对 —— 只比对字符串是不够的，
//   因为 `库/../..` 这种路径字符串上看着在库里，解析后却在外面。
const fs = require("node:fs");
const path = require("node:path");

/** 应用当前打开的库目录（由渲染进程在 openVault 时同步过来） */
let currentVault = null;

function setVault(dir) {
  if (typeof dir === "string" && dir && fs.existsSync(dir)) {
    currentVault = fs.realpathSync(dir);
  } else {
    currentVault = null;
  }
  return currentVault;
}

/**
 * 校验目标路径在库内。
 *
 * 两个要点：
 *   1. 用 realpathSync 解析（跟随符号链接、消掉 ../），再做前缀比对
 *   2. 目标可能还不存在（新建文件），这时对**父目录**做 realpath
 */
function assertInsideVault(target, { mustExist = false } = {}) {
  if (!currentVault) throw new Error("还没有打开库");
  const abs = path.resolve(target);

  if (mustExist) {
    if (!fs.existsSync(abs)) throw new Error(`路径不存在：${abs}`);
    const real = fs.realpathSync(abs);
    if (!isInside(real, currentVault)) {
      throw new Error("拒绝操作：目标不在当前库内");
    }
    return real;
  }

  // 目标还不存在 → 校验父目录
  const parent = path.dirname(abs);
  if (!fs.existsSync(parent)) throw new Error(`父目录不存在：${parent}`);
  const realParent = fs.realpathSync(parent);
  if (!isInside(realParent, currentVault)) {
    throw new Error("拒绝操作：目标不在当前库内");
  }
  return path.join(realParent, path.basename(abs));
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * 文件名合法性检查。
 *
 * 三个实测踩过的坑：
 *   1. **必须先 trim 再判空**。原实现是 `!name.trim()` 判空后直接 `const n = name.trim()`，
 *      看着没问题 —— 但调用方在**校验前**就把 ".md" 拼上了：
 *      "   " → "  .md" → trim 后是 ".md"，非空、通过校验，
 *      结果建出一个名叫 ".md" 的文件。所以这里要连**主干名**一起校验。
 *   2. **保留名要按主干比对**。Windows 保留的是 "CON"，"CON.md" 同样会被系统拒绝。
 *      原实现只比对整串，"CON.md" 直接漏过。
 *   3. 非法字符检查要针对用户输入，而不是拼完扩展名的结果（否则同理会漏）。
 */
function validateName(name) {
  if (typeof name !== "string") throw new Error("名称必须是文本");
  const n = name.trim();
  if (!n) throw new Error("名称不能为空");

  // 主干名（去掉扩展名）—— 保留名与空名都要按它判
  const ext = path.extname(n);
  const stem = ext ? n.slice(0, -ext.length) : n;
  if (!stem.trim()) {
    throw new Error("文件名不能只有扩展名");
  }

  if (/[<>:"/\\|?*\u0000-\u001f]/.test(n)) {
    throw new Error("名称不能包含 < > : \" / \\ | ? * 这些字符");
  }
  // Windows 保留名：CON / PRN / AUX / NUL / COM1-9 / LPT1-9
  // 注意要判**主干**，因为 CON.md 同样不被允许
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem)) {
    throw new Error(`「${stem}」是 Windows 保留名，换个名字`);
  }
  if (n.startsWith(".") && stem.startsWith(".")) {
    // 允许隐藏文件（如 .gezhi），但不允许 ".md" 这种只有扩展名的
  }
  if (n.length > 120) throw new Error("名称过长（限 120 字符）");
  return n;
}

/** 防止把同一个名字用两次 */
function uniquePath(dir, base, ext = "") {
  let candidate = path.join(dir, base + ext);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} ${i}${ext}`);
    i++;
    if (i > 999) throw new Error("同名文件太多");
  }
  return candidate;
}

function registerVaultFs(ipcMain) {
  // 打开库时同步目录，供路径校验用
  ipcMain.handle("vault:set", (_e, dir) => ({ ok: true, vault: setVault(dir) }));

  /**
   * 统一的 IPC 包装。
   *
   * ⚠️ 为什么要包一层：Electron 的 ipcMain.handle 遇到**未捕获异常**时，
   *    渲染进程收到的是 `Error: An object could not be cloned` 之类的模糊错误，
   *    而我们想看的是具体原因（"名称不能为空"）。更要命的是：
   *    如果返回的对象里有不可克隆的值，渲染进程会收到**空对象 {}** —— 
   *    断言 `!r.ok` 通过、`r.error` 是 undefined，报错信息全丢。
   *    所以这里保证：任何路径都返回一个只含基本类型的 {ok, ...} 对象。
   */
  const wrap = (fn) => async (_e, arg) => {
    try {
      const r = await fn(arg);
      if (r && typeof r === "object" && typeof r.ok === "boolean") return r;
      return { ok: true, result: r };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  /** 新建文件 */
  ipcMain.handle("fs:createFile", wrap(({ dir, name, content = "" }) => {
    try {
      // ★ 顺序：**先用用户原样输入校验，再拼扩展名**。
      //   反过来的话（原实现），"   " 会被拼成 "   .md"，
      //   再 trim 成 ".md" —— 非空、合法，于是建出一个名叫 ".md" 的文件。
      //   实测踩过：调试输出里真的出现了 `.md` 这个文件。
      const base = validateName(name);
      const safe = base.includes(".") ? base : `${base}.md`;
      // 拼完再校验一次整串（防 "CON" + ".md" 这类绕过）
      validateName(safe);
      const parent = assertInsideVault(path.join(dir, safe), { mustExist: false });
      const target = path.join(path.dirname(parent), safe);
      if (fs.existsSync(target)) return { ok: false, error: `「${safe}」已存在` };
      // 默认内容：给一个新笔记的标题骨架（比空文件友好）
      const finalContent = content || (safe.endsWith(".md") ? `# ${safe.replace(/\.md$/i, "")}\n\n` : "");
      fs.writeFileSync(target, finalContent, "utf8");
      return { ok: true, path: target, name: safe };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /** 新建文件夹 */
  ipcMain.handle("fs:createFolder", wrap(({ dir, name }) => {
    try {
      const safe = validateName(name);
      assertInsideVault(path.join(dir, safe), { mustExist: false });
      const target = path.join(dir, safe);
      if (fs.existsSync(target)) return { ok: false, error: `「${safe}」已存在` };
      fs.mkdirSync(target);
      return { ok: true, path: target, name: safe };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /**
   * 重命名（文件或文件夹）。
   * 只允许改名，不允许改路径 —— 移动是另一个操作，混在一起容易出 bug。
   */
  ipcMain.handle("fs:rename", wrap(({ target: oldPath, newName }) => {
    try {
      const real = assertInsideVault(oldPath, { mustExist: true });
      const isDir = fs.statSync(real).isDirectory();
      const safe = validateName(newName);
      // 文件保留原扩展名（除非用户明确写了新扩展名）
      const curExt = path.extname(real);
      const finalName = !isDir && curExt && !safe.includes(".") ? safe + curExt : safe;
      const newPath = path.join(path.dirname(real), finalName);

      // ⚠️ 顺序很重要：**先判重名，再判"没变化"**。
      //    反过来的话（原实现就是这样），"重命名成自己已存在的名字"
      //    会因为 newPath === real 而走 unchanged 分支，直接被放行 ——
      //    用户看到"成功"但什么也没发生，而重名冲突根本没被拦住。
      if (path.resolve(newPath) !== path.resolve(real) && fs.existsSync(newPath)) {
        return { ok: false, error: `「${finalName}」已存在` };
      }
      if (newPath === real) return { ok: true, path: real, name: finalName, unchanged: true };

      fs.renameSync(real, newPath);
      return { ok: true, path: newPath, name: finalName, oldPath: real };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /**
   * 删除。
   *
   * ★ 默认**移到回收站**而不是直接删 —— 笔记是用户的命根子，
   *   一次误点就永久丢失是不可接受的。只有回收站不可用时才真删，
   *   并且这时界面上会明确提示。
   *   （Electron 的 shell.trashItem 是异步的）
   */
  ipcMain.handle("fs:delete", async (_e, { target, permanent = false }) => {
    try {
      const real = assertInsideVault(target, { mustExist: true });
      if (permanent) {
        fs.rmSync(real, { recursive: true, force: true });
        return { ok: true, path: real, permanent: true };
      }
      const { shell } = require("electron");
      await shell.trashItem(real);
      return { ok: true, path: real, trashed: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 保存文本文件（编辑器用） */
  ipcMain.handle("fs:writeText", wrap(({ path: filePath, text }) => {
    try {
      if (typeof text !== "string") return { ok: false, error: "内容必须是字符串" };
      const real = assertInsideVault(filePath, { mustExist: true });
      const st = fs.statSync(real);
      if (st.isDirectory()) return { ok: false, error: "目标是文件夹，不能写入" };
      // 写前把原文件备份一份（同名 .bak），防止编辑器 bug 把笔记写坏
      // 只对已有内容的文件备份，且限制大小（别为了备份把磁盘写满）
      if (st.size > 0 && st.size < 8 * 1024 * 1024) {
        try {
          const bak = real + ".bak";
          // 只保留一份备份：覆盖前一个
          if (fs.existsSync(bak)) fs.unlinkSync(bak);
          fs.copyFileSync(real, bak);
        } catch { /* 备份失败不阻断保存 */ }
      }
      fs.writeFileSync(real, text, "utf8");
      const after = fs.statSync(real);
      return { ok: true, path: real, size: after.size, mtime: after.mtime.toISOString() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /** 查询当前库（调试与测试用） */
  ipcMain.handle("fs:currentVault", () => ({ vault: currentVault }));
}

module.exports = { registerVaultFs, setVault, assertInsideVault, validateName };
