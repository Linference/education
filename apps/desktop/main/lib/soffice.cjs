// Use LibreOffice to convert Office documents to PDF (for high-fidelity viewing)
//
// Why this path works and looks best:
//   LibreOffice ships with a complete Office rendering engine; in headless mode it
//   can convert .ppt/.pptx/.doc/.docx/.xls/.xlsx to PDF.
//   Gezhi already has a PDF viewer, so the converted PDF can be displayed directly -
//   there is no need to write a second viewer.
//
// License: MPL-2.0 (weak copyleft). **Calling it as a separate process** is not
//   viral - we do not distribute its code; we just launch it and take the files it
//   produces. That is different from "embedding its source into Gezhi".
//
// ⚠️ Three pitfalls found in practice (defended against up front):
//   1. `--outdir` must be inside LibreOffice's **allowed writable directory**.
//      In practice: outputting to the vault directory is rejected by a sandbox
//      restriction like "path contains invalid component". So we always convert to a
//      temp directory under userData, then read it back.
//   2. The same profile cannot be launched concurrently. If two conversions run at
//      once, the second silently fails or hangs.
//      → Serialize with a queue, and give each conversion its own -env:UserInstallation.
//   3. On conversion failure LibreOffice may **not return a non-zero exit code** (it
//      just produces no file).
//      → Success is determined by "the output file exists and is non-empty", not by
//        the exit code alone.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");

/** Common install locations for LibreOffice */
const SOFFICE_PATHS = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files\\LibreOffice 7\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

/**
 * Find LibreOffice.
 *
 * @param {string} [resourcesPath] process.resourcesPath after packaging (used to find a bundled LibreOffice)
 * @returns {string|null}
 */
function findSoffice(resourcesPath) {
  const candidates = [];

  // 1) Bundled ("fully built in", the user does not need to install it themselves)
  //    Packaged location: resources/soffice/program/soffice.exe
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, "soffice", "program", "soffice.exe"));
  }
  // Dev mode: vendor/soffice/program/soffice.exe in the repo
  // (__dirname is apps/desktop/main/lib; three levels up is the repo root)
  candidates.push(path.resolve(__dirname, "..", "..", "..", "..", "vendor", "soffice", "program", "soffice.exe"));

  // 2) Installed by the user (environment variable first, so a non-standard location can be specified)
  if (process.env.GEZHI_SOFFICE) candidates.push(process.env.GEZHI_SOFFICE);
  candidates.push(...SOFFICE_PATHS);

  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch { /* ignore */ }
  }

  // 3) Finally try PATH
  const which = process.platform === "win32" ? "where" : "which";
  try {
    const r = spawnSync(which, ["soffice"], { encoding: "utf8", timeout: 10000 });
    if (r.status === 0) {
      const first = String(r.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Get the LibreOffice version number.
 *
 * ⚠️ `soffice --version` cannot be used - it is a **GUI program**, and on Windows it
 *    does not write to the console, so the stdout `spawnSync` receives is always an
 *    empty string (observed in practice).
 *    Three reliable sources, tried in order:
 *      1. program/version.ini - it has no direct version field, but it does have a
 *         buildid and a language list; we don't need them, skip
 *      2. Read from the executable's version resource (PowerShell / wmic) - most
 *         reliable
 *      3. Infer from the install directory name or update-settings.ini
 *
 * The version number is only **for display** (so the UI can tell the user which
 * engine is in use); not getting it does not affect functionality, so on failure we
 * return null instead of throwing.
 */
function readVersion(exe) {
  // 1) Windows: read the exe's version resource
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
    } catch { /* continue trying the next method */ }
  }

  // 2) Look in program/version.ini (field names may differ across versions)
  try {
    const ini = path.join(path.dirname(exe), "version.ini");
    if (fs.existsSync(ini)) {
      const txt = fs.readFileSync(ini, "utf8");
      // In the form ReferenceOOoMajorMinor=4.1 or Version=26.8
      const m = /^(?:Version|ReferenceOOoMajorMinor)\s*=\s*(.+)$/im.exec(txt);
      if (m) return m[1].trim();
    }
  } catch { /* ignore */ }

  // 3) Fallback: run --version once (works on Linux/macOS; on Windows failing to get it does not error)
  try {
    const r = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 30000, windowsHide: true });
    const v = String(r.stdout ?? "").trim().split(/\r?\n/)[0];
    if (v) return v;
  } catch { /* ignore */ }

  return null;
}

