// Gezhi · In-vault file operations (create / rename / delete / save)
//
// Why these must live in the main process: the renderer has no fs (contextIsolation is on).
//
// ★ Security constraint (important, not optional):
//   All path operations must be **confined to the currently opened vault directory**.
//   Otherwise an injected script in the renderer could make the main process write files into C:\Windows.
//   Here we resolve with realpath and compare prefixes — comparing strings alone is not enough,
//   because a path like `vault/../..` looks like it is inside the vault but resolves outside it.
const fs = require("node:fs");
const path = require("node:path");

/** The currently opened vault directory (synced from the renderer when openVault runs) */
let currentVault = null;

function setVault(dir) {
  if (typeof dir === "string" && dir && fs.existsSync(dir)) {
    currentVault = fs.realpathSync(dir);
  } else {
    currentVault = null;
  }
  return currentVault;
}

/**
 * Verify that a target path is inside the vault.
 *
 * Two key points:
 *   1. Resolve with realpathSync (follow symlinks, resolve ../), then compare prefixes
 *   2. The target may not exist yet (new file), in which case realpath the **parent directory**
 */
function assertInsideVault(target, { mustExist = false } = {}) {
  if (!currentVault) throw new Error("No vault is open yet");
  const abs = path.resolve(target);

  if (mustExist) {
    if (!fs.existsSync(abs)) throw new Error(`Path does not exist: ${abs}`);
    const real = fs.realpathSync(abs);
    if (!isInside(real, currentVault)) {
      throw new Error("Operation denied: target is not inside the current vault");
    }
    return real;
  }

  // Target does not exist yet → validate the parent directory
  const parent = path.dirname(abs);
  if (!fs.existsSync(parent)) throw new Error(`Parent directory does not exist: ${parent}`);
  const realParent = fs.realpathSync(parent);
  if (!isInside(realParent, currentVault)) {
    throw new Error("Operation refused: the target is outside the current library");
  }
  return path.join(realParent, path.basename(abs));
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * File name validity check.
 *
 * Three pitfalls hit in practice:
 *   1. **Trim first, then check for empty.** The original implementation checked `!name.trim()` and then used `const n = name.trim()`,
 *      which looks fine — but the caller appends ".md" **before** validation:
 *      "   " → "  .md" → after trim it is ".md", non-empty, passes validation,
 *      and ends up creating a file named ".md". So the **stem name** must be validated too.
 *   2. **Reserved names must be compared by stem.** Windows reserves "CON", and "CON.md" is likewise rejected by the system.
 *      The original implementation compared the whole string, so "CON.md" slipped through.
 *   3. Illegal-character checks must target the user input, not the result after appending the extension (otherwise it leaks through the same way).
 */
function validateName(name) {
  if (typeof name !== "string") throw new Error("Name must be text");
  const n = name.trim();
  if (!n) throw new Error("Name cannot be empty");

  // Stem name (without extension) — reserved names and empty names are judged by this
  const ext = path.extname(n);
  const stem = ext ? n.slice(0, -ext.length) : n;
  if (!stem.trim()) {
    throw new Error("File name cannot be only an extension");
  }

  if (/[<>:"/\\|?*\u0000-\u001f]/.test(n)) {
    throw new Error("Name cannot contain these characters: < > : \" / \\ | ? *");
  }
  // Windows reserved names: CON / PRN / AUX / NUL / COM1-9 / LPT1-9
  // Note that we must check the **stem**, because CON.md is equally disallowed
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem)) {
    throw new Error(`"${stem}" is a Windows reserved name; choose a different name`);
  }
  if (n.startsWith(".") && stem.startsWith(".")) {
    // Allow hidden files (such as .gezhi), but not something like ".md" that is only an extension
  }
  if (n.length > 120) throw new Error("Name too long (limit 120 characters)");
  return n;
}

