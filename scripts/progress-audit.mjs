#!/usr/bin/env node
// 进度盘点：把计划里的能力逐条对照"代码里到底有没有"
//
// 为什么要有这个脚本：人（包括我）容易凭印象说"差不多做完了"。
// 这里对每条能力找一个**可验证的存在性证据**（文件/函数/测试），
// 没证据的一律算未完成。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function has(rel, needle) {
  try {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return false;
    const st = fs.statSync(p);
    if (st.isDirectory()) return false;
    return fs.readFileSync(p, "utf8").includes(needle);
  } catch {
    return false;
  }
}
function anyHas(files, needle) {
  return files.some((f) => has(f, needle));
}

/**
 * 数据库表清单 —— **真正解析 schema.sql**，不靠猜关键字。
 *
 * 第一版盘点脚本用"文件里包含 questions 这个词"来判断题库模型是否具备，
 * 结果判错了（把注释里的词也算上）。表名要实地解析 SQL 才算数。
 */
const SCHEMA = fs.readFileSync(path.join(ROOT, "packages/db/schema.sql"), "utf8");
const TABLES = new Set(
  [...SCHEMA.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"']?(\w+)/gi)].map((m) => m[1])
);
const hasTable = (name) => TABLES.has(name);

// 每条：[能力, 所属阶段, 证据检查函数, 说明]
const ITEMS = [
  // ---------- P0 地基 ----------
  ["库结构 + 43 张表 schema", "P0", () => exists("packages/db/schema.sql"), "packages/db/schema.sql"],
  ["DSH 桥（headless 调用 + 事件解析）", "P0", () => anyHas(["packages/dsh-bridge/src/index.mjs"], "runHeadless"), "dsh-bridge"],
  ["密钥加密存储（scrypt+AES-GCM）", "P0", () => anyHas(["packages/core/src/credentials.mjs"], "scrypt"), "credentials.mjs"],
  ["依赖许可门禁", "P0", () => exists("scripts/check-licenses.mjs"), "check-licenses.mjs"],
  ["密钥防泄漏扫描", "P0", () => exists("scripts/scan-secrets.mjs"), "scan-secrets.mjs"],
  ["双重编码防护扫描", "P0", () => exists("scripts/scan-mojibake.mjs"), "scan-mojibake.mjs"],

  // ---------- P1 知识库与编辑器 ----------
  ["Electron 壳 + 三栏布局", "P1", () => anyHas(["apps/desktop/renderer/src/App.tsx"], "ribbon"), "App.tsx"],
  ["文件树（懒加载 + 筛选）", "P1", () => anyHas(["apps/desktop/renderer/src/App.tsx"], "renderTree"), "App.tsx"],
  ["标签页（可开可关）", "P1", () => anyHas(["apps/desktop/renderer/src/App.tsx"], "closeTab"), "App.tsx"],
  ["Markdown 渲染（阅读视图）", "P1", () => anyHas(["apps/desktop/renderer/src/components/MarkdownView.tsx"], "renderMarkdown"), "MarkdownView"],
  ["★ 编辑器（能自己写笔记）", "P1", () => exists("apps/desktop/renderer/src/components/MdEditor.tsx"), "CodeMirror 6"],
  ["★ 保存文件（写回磁盘）", "P1", () => has("apps/desktop/main/vault-fs.cjs", "fs:writeText"), "vault-fs.cjs"],
  ["★ 编辑 / 阅读双模式", "P1", () => anyHas(["apps/desktop/renderer/src/App.tsx"], "modeByPath"), "按文件记模式"],
  ["★ 新建文件 / 文件夹", "P1", () => has("apps/desktop/main/vault-fs.cjs", "fs:createFile"), "内联输入 + 右键菜单"],
  ["★ 重命名 / 删除（回收站）", "P1", () => has("apps/desktop/main/vault-fs.cjs", "fs:rename"), "默认移回收站"],
  ["★ 写操作限制在库内（防路径逃逸）", "P1", () => has("apps/desktop/main/vault-fs.cjs", "assertInsideVault"), "realpath 前缀校验"],
  ["★ 保存前自动备份", "P1", () => has("apps/desktop/main/vault-fs.cjs", ".bak"), "防编辑器 bug 写坏笔记"],

  // ---------- P2 多格式查看 ----------
  ["PDF 查看器", "P2", () => exists("apps/desktop/renderer/src/components/PdfViewer.tsx"), "PdfViewer"],
  ["Word .docx 查看器", "P2", () => exists("apps/desktop/renderer/src/components/DocxViewer.tsx"), "DocxViewer"],
  ["旧版 .doc 解析器", "P2", () => anyHas(["apps/desktop/main/lib/doc-extract.cjs"], "readOle"), "doc-extract"],
  ["PPTX 查看器", "P2", () => exists("apps/desktop/renderer/src/components/PptViewer.tsx"), "PptViewer"],
  ["旧版 .ppt 解析器", "P2", () => anyHas(["apps/desktop/main/lib/doc-extract.cjs"], "extractTextFromPpt"), "doc-extract"],
  ["CSV/TSV 表格视图（虚拟滚动）", "P2", () => anyHas(["apps/desktop/renderer/src/components/CsvViewer.tsx"], "OVERSCAN"), "CsvViewer"],
  ["★ 高保真查看（PPT/Word/Excel → PDF）", "P2", () => exists("apps/desktop/main/lib/soffice.cjs"), "内置 LibreOffice 26.8"],
  ["★ 高保真可退（无引擎时退回文字模式）", "P2", () => has("apps/desktop/main/convert-ipc.cjs", "没有找到 LibreOffice"), "可选增强"],
  ["★ 文档类型识别（防损坏文件误导）", "P2", () => anyHas(["apps/desktop/main/lib/soffice.cjs"], "EXPECTED_DOC_TYPE"), "识别 Writer/Impress/Calc"],
  ["★ Excel .xlsx 查看", "P2", () => anyHas(["apps/desktop/main/lib/soffice.cjs"], ".xlsx"), "经 LibreOffice 转 PDF"],

  // ---------- P3 图谱/反链/搜索 ----------
  ["关系图谱的数据模型（links / kp_edges）", "P3", () => hasTable("links") && hasTable("kp_edges"), "表已建"],
  ["★ 关系图谱界面", "P3", () => exists("apps/desktop/renderer/src/components/GraphView.tsx"), "**未实现**"],
  ["★ 反向链接（面板 + 点击跳转）", "P3", () => exists("apps/desktop/renderer/src/components/BacklinksPanel.tsx"), "BacklinksPanel"],
  ["★ 出链（这篇引用了谁）", "P3", () => has("apps/desktop/main/indexer.cjs", "function outlinks"), "indexer.cjs"],
  ["★ wikilink 解析（跳过代码块/行内代码）", "P3", () => has("apps/desktop/main/indexer.cjs", "extractLinks"), "indexer.cjs"],
  ["★ 全文检索接进界面", "P3", () => exists("apps/desktop/renderer/src/components/SearchPanel.tsx"), "SearchPanel"],
  ["★ 中文检索（含双字词）", "P3", () => has("apps/desktop/main/indexer.cjs", "like-fallback"), "≥3字走FTS，≤2字走LIKE"],
  ["★ 索引器（切块/增量/删除同步）", "P3", () => has("apps/desktop/main/indexer.cjs", "indexVault"), "后台索引 + 保存后重索引"],

  // ---------- P4 AI/Agent ----------
  ["DSH 接入界面（事件流实时显示）", "P4", () => exists("apps/desktop/main/ai.cjs"), "ai.cjs"],
  ["AI 面板（能看过程 + diff）", "P4", () => exists("apps/desktop/renderer/src/components/AiChat.tsx"), "AiChat"],
  ["会话可续 + 对话持久化", "P4", () => anyHas(["apps/desktop/renderer/src/components/AiChat.tsx"], "localStorage"), "AiChat"],
  ["沙箱边界 = 库目录", "P4", () => anyHas(["apps/desktop/main/ai.cjs"], "workdir"), "ai.cjs"],
  ["★ AI 产出物一键存为新文件", "P4", () => has("apps/desktop/main/index.cjs", "file:writeFromAI"), "**未实现**"],

  // ---------- P5 文档产线 ----------
  ["Markdown → PDF（Typst）", "P5", () => exists("apps/desktop/main/lib/md2typst.cjs"), "md2typst"],
  ["LaTeX → Typst 数学转换", "P5", () => exists("apps/desktop/main/lib/latex2typst.cjs"), "latex2typst"],
  ["Markdown → Word（纯 JS）", "P5", () => exists("apps/desktop/main/lib/docx-native.cjs"), "docx-native"],
  ["导出界面（格式由用户选）", "P5", () => exists("apps/desktop/renderer/src/components/ExportMenu.tsx"), "ExportMenu"],
  ["产出物无产品署名", "P5", () => anyHas(["scripts/verify-export.mjs"], "无产品署名"), "有断言"],
  ["★ 一键组卷成 PDF", "P5", () => has("apps/desktop/main/index.cjs", "buildPaper"), "**未实现（依赖题库）**"],

  // ---------- P6 语音与费曼 ----------
  ["腾讯云 ASR/TTS 接入", "P6", () => exists("packages/voice/src/index.mjs"), "packages/voice"],
  ["★ 语音面板接进界面", "P6", () => exists("apps/desktop/renderer/src/components/VoicePanel.tsx"), "**未接界面**"],
  ["★ 口型数据（数字人）", "P6", () => anyHas(["packages/voice/src/index.mjs"], "buildVisemeTrack"), "**算法已备，未接界面**"],
  ["★ 费曼评分页面", "P6", () => exists("apps/desktop/renderer/src/components/FeynmanPanel.tsx"), "**未实现**"],
  ["★ 数字人形象", "P6", () => exists("apps/desktop/renderer/src/components/Avatar.tsx"), "**未实现**"],

  // ---------- P7 教材库 ----------
  ["教材数据模型（books / chapters / pages）", "P7", () => hasTable("books") && hasTable("chapters") && hasTable("pages"), "表已建"],
  ["★ 教材 PDF 采集流水线", "P7", () => exists("packages/textbook"), "**未实现**"],
  ["★ 教材 OCR（无文本层 PDF）", "P7", () => exists("scripts/ocr") || exists("packages/ocr"), "**未实现**"],

  // ---------- P8 题库 ----------
  ["题库数据模型（questions / papers / …）", "P8", () => hasTable("questions") && hasTable("papers") && hasTable("paper_items") && hasTable("knowledge_points"), "5 张表已建"],
  ["★ 题库界面", "P8", () => exists("apps/desktop/renderer/src/components/QuestionBank.tsx"), "**未实现**"],
  ["★ 一键组卷成 PDF", "P8", () => exists("packages/paper"), "**未实现**"],

  // ---------- P9 日历计划 ----------
  ["日历/计划数据模型（6 张表）", "P9", () => ["goals", "plans", "tasks", "events", "countdowns", "reviews"].every(hasTable), "全建好"],
  ["★ 日历 / 倒计时 / 计划界面", "P9", () => exists("apps/desktop/renderer/src/components/Calendar.tsx") || exists("apps/desktop/renderer/src/components/PlanPanel.tsx"), "**未实现**"],

  // ---------- P10 打包 ----------
  ["单文件安装包（NSIS）", "P10", () => exists("dist/installer"), "dist/installer"],
  ["全内置（Typst 随包）", "P10", () => exists("vendor/typst/typst.exe"), "vendor/typst"],
  ["随包许可副署", "P10", () => exists("vendor/typst/LICENSE"), "vendor/typst/LICENSE"],
  ["★ 自动更新（迭代分发）", "P10", () => has("package.json", "publish"), "**未配置**"],
  ["★ 代码签名", "P10", () => false, "**没有证书（用户会看到「未知发布者」警示）**"],
];

console.log("=== 格致 · 进度盘点 ===\n");

const byPhase = new Map();
let done = 0;
let todo = 0;

for (const [name, phase, check, note] of ITEMS) {
  let ok = false;
  try { ok = Boolean(check()); } catch { ok = false; }
  if (!byPhase.has(phase)) byPhase.set(phase, []);
  byPhase.get(phase).push({ name, ok, note });
  if (ok) done++; else todo++;
}

for (const [phase, items] of [...byPhase.entries()].sort()) {
  const d = items.filter((i) => i.ok).length;
  const pct = Math.round((d / items.length) * 100);
  const bar = "█".repeat(Math.round(pct / 8)).padEnd(13, "·");
  console.log(`${phase.padEnd(4)} ${bar} ${String(pct).padStart(3)}%  (${d}/${items.length})`);
  for (const i of items) {
    console.log(`       ${i.ok ? "✔" : "✘"} ${i.name}${i.ok ? "" : "   ← " + i.note}`);
  }
  console.log();
}

console.log(`=== 合计：${done} 项已具备 / ${todo} 项未完成（共 ${ITEMS.length} 项）===`);

// 按"用户能感知的功能"做个粗分类，比按阶段更直观
const CORE = ITEMS.filter((i) => !i[0].startsWith("★"));
const STAR = ITEMS.filter((i) => i[0].startsWith("★"));
const coreDone = CORE.filter((i) => { try { return i[2](); } catch { return false; } }).length;
const starDone = STAR.filter((i) => { try { return i[2](); } catch { return false; } }).length;
console.log(`\n  基础能力（查看/渲染/导出/AI）：${coreDone}/${CORE.length} 具备`);
console.log(`  尚缺的大件（标★）：${STAR.length - starDone}/${STAR.length} 未完成`);
