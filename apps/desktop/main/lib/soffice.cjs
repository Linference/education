// 用 LibreOffice 把 Office 文档转成 PDF（用于高保真查看）
//
// 为什么这条路可行且视觉最好：
//   LibreOffice 自带完整的 Office 渲染引擎，headless 模式下能把
//   .ppt/.pptx/.doc/.docx/.xls/.xlsx 转成 PDF。
//   格致已经有 PDF 查看器，所以转出来的 PDF 直接就能显示 ——
//   不需要再写第二个查看器。
//
// 许可：MPL-2.0（弱 copyleft）。**作为独立进程调用**不传染 ——
//   我们不分发它的代码，只是启动它、拿它产出的文件。
//   这跟"把它的源码嵌进格致"是两件事。
//
// ⚠️ 三个实测坑（预先防范）：
//   1. `--outdir` 必须在 LibreOffice 的**允许写入目录**内。
//      实测：输出到库目录会被 "path contains invalid component" 之类的
//      沙箱限制拒绝。所以统一转到 userData 下的临时目录，再读回来。
//   2. 同一 profile 不能并发启动。两个转换同时跑，第二个会静默失败或挂住。
//      → 用队列串行化，并且给每个转换独立的 -env:UserInstallation。
//   3. 转换失败时 LibreOffice 可能**不返回非零退出码**（只是没产出文件）。
//      → 判定成功要靠"输出文件存在且非空"，不能只看退出码。
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");

/** LibreOffice 常见的安装位置 */
const SOFFICE_PATHS = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files\\LibreOffice 7\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

/**
 * 找 LibreOffice。
 *
 * @param {string} [resourcesPath] 打包后 process.resourcesPath（用于找随包分发的 LibreOffice）
 * @returns {string|null}
 */
function findSoffice(resourcesPath) {
  const candidates = [];

  // 1) 随包分发的（"全内置"，用户不需要自己装）
  //    打包后位置：resources/soffice/program/soffice.exe
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, "soffice", "program", "soffice.exe"));
  }
  // 开发态：仓库里的 vendor/soffice/program/soffice.exe
  // （__dirname 是 apps/desktop/main/lib，往上三级是仓库根）
  candidates.push(path.resolve(__dirname, "..", "..", "..", "..", "vendor", "soffice", "program", "soffice.exe"));

  // 2) 用户自己装的（环境变量优先，便于指定非标准位置）
  if (process.env.GEZHI_SOFFICE) candidates.push(process.env.GEZHI_SOFFICE);
  candidates.push(...SOFFICE_PATHS);

  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch { /* 忽略 */ }
  }

  // 3) 最后试 PATH
  const which = process.platform === "win32" ? "where" : "which";
  try {
    const r = spawnSync(which, ["soffice"], { encoding: "utf8", timeout: 10000 });
    if (r.status === 0) {
      const first = String(r.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    }
  } catch { /* 忽略 */ }

  return null;
}

/**
 * 取 LibreOffice 版本号。
 *
 * ⚠️ 不能用 `soffice --version` —— 它是 **GUI 程序**，在 Windows 上不往
 *    控制台写输出，`spawnSync` 拿到的 stdout 永远是空字符串（实测）。
 *    三个可靠来源，按顺序试：
 *      1. program/version.ini —— 里没有直接的版本号字段，但有 buildid 与
 *         语言列表；我们用不到，跳过
 *      2. 从可执行文件的版本资源里读（PowerShell / wmic）—— 最可靠
 *      3. 从安装目录名或 update-settings.ini 推断
 *
 * 版本号只是**展示用**（界面上让用户知道用的是哪个引擎），
 * 拿不到也不影响功能，所以失败返回 null 而不是报错。
 */
function readVersion(exe) {
  // 1) Windows：读 exe 的版本资源
  if (process.platform === "win32") {
    try {
      const r = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command",
          `(Get-Item '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`],
        { encoding: "utf8", timeout: 20000, windowsHide: true }
      );
      const v = String(r.stdout ?? "").trim();
      if (v) return v;
    } catch { /* 继续试下一个方式 */ }
  }

  // 2) 从 program/version.ini 里找（不同版本字段名可能不同）
  try {
    const ini = path.join(path.dirname(exe), "version.ini");
    if (fs.existsSync(ini)) {
      const txt = fs.readFileSync(ini, "utf8");
      // 形如 ReferenceOOoMajorMinor=4.1 或 Version=26.8
      const m = /^(?:Version|ReferenceOOoMajorMinor)\s*=\s*(.+)$/im.exec(txt);
      if (m) return m[1].trim();
    }
  } catch { /* 忽略 */ }

  // 3) 兜底：跑一次 --version（Linux/macOS 上能拿到；Windows 上拿不到也不报错）
  try {
    const r = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 30000, windowsHide: true });
    const v = String(r.stdout ?? "").trim().split(/\r?\n/)[0];
    if (v) return v;
  } catch { /* 忽略 */ }

  return null;
}

