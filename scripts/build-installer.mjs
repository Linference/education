#!/usr/bin/env node
// 构建 Windows 完整安装包
//
// 为什么要有这个脚本而不是直接敲命令：
//   构建依赖三个环境变量（镜像 + 关掉代码签名探测），
//   漏一个就会出现"下载失败"或"卡在签名"，而这些都不在一眼可见的地方。
//   放进脚本里，别人 clone 下来也能一条命令构建。
//
// 用法：node scripts/build-installer.mjs
//
// 然后构建前会先做两项检查（这是本项目的规矩）：
//   1. 依赖许可门禁 —— AGPL / 非商业许可不许进安装包
//   2. 图标资产是否齐全 —— 缺图标会让安装包变成默认丑陋图标
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = path.join(ROOT, "brand", "assets");
const release = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// Versioned outputs let an older preview stay open while building the update.
const outputRelative = `dist/installer/${release.version}`;
const OUT = path.join(ROOT, outputRelative);

function step(title) {
  console.log(`\n──────── ${title} ────────`);
}

function run(cmd, args, opts = {}) {
  // 注意：不要统一开 shell —— 本机 node.exe 在 "C:\Program Files\nodejs" 下，
  // shell 会把带空格的路径拆开，报 "'C:\Program' is not recognized"。
  // 需要 shell 的只有 npx（.cmd 批处理）。
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...opts,
  });
  return r.status ?? 1;
}

// ---------------------------------------------------------------- 前置检查

step("1. 图标资产检查");
const required = ["app.ico", "icon-256.png", "icon-512.png", "nsis-header-v3.bmp"];
const missing = required.filter((f) => !fs.existsSync(path.join(BRAND, f)));
if (missing.length) {
  console.error(`  [FAIL] 缺图标资产：${missing.join(", ")}`);
  console.error("         先跑：python brand/make-icons-from-logo.py");
  process.exit(1);
}
console.log(`  [OK] ${required.length} 个关键图标资产齐全`);

step("2. 依赖许可门禁");
if (run(process.execPath, ["scripts/check-licenses.mjs"]) !== 0) {
  console.error("  [FAIL] 许可门禁未通过，构建中止（安装包一旦分发，许可问题就收不回来了）");
  process.exit(1);
}

step("3. 主进程语法自检（避免打出一个起不来的包）");
for (const f of ["apps/desktop/main/index.cjs", "apps/desktop/main/preload.cjs"]) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) { console.error(`  [FAIL] 缺文件 ${f}`); process.exit(1); }
  const txt = fs.readFileSync(abs, "utf8");
  if (txt.charCodeAt(0) === 0xfeff) {
    console.error(`  [FAIL] ${f} 带 UTF-8 BOM —— Node require 会语法错误`);
    process.exit(1);
  }
}
// Check every loaded local module, not only the entry files. A syntax error in
// a nested IPC dependency can prevent Electron from ever creating a window.
const sourceFiles = fs.readdirSync(path.join(ROOT, 'apps/desktop/main'), { recursive: true })
  .filter(f => f.endsWith('.cjs')).map(f => path.join(ROOT, 'apps/desktop/main', f));
sourceFiles.push(...fs.readdirSync(path.join(ROOT, 'apps/desktop/shared'))
  .filter(f => /\.(mjs|cjs)$/.test(f)).map(f => path.join(ROOT, 'apps/desktop/shared', f)));
for (const f of sourceFiles) {
  if (run(process.execPath, ['--check', f]) !== 0) {
    console.error(`  [FAIL] 主进程模块语法错误：${path.relative(ROOT, f)}`);
    process.exit(1);
  }
}
console.log(`  [OK] 入口存在且无 BOM，${sourceFiles.length} 个主进程 / 共享模块通过语法检查`);

step("3.2 内置依赖检查（全内置目标：装完就能用）");
// Typst：导 PDF 用。不带上，用户得自己 winget install —— 中学生做不到。
const typstVendor = path.join(ROOT, "vendor", "typst", "typst.exe");
if (!fs.existsSync(typstVendor)) {
  console.error("  [FAIL] 缺 vendor/typst/typst.exe");
  console.error("         运行：node scripts/vendor-typst.mjs");
  process.exit(1);
}
try {
  const v = execFileSync(typstVendor, ["--version"], { encoding: "utf8", timeout: 30000 }).trim();
  const lic = fs.existsSync(path.join(ROOT, "vendor", "typst", "LICENSE"));
  console.log(`  [OK] 内置 Typst：${v}（${(fs.statSync(typstVendor).size / 1024 / 1024).toFixed(1)} MB）`);
  if (!lic) {
    console.error("  [FAIL] 缺 vendor/typst/LICENSE —— Typst 是 Apache-2.0，随包分发必须副署");
    process.exit(1);
  }
  console.log("  [OK] 许可文件已随包（Apache-2.0 副署要求）");
} catch (e) {
  console.error(`  [FAIL] 内置的 typst.exe 跑不起来：${e.message}`);
  process.exit(1);
}

// docx：Word 导出用（纯 JS，无外部依赖）
const dshInstaller = path.join(ROOT, 'vendor/dsh/dsh-installer.exe');
if (!fs.existsSync(dshInstaller) || fs.statSync(dshInstaller).size < 1024*1024 || !fs.existsSync(path.join(ROOT,'vendor/dsh/LICENSE'))) {
  console.error('  [FAIL] 缺少内置 DeepSeek Harness 安装程序或许可文件'); process.exit(1);
}
console.log('  [OK] DeepSeek Harness 安装程序随包，首次启动提供安装与官方登录引导');