/** Prevent using the same name twice */
function uniquePath(dir, base, ext = "") {
  let candidate = path.join(dir, base + ext);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} ${i}${ext}`);
    i++;
    if (i > 999) throw new Error("Too many files with the same name");
  }
  return candidate;
}

function registerVaultFs(ipcMain) {
  // Sync the directory when opening a vault, for path validation
  ipcMain.handle("vault:set", (_e, dir) => ({ ok: true, vault: setVault(dir) }));

  /**
   * Unified IPC wrapper.
   *
   * ⚠️ Why wrap at all: when ipcMain.handle hits an **uncaught exception**,
   *     the renderer receives a vague error like `Error: An object could not be cloned`,
   *     whereas we want the specific reason ("Name cannot be empty"). Even worse:
   *     if the returned object contains a non-cloneable value, the renderer receives an **empty object {}** —
   *     the `!r.ok` assertion passes and `r.error` is undefined, losing the whole error message.
   *     So here we guarantee: every path returns a {ok, ...} object containing only primitive types.
   */
  const wrap = (fn) => async (_e, arg) => {
    try {
      const r = await fn(arg);
      if (r && typeof r === "object" && typeof r.ok === "boolean") return r;
      return { ok: true, result: r };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  /** Create a file */
  ipcMain.handle("fs:createFile", wrap(({ dir, name, content = "" }) => {
    try {
      // ★ Order: **validate the user's raw input first, then append the extension**.
      //   The other way around (the original implementation), "   " gets joined into "   .md",
      //   then trimmed to ".md" — non-empty and legal, so it creates a file named ".md".
      //   Hit in practice: the debug output really did show a `.md` file.
      const base = validateName(name);
      const safe = base.includes(".") ? base : `${base}.md`;
      // Validate the full string once more after appending (to block bypasses like "CON" + ".md")
      validateName(safe);
      const parent = assertInsideVault(path.join(dir, safe), { mustExist: false });
      const target = path.join(path.dirname(parent), safe);
      if (fs.existsSync(target)) return { ok: false, error: `"${safe}" already exists` };
      // Default content: a title skeleton for a new note (friendlier than an empty file)
      const finalContent = content || (safe.endsWith(".md") ? `# ${safe.replace(/\.md$/i, "")}\n\n` : "");
      fs.writeFileSync(target, finalContent, "utf8");
      return { ok: true, path: target, name: safe };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /** Create a folder */
  ipcMain.handle("fs:createFolder", wrap(({ dir, name }) => {
    try {
      const safe = validateName(name);
      assertInsideVault(path.join(dir, safe), { mustExist: false });
      const target = path.join(dir, safe);
      if (fs.existsSync(target)) return { ok: false, error: `"${safe}" already exists` };
      fs.mkdirSync(target);
      return { ok: true, path: target, name: safe };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /**
   * Rename (file or folder).
   * Only the name may change, not the path — moving is a separate operation, and mixing them is bug-prone.
   */
  ipcMain.handle("fs:rename", wrap(({ target: oldPath, newName }) => {
    try {
      const real = assertInsideVault(oldPath, { mustExist: true });
      const isDir = fs.statSync(real).isDirectory();
      const safe = validateName(newName);
      // Files keep their original extension (unless the user explicitly wrote a new extension)
      const curExt = path.extname(real);
      const finalName = !isDir && curExt && !safe.includes(".") ? safe + curExt : safe;
      const newPath = path.join(path.dirname(real), finalName);

      // ⚠️ Order matters: **check for a name collision first, then check "no change"**.
      //     The other way around (which is how the original implementation did it), "renaming to its own existing name"
      //     takes the unchanged branch because newPath === real and is allowed through —
      //     the user sees "success" but nothing happens, and the name collision is never caught.
      if (path.resolve(newPath) !== path.resolve(real) && fs.existsSync(newPath)) {
        return { ok: false, error: `"${finalName}" already exists` };
      }
      if (newPath === real) return { ok: true, path: real, name: finalName, unchanged: true };

      fs.renameSync(real, newPath);
      return { ok: true, path: newPath, name: finalName, oldPath: real };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /**
   * Delete.
   *
   * ★ By default **move to the trash** rather than delete outright — notes are the user's lifeline,
   *   and a single misclick losing them permanently is unacceptable. Only when the trash is unavailable
   *   do we actually delete, and in that case the UI is clearly informed.
   *   (Electron's shell.trashItem is asynchronous)
   */
  ipcMain.handle("fs:delete", async (_e, { target, permanent = false }) => {
    try {
      const real = assertInsideVault(target, { mustExist: true });
      if (permanent) {
        fs.rmSync(real, { recursive: true, force: true });
        return { ok: true, path: real, permanent: true };
      }
      const { shell } = require("electron");
      await shell.trashItem(real);
      return { ok: true, path: real, trashed: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** Save a text file (used by the editor) */
  ipcMain.handle("fs:writeText", wrap(({ path: filePath, text }) => {
    try {
      if (typeof text !== "string") return { ok: false, error: "Content must be a string" };
      const real = assertInsideVault(filePath, { mustExist: true });
      const st = fs.statSync(real);
      if (st.isDirectory()) return { ok: false, error: "Target is a folder and cannot be written to" };
      // Back up the original file before writing (same name + .bak) so an editor bug can't corrupt a note
      // Only back up files that already have content, and cap the size (don't fill the disk just to back up)
      if (st.size > 0 && st.size < 8 * 1024 * 1024) {
        try {
          const bak = real + ".bak";
          // Keep only one backup: overwrite the previous one
          if (fs.existsSync(bak)) fs.unlinkSync(bak);
          fs.copyFileSync(real, bak);
        } catch { /* A failed backup must not block the save */ }
      }
      fs.writeFileSync(real, text, "utf8");
      const after = fs.statSync(real);
      return { ok: true, path: real, size: after.size, mtime: after.mtime.toISOString() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

  /** Query the current vault (for debugging and testing) */
  ipcMain.handle("fs:currentVault", () => ({ vault: currentVault }));
}

module.exports = { registerVaultFs, setVault, assertInsideVault, validateName };
