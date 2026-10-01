#!/usr/bin/env node
// 格致 · 库管理 / 建库 CLI
//
// 用法：
//   node packages/db/src/cli.mjs where                     查看"文档"目录是怎么解析出来的
//   node packages/db/src/cli.mjs init <库名> [--dry-run]    建一个库
//   node packages/db/src/cli.mjs list                       列出所有库
//   node packages/db/src/cli.mjs migrate --vault <id>       只建数据库结构
//   node packages/db/src/cli.mjs search <库id> <关键词>      在知识库里检索
import path from "node:path";
import { openDatabase, migrate, schemaInfo, searchChunks, closeDatabase, indexPathFor, cacheDirFor } from "./index.mjs";
import { createVault, listVaults, resolveVaultsRoot } from "../../core/src/vault.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const positional = rest.filter((a) => !a.startsWith("--"));
const flagValue = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

function printHelp() {
  console.log(`格致 · 库管理

  where                     查看"文档"目录解析结果（默认库位置由它决定）
  init <库名> [--dry-run]   建库（目录骨架 + vault.json + vaults.json + 数据库）
  list                      列出所有库
  migrate [--vault <id>]    只建/升级数据库结构
  search <库id> <关键词>     在知识库里检索（验证中文索引）

选项：
  --root <路径>             指定库根（覆盖"文档"目录）
  --subject <学科>          学科
  --grade <年级>            年级
  --dry-run                 只报告将要做什么，不落盘`);
}

switch (cmd) {
  case "where": {
    const r = resolveVaultsRoot();
    console.log("=== \"文档\"目录解析 ===");
    console.log(`  解析结果      ：${r.documentsDir}`);
    console.log(`  解析依据      ：${r.via}`);
    console.log(`  库的默认根目录：${r.root}`);
    console.log(`  应用数据目录  ：${path.dirname(indexPathFor("x"))}`);
    console.log("");
    console.log("  说明：多数 Windows 用户的「文档」在 C:\\Users\\<名>\\Documents，");
    console.log("        但它可能被重定向（本机就重定向到了 D 盘），所以只能问系统、不能硬编码。");
    break;
  }

  case "init": {
    const name = positional[0];
    if (!name) {
      console.error("用法：init <库名> [--dry-run]");
      process.exit(2);
    }
    const dryRun = flags.has("--dry-run");
    const info = createVault({
      name,
      root: flagValue("--root"),
      subject: flagValue("--subject") ?? null,
      grade: flagValue("--grade") ?? null,
      dryRun,
    });

    console.log(`=== ${dryRun ? "将要建立" : "已建立"}库：${info.name} ===`);
    console.log(`  库 id        ：${info.id}`);
    console.log(`  库目录       ：${info.vaultDir}`);
    console.log(`  文档目录依据 ：${info.resolvedVia}`);
    console.log(`  索引库       ：${info.indexPath}`);
    console.log(`  缓存目录     ：${info.cacheDir}`);
    console.log("  动作：");
    for (const a of info.actions) console.log(`    - ${a}`);

    if (!dryRun) {
      const db = openDatabase({ vaultId: info.id });
      const si = migrate(db);
      closeDatabase(db);
      console.log(`  数据库       ：schema v${si.schemaVersion}，SQLite ${si.sqlite}，${si.tableCount} 张表`);
      console.log(`  FTS 索引     ：${si.ftsTables.filter((t) => !t.includes("_data") && !t.includes("_idx") && !t.includes("_config") && !t.includes("_docsize")).join(", ")}`);
      console.log("\n  下一步：直接把 Markdown / PDF / Word 丢进库目录即可（P1 起支持自动入库）。");
    }
    break;
  }

  case "list": {
    const r = listVaults();
    console.log(`=== 库清单（${r.registryPath}）===`);
    if (!r.vaults.length) {
      console.log("  （还没有库。用 `init <库名>` 建一个。）");
    } else {
      for (const v of r.vaults) {
        console.log(`  ${v.exists ? "✔" : "✖"} ${v.name}  [${v.id}]`);
        console.log(`      ${v.path}${v.exists ? "" : "  ← 目录不存在"}`);
      }
    }
    break;
  }

  case "migrate": {
    const vaultId = flagValue("--vault") ?? "default";
    const db = openDatabase({ vaultId });
    const si = migrate(db);
    closeDatabase(db);
    console.log(`已建/升级结构：vault=${vaultId}，schema v${si.schemaVersion}，${si.tableCount} 张表`);
    break;
  }

  case "search": {
    const [vaultId, ...terms] = positional;
    const q = terms.join(" ");
    if (!vaultId || !q) {
      console.error("用法：search <库id> <关键词>");
      process.exit(2);
    }
    const db = openDatabase({ vaultId });
    migrate(db);
    const hits = searchChunks(db, q);
    console.log(`=== 检索「${q}」（库 ${vaultId}）→ ${hits.length} 条 ===`);
    for (const h of hits) {
      console.log(`  [chunk ${h.id}] 第 ${h.page_from}-${h.page_to} 页  命中路：${h.via.join("+")}  权重 ${h.score}`);
      console.log(`      ${h.text.slice(0, 100)}${h.text.length > 100 ? "…" : ""}`);
    }
    if (!hits.length) console.log("  （知识库还是空的 —— 先导入教材，见 P7）");
    closeDatabase(db);
    break;
  }

  default:
    printHelp();
    process.exit(cmd ? 2 : 0);
}
