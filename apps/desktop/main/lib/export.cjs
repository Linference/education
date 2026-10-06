// 格致 · 文档导出
//
// 三条线：
//   Markdown → PDF  ：md → Typst → typst compile → PDF（版式由模板决定）
//   Markdown → Word ：md → python-docx 脚本 → docx
//   Markdown → MD   ：直接另存（原样搬运）
//
// ⚠️ 产品硬规矩：**产出物不得出现任何产品署名**。
//   页脚不写、结尾不写、页眉不写、注释里也不写。学生拿到的必须是"自己的文档"。
//   这条只约束产出物；代码注释里出现项目名是正常的。
//
// ⚠️ 为什么 PDF 走 Typst 而不是 JS 拼：
//   中文断行、标点挤压、字体嵌入、公式排版在 Typst/LaTeX 里有十几年积累，
//   Node 生态没有等价物。JS 拼出来的版式每次都不一样，不能当交付物。
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync, execFile } = require("node:child_process");
const { promisify } = require('node:util');
const { fileURLToPath } = require('node:url');
const { markdownToTypst, buildTypstDocument } = require("./md2typst.cjs");

// ---------------------------------------------------------------- 找工具

/**
 * 找 typst 可执行文件。
 *
 * 查找顺序（**先找随包内置的**，再找系统的）：
 *   1. 环境变量 GEZHI_TYPST（调试用）
 *   2. **随包内置**：resources/typst/typst.exe（全内置安装包的路径）
 *   3. 同目录下的 typst/（打包后 process.resourcesPath 已由调用方传入）
 *   4. PATH
 *   5. 常见安装位置（cargo、Program Files、winget 包目录）
 *
 * 为什么要内置：目标用户是中学生，让他们自己去 `winget install Typst.Typst`
 * 不现实。全内置版把 typst.exe 打进安装包，装完就能导 PDF。
 */
function findTypst(bundledPath) {
  const envPath = process.env.GEZHI_TYPST;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 随包内置（优先级高于系统安装的：版本可控，行为可预期）
  const bundled = [];
  if (bundledPath) bundled.push(bundledPath);
  if (process.resourcesPath) {
    bundled.push(path.join(process.resourcesPath, "typst", "typst.exe"));
    bundled.push(path.join(process.resourcesPath, "typst", "typst"));
  }
  for (const b of bundled) {
    if (b && fs.existsSync(b)) return b;
  }

  const candidates = [
    // PATH 里能直接找到
    "typst",
    path.join(os.homedir(), ".cargo", "bin", "typst.exe"),
    "C:\\Program Files\\Typst\\typst.exe",
  ];

  // winget 的包目录：名字里带版本，只能扫
  const wingetRoot = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(wingetRoot)) {
    for (const d of fs.readdirSync(wingetRoot)) {
      if (!/typst/i.test(d)) continue;
      const base = path.join(wingetRoot, d);
      const found = findFileDeep(base, "typst.exe", 4);
      if (found) candidates.push(found);
    }
  }

  for (const c of candidates) {
    if (c === "typst") {
      // 试 PATH
      const r = spawnSync("typst", ["--version"], { encoding: "utf8", timeout: 15000, shell: true });
      if (r.status === 0) return "typst";
      continue;
    }
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function findFileDeep(dir, name, maxDepth, depth = 0) {
  if (depth > maxDepth) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return p;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const r = findFileDeep(path.join(dir, e.name), name, maxDepth, depth + 1);
    if (r) return r;
  }
  return null;
}

/** 找带 python-docx 的 Python。优先用项目记录过的解释器，再退回 PATH。 */
function findPython() {
  const envPath = process.env.GEZHI_PYTHON;
  const candidates = [];
  if (envPath) candidates.push(envPath);

  const localPrograms = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python");
  if (fs.existsSync(localPrograms)) {
    for (const d of fs.readdirSync(localPrograms).sort().reverse()) {
      if (/^Python3/i.test(d)) candidates.push(path.join(localPrograms, d, "python.exe"));
    }
  }
  candidates.push("python", "python3", "py");

  for (const c of candidates) {
    const r = spawnSync(c, ["-c", "import docx; print('ok')"], {
      encoding: "utf8", timeout: 20000, shell: c === "py" || c === "python" || c === "python3",
    });
    if (r.status === 0 && String(r.stdout).includes("ok")) return c;
  }
  return null;
}