/** 探测能力（界面据此决定走"高保真"还是"文字模式"） */
function probeSoffice(resourcesPath) {
  const exe = findSoffice(resourcesPath);
  if (!exe) {
    return {
      available: false,
      reason: "没有找到 LibreOffice。装上它之后，格致可以用它把 PPT/Word 转成 PDF 高保真查看。",
      engine: null,
      version: null,
    };
  }
  return { available: true, engine: exe, version: readVersion(exe), reason: null };
}

/** 支持的扩展名 → LibreOffice 的转换目标 */
const CONVERTIBLE = new Set([".ppt", ".pptx", ".pps", ".ppsx", ".doc", ".docx", ".rtf", ".xls", ".xlsx", ".odp", ".odt", ".ods"]);

/**
 * 扩展名 → LibreOffice 打开它时**应该**用的文档类型。
 *
 * 用途：识别"文件其实是坏的，但 LibreOffice 硬把它当别的类型打开了"。
 * 实测：29 字节的垃圾文件命名为 .pptx，LibreOffice 不报错，
 * 而是**当纯文本文档打开**，照样导出一个 1 页的 PDF。
 * 用户会看到一页乱码或空白，还以为转换功能坏了。
 * 日志里会写 "as a Writer document" —— 这就是判据。
 */
const EXPECTED_DOC_TYPE = {
  ".ppt": "Impress", ".pptx": "Impress", ".pps": "Impress", ".ppsx": "Impress", ".odp": "Impress",
  ".doc": "Writer", ".docx": "Writer", ".rtf": "Writer", ".odt": "Writer",
  ".xls": "Calc", ".xlsx": "Calc", ".ods": "Calc",
};

/**
 * 串行队列。
 * 同一 profile 并发启动 LibreOffice 会失败，所以转换必须排队。
 */
let queueTail = Promise.resolve();
function enqueue(task) {
  const run = queueTail.then(task, task);
  // 让队列不因为某次失败而中断
  queueTail = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * 把文档转成 PDF。
 *
 * @param {object} opts
 * @param {string} opts.exe       soffice.exe 路径
 * @param {string} opts.src       源文件绝对路径
 * @param {string} opts.workDir   工作目录（必须在可写位置，建议 userData 下）
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok:boolean, pdf?:string, ms?:number, error?:string, log?:string}>}
 */
