#!/usr/bin/env node
// 把 Typst 可执行文件收进 vendor/typst/，供安装包内置
//
// 为什么要单独一步而不是让构建脚本每次去下：
//   1. typst.exe 约 50 MB，**不宜进 git**（.gitignore 排除 vendor/typst/*.exe），
//      但构建时需要它。所以做成一个显式的"准备依赖"步骤。
//   2. 需要副署许可：Typst 是 Apache-2.0，随包分发必须带上 LICENSE 与 NOTICE。
//   3. 版本要可追溯：记下版本号，出问题时能对上。
//
// 用法：node scripts/vendor-typst.mjs
//   会自动从这些地方找已有的 typst：
//     - 环境变量 GEZHI_TYPST
//     - PATH
//     - winget 安装目录
//     - vendor/typst/ 已有（则只校验版本）
//   找不到就提示用 winget 装。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DEST = path.join(ROOT, "vendor", "typst");

function findTypst() {
  const cands = [];
  if (process.env.GEZHI_TYPST) cands.push(process.env.GEZHI_TYPST);
  cands.push(path.join(DEST, "typst.exe"));

  // PATH
  const which = spawnSync("where", ["typst"], { encoding: "utf8", shell: true });
  if (which.status === 0) {
    for (const l of String(which.stdout).split(/\r?\n/)) {
      if (l.trim()) cands.push(l.trim());
    }
  }

  // winget 包目录
  const wingetRoot = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(wingetRoot)) {
    for (const d of fs.readdirSync(wingetRoot)) {
      if (!/typst/i.test(d)) continue;
      const base = path.join(wingetRoot, d);
      const stack = [[base, 0]];
      while (stack.length) {
        const [dir, depth] = stack.pop();
        if (depth > 4) continue;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isFile() && e.name.toLowerCase() === "typst.exe") cands.push(p);
          else if (e.isDirectory()) stack.push([p, depth + 1]);
        }
      }
    }
  }

  for (const c of cands) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

console.log("=== 收集 Typst 到 vendor/typst/ ===\n");

const src = findTypst();
if (!src) {
  console.error("  找不到 typst.exe。");
  console.error("  安装：winget install Typst.Typst");
  console.error("  或设置环境变量 GEZHI_TYPST 指向 typst.exe");
  process.exit(1);
}
console.log(`  来源：${src}`);

const version = execFileSync(src, ["--version"], { encoding: "utf8", timeout: 30000 }).trim();
console.log(`  版本：${version}`);

fs.mkdirSync(DEST, { recursive: true });

// ---- 复制可执行文件 ----
const destExe = path.join(DEST, "typst.exe");
const srcDir = path.dirname(src);
const srcSize = fs.statSync(src).size;
fs.copyFileSync(src, destExe);
console.log(`  已复制 typst.exe（${(srcSize / 1024 / 1024).toFixed(1)} MB）`);

// ---- 复制许可与声明（Apache-2.0 随包分发的要求）----
const copiedLicenses = [];
for (const name of ["LICENSE", "NOTICE", "README.md", "THIRD-PARTY-NOTICES", "COPYING"]) {
  const p = path.join(srcDir, name);
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(DEST, name));
    copiedLicenses.push(name);
  }
}
console.log(`  许可证文件：${copiedLicenses.length ? copiedLicenses.join(", ") : "（源目录里没有，将用下面的说明代替）"}`);

// ---- 写一个说明文件，记录来源与版本 ----
const readme = `# vendor/typst

本目录存放**随格致安装包一起分发**的 Typst 可执行文件。

- 来源：${src}
- 版本：${version}
- 用途：Markdown → PDF 导出（格致的讲义模板 templates/typst/ 由 typst 编译）

## 许可

Typst 采用 **Apache License 2.0**。随包分发时保留其 LICENSE 与 NOTICE 文件
（见本目录）。上游：https://github.com/typst/typst

## 为什么不放 git

typst.exe 约 ${(srcSize / 1024 / 1024).toFixed(0)} MB，二进制不进版本库。
需要时运行：

    node scripts/vendor-typst.mjs

该脚本会自动从 PATH / winget 安装目录找到 typst 并复制到这里。
构建脚本 \`scripts/build-installer.mjs\` 会在打包前检查它是否存在。

## 为什么内置而不是让用户自己装

格致的目标用户是中学生。让每个人先去 \`winget install Typst.Typst\`
不现实 —— 内置后"装完就能导 PDF"。
代价是安装包体积增加约 25 MB（压缩后）。
`;
fs.writeFileSync(path.join(DEST, "README.md"), readme, "utf8");
console.log(`  已写 README.md（记录来源与版本）`);

// ---- 校验：复制出来的能跑吗 ----
try {
  const v2 = execFileSync(destExe, ["--version"], { encoding: "utf8", timeout: 30000 }).trim();
  console.log(`\n  ✔ 校验通过：${v2}`);
} catch (e) {
  console.error(`\n  ✖ 复制后的文件跑不起来：${e.message}`);
  process.exit(1);
}

const total = fs.readdirSync(DEST).reduce((s, f) => s + fs.statSync(path.join(DEST, f)).size, 0);
console.log(`  vendor/typst 总大小：${(total / 1024 / 1024).toFixed(1)} MB`);
console.log(`\n下一步：node scripts/build-installer.mjs（会把本目录打进安装包）`);