// ---------------------------------------------------------------- PDF

/**
 * Markdown → PDF。
 *
 * 流程：写 .md → 转 .typ → typst compile
 *
 * 为什么要落盘再编译而不是走 stdin：
 *   Typst 的图片引用、#import 模板都依赖**文件系统的相对路径**，
 *   走 stdin 时没有"当前文件所在目录"的概念，图片和模板都找不到。
 *   所以老老实实写进源文件同目录，编译完再清理（只留 .typ 方便用户改版式）。
 */
async function exportPdf({ markdown, sourcePath, outputPath, title, author, templatePath, keepTypst, bundledTypst }) {
  // 优先用随包内置的 typst.exe（全内置安装包的目标：装完就能导，用户不用装任何东西）
  const typstBin = findTypst(bundledTypst);
  if (!typstBin) {
    return {
      ok: false,
      error:
        "找不到 Typst。全内置版的安装包应当自带了它；\n" +
        "如果你是开发态运行，请先执行：node scripts/vendor-typst.mjs\n" +
        "（或 winget install Typst.Typst）",
    };
  }

  const dir = path.dirname(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gezhi-pdf-'));
  const typPath = path.join(workDir, 'document.typ');
  const pdfPath = outputPath ?? path.join(dir, `${stem}.pdf`);
  const warnings = [];
  let retainWork = false;

  try {
    let assetIndex = 0;
    const imageResolver = src => {
      try {
        if (/^https?:/i.test(src)) { warnings.push('未嵌入网络图片，请先保存到本地：' + src); return null; }
        const local = src.startsWith('file:') ? fileURLToPath(src) : path.resolve(dir, decodeURIComponent(src));
        if (!fs.statSync(local).isFile()) throw new Error('不是文件');
        const fileName = 'image-' + (++assetIndex) + path.extname(local);
        fs.copyFileSync(local, path.join(workDir,fileName)); return fileName;
      } catch { warnings.push('找不到本地图片：' + src); return null; }
    };
    const { body, title: autoTitle } = markdownToTypst(markdown, { imageResolver });
    const docTitle = title ?? autoTitle ?? stem;
    const authorLine = author ? `  author: ${JSON.stringify(author)},\n` : "";

    // ★ Typst 的 --root 是安全边界：**只有 root 之内的文件才能被读取**。
    //   用绝对路径 #import 一个在 root 之外的文件会报
    //   `path contains invalid component "D:"`（实测）。
    //   所以把模板复制到输出目录旁边，用**相对路径** import，
    //   并把 --root 指向输出目录。这样图片等相对资源也能正确解析。
    const tplName = "gezhi-handout.typ";
    const tplDest = path.join(workDir, tplName);
    fs.copyFileSync(templatePath, tplDest);
    // gezhi.typ（字体栈）也要一起带过去，handout.typ 会 import 它
    const gezhiSrc = path.join(path.dirname(templatePath), "gezhi.typ");
    if (fs.existsSync(gezhiSrc)) {
      fs.copyFileSync(gezhiSrc, path.join(workDir, "gezhi.typ"));
    }

    // ⚠️ 顺序：#import 必须在 #show 之前 —— 否则 handout 还没定义就用了。
    const doc = `// 由导出流程生成；编译进 PDF 后本注释不可见
// 产出物不含任何产品署名（产品硬规矩）
#import "${tplName}": handout

#show: handout.with(
  title: ${JSON.stringify(docTitle)},
${authorLine})

${body}
`;
    fs.writeFileSync(typPath, doc, "utf8");

    const args = [
      "compile",
      "--root", workDir,
      "--font-path", "C:\\Windows\\Fonts",
      typPath,
      pdfPath,
    ];
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    // Compilation is asynchronous so the window remains interactive.
    await promisify(execFile)(typstBin,args,{encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:4*1024*1024});
    if (!fs.existsSync(pdfPath)) {
      return { ok: false, error: "Typst 报告成功但没有生成 PDF", typPath };
    }

    const size = fs.statSync(pdfPath).size;
    if (size < 1000) {
      return { ok: false, error: `生成的 PDF 只有 ${size} 字节，疑似失败`, typPath };
    }

    retainWork = Boolean(keepTypst);
    return { ok: true, path: pdfPath, size, warnings, typPath: keepTypst ? typPath : null, engine: typstBin };
  } catch (e) {
    return { ok: false, error: 'PDF 导出失败：' + String(e.stderr || e.message).slice(0,2500) };
  } finally {
    // Delete only the uniquely-created owned temporary directory.
    const tempRoot = fs.realpathSync(os.tmpdir());
    const real = fs.realpathSync(workDir);
    if (!retainWork && path.dirname(real) === tempRoot && path.basename(real).startsWith('gezhi-pdf-')) fs.rmSync(real,{recursive:true,force:true});
  }
}

// ---------------------------------------------------------------- Word
//
// 用**纯 JavaScript** 的 docx 库生成，不再依赖 python-docx。
//
// 为什么换掉 python-docx：
//   它需要随包带一个 Python 运行时。本机装完是 11 GB；即便用 embeddable 版
//   也要 40–60 MB，还得自己解决 lxml 的二进制依赖。
//   而 docx 这个 npm 库是 MIT 许可、解包 9 MB、纯 JS、直接生成 OOXML。
//   对"全内置安装包"这个目标，差距是一个量级。
//
// 原来的 python-docx 路径**保留为后备**：万一 docx 库在某个文档上出问题，
// 装了 Python 的机器还能走老路（findPython 仍然保留）。
async function exportDocx({ markdown, sourcePath, outputPath, title, scriptPath, preferPython }) {
  const dir = path.dirname(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const docxPath = outputPath ?? path.join(dir, `${stem}.docx`);

  // 默认走纯 JS（内置、无外部依赖）
  if (!preferPython) {
    const { exportDocxNative } = require("./docx-native.cjs");
    return exportDocxNative({ markdown, outputPath: docxPath, title: title ?? stem });
  }

  // 后备：python-docx
  const py = findPython();
  if (!py) {
    return { ok: false, error: "找不到带 python-docx 的 Python（且未启用内置转换器）" };
  }
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `找不到转换脚本：${scriptPath}` };
  }

  const mdTmp = path.join(dir, `${stem}.gezhi-export.md`);
  try {
    fs.writeFileSync(mdTmp, markdown, "utf8");
    const r = spawnSync(py, [scriptPath, mdTmp, docxPath, title ?? stem], {
      encoding: "utf8",
      timeout: 180000,
      windowsHide: true,
    });
    try { fs.unlinkSync(mdTmp); } catch { /* 忽略 */ }

    if (r.status !== 0) {
      const err = String(r.stderr ?? "") + String(r.stdout ?? "");
      return { ok: false, error: `转换失败（退出码 ${r.status}）：\n${err.slice(0, 2000)}` };
    }
    if (!fs.existsSync(docxPath)) return { ok: false, error: "脚本报告成功但没有生成 docx" };

    return { ok: true, path: docxPath, size: fs.statSync(docxPath).size, engine: py };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------- 能力探测

/** 导出能力自检：界面据此决定哪些格式可选、缺什么怎么装 */
function probeExportCapabilities({ templatePath, docxScriptPath, typstBundled }) {
  // Typst：优先用随包内置的，其次找系统的
  const typst = typstBundled && fs.existsSync(typstBundled) ? typstBundled : findTypst();
  return {
    pdf: {
      available: Boolean(typst),
      engine: typst,
      bundled: Boolean(typstBundled && fs.existsSync(typstBundled)),
      template: fs.existsSync(templatePath),
      reason: typst ? null : "未找到 Typst（全内置版应自带；开发态可 winget install Typst.Typst）",
    },
    docx: {
      // 纯 JS 转换器是内置的，永远可用 —— 不再依赖 Python
      available: true,
      engine: "内置（纯 JavaScript）",
      pythonFallback: Boolean(findPython()) && fs.existsSync(docxScriptPath),
      reason: null,
    },
    markdown: { available: true },
  };
}

module.exports = { exportPdf, exportDocx, probeExportCapabilities, findTypst, findPython, markdownToTypst, buildTypstDocument };