function convertToPdf({ exe, src, workDir, timeoutMs = 180000 }) {
  return enqueue(() => new Promise((resolve) => {
    const t0 = Date.now();
    if (!fs.existsSync(src)) { resolve({ ok: false, error: `源文件不存在：${src}` }); return; }

    const ext = path.extname(src).toLowerCase();
    if (!CONVERTIBLE.has(ext)) {
      resolve({ ok: false, error: `这个格式 LibreOffice 不负责转换：${ext}` });
      return;
    }

    // 空文件/几乎空的文件直接拒绝。
    // 实测：0 字节的 .pptx 也会"转换成功"，产出一个 8 KB 的空 PDF ——
    // 用户看到白页，不如明确告诉他文件是空的。
    // 阈值取 64 字节：比任何真实的 Office 文档头都小。
    const srcSize = (() => { try { return fs.statSync(src).size; } catch { return -1; } })();
    if (srcSize >= 0 && srcSize < 64) {
      resolve({ ok: false, error: `源文件几乎是空的（${srcSize} 字节），没有内容可转换` });
      return;
    }

    const outDir = path.join(workDir, `lo-out-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(outDir, { recursive: true });

    // 每个转换用独立的 UserInstallation，避免并发冲突；
    // 放临时目录，不污染用户的 LibreOffice 配置。
    const profile = path.join(workDir, `lo-profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

    /**
     * 导出参数。
     *
     * ★ 为什么必须压缩：实测 219 MB 的课件（图片型）用无损导出，
     *   得到的 PDF 是 **260 MB** —— 查看器加载 4 秒都显示不出来。
     *   课件里的配图按 150 DPI + JPEG 85% 压缩后，屏幕上几乎看不出差别
     *   （幻灯片的观看距离和放大倍率本来就不需要 300 DPI 无损）。
     *
     * 参数含义：
     *   ReduceImageResolution  按指定 DPI 重采样图片
     *   MaxImageResolution     上限 DPI
     *   Quality                 JPEG 质量（1-100）
     *   UseLosslessCompression  false = 用 JPEG 有损压缩
     */
    const FILTER_OPTIONS = [
      "ReduceImageResolution=true",
      "MaxImageResolution=150",
      "Quality=85",
      "UseLosslessCompression=false",
      "ExportBookmarks=true",
      "ExportNotes=false",           // 备注不用导出，省体积
    ].join(",");

    const isImpress = /\.(ppt|pptx|pps|ppsx|odp)$/i.test(ext);
    const filter = isImpress
      ? `pdf:impress_pdf_Export:${JSON.stringify({ FilterOptions: FILTER_OPTIONS })}`
      : `pdf:writer_pdf_Export:${JSON.stringify({ FilterOptions: FILTER_OPTIONS })}`;

    const args = [
      "--headless",           // 无界面
      "--norestore",          // 不恢复上次会话（否则可能弹窗挂住）
      "--invisible",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard", // 首次运行向导会阻塞自动化
      `-env:UserInstallation=file:///${profile.replace(/\\/g, "/")}`,
      "--convert-to", filter,
      "--outdir", outDir,
      src,
    ];

    let out = "";
    let done = false;
    const child = spawn(exe, args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* 忽略 */ }
      resolve({ ok: false, error: `转换超时（${timeoutMs / 1000}s）`, ms: Date.now() - t0, log: out.slice(-600) });
    }, timeoutMs);

    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });

    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `启动 LibreOffice 失败：${e.message}`, ms: Date.now() - t0 });
    });

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      // ★ 不能只看退出码 —— 转换失败时 LibreOffice 可能仍返回 0。
      //   判定标准是"输出目录里有非空的 pdf"。
      let pdf = null;
      try {
        const produced = fs.readdirSync(outDir).filter((f) => /\.pdf$/i.test(f));
        if (produced.length) {
          const p = path.join(outDir, produced[0]);
          if (fs.statSync(p).size > 0) pdf = p;
        }
      } catch { /* 忽略 */ }

      // 清理 profile（几百 KB 到几 MB，不清理会累积）
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }

      if (!pdf) {
        resolve({
          ok: false,
          error: `LibreOffice 没有产出 PDF（退出码 ${code}）`,
          ms: Date.now() - t0,
          log: out.slice(-600),
        });
        return;
      }

      /**
       * ★ 类型识别校验：文件坏掉时 LibreOffice 常常**不报错**，
       *   而是把它当成另一种文档打开，然后"成功"导出一个无意义的 PDF。
       *
       *   实测数据（29 字节垃圾内容命名为 .pptx）：
       *     · 退出码 0，产出 18 KB / 1 页的 PDF
       *     · 日志里写 "as a **Writer** document"（应为 Impress）
       *   用户看到的是空白页，会以为转换坏了。
       *
       *   所以读日志里的类型，和扩展名应有的类型比对。
       */
      const expected = EXPECTED_DOC_TYPE[ext];
      const m = /as a\s+([A-Za-z]+)\s+document/i.exec(out);
      const actual = m ? m[1] : null;
      if (expected && actual && actual.toLowerCase() !== expected.toLowerCase()) {
        cleanup(path.dirname(pdf));
        resolve({
          ok: false,
          error: `这个文件可能已损坏：LibreOffice 把它识别为「${actual}」文档，而 .${ext.slice(1)} 应当是「${expected}」`,
          ms: Date.now() - t0,
          log: out.slice(-400),
        });
        return;
      }

      resolve({ ok: true, pdf, ms: Date.now() - t0, log: out.slice(-400) });
    });
  }));
}

/** 清理某次转换产生的临时目录 */
function cleanup(outDir) {
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

module.exports = { findSoffice, probeSoffice, convertToPdf, cleanup, CONVERTIBLE, SOFFICE_PATHS };
