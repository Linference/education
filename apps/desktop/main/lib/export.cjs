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
const { spawnSync } = require("node:child_process");
const { markdownToTypst, buildTypstDocument } = require("./md2typst.cjs");

// ---------------------------------------------------------------- 找工具

/**
 * 找 typst 可执行文件。
 *
 * 为什么要找而不是直接用 "typst"：
 *   winget 装的 typst 不一定在 PATH 里（本机就没有），
 *   spawn("typst") 会直接 ENOENT。必须按已知位置逐个试。
 */
function findTypst() {
  const envPath = process.env.GEZHI_TYPST;
  if (envPath && fs.existsSync(envPath)) return envPath;

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
async function exportPdf({ markdown, sourcePath, outputPath, title, author, templatePath, keepTypst }) {
  const typstBin = findTypst();
  if (!typstBin) {
    return {
      ok: false,
      error:
        "找不到 Typst。导出 PDF 需要它。\n" +
        "安装：winget install Typst.Typst\n" +
        "（装完重启格致；或在设置里指定 typst.exe 的路径）",
    };
  }

  const dir = path.dirname(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const typPath = path.join(dir, `${stem}.gezhi.typ`);
  const pdfPath = outputPath ?? path.join(dir, `${stem}.pdf`);

  try {
    const { body, title: autoTitle } = markdownToTypst(markdown);
    const docTitle = title ?? autoTitle ?? stem;
    const authorLine = author ? `  author: ${JSON.stringify(author)},\n` : "";

    // ★ Typst 的 --root 是安全边界：**只有 root 之内的文件才能被读取**。
    //   用绝对路径 #import 一个在 root 之外的文件会报
    //   `path contains invalid component "D:"`（实测）。
    //   所以把模板复制到输出目录旁边，用**相对路径** import，
    //   并把 --root 指向输出目录。这样图片等相对资源也能正确解析。
    const tplName = "gezhi-handout.typ";
    const tplDest = path.join(dir, tplName);
    fs.copyFileSync(templatePath, tplDest);
    // gezhi.typ（字体栈）也要一起带过去，handout.typ 会 import 它
    const gezhiSrc = path.join(path.dirname(templatePath), "gezhi.typ");
    if (fs.existsSync(gezhiSrc)) {
      fs.copyFileSync(gezhiSrc, path.join(dir, "gezhi.typ"));
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
      "--root", dir,
      "--font-path", "C:\\Windows\\Fonts",
      typPath,
      pdfPath,
    ];
    const r = spawnSync(typstBin, args, {
      encoding: "utf8",
      timeout: 180000,
      windowsHide: true,
    });

    if (r.status !== 0) {
      const err = String(r.stderr ?? "") + String(r.stdout ?? "");
      return {
        ok: false,
        error: `Typst 编译失败（退出码 ${r.status}）：\n${err.slice(0, 2000)}`,
        typPath,
      };
    }
    if (!fs.existsSync(pdfPath)) {
      return { ok: false, error: "Typst 报告成功但没有生成 PDF", typPath };
    }

    const size = fs.statSync(pdfPath).size;
    if (size < 1000) {
      return { ok: false, error: `生成的 PDF 只有 ${size} 字节，疑似失败`, typPath };
    }

    // 清理中间产物（只留 PDF，除非调用方要求保留 .typ 以便改版式）
    for (const f of [tplDest, path.join(dir, "gezhi.typ")]) {
      try { fs.unlinkSync(f); } catch { /* 忽略 */ }
    }
    if (!keepTypst) {
      try { fs.unlinkSync(typPath); } catch { /* 忽略 */ }
    }

    return { ok: true, path: pdfPath, size, typPath: keepTypst ? typPath : null, engine: typstBin };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------- Word

/** Markdown → Word（调用 templates/docx/md2docx.py） */
async function exportDocx({ markdown, sourcePath, outputPath, title, scriptPath }) {
  const py = findPython();
  if (!py) {
    return {
      ok: false,
      error: "找不到带 python-docx 的 Python。安装：python -m pip install python-docx",
    };
  }
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `找不到转换脚本：${scriptPath}` };
  }

  const dir = path.dirname(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const mdTmp = path.join(dir, `${stem}.gezhi-export.md`);
  const docxPath = outputPath ?? path.join(dir, `${stem}.docx`);

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
function probeExportCapabilities({ templatePath, docxScriptPath }) {
  const typst = findTypst();
  const py = findPython();
  return {
    pdf: {
      available: Boolean(typst),
      engine: typst,
      template: fs.existsSync(templatePath),
      reason: typst ? null : "未找到 Typst（winget install Typst.Typst）",
    },
    docx: {
      available: Boolean(py) && fs.existsSync(docxScriptPath),
      engine: py,
      reason: !py ? "未找到带 python-docx 的 Python" : !fs.existsSync(docxScriptPath) ? "缺少转换脚本" : null,
    },
    markdown: { available: true },
  };
}

module.exports = { exportPdf, exportDocx, probeExportCapabilities, findTypst, findPython, markdownToTypst, buildTypstDocument };
