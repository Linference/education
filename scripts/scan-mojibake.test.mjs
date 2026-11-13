// Skip-rule verification for scan-mojibake.
//
// Why this test exists:
//   After bundling LibreOffice the repo gained 9000+ third-party files,
//   and they contain character-table constants that "look like mojibake"
//   (e.g. idna's uts46data.py lists Han characters by Unicode block),
//   which would be falsely reported as "double-encoding corruption".
//   So vendor/ and dist/installer must be skipped.
//
// ★ But the skip rules are easy to get wrong, so this test locks down two things:
//   1. What should be skipped really is skipped (otherwise false positives)
//   2. **What should be scanned is not wrongly skipped** (otherwise real
//      corruption is missed — the more dangerous failure)
//
// It also covers a hidden trap: the first version wrote /[\\/]vendor[\\/]/,
// requiring a separator on both sides of vendor, which **does not match a
// relative path**. The real scan passes absolute paths so it "looked fine",
// but that is an implicit dependency.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Construct the skip rules the same way scan-mojibake.mjs does
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
  // [path segments, expect skip?, description]
  [["vendor", "soffice", "program", "lib", "idna", "uts46data.py"], true, "Third-party files from the bundled LibreOffice"],
  [["dist", "installer", "win-unpacked", "resources", "x.py"], true, "Packaging artifacts"],
  [["node_modules", "x", "y.js"], true, "Dependencies"],
  [["apps", "desktop", "renderer", "src", "App.tsx"], false, "★ Our own source code; must be scanned"],
  [["scripts", "scan-mojibake.mjs"], false, "★ Our own script; must be scanned"],
  [["docs", "01-架构.md"], false, "★ Our own document; must be scanned"],
  [["README.md"], false, "★ Root-level file; must be scanned"],
];

let bad = 0;
console.log("=== scan-mojibake skip-rule verification (absolute + relative paths) ===\n");
console.log("  Path                                    Expect  Abs   Rel");
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
  console.log(`  ${String(parts.join("\\")).slice(0, 38).padEnd(40)} ${(wantSkip ? "skip" : "keep").padEnd(6)} ${mark(okA)}     ${mark(okR)}   ${why}`);
}

console.log(`\n=== Result: ${bad === 0 ? `all ${CASES.length} cases passed` : `${bad} case(s) failed`} ===`);
if (bad) {
  console.log("  Missed a skip → false positives; wrongly skipped → real corruption missed. Both must be fixed.");
}
process.exit(bad === 0 ? 0 : 1);
