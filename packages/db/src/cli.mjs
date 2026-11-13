#!/usr/bin/env node
// Gezhi · Vault management / creation CLI
//
// Usage:
//   node packages/db/src/cli.mjs where                      Show how the "Documents" directory was resolved
//   node packages/db/src/cli.mjs init <vault-name> [--dry-run]    Create a vault
//   node packages/db/src/cli.mjs list                       List all vaults
//   node packages/db/src/cli.mjs migrate --vault <id>       Only create the database schema
//   node packages/db/src/cli.mjs search <vault-id> <query>  Search the knowledge base
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
  console.log(`Gezhi · Vault management

  where                     Show the resolved "Documents" directory (the default vault location depends on it)
  init <vault-name> [--dry-run]   Create a vault (directory skeleton + vault.json + vaults.json + database)
  list                      List all vaults
  migrate [--vault <id>]    Only create/upgrade the database schema
  search <vault-id> <query> Search the knowledge base (validates Chinese indexing)

Options:
  --root <path>             Specify the vaults root (overrides the "Documents" directory)
  --subject <subject>       Subject
  --grade <grade>           Grade
  --dry-run                 Only report what would be done, write nothing`);
}

switch (cmd) {
  case "where": {
    const r = resolveVaultsRoot();
    console.log("=== \"Documents\" directory resolution ===");
    console.log(`  Resolved path     : ${r.documentsDir}`);
    console.log(`  Resolved via      : ${r.via}`);
    console.log(`  Default vault root: ${r.root}`);
    console.log(`  App data directory: ${path.dirname(indexPathFor("x"))}`);
    console.log("");
    console.log("  Note: most Windows users keep Documents at C:\\Users\\<name>\\Documents,");
    console.log("        but it can be redirected (on this machine it is redirected to the D drive), so we must ask the system, never hard-code.");
    break;
  }

  case "init": {
    const name = positional[0];
    if (!name) {
      console.error("Usage: init <vault-name> [--dry-run]");
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

    console.log(`=== Vault ${dryRun ? "to be created" : "created"}: ${info.name} ===`);
    console.log(`  Vault id          : ${info.id}`);
    console.log(`  Vault directory   : ${info.vaultDir}`);
    console.log(`  Documents source  : ${info.resolvedVia}`);
    console.log(`  Index database    : ${info.indexPath}`);
    console.log(`  Cache directory   : ${info.cacheDir}`);
    console.log("  Actions:");
    for (const a of info.actions) console.log(`    - ${a}`);

    if (!dryRun) {
      const db = openDatabase({ vaultId: info.id });
      const si = migrate(db);
      closeDatabase(db);
      console.log(`  Database          : schema v${si.schemaVersion}, SQLite ${si.sqlite}, ${si.tableCount} tables`);
      console.log(`  FTS indexes       : ${si.ftsTables.filter((t) => !t.includes("_data") && !t.includes("_idx") && !t.includes("_config") && !t.includes("_docsize")).join(", ")}`);
      console.log("\n  Next: just drop Markdown / PDF / Word files into the vault directory (automatic import is supported from P1 onward).");
    }
    break;
  }

  case "list": {
    const r = listVaults();
    console.log(`=== Vault registry (${r.registryPath}) ===`);
    if (!r.vaults.length) {
      console.log("  (No vaults yet. Create one with `init <vault-name>`.)");
    } else {
      for (const v of r.vaults) {
        console.log(`  ${v.exists ? "✔" : "✖"} ${v.name}  [${v.id}]`);
        console.log(`      ${v.path}${v.exists ? "" : "  <- directory does not exist"}`);
      }
    }
    break;
  }

  case "migrate": {
    const vaultId = flagValue("--vault") ?? "default";
    const db = openDatabase({ vaultId });
    const si = migrate(db);
    closeDatabase(db);
    console.log(`Schema created/upgraded: vault=${vaultId}, schema v${si.schemaVersion}, ${si.tableCount} tables`);
    break;
  }

  case "search": {
    const [vaultId, ...terms] = positional;
    const q = terms.join(" ");
    if (!vaultId || !q) {
      console.error("Usage: search <vault-id> <query>");
      process.exit(2);
    }
    const db = openDatabase({ vaultId });
    migrate(db);
    const hits = searchChunks(db, q);
    console.log(`=== Search "${q}" (vault ${vaultId}) -> ${hits.length} hits ===`);
    for (const h of hits) {
      console.log(`  [chunk ${h.id}] pages ${h.page_from}-${h.page_to}  matched via: ${h.via.join("+")}  score ${h.score}`);
      console.log(`      ${h.text.slice(0, 100)}${h.text.length > 100 ? "..." : ""}`);
    }
    if (!hits.length) console.log("  (The knowledge base is still empty -- import textbooks first, see P7)");
    closeDatabase(db);
    break;
  }

  default:
    printHelp();
    process.exit(cmd ? 2 : 0);
}
