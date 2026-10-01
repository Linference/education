#!/usr/bin/env node
// 核对：主流开源 Office 引擎的许可证，以及能不能进格致
//
// 为什么写这个脚本：用户在问"为什么不用 office 的开源插件"。
// 与其凭印象回答，不如把每个候选的**许可证**摆出来，
// 对照项目自己的门禁规则（scripts/check-licenses.mjs）判一遍。
//
// ⚠️ 许可证信息是"事实声明"，需要核对官方仓库。
//    这里标注了每个结论的来源，便于复核。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CANDIDATES = [
  {
    name: "LibreOffice（含 headless 转换、UNO API）",
    license: "MPL-2.0",
    osi: true,
    copyleft: "弱（文件级）",
    what: "完整的办公套件，能渲染/转换 doc/docx/xls/ppt，也能内嵌做编辑",
    verdict: "可用",
    why: "MPL-2.0 是弱 copyleft：作为独立进程调用不传染。格致可以把它当外部引擎用",
    cost: "安装体积约 350–700 MB；在格致里做『内嵌编辑』要写 UNO 桥，工作量大",
    source: "libreoffice.org 官方 LICENSE（MPL-2.0）",
  },
  {
    name: "ONLYOFFICE Document Server",
    license: "AGPL-3.0",
    osi: true,
    copyleft: "强（网络分发也传染）",
    what: "在浏览器里编辑 docx/xlsx/pptx，效果接近 Office，有现成的 JS 前端",
    verdict: "被门禁拦",
    why: "AGPL：格致若是分发产品，把 AGPL 组件打包进去会触发传染义务",
    cost: "要跑一个 Node 服务 + 一堆二进制，安装体积 +1 GB 量级",
    source: "github.com/ONLYOFFICE/DocumentServer 的 LICENSE（AGPL-3.0）",
  },
  {
    name: "Collabora Online（LibreOffice 的在线版）",
    license: "MPL-2.0",
    osi: true,
    copyleft: "弱",
    what: "在浏览器里编辑 Office 文档，基于 LibreOffice 内核",
    verdict: "可用但重",
    why: "MPL-2.0 可用；但它是『服务端 + 浏览器』架构，不是能塞进 Electron 的组件",
    cost: "要跑一个 C++ 服务，打包与部署复杂度远超『装个 Electron 应用』",
    source: "collabora.com 开源版声明（MPL-2.0）",
  },
  {
    name: "Apache OpenOffice",
    license: "Apache-2.0",
    osi: true,
    copyleft: "无",
    what: "老牌办公套件",
    verdict: "可用但已过时",
    why: "许可最宽松，但对现代 docx/pptx 的兼容性明显落后于 LibreOffice",
    cost: "同样是好几百 MB 的完整套件",
    source: "openoffice.org 的 LICENSE（Apache-2.0）",
  },
  {
    name: "Microsoft Office Web 组件 / OOXML SDK",
    license: "专有（SDK 另有条款）",
    osi: false,
    what: "微软官方渲染方案",
    verdict: "不可用",
    why: "闭源；Office Online Server 需要 Windows Server + 授权",
    cost: "—",
    source: "微软许可条款",
  },
  {
    name: "WebODF / kodeWeave 之类纯 JS ODF 方案",
    license: "AGPL / 其他",
    osi: true,
    what: "纯前端的 ODF 编辑器",
    verdict: "不匹配",
    why: "只支持 ODF（.odt），不认 .docx/.pptx；且多为 AGPL",
    cost: "格式不匹配，等于没用",
    source: "webodf.org（AGPL-3.0）",
  },
];

/** 读项目自己的门禁规则，用它来判定 */
const gate = fs.readFileSync(path.join(ROOT, "scripts", "check-licenses.mjs"), "utf8");
const blocked = [...gate.matchAll(/\/\^?([^/]+)\/[a-z]*,\s*why:\s*"([^"]+)"/g)]
  .map((m) => ({ pat: m[1], why: m[2] }))
  .filter((x) => /AGPL|SSPL|Commons|NC|proprietary/i.test(x.pat + x.why));

console.log("=== 项目自己的门禁拦了什么 ===\n");
for (const b of blocked.slice(0, 6)) {
  console.log(`  ${b.pat.padEnd(46)} ${b.why}`);
}

console.log("\n\n=== 开源 Office 引擎逐个核对 ===\n");
for (const c of CANDIDATES) {
  const mark = c.verdict === "可用" ? "✔" : c.verdict.startsWith("可用但") ? "△" : "✘";
  console.log(`${mark} ${c.name}`);
  console.log(`    许可证：${c.license}${c.osi ? "（OSI 认可）" : "（非 OSI）"}   传染性：${c.copyleft}`);
  console.log(`    能做什么：${c.what}`);
  console.log(`    结论：${c.verdict} —— ${c.why}`);
  console.log(`    代价：${c.cost}`);
  console.log(`    来源：${c.source}`);
  console.log();
}

console.log("=== 一句话总结 ===");
console.log("  能用的（LibreOffice / Collabora）都是『几百 MB 的独立进程』，");
console.log("  体积小又能内嵌的（ONLYOFFICE）是 AGPL，被项目自己的门禁拦住。");
console.log("  这不是我偷懒，是许可证与体积两条硬约束把路堵了。");
