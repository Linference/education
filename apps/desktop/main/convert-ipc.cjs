// 高保真查看的 IPC：用系统上的 LibreOffice 把 Office 文档转成 PDF
//
// 设计原则（重要）：
//   **这是可选增强，不是必需依赖。**
//   没有 LibreOffice 的用户照样能用格致 —— 退回"文字提取模式"，
//   并在界面上说明"想要原样还原，装个 LibreOffice 就行"。
//   绝不能因为缺一个可选组件就让整个功能不可用。
//
// 为什么转成 PDF 而不是图片：
//   格致已经有 PDF 查看器（pdf.js，带缩放/翻页/文字选择）。
//   转成 PDF 直接复用，还能选中文字、搜索、导出 —— 比图片强。
const path = require("node:path");
const fs = require("node:fs");
const soffice = require("./lib/soffice.cjs");

let currentWindow = null;

function registerConvert(ipcMain, getWindow, app) {
  currentWindow = getWindow;

  /** 转换产物放这里（userData 下的临时目录） */
  const workDir = path.join(app.getPath("userData"), "convert-cache");
  fs.mkdirSync(workDir, { recursive: true });

  /**
   * 探测能力。界面在打开 Office 文件时调一次，决定走哪条路。
   * 结果缓存，避免每次都去 spawn 一次 --version。
   */
  let cached = null;
  let cachedAt = 0;
  const doProbe = (refresh = false) => {
    if (!refresh && cached && Date.now() - cachedAt < 60_000) return cached;
    cached = soffice.probeSoffice(process.resourcesPath);
    cachedAt = Date.now();
    return cached;
  };

  ipcMain.handle("convert:probe", async (_e, { refresh = false } = {}) => doProbe(refresh));

  /**
   * 转换一个文件。
   *
   * 返回的 pdfPath 在 userData 的缓存目录里，**不在用户的库目录里** ——
   * 不往用户资料库里塞中间产物。
   */
  ipcMain.handle("convert:toPdf", async (_e, { src }) => {
    try {
      if (typeof src !== "string" || !src) return { ok: false, error: "没有指定文件" };

      const exe = soffice.findSoffice(process.resourcesPath);
      if (!exe) {
        return {
          ok: false,
          error: "没有找到 LibreOffice，无法高保真转换",
          hint: "装上 LibreOffice 之后格致会自动使用它（不用另外配置）",
        };
      }

      const r = await soffice.convertToPdf({ exe, src, workDir });
      if (!r.ok) return r;

      // 把产物移到缓存目录下带语义的文件名（便于在界面上显示与清理）
      const base = path.basename(src).replace(/\.[^.]+$/, "");
      const target = path.join(workDir, `${base}.converted.pdf`);
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
        fs.renameSync(r.pdf, target);
      } catch {
        // rename 失败（跨盘等）就复制
        fs.copyFileSync(r.pdf, target);
      }
      // 清掉 LibreOffice 自己的输出子目录
      soffice.cleanup(path.dirname(r.pdf));

      const st = fs.statSync(target);
      const probe = doProbe();
      return {
        ok: true,
        pdfPath: target,
        bytes: st.size,
        ms: r.ms,
        engine: exe,
        version: probe.version ?? null,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 缓存占用（界面上可以显示，并提供清理） */
  ipcMain.handle("convert:cacheInfo", async () => {
    try {
      let bytes = 0;
      let count = 0;
      for (const f of fs.readdirSync(workDir)) {
        try { const st = fs.statSync(path.join(workDir, f)); if (st.isFile()) { bytes += st.size; count++; } } catch { /* 忽略 */ }
      }
      return { ok: true, dir: workDir, bytes, count };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 清空转换缓存 */
  ipcMain.handle("convert:clearCache", async () => {
    try {
      let n = 0;
      for (const f of fs.readdirSync(workDir)) {
        try { fs.rmSync(path.join(workDir, f), { recursive: true, force: true }); n++; } catch { /* 忽略 */ }
      }
      return { ok: true, removed: n };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerConvert };
