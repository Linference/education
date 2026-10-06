// 格致 · 导出相关的 IPC 注册
//
// 三条线（产品硬规矩：**用户自己选格式**，不替他决定）：
//   Markdown → PDF   ：md → Typst → typst compile
//   Markdown → Word  ：md → python-docx
//   Markdown → MD    ：原样另存
const path = require("node:path");
const fs = require("node:fs");
// app 用来取系统"下载"文件夹的真实路径（用户可能改过位置，也可能被组策略重定向）
const { dialog, app } = require("electron");
const { exportPdf, exportDocx, probeExportCapabilities } = require("./lib/export.cjs");
const { validateName } = require('./vault-fs.cjs');

function registerExport(ipcMain, getWindow) {
  const ROOT = path.resolve(__dirname, "..", "..", "..");       // 仓库根（开发态）
  const isPacked = Boolean(process.resourcesPath && !process.resourcesPath.includes("node_modules"));

  /**
   * 找模板与脚本。
   * 开发态在仓库的 templates/ 下；打包态用 extraResources 放到 resources/。
   */
  const findRes = (rel, packedRel) => {
    const cands = [
      path.join(process.resourcesPath ?? "", packedRel),
      path.join(ROOT, rel),
    ];
    for (const c of cands) if (c && fs.existsSync(c)) return c;
    return cands[cands.length - 1];
  };

  const templatePath = findRes("templates/typst/handout.typ", path.join("templates", "typst", "handout.typ"));
  const docxScriptPath = findRes("templates/docx/md2docx.py", path.join("templates", "docx", "md2docx.py"));

  /**
   * 内置 Typst 的路径（全内置安装包的核心）。
   *
   * 打包后 typst.exe 在 resources/typst/ 下（由 extraResources 放进去）；
   * 开发态在仓库的 vendor/typst/ 下。两处都找不到才退回系统安装的 Typst。
   */
  const bundledTypst = (() => {
    const cands = [
      path.join(process.resourcesPath ?? "", "typst", "typst.exe"),
      path.join(ROOT, "vendor", "typst", "typst.exe"),
    ];
    for (const c of cands) if (c && fs.existsSync(c)) return c;
    return null;
  })();

  // 能力探测：界面据此决定哪些格式可点、缺工具怎么装
  ipcMain.handle("export:probe", () => {
    const cap = probeExportCapabilities({ templatePath, docxScriptPath, typstBundled: bundledTypst });
    return {
      ...cap,
      paths: { templatePath, docxScriptPath, bundledTypst, packed: isPacked },
    };
  });

  /**
   * 导出。
   *
   * @param payload.format  "pdf" | "docx" | "markdown"
   * @param payload.markdown 源文本
   * @param payload.sourcePath 源文件路径（决定输出目录，也决定图片相对路径能不能解析）
   * @param payload.defaultName 默认文件名（不含扩展名）
   * @param payload.author 可选署名（默认不写 —— 产出物要干净）
   * @param payload.saveAs 是否弹"另存为"对话框
   * @param payload.toDownloads 导出到系统"下载"文件夹，而不是源文件所在目录
   */
  ipcMain.handle("export:run", async (_e, payload) => {
    try {
    const { format, markdown, sourcePath: suppliedSource, defaultName, author, saveAs, toDownloads } = payload ?? {};
    if (!['markdown', 'pdf', 'docx'].includes(format)) return { ok: false, error: '不支持的导出格式' };
    if (typeof markdown !== "string" || (format !== 'markdown' && !markdown.trim())) {
      return { ok: false, error: "没有可导出的内容" };
    }
    if (typeof suppliedSource !== 'string' || !suppliedSource.trim()) {
      return { ok: false, error: "缺少源文件路径" };
    }

    const sourcePath = fs.existsSync(suppliedSource) && fs.statSync(suppliedSource).isDirectory()
      ? path.join(suppliedSource, '学习记录.md') : suppliedSource;
    const stem = validateName(defaultName || path.basename(sourcePath, path.extname(sourcePath)));
    /*
     * 输出目录。
     *
     * 默认与源文件同目录（在库里的笔记导出后就近放着，好找）。
     * 但**组卷导出试卷时要走"下载"文件夹** —— 用户要的是"拿到一份卷子",
     * 那是文件交付，不是往知识库里加东西；混进库里还会被索引、
     * 出现在文件树里，反而乱。
     *
     * 用 Electron 的 app.getPath("downloads") 而不是拼 "C:\Users\x\Downloads" ——
     * 用户可能改过下载位置，也可能被组策略重定向（本机的"文档"就是重定向过的）。
     */
    let dir = path.dirname(sourcePath);
    if (toDownloads) {
      try {
        dir = app.getPath("downloads");
      } catch {
        // 拿不到就退回原位，不因为这点事让导出失败
      }
    }
    // 目标目录可能不存在（用户删过），补建一下
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* 忽略，写的时候会再报 */ }

    // 目标路径：默认与源文件同目录（用户能找到），也可以弹对话框
    let target;
    if (format === "markdown") {
      const ext = ".md";
      target = path.join(dir, `${stem}.导出${ext}`);
      // Automatic export must not silently replace an earlier copy.
      for (let n = 2; !saveAs && fs.existsSync(target); n++) target = path.join(dir, `${stem}.导出-${n}${ext}`);
      if (saveAs) {
        const r = await dialog.showSaveDialog(getWindow(), {
          title: "导出 Markdown",
          defaultPath: target,
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (r.canceled || !r.filePath) return { ok: false, canceled: true };
        target = r.filePath;
      }
      if (path.extname(target).toLowerCase() !== '.md') target += '.md';
      try {
        fs.writeFileSync(target, markdown, "utf8");
        return { ok: true, path: target, size: fs.statSync(target).size };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    const ext = format === "pdf" ? ".pdf" : ".docx";
    target = path.join(dir, `${stem}${ext}`);
    if (saveAs) {
      const r = await dialog.showSaveDialog(getWindow(), {
        title: format === "pdf" ? "导出 PDF" : "导出 Word",
        defaultPath: target,
        filters: format === "pdf"
          ? [{ name: "PDF", extensions: ["pdf"] }]
          : [{ name: "Word 文档", extensions: ["docx"] }],
      });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      target = r.filePath;
    }
    if (path.extname(target).toLowerCase() !== ext) target += ext;

    if (format === "pdf") {
      return exportPdf({
        markdown,
        sourcePath,
        outputPath: target,
        title: stem,
        author: author || undefined,
        templatePath,
        bundledTypst,        // 优先用内置的 typst.exe
      });
    }
    if (format === "docx") {
      return exportDocx({
        markdown,
        sourcePath,
        outputPath: target,
        title: stem,
        scriptPath: docxScriptPath,
      });
    }
    return { ok: false, error: `不支持的格式：${format}` };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  // 在资源管理器里定位导出结果
  ipcMain.handle("export:reveal", async (_e, p) => {
    if (p && fs.existsSync(p)) {
      require("electron").shell.showItemInFolder(p);
      return { ok: true };
    }
    return { ok: false, error: "文件不存在" };
  });
}

module.exports = { registerExport };