const docxPkg = path.join(ROOT, "apps", "desktop", "node_modules", "docx", "package.json");
if (!fs.existsSync(docxPkg)) {
  console.error("  [FAIL] 缺 apps/desktop/node_modules/docx —— Word 导出会失效");
  console.error("         运行：cd apps/desktop && npm install");
  process.exit(1);
}
console.log(`  [OK] 内置 docx（纯 JS 生成 Word，不需要 Python）`);

// LibreOffice：PPT/Word/Excel/旧版 .doc/.ppt 高保真查看用（可选增强的"随包"部分）
//
// 检查三件事：
//   1) soffice.exe 在
//   2) share/config 在 —— **砍掉它转换会静默失败**（实测报
//      "source file could not be loaded"，但退出码是 0，很难查）
//   3) 许可文件在 —— MPL-2.0 随包分发必须副署
const sofficeExe = path.join(ROOT, "vendor", "soffice", "program", "soffice.exe");
if (!fs.existsSync(sofficeExe)) {
  console.error("  [FAIL] 缺 vendor/soffice/program/soffice.exe");
  console.error("         PPT/Word 会退回纯文字模式（能用，但看不到排版和图片）");
  console.error("         制备方式见 vendor/soffice/README.md");
  process.exit(1);
}
const sofficeConfig = path.join(ROOT, "vendor", "soffice", "share", "config");
if (!fs.existsSync(sofficeConfig)) {
  console.error("  [FAIL] 缺 vendor/soffice/share/config —— 转换会静默失败");
  console.error("         这个目录放着文件类型识别与导出过滤器的注册信息，不能裁剪");
  process.exit(1);
}
const sofficeLicense = path.join(ROOT, "vendor", "soffice", "license.txt");
if (!fs.existsSync(sofficeLicense)) {
  console.error("  [FAIL] 缺 vendor/soffice/license.txt —— MPL-2.0 随包分发必须副署");
  process.exit(1);
}
{
  let sizeMB = 0;
  let files = 0;
  const walk = (d) => {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { sizeMB += fs.statSync(p).size; files++; } catch { /* 忽略 */ } }
    }
  };
  walk(path.join(ROOT, "vendor", "soffice"));
  console.log(`  [OK] 内置 LibreOffice：${(sizeMB / 1024 / 1024).toFixed(0)} MB / ${files} 个文件（压缩后约 200 MB）`);
  console.log(`       share/config 在位（裁剪时漏删会静默失败）、MPL-2.0 许可已副署`);
}

step("3.5 构建渲染进程（Vite + React）");
// 渲染进程必须先构建：主进程加载的是 renderer/dist/index.html，
// 不构建就会打出一个只有空白窗口的安装包。
// 注意 vite 装在 apps/desktop/node_modules 下，不是仓库根。
const viteBin = path.join(ROOT, "apps", "desktop", "node_modules", "vite", "bin", "vite.js");
if (!fs.existsSync(viteBin)) {
  console.error(`  [FAIL] 找不到 vite：${viteBin}`);
  console.error("         先在 apps/desktop 下跑 npm install");
  process.exit(1);
}
if (run(process.execPath, [viteBin, "build"], { cwd: path.join(ROOT, "apps", "desktop") }) !== 0) {
  console.error("  [FAIL] 渲染进程构建失败");
  process.exit(1);
}
const distIndex = path.join(ROOT, "apps", "desktop", "renderer", "dist", "index.html");
if (!fs.existsSync(distIndex)) {
  console.error(`  [FAIL] 没有生成 ${distIndex}`);
  process.exit(1);
}
console.log("  [OK] 渲染进程构建完成");

// ---------------------------------------------------------------- 构建

step("4. 打包（electron-builder → NSIS 单文件安装包）");
console.log("  配置来源：package.json 的 build 字段（单一来源）");
console.log("  镜像：npmmirror（国内直连 GitHub 会失败）");
console.log("  代码签名：关闭（没有证书；未签名安装包 Windows 会提示「未知发布者」）\n");

const env = {
  ...process.env,
  ELECTRON_BUILDER_BINARIES_MIRROR: "https://npmmirror.com/mirrors/electron-builder-binaries/",
  ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

// 配置只放在 package.json 的 build 字段里，不加载第二份配置文件。
// 唯一的命令行覆盖是本次版本的输出目录，避免覆盖正在运行的预览。
//    曾经同时存在 package.json.build 与 build/*.cjs 两份配置，
//    改了其中一份却跑另一份，白查了半天 schema 报错。
const code = run(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["electron-builder", "--win", "nsis", `--config.directories.output=${outputRelative}`],
  { env, shell: process.platform === "win32" }
);
if (code !== 0) {
  console.error(`\n  [FAIL] 构建失败，退出码 ${code}`);
  process.exit(code);
}

// ---------------------------------------------------------------- 产物核验

step("5. 产物核验");
if (!fs.existsSync(OUT)) { console.error("  [FAIL] 没有输出目录"); process.exit(1); }
const artifacts = fs.readdirSync(OUT).filter((f) => f === `格致-${release.version}-安装包.exe`);
if (artifacts.length === 0) { console.error("  [FAIL] 没有生成 .exe"); process.exit(1); }

for (const a of artifacts) {
  const st = fs.statSync(path.join(OUT, a));
  console.log(`  ${a}`);
  console.log(`     体积：${(st.size / 1024 / 1024).toFixed(1)} MB`);
  if (st.size > 150 * 1024 * 1024) {
    console.log("     ⚠ 超过 150MB，某些邮件/网盘会拒收，考虑提供分卷或网盘链接");
  } else {
    console.log("     OK：单文件可直接分发");
  }
}

console.log(`\n安装包位置：${OUT}`);
console.log("这是一个完整的单文件安装包 —— 别人双击就能装，不需要额外下载任何东西。");
