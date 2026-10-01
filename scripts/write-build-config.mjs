#!/usr/bin/env node
// 把 electron-builder 配置写进根 package.json 的 build 字段
//
// 为什么用 package.json 而不是 --config 传文件：
//   实测 --config 传 .cjs 时，electron-builder 报
//   "configuration.win should be one of these: null"，
//   但同一份配置用 require() 读出来完全合法（顶层键、win 结构、无 BOM 都验过）。
//   与其跟它的配置加载器纠缠，不如走一等公民路径 —— package.json 的 build 字段。
//
// 用脚本而不是 npm pkg set：后者对嵌套对象与 ${} 模板串的转义很麻烦，
// 而且在 PowerShell 里会再叠一层引号地狱（这个坑我今天踩了三次）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(ROOT, "package.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

pkg.build = {
  appId: "mo.gezhi.app",
  productName: "格致",
  copyright: "Copyright 2026 Linference",

  // ★ 必须显式指定，否则 electron-builder 会把整个仓库打进 asar
  //   （实测：不指定时 asar 里出现了 .githooks、brand、research 等无关内容）
  directories: {
    app: "apps/desktop",
    output: "dist/installer",
    buildResources: "brand/assets",
  },

  // 相对于 directories.app（即 apps/desktop）
  files: ["main/**/*", "renderer/**/*", "package.json", "!**/*.map"],

  // ★ 随包的运行期资源（"全内置"目标：装完就能用，不需要用户自己装任何东西）
  //
  //   1) dsh-bridge  —— AI 内核。不带上，打包版会显示"DSH 不可用"
  //                     （开发态正常，这类问题最难发现 —— 有 verify-packaged.mjs 盯它）
  //   2) templates   —— Typst 讲义模板 + 字体栈。不带上，一导出就失败
  //   3) typst       —— **Typst 可执行文件（约 50 MB）**。
  //                     目标用户是中学生，让他们自己 `winget install Typst.Typst`
  //                     不现实。内置后导 PDF 开箱即用。
  //   4) soffice     —— **LibreOffice（裁剪后 1014 MB，压缩后 198 MB）**。
  //                     用途：把 PPT/Word/Excel/旧版 .doc/.ppt 转成 PDF，
  //                     交给已有的 PDF 查看器显示 —— **视觉 100% 还原**。
  //
  //                     为什么值得这个体积：实测 15 MB 的手写课件只提取出
  //                     2 KB 文字（内容全在图片里），纯文字模式对这类文件没有意义。
  //
  //                     裁剪依据（每一刀都验证过转换仍正常）：
  //                       · 砍掉：help / readmes / gallery / template / autotext
  //                               / wizards / xslt / palette / share/extensions
  //                       · **必须保留 share/config** —— 砍掉后转换报
  //                         "source file could not be loaded"（实测踩过）
  //                     许可：MPL-2.0。作为**独立进程**调用不传染；
  //                     随包分发需附 LICENSE（见 vendor/soffice/LICENSE.html）。
  extraResources: [
    { from: "packages/dsh-bridge/src", to: "dsh-bridge" },
    { from: "templates/typst", to: "templates/typst" },
    { from: "templates/docx", to: "templates/docx" },
    { from: "vendor/typst", to: "typst" },
    // 注意：to 用 "soffice"，代码里按 process.resourcesPath/soffice/program/soffice.exe 找
    { from: "vendor/soffice", to: "soffice" },
  ],

  asar: true,
  compression: "maximum",
  artifactName: "${productName}-${version}-安装包.${ext}",

  win: {
    // ⚠️ win 段里**不要写 publisherName** —— electron-builder 26.15.3 的 schema
    //    不接受它（它属于 Azure 代码签名那一支配置）。实测逐键单测结果：
    //      win.icon        ok
    //      win.publisherName  FAIL  ← 元凶，报成 "configuration.win should be one of these: null"
    //      win.target      ok（字符串 / 字符串数组 / 对象数组都行）
    //    这个错误信息完全没提字段名，害我查了很久 —— 记在这里免得重犯。
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "brand/assets/app.ico",
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "格致",
    installerLanguages: ["zh_TW", "zh_CN", "en_US"],
    multiLanguageInstaller: true,
    displayLanguageSelector: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerIcon: "brand/assets/app.ico",
    uninstallerIcon: "brand/assets/app.ico",
    installerHeaderIcon: "brand/assets/app.ico",
    include: "build/installer.nsh",
  },
};

// 顺手补上 author（electron-builder 会警告）与 packageManager（pnpm 字段与 npm 冲突，去掉）
if (!pkg.author) pkg.author = "Linference <linjie20091027@gmail.com>";
if (!pkg.license) pkg.license = "MIT";

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// 校验写入结果
const check = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const bom = fs.readFileSync(pkgPath)[0] === 0xef;
console.log("已写入 build 配置到 package.json");
console.log("  无 BOM:", !bom);
console.log("  directories.app:", check.build.directories.app);
console.log("  win.target:", JSON.stringify(check.build.win.target));
console.log("  nsis 项数:", Object.keys(check.build.nsis).length);
console.log("  artifactName:", check.build.artifactName);
