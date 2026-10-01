// 格致 · 库（Vault）脚手架
//
// 两条硬规则（都是调研得出的）：
//   1. 默认位置必须"问系统"，不能硬编码 —— 大多数 Windows 用户的「文档」在
//      C:\Users\<名>\Documents，但它随时可能被重定向（本机就重定向到了 D 盘）。
//      Electron 里用 app.getPath('documents')；这里在纯 Node 环境下做等价推断。
//   2. 索引与缓存放 %APPDATA%（库之外）—— 库若落在 OneDrive 同步目录里，
//      WAL 模式的 SQLite 被云盘中途打断写入会损坏或锁死。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { appDataDir, indexPathFor } from "../../db/src/index.mjs";

/** 库内的目录骨架。 */
export const VAULT_SUBDIRS = [
  "笔记",
  "教材",
  "题库",
  "语音",
  "产出",
  "模板",
  "附件",
  path.join(".gezhi"),
  path.join(".gezhi", "backup"),
  path.join(".gezhi", "trash"),
];

export const VAULT_DIR_NAME = "格致";

/**
 * 解析系统"文档"目录。
 * @returns {{ dir: string, via: string }}
 */
export function resolveDocumentsDir() {
  // 1) 显式覆盖（测试与高级用户用）
  if (process.env.GEZHI_DOCUMENTS) {
    return { dir: process.env.GEZHI_DOCUMENTS, via: "环境变量 GEZHI_DOCUMENTS" };
  }

  // 2) Windows：读注册表里真实的已知文件夹位置（支持重定向）
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"],
        { encoding: "utf8", windowsHide: true }
      );
      const m = out.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/);
      if (m) {
        const expanded = m[1].trim().replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
        if (expanded && fs.existsSync(expanded)) {
          return { dir: expanded, via: "注册表 User Shell Folders\\Personal" };
        }
      }
    } catch {
      /* 落到下面的默认值 */
    }
  }

  // 3) 默认
  return { dir: path.join(os.homedir(), "Documents"), via: "默认推断" };
}

/** 库的根目录（多库并列的地方）：<文档>\格致\ */
export function resolveVaultsRoot() {
  const { dir, via } = resolveDocumentsDir();
  return { root: path.join(dir, VAULT_DIR_NAME), documentsDir: dir, via };
}

export function makeVaultId(name) {
  const safe = String(name).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "vault";
  const stamp = Date.now().toString(36);
  return `${safe}-${stamp}`;
}

/**
 * 建库。
 * @param {object} opts
 * @param {string} opts.name       库名（也就是文件夹名）
 * @param {string} [opts.root]     库根（默认 <文档>\格致\）
 * @param {string} [opts.subject]  学科
 * @param {string} [opts.grade]    年级
 * @param {boolean} [opts.dryRun]  只报告将要做什么，不落盘
 */
export function createVault({ name, root, subject = null, grade = null, dryRun = false } = {}) {
  if (!name) throw new Error("建库需要 name");
  const rootInfo = root ? { root, documentsDir: path.dirname(root), via: "显式指定" } : resolveVaultsRoot();
  const vaultDir = path.join(rootInfo.root, name);
  const configDir = path.join(vaultDir, ".gezhi");
  const id = makeVaultId(name);

  const actions = [];
  const doMkdir = (p) => {
    actions.push(`建目录 ${path.relative(rootInfo.root, p) || "."}`);
    if (!dryRun) fs.mkdirSync(p, { recursive: true });
  };

  doMkdir(vaultDir);
  for (const sub of VAULT_SUBDIRS) doMkdir(path.join(vaultDir, sub));

  // vault.json：库级配置
  const vaultJson = {
    schemaVersion: 1,
    id,
    name,
    subject,
    grade,
    createdAt: new Date().toISOString(),
    // 说明：索引与缓存不在库内，见 indexPath / cacheDir
    dataPolicy: {
      notes: "Markdown 是唯一真源，可用任何编辑器打开",
      index: "索引与缓存位于 %APPDATA%\\gezhi，可从库内容重建",
      backup: ".gezhi/backup 存放不可重建的数据（题库 / 计划 / 评分）",
    },
    exportDefaults: { pdf: "typst", docx: "python-docx", html: "chromium-print" },
  };
  actions.push("写 .gezhi/vault.json");
  if (!dryRun) fs.writeFileSync(path.join(configDir, "vault.json"), JSON.stringify(vaultJson, null, 2), "utf8");

  // vaults.json：多库清单（放在格致根，便于切换）
  const registryPath = path.join(rootInfo.root, "vaults.json");
  actions.push("更新 vaults.json（库清单）");
  if (!dryRun) {
    let reg = { schemaVersion: 1, vaults: [] };
    try {
      reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    } catch {
      /* 首次或损坏就重建 */
    }
    reg.vaults = Array.isArray(reg.vaults) ? reg.vaults : [];
    if (!reg.vaults.some((v) => v.id === id)) {
      reg.vaults.push({ id, name, path: vaultDir, subject, grade, createdAt: vaultJson.createdAt });
    }
    fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2), "utf8");
  }

  // workspace.json：标签页与面板布局（先给默认值，P1 起用）
  const workspaceJson = {
    schemaVersion: 1,
    openTabs: [],
    activeTab: null,
    layout: { sidebarWidth: 260, rightPanelWidth: 320, rightPanelVisible: true },
    editorMode: "live", // source | live | reading
  };
  actions.push("写 .gezhi/workspace.json");
  if (!dryRun) fs.writeFileSync(path.join(configDir, "workspace.json"), JSON.stringify(workspaceJson, null, 2), "utf8");

  const indexPath = indexPathFor(id);
  const cacheDir = path.join(appDataDir(), "cache", id);

  return {
    id,
    name,
    vaultDir,
    configDir,
    root: rootInfo.root,
    documentsDir: rootInfo.documentsDir,
    resolvedVia: rootInfo.via,
    indexPath,
    cacheDir,
    registryPath,
    actions,
    dryRun,
  };
}

/** 列出所有库（读 vaults.json，并核对目录是否还在）。 */
export function listVaults() {
  const { root } = resolveVaultsRoot();
  const registryPath = path.join(root, "vaults.json");
  let reg = { vaults: [] };
  try {
    reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch {
    return { root, registryPath, vaults: [] };
  }
  const vaults = (reg.vaults ?? []).map((v) => ({ ...v, exists: fs.existsSync(v.path) }));
  return { root, registryPath, vaults };
}

export { appDataDir, indexPathFor };
