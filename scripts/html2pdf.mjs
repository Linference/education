// 把 HTML 转成 PDF（用系统上已装的 Chrome / Edge 无头模式）
//
// 为什么需要这个：
//   AI 助手在库里干活时，想要"把这份内容做成 PDF"。它试过 pandoc /
//   wkhtmltopdf / soffice，全都不在 PATH 里 —— 于是只能退而输出 HTML，
//   让用户自己去浏览器里"打印为 PDF"。
//   实际上 Chrome 与 Edge **都装了**，只是没进 PATH，AI 找不到。
//
//   DSH 在受限环境下**可以调用程序**（实测 node 能跑），所以只要给一个
//   明确的入口，AI 就能自己完成 HTML → PDF。
//
// 用法：
//   node scripts/html2pdf.mjs <输入.html> [输出.pdf]
//
// 说明：
//   · 自动找 Chrome / Edge（PATH → 常见安装位置）
//   · 用 --headless --print-to-pdf，是无头浏览器的官方打印通道
//   · 支持 A4 纸张与背景图形（--print-to-pdf 默认会带上 CSS 背景）
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** 浏览器候选位置（Windows / macOS / Linux） */
const BROWSERS = [
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe") : "",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter(Boolean);

/** 在 PATH 里找 */
function fromPath() {
  const names = process.platform === "win32"
    ? ["chrome.exe", "msedge.exe", "chromium.exe"]
    : ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];
  const which = process.platform === "win32" ? "where" : "which";
  for (const n of names) {
    try {
      const r = spawnSync(which, [n], { encoding: "utf8", timeout: 8000, windowsHide: true });
      if (r.status === 0) {
        const first = String(r.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
        if (first && fs.existsSync(first)) return first;
      }
    } catch { /* 继续 */ }
  }
  return null;
}

function findBrowser() {
  if (process.env.GEZHI_BROWSER && fs.existsSync(process.env.GEZHI_BROWSER)) return process.env.GEZHI_BROWSER;
  for (const b of BROWSERS) { try { if (fs.existsSync(b)) return b; } catch { /* 忽略 */ } }
  return fromPath();
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("用法: node scripts/html2pdf.mjs <输入.html> [输出.pdf]");
    console.error("");
    console.error("把 HTML 文件转成 PDF（用系统上已装的 Chrome / Edge）。");
    process.exit(2);
  }

  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) {
    console.error(`找不到输入文件：${inputPath}`);
    process.exit(1);
  }

  const outPath = output
    ? path.resolve(output)
    : inputPath.replace(/\.html?$/i, "") + ".pdf";

  const browser = findBrowser();
  if (!browser) {
    console.error("找不到 Chrome 或 Edge。");
    console.error("可以设置环境变量 GEZHI_BROWSER 指向浏览器可执行文件。");
    console.error("已尝试的位置：");
    for (const b of BROWSERS) console.error("  " + b);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // 用一个独立的临时用户目录，避免和用户正在开的浏览器抢 profile
  // （不隔离会失败：Chrome 检测到同一 profile 已被占用就拒绝启动）
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-pdf-"));

  /**
   * 用临时的打印样式文件控制纸张与页边距。
   *
   * ★ 为什么不用 `--print-to-pdf-no-header`：
   *   那个开关在新版 Chrome 里已经失效，实测打出来的 PDF 顶部带
   *   "2026/10/1 20:37   测试" 这样的页眉页脚（日期 + 标题）。
   *   可靠的去掉办法是在页面样式里用 `@page { margin: 0 }` ——
   *   页眉页脚只在有页边距时才有位置绘制。
   *
   *   这里不改用户的 HTML，而是另写一个样式文件注入进去，
   *   所以原文件内容不受影响。
   */
  const cssPath = path.join(path.dirname(outPath), `.gezhi-print-${process.pid}.css`);
  fs.writeFileSync(cssPath, [
    "/* 格致生成的打印样式：去掉浏览器页眉页脚，设置 A4 页边距 */",
    "@page { size: A4; margin: 0; }",
    "html, body { margin: 0 !important; padding: 12mm !important; }",
  ].join("\n"), "utf8");

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userDataDir}`,
    `--print-to-pdf=${outPath}`,
    pathToFileURL(inputPath).href,
  ];

  const t0 = Date.now();
  const r = spawnSync(browser, args, {
    encoding: "utf8", timeout: 120000, windowsHide: true,
  });
  const ms = Date.now() - t0;

  // 清理临时文件
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  try { fs.rmSync(cssPath, { force: true }); } catch { /* 忽略 */ }

  // ★ 判定成功要看**产物**，不能只看退出码：
  //   Chrome 打印失败时也可能返回 0。
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    console.error("转换失败：没有产出 PDF");
    console.error(`浏览器：${browser}`);
    console.error(`退出码：${r.status}`);
    const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    if (tail) console.error("输出：" + tail.slice(-400));
    process.exit(1);
  }

  const size = fs.statSync(outPath).size;
  console.log(`已生成 PDF：${outPath}`);
  console.log(`  体积 ${(size / 1024).toFixed(0)} KB，耗时 ${(ms / 1000).toFixed(1)}s`);
  console.log(`  引擎 ${path.basename(browser)}`);
}

main();