/** Probe capabilities (the UI uses this to decide between "high fidelity" and "text mode") */
function probeSoffice(resourcesPath) {
  const exe = findSoffice(resourcesPath);
  if (!exe) {
    return {
      available: false,
      reason: "LibreOffice was not found. Once it is installed, Gezhi can use it to convert PPT/Word to PDF for high-fidelity viewing.",
      engine: null,
      version: null,
    };
  }
  return { available: true, engine: exe, version: readVersion(exe), reason: null };
}

/** Supported extensions -> LibreOffice conversion target */
const CONVERTIBLE = new Set([".ppt", ".pptx", ".pps", ".ppsx", ".doc", ".docx", ".rtf", ".xls", ".xlsx", ".odp", ".odt", ".ods"]);

/**
 * Extension -> the document type LibreOffice **should** use when opening it.
 *
 * Purpose: detect "the file is actually corrupt, but LibreOffice opens it as another
 * type anyway".
 * In practice: a 29-byte garbage file named .pptx does not make LibreOffice error;
 * instead it **opens it as a plain text document** and still exports a 1-page PDF.
 * The user sees a page of mojibake or blank and assumes the conversion is broken.
 * The log will say "as a Writer document" - that is the signal.
 */
const EXPECTED_DOC_TYPE = {
  ".ppt": "Impress", ".pptx": "Impress", ".pps": "Impress", ".ppsx": "Impress", ".odp": "Impress",
  ".doc": "Writer", ".docx": "Writer", ".rtf": "Writer", ".odt": "Writer",
  ".xls": "Calc", ".xlsx": "Calc", ".ods": "Calc",
};

/**
 * Serial queue.
 * Launching LibreOffice concurrently with the same profile fails, so conversions
 * must be queued.
 */
let queueTail = Promise.resolve();
function enqueue(task) {
  const run = queueTail.then(task, task);
  // Keep the queue from breaking because of a single failure
  queueTail = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Convert a document to PDF.
 *
 * @param {object} opts
 * @param {string} opts.exe       soffice.exe path
 * @param {string} opts.src       absolute path of the source file
 * @param {string} opts.workDir   working directory (must be writable; under userData is recommended)
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok:boolean, pdf?:string, ms?:number, error?:string, log?:string}>}
 */
