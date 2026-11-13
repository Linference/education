// Gezhi · Vault scaffolding
//
// Two hard rules (both from research):
//   1. The default location must be "asked from the system", never hard-coded — most Windows users keep
//      Documents at C:\Users\<name>\Documents, but it can be redirected at any time (on this machine it
//      is redirected to the D drive). In Electron use app.getPath('documents'); here we make the
//      equivalent inference in a pure Node environment.
//   2. Keep the index and cache under %APPDATA% (outside the vault) — if the vault lives in a OneDrive
//      sync folder, a WAL-mode SQLite interrupted mid-write by the cloud drive can corrupt or lock up.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { appDataDir, indexPathFor } from "../../db/src/index.mjs";

/** Directory skeleton inside a vault. */
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
 * Resolve the system "Documents" directory.
 * @returns {{ dir: string, via: string }}
 */
export function resolveDocumentsDir() {
  // 1) Explicit override (for tests and advanced users)
  if (process.env.GEZHI_DOCUMENTS) {
    return { dir: process.env.GEZHI_DOCUMENTS, via: "GEZHI_DOCUMENTS environment variable" };
  }

  // 2) Windows: read the real known-folder location from the registry (supports redirection)
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
          return { dir: expanded, via: "registry User Shell Folders\\Personal" };
        }
      }
    } catch {
      /* fall through to the default below */
    }
  }

  // 3) Default
  return { dir: path.join(os.homedir(), "Documents"), via: "default inference" };
}

/** Vaults root (where multiple vaults sit side by side): <Documents>\格致\ */
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
 * Create a vault.
 * @param {object} opts
 * @param {string} opts.name       Vault name (also the folder name)
 * @param {string} [opts.root]     Vaults root (default <Documents>\格致\)
 * @param {string} [opts.subject]  Subject
 * @param {string} [opts.grade]    Grade
 * @param {boolean} [opts.dryRun]  Only report what would be done, write nothing
 */
export function createVault({ name, root, subject = null, grade = null, dryRun = false } = {}) {
  if (!name) throw new Error("Creating a vault requires a name");
  const rootInfo = root ? { root, documentsDir: path.dirname(root), via: "explicitly specified" } : resolveVaultsRoot();
  const vaultDir = path.join(rootInfo.root, name);
  const configDir = path.join(vaultDir, ".gezhi");
  const id = makeVaultId(name);

  const actions = [];
  const doMkdir = (p) => {
    actions.push(`create directory ${path.relative(rootInfo.root, p) || "."}`);
    if (!dryRun) fs.mkdirSync(p, { recursive: true });
  };

  doMkdir(vaultDir);
  for (const sub of VAULT_SUBDIRS) doMkdir(path.join(vaultDir, sub));

  // vault.json: vault-level configuration
  const vaultJson = {
    schemaVersion: 1,
    id,
    name,
    subject,
    grade,
    createdAt: new Date().toISOString(),
    // Note: the index and cache are not inside the vault; see indexPath / cacheDir
    dataPolicy: {
      notes: "Markdown is the single source of truth and can be opened with any editor",
      index: "The index and cache live in %APPDATA%\\gezhi and can be rebuilt from vault contents",
      backup: ".gezhi/backup holds data that cannot be rebuilt (question bank / plans / scores)",
    },
    exportDefaults: { pdf: "typst", docx: "python-docx", html: "chromium-print" },
  };
  actions.push("write .gezhi/vault.json");
  if (!dryRun) fs.writeFileSync(path.join(configDir, "vault.json"), JSON.stringify(vaultJson, null, 2), "utf8");

  // vaults.json: multi-vault registry (kept at the Gezhi root so vaults can be switched easily)
  const registryPath = path.join(rootInfo.root, "vaults.json");
  actions.push("update vaults.json (vault registry)");
  if (!dryRun) {
    let reg = { schemaVersion: 1, vaults: [] };
    try {
      reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    } catch {
      /* first run or corrupted, so rebuild */
    }
    reg.vaults = Array.isArray(reg.vaults) ? reg.vaults : [];
    if (!reg.vaults.some((v) => v.id === id)) {
      reg.vaults.push({ id, name, path: vaultDir, subject, grade, createdAt: vaultJson.createdAt });
    }
    fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2), "utf8");
  }

  // workspace.json: tab and panel layout (defaults for now, used from P1 onward)
  const workspaceJson = {
    schemaVersion: 1,
    openTabs: [],
    activeTab: null,
    layout: { sidebarWidth: 260, rightPanelWidth: 320, rightPanelVisible: true },
    editorMode: "live", // source | live | reading
  };
  actions.push("write .gezhi/workspace.json");
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

/** List all vaults (reads vaults.json and checks whether each directory still exists). */
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
