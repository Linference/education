// scan-mojibake 的跳过规则验证
//
// 为什么需要这个测试：
//   内置 LibreOffice 后仓库里多了 9000+ 个第三方文件，
//   它们里面有"看着像乱码"的字符表常量（如 idna 的 uts46data.py
//   按 Unicode 区段罗列汉字），会被误报成"双重编码损坏"。
//   所以要跳过 vendor/ 与 dist/installer。
//
// ★ 但跳过规则本身很容易写错，这个测试锁定两件事：
//   1. 该跳的确实跳了（否则误报）
//   2. **该扫的没被误跳**（否则真正的损坏会漏检 —— 更危险）
//
// 还覆盖一个隐性坑：第一版写成 /[\\/]vendor[\\/]/，
// 要求 vendor 前后都有分隔符，**相对路径不匹配**。
// 实际扫描传绝对路径所以"看起来没问题"，但这是隐性依赖。
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 与 scan-mojibake.mjs 保持一致的构造方式
const SEG = (name) => new RegExp(`(^|[\\\\/])${name}[\\\\/]`);
const SKIP = [
  SEG("node_modules"),
  SEG("\\.git"),
  SEG("dist"),
  SEG("产出"),
  SEG("vendor"),
  new RegExp(`(^|[\\\\/])\\.tmp[^\\\\/]*[\\\\/]`),
  /package-lock\.json$/,
  /\.asar$/,
  /\.min\.(js|css)$/,
];

const rel = (p) => path.join(...p);
const abs = (p) => path.resolve(__dirname, "..", ...p);

const CASES = [
  // [路径片段, 期望是否跳过, 说明]
  [["vendor", "soffice", "program", "lib", "idna", "uts46data.py"], true, "内置 LibreOffice 的第三方文件"],
  [["dist", "installer", "win-unpacked", "resources", "x.py"], true, "打包产物"],
  [["node_modules", "x", "y.js"], true, "依赖"],
  [["apps", "desktop", "renderer", "src", "App.tsx"], false, "★ 我们自己的源码，必须扫"],
  [["scripts", "scan-mojibake.mjs"], false, "★ 我们自己的脚本，必须扫"],
  [["docs", "01-架构.md"], false, "★ 我们自己的文档，必须扫"],
  [["README.md"], false, "★ 根目录文件，必须扫"],
];

let bad = 0;
console.log("=== scan-mojibake 跳过规则验证（绝对 + 相对路径）===\n");
console.log("  路径形态                                 期望   绝对  相对");
console.log("  " + "─".repeat(68));

for (const [parts, wantSkip, why] of CASES) {
  const a = abs(parts);
  const r = rel(parts);
  const hitA = SKIP.some((re) => re.test(a));
  const hitR = SKIP.some((re) => re.test(r));
  const okA = hitA === wantSkip;
  const okR = hitR === wantSkip;
  if (!okA || !okR) bad++;
  const mark = (ok) => (ok ? "✔" : "✖");
  console.log(`  ${String(parts.join("\\")).slice(0, 38).padEnd(40)} ${(wantSkip ? "跳过" : "保留").padEnd(6)} ${mark(okA)}     ${mark(okR)}   ${why}`);
}

console.log(`\n=== 结果：${bad === 0 ? `全部 ${CASES.length} 条通过` : `${bad} 条不符`} ===`);
if (bad) {
  console.log("  该跳的没跳 → 会误报；该扫的被跳 → 会漏检真实损坏。两种都必须修。");
}
process.exit(bad === 0 ? 0 : 1);