function convertToPdf({ exe, src, workDir, timeoutMs = 180000 }) {
  return enqueue(() => new Promise((resolve) => {
    const t0 = Date.now();
    if (!fs.existsSync(src)) { resolve({ ok: false, error: `Source file does not exist: ${src}` }); return; }

    const ext = path.extname(src).toLowerCase();
    if (!CONVERTIBLE.has(ext)) {
      resolve({ ok: false, error: `LibreOffice does not handle conversion for this format: ${ext}` });
      return;
    }

    // Reject empty / nearly empty files outright.
    // In practice: a 0-byte .pptx still "converts successfully" and produces an 8 KB
    // empty PDF - instead of showing the user a white page, better to tell them
    // explicitly the file is empty.
    // The 64-byte threshold is smaller than any real Office document header.
    const srcSize = (() => { try { return fs.statSync(src).size; } catch { return -1; } })();
    if (srcSize >= 0 && srcSize < 64) {
      resolve({ ok: false, error: `Source file is nearly empty (${srcSize} bytes), nothing to convert` });
      return;
    }

    const outDir = path.join(workDir, `lo-out-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(outDir, { recursive: true });

    // Each conversion uses an independent UserInstallation to avoid concurrency
    // conflicts; put it in a temp directory so it doesn't pollute the user's
    // LibreOffice configuration.
    const profile = path.join(workDir, `lo-profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

    /**
     * Export parameters.
     *
     * ★ Why compression is required: a 219 MB course deck (image-heavy) exported
     *   losslessly produced a **260 MB** PDF in practice - the viewer couldn't even
     *   render it after 4 seconds.
     *   After compressing the deck's images at 150 DPI + JPEG 85%, the difference is
     *   nearly invisible on screen (at slide viewing distance and magnification,
     *   lossless 300 DPI was never needed).
     *
     * Parameter meanings:
     *   ReduceImageResolution  resample images at the given DPI
     *   MaxImageResolution     upper DPI limit
     *   Quality                JPEG quality (1-100)
     *   UseLosslessCompression  false = use lossy JPEG compression
     */
    const FILTER_OPTIONS = [
      "ReduceImageResolution=true",
      "MaxImageResolution=150",
      "Quality=85",
      "UseLosslessCompression=false",
      "ExportBookmarks=true",
      "ExportNotes=false",           // no need to export notes, saves size
    ].join(",");

    const isImpress = /\.(ppt|pptx|pps|ppsx|odp)$/i.test(ext);
    const filter = isImpress
      ? `pdf:impress_pdf_Export:${JSON.stringify({ FilterOptions: FILTER_OPTIONS })}`
      : `pdf:writer_pdf_Export:${JSON.stringify({ FilterOptions: FILTER_OPTIONS })}`;

    const args = [
      "--headless",           // no UI
      "--norestore",          // don't restore the last session (otherwise it may pop a dialog and hang)
      "--invisible",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard", // the first-run wizard blocks automation
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
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, error: `Conversion timed out (${timeoutMs / 1000}s)`, ms: Date.now() - t0, log: out.slice(-600) });
    }, timeoutMs);

    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });

    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `Failed to start LibreOffice: ${e.message}`, ms: Date.now() - t0 });
    });

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      // ★ The exit code alone is not enough - on conversion failure LibreOffice may
      //   still return 0.
      //   The criterion is "there is a non-empty pdf in the output directory".
      let pdf = null;
      try {
        const produced = fs.readdirSync(outDir).filter((f) => /\.pdf$/i.test(f));
        if (produced.length) {
          const p = path.join(outDir, produced[0]);
          if (fs.statSync(p).size > 0) pdf = p;
        }
      } catch { /* ignore */ }

      // Clean up the profile (a few hundred KB to a few MB; it accumulates if not cleaned)
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }

      if (!pdf) {
        resolve({
          ok: false,
          error: `LibreOffice produced no PDF (exit code ${code})`,
          ms: Date.now() - t0,
          log: out.slice(-600),
        });
        return;
      }

      /**
       * ★ Type detection check: when a file is corrupt LibreOffice often **does not
       *   error**; instead it opens it as another type of document and then
       *   "successfully" exports a meaningless PDF.
       *
       *   Observed data (29 bytes of garbage named .pptx):
       *     · exit code 0, produces an 18 KB / 1-page PDF
       *     · the log says "as a **Writer** document" (should be Impress)
       *   The user sees a blank page and assumes the conversion is broken.
       *
       *   So read the type from the log and compare it against the type the
       *   extension implies.
       */
      const expected = EXPECTED_DOC_TYPE[ext];
      const m = /as a\s+([A-Za-z]+)\s+document/i.exec(out);
      const actual = m ? m[1] : null;
      if (expected && actual && actual.toLowerCase() !== expected.toLowerCase()) {
        cleanup(path.dirname(pdf));
        resolve({
          ok: false,
          error: `This file may be corrupt: LibreOffice identified it as a "${actual}" document, but .${ext.slice(1)} should be "${expected}"`,
          ms: Date.now() - t0,
          log: out.slice(-400),
        });
        return;
      }

      resolve({ ok: true, pdf, ms: Date.now() - t0, log: out.slice(-400) });
    });
  }));
}

/** Clean up the temp directory produced by a conversion */
function cleanup(outDir) {
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

module.exports = { findSoffice, probeSoffice, convertToPdf, cleanup, CONVERTIBLE, SOFFICE_PATHS };
