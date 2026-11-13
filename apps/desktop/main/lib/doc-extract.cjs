// Text extraction for .doc (Word 97-2003 binary format)
//
// Why we wrote it ourselves:
//   `.doc` is an OLE compound document (Compound File Binary), not a zip, and not XML.
//   The usable libraries on npm are either stale or unmaintained, while the format
//   itself is **public and has a clear spec** (MS-CFB + MS-DOC), so we can parse it
//   ourselves.
//
// Parsing pipeline (every layer has been verified against real files):
//   1. OLE container: read header -> parse FAT / MiniFAT / directory entries -> extract streams
//   2. WordDocument stream: read the FIB (File Information Block) to get the key offsets
//   3. Text: the **piece table** at the end of the FIB decides which encoding each segment uses:
//        bit15 = 1 -> this segment is single-byte CP1252 (Chinese is stored as a GBK variant here)
//        bit15 = 0 -> this segment is UTF-16LE
//      This is the easiest place to get .doc extraction wrong -- not distinguishing the
//      encodings produces mojibake.
//
// ⚠️ This only does **text extraction** (enough for preview). No layout reconstruction:
//    .doc layout information (fonts, tables, images) is stored in complex binary structures,
//    and fully reconstructing it is equivalent to rewriting Word. Preview only needs "readable".
//
// References: MS-CFB (Compound File format), MS-DOC (Word binary format).

const fs = require("node:fs");

// ---------------------------------------------------------------- OLE container

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

/**
 * Parse an OLE compound document, returning { streams: Map<name, Buffer> }.
 *
 * Structure highlights:
 *   - The header is 512 bytes, containing sector size, FAT location, and directory start sector
 *   - Large streams use the FAT (each sector is 512 or 4096 bytes)
 *   - **Streams smaller than 4096 bytes use the MiniFAT** (stored in the root entry's data)
 *     -- missing the MiniFAT makes small streams unreadable; this is the most common implementation bug
 */
function readOle(buf) {
  if (buf.length < 512 || !buf.subarray(0, 8).equals(OLE_MAGIC)) {
    throw new Error("Not an OLE compound document (magic number mismatch)");
  }

  const sectorShift = buf.readUInt16LE(0x1e);
  const miniSectorShift = buf.readUInt16LE(0x20);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;

  const numFatSectors = buf.readUInt32LE(0x2c);
  const dirStartSector = buf.readUInt32LE(0x30);
  const miniStreamCutoff = buf.readUInt32LE(0x38);
  const miniFatStart = buf.readUInt32LE(0x3c);
  const numMiniFatSectors = buf.readUInt32LE(0x40);
  const difatStart = buf.readUInt32LE(0x44);
  const numDifatSectors = buf.readUInt32LE(0x48);

  const dataStart = 512;

  /** Offset of the n-th sector within the file */
  const sectorOffset = (n) => dataStart + n * sectorSize;

  const readSector = (n) => {
    const off = sectorOffset(n);
    if (off + sectorSize > buf.length) {
      // Truncated file: return the remaining bytes instead of crashing, to extract as much as possible
      return buf.subarray(off, Math.min(off + sectorSize, buf.length));
    }
    return buf.subarray(off, off + sectorSize);
  };

  // ---- DIFAT: first read the 109 FAT sector numbers embedded in the header, then follow the extended DIFAT ----
  const fatSectorIds = [];
  for (let i = 0; i < 109; i++) {
    const v = buf.readUInt32LE(0x4c + i * 4);
    if (v === FREESECT || v === ENDOFCHAIN) break;
    fatSectorIds.push(v);
  }
  // Extended DIFAT
  let difat = difatStart;
  let guard = 0;
  while (difat !== ENDOFCHAIN && difat !== FREESECT && guard++ < numDifatSectors + 8) {
    const sec = readSector(difat);
    const perSec = sectorSize / 4 - 1;
    for (let i = 0; i < perSec; i++) {
      const v = sec.readUInt32LE(i * 4);
      if (v === FREESECT || v === ENDOFCHAIN) continue;
      fatSectorIds.push(v);
    }
    difat = sec.readUInt32LE(sectorSize - 4);
    if (difat === ENDOFCHAIN || difat === FREESECT) break;
  }

  // ---- FAT ----
  const fat = [];
  for (const sid of fatSectorIds.slice(0, Math.max(numFatSectors, fatSectorIds.length))) {
    const sec = readSector(sid);
    for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(sec.readUInt32LE(i));
  }
  if (fat.length === 0) throw new Error("FAT is empty, the file may be corrupt");

  /** Follow the FAT chain and concatenate sectors into a Buffer */
  const readChain = (start, size = null) => {
    const parts = [];
    let cur = start;
    let guard2 = 0;
    while (cur !== ENDOFCHAIN && cur !== FREESECT && cur < fat.length && guard2++ < fat.length + 8) {
      parts.push(readSector(cur));
      cur = fat[cur];
    }
    const out = Buffer.concat(parts);
    return size != null ? out.subarray(0, size) : out;
  };

  // ---- MiniFAT ----
  const miniFat = readChain(miniFatStart, numMiniFatSectors * sectorSize);
  const miniFatEntries = [];
  for (let i = 0; i + 4 <= miniFat.length; i += 4) miniFatEntries.push(miniFat.readUInt32LE(i));

  // ---- Directory entries ----
  const dirRaw = readChain(dirStartSector);
  const entries = [];
  for (let off = 0; off + 128 <= dirRaw.length; off += 128) {
    const nameLen = dirRaw.readUInt16LE(off + 64);
    if (nameLen === 0) continue;
    const name = dirRaw.subarray(off, off + Math.max(0, nameLen - 2)).toString("utf16le");
    const type = dirRaw.readUInt8(off + 66);
    const startSector = dirRaw.readUInt32LE(off + 116);
    const size = dirRaw.readUInt32LE(off + 120);
    entries.push({ name, type, startSector, size });
  }
  if (entries.length === 0) throw new Error("Directory is empty");

  const root = entries.find((e) => e.type === 5) ?? entries[0];

  // MiniStream: the content of all small streams lives in the stream pointed to by the root entry
  const miniStream = root.size > 0 ? readChain(root.startSector, root.size) : Buffer.alloc(0);

  const readMiniChain = (start, size) => {
    const parts = [];
    let cur = start;
    let guard3 = 0;
    while (cur !== ENDOFCHAIN && cur !== FREESECT && cur < miniFatEntries.length && guard3++ < miniFatEntries.length + 8) {
      const off = cur * miniSectorSize;
      parts.push(miniStream.subarray(off, Math.min(off + miniSectorSize, miniStream.length)));
      cur = miniFatEntries[cur];
    }
    return Buffer.concat(parts).subarray(0, size);
  };

  // ---- Extract streams ----
  const streams = new Map();
  for (const e of entries) {
    if (e.type !== 2) continue;                       // 2 = stream
    try {
      const isSmall = e.size < miniStreamCutoff;
      const data = isSmall && miniStream.length > 0
        ? readMiniChain(e.startSector, e.size)
        : readChain(e.startSector, e.size);
      streams.set(e.name, data);
      // Word's stream name may be "WordDocument" or carry a control-character prefix, so match loosely
      if (/WordDocument/i.test(e.name)) streams.set("WordDocument", data);
    } catch {
      // A single stream failing to read must not affect the other streams
    }
  }

  return { streams, sectorSize, miniSectorSize, entryCount: entries.length };
}

// ---------------------------------------------------------------- .doc text

/**
 * Extract body text from the WordDocument stream.
 *
 * Key FIB fields (offsets are relative to the start of the WordDocument stream):
 *   0x0000  wIdent (should be 0xA5EC)
 *   0x0002  nFib (version number)
 *   0x000A  flags: bit 9 (0x0200) indicates whether 1Table or 0Table is used
 *   0x0018  fcMin (legacy field, may be inaccurate in modern .doc)
 *   0x001C  fcMac
 *   0x004C  ccpText (number of body characters)
 *   0x00FA  fcClx (offset of the piece table in the Table stream)
 *   0x00FE  lcbClx (length of the piece table)
 */
function extractTextFromDoc(streams) {
  const wd = streams.get("WordDocument");
  if (!wd || wd.length < 0x200) throw new Error("Missing WordDocument stream or stream too short");

  const wIdent = wd.readUInt16LE(0);
  if (wIdent !== 0xa5ec && wIdent !== 0xa5dc) {
    // Not a standard Word document, but could still be something else in the OLE -- fall back to plain-text scanning
    throw new Error(`Unexpected WordDocument identifier (0x${wIdent.toString(16)})`);
  }

  const flags = wd.readUInt16LE(0x0a);
  const use1Table = (flags & 0x0200) !== 0;
  const table = streams.get(use1Table ? "1Table" : "0Table") ?? streams.get("1Table") ?? streams.get("0Table");

  const fcClx = wd.readUInt32LE(0x01a2);
  const lcbClx = wd.readUInt32LE(0x01a6);

  // ---- Has a piece table: take the regular path (supports mixed encodings) ----
  if (table && lcbClx > 0 && fcClx + lcbClx <= table.length) {
    const pieces = readPieceTable(table, fcClx, lcbClx);
    if (pieces.length > 0) {
      const parts = [];
      for (const p of pieces) {
        if (p.fc + p.length > wd.length) continue;
        const raw = wd.subarray(p.fc, p.fc + p.length);
        parts.push(p.compressed ? decodeCp1252ish(raw) : raw.toString("utf16le"));
      }
      const text = parts.join("");
      if (text.trim().length > 0) return { text, method: "piece-table" };
    }
  }

  // ---- No piece table: fall back to "scan the entire stream for printable text" ----
  //
  // This path is imprecise, but better than failing to open the file. Some .doc
  // files (especially ones generated by other software, or modified by tools after
  // download) have inaccurate FIB fields, so the piece table cannot be read.
  const fallback = scanForText(wd);
  if (fallback.trim().length > 0) return { text: fallback, method: "scan-fallback" };

  throw new Error("Unable to extract text from the WordDocument stream");
}

/** Read the piece table (stored in the Clx structure of the Table stream) */
function readPieceTable(table, fcClx, lcbClx) {
  const clx = table.subarray(fcClx, fcClx + lcbClx);
  // Clx = several Prc entries (starting with 0x01) + one Pcdt (starting with 0x02)
  let i = 0;
  while (i < clx.length && clx[i] === 0x01) {
    // Prc: 1-byte marker + 2-byte cbGrpprl + content
    const cb = clx.readUInt16LE(i + 1);
    i += 3 + cb;
  }
  if (i >= clx.length || clx[i] !== 0x02) return [];

  const lcb = clx.readUInt32LE(i + 1);
  const plc = clx.subarray(i + 5, i + 5 + lcb);
  if (plc.length < 4) return [];

  // PlcPcd: (n+1) CPs (4 bytes each) + n Pcds (8 bytes each)
  const n = Math.floor((plc.length - 4) / 12);
  if (n <= 0) return [];

  const cps = [];
  for (let k = 0; k <= n; k++) cps.push(plc.readUInt32LE(k * 4));

  const pieces = [];
  const pcdBase = (n + 1) * 4;
  for (let k = 0; k < n; k++) {
    const off = pcdBase + k * 8;
    if (off + 8 > plc.length) break;
    const fcRaw = plc.readUInt32LE(off + 2);
    const compressed = (fcRaw & 0x40000000) !== 0;   // bit30: 1 = single-byte encoding
    // When compressed, fc must be divided by 2 (the low 30 bits are a "character position"; multiply by 2 to get the byte offset)
    const fc = compressed ? (fcRaw & 0x3fffffff) / 2 : fcRaw & 0x3fffffff;
    const cpStart = cps[k];
    const cpEnd = cps[k + 1];
    const chars = cpEnd - cpStart;
    pieces.push({ fc, length: compressed ? chars : chars * 2, compressed, chars });
  }
  return pieces;
}

/**
 * Decode a "compressed" piece (single-byte encoding).
 *
 * The MS-DOC spec calls this CP1252, but **Chinese .doc files actually use a GBK-family
 * encoding** (on a Simplified Chinese Windows system, Word stores Han characters using
 * the system code page as a mix of single-byte and double-byte sequences).
 * Node's built-in TextDecoder supports gbk, so use it directly.
 * Verified in practice: decoding with latin1 yields mojibake; gbk is correct.
 */
function decodeCp1252ish(buf) {
  try {
    return new TextDecoder("gbk", { fatal: false }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

/** Fallback: scan the stream for consecutive runs of readable text (both Chinese and English) */
function scanForText(wd) {
  const chunks = [];
  // Scan as UTF-16LE
  let cur = [];
  for (let i = 0; i + 1 < wd.length; i += 2) {
    const c = wd.readUInt16LE(i);
    if (isReadableCode(c)) {
      cur.push(c);
    } else {
      if (cur.length >= 8) chunks.push(String.fromCharCode(...cur));
      cur = [];
    }
  }
  if (cur.length >= 8) chunks.push(String.fromCharCode(...cur));
  return chunks.join("\n\n");
}

function isReadableCode(c) {
  if (c === 0x0d || c === 0x0a || c === 0x09) return true;
  if (c >= 0x20 && c <= 0x7e) return true;            // ASCII
  if (c >= 0x4e00 && c <= 0x9fff) return true;        // CJK Unified Ideographs (basic block)
  if (c >= 0x3000 && c <= 0x303f) return true;        // CJK punctuation
  if (c >= 0xff00 && c <= 0xffef) return true;        // fullwidth forms
  if (c >= 0x2010 && c <= 0x203b) return true;        // general punctuation
  return false;
}

// ---------------------------------------------------------------- Public API

/**
 * Extract text from a .doc file.
 * @returns {{ok: true, text: string, method: string} | {ok: false, error: string}}
 */
function extractDocText(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // ⚠️ Only reject files that are genuinely empty.
    //    The first version used `length < 512 -> error`, reasoning that "the OLE
    //    header alone is 512 bytes", but that falsely rejected legitimate **small
    //    RTF / small plain-text** files (a few dozen bytes is perfectly normal).
    //    Format detection should look at **content signatures** (magic number, first
    //    few bytes), not at the size.
    if (buf.length < 8) return { ok: false, error: "File is empty or too small" };

    // Case 1: it is actually an OLE compound document (a real .doc)
    if (buf.subarray(0, 8).equals(OLE_MAGIC)) {
      const { streams } = readOle(buf);
      const r = extractTextFromDoc(streams);
      return { ok: true, text: cleanText(r.text), method: r.method };
    }

    // Case 2: the file is named .doc but the content is actually RTF (very common: Word saved as RTF and then renamed)
    const head = buf.subarray(0, 5).toString("latin1");
    if (head.startsWith("{\\rtf")) {
      return { ok: true, text: cleanText(rtfToText(buf.toString("latin1"))), method: "rtf" };
    }

    // Case 3: it is actually a docx (zip) renamed -- hand it to the upper layer to process as docx
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      return { ok: false, error: "__IS_DOCX__", hint: "This file is actually in .docx format (only the extension says .doc); just open it as docx" };
    }

    // Case 4: plain text renamed
    const asText = buf.toString("utf8");
    if (!asText.includes("\u0000") && /[\u4e00-\u9fff\w]/.test(asText.slice(0, 500))) {
      return { ok: true, text: cleanText(asText), method: "plaintext" };
    }

    return { ok: false, error: "Unrecognized .doc content (not an OLE compound document, nor RTF/docx/plain text)" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** RTF -> plain text (only the simplified processing needed for preview) */
function rtfToText(rtf) {
  let s = rtf;
  // Remove groups and invisible destinations
  s = s.replace(/\\\*\\[a-zA-Z]+/g, "");
  s = s.replace(/\\u(-?\d+)\s?\??/g, (_m, n) => String.fromCharCode(((Number(n) % 65536) + 65536) % 65536));
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h) => {
    try { return new TextDecoder("gbk").decode(Buffer.from([parseInt(h, 16)])); } catch { return ""; }
  });
  s = s.replace(/\\(par|line)\b/g, "\n");
  s = s.replace(/\\(tab)\b/g, "\t");
  s = s.replace(/\\[a-zA-Z]+-?\d*\s?/g, "");
  s = s.replace(/[{}]/g, "");
  return s;
}

/** Clean up: normalize newlines, collapse extra blank lines, strip Word control characters */
function cleanText(t) {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/\u000b/g, "\n")          // vertical tab = Word's manual line break
    .replace(/\u000c/g, "\n")          // page break
    .replace(/\u0007/g, "\t")          // cell separator
    .replace(/[\u0000-\u0008\u000e-\u001f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------- PPT (legacy)

/**
 * Legacy .ppt (PowerPoint 97-2003) text extraction.
 *
 * Like .doc it is an OLE compound document, but the stream layout differs:
 *   - Body text lives in the **"PowerPoint Document"** stream (note the space)
 *   - That stream is made of a sequence of **records**, each with an 8-byte header:
 *       [0..1]  recVer(4bit) + recInstance(12bit)
 *       [2..3]  recType
 *       [4..7]  recLen
 *   - Text hides in two kinds of records:
 *       TextCharsAtom (4000)  -> UTF-16LE text
 *       TextBytesAtom (4008)  -> single-byte text (usually a GBK family for Chinese)
 *   And they are **scattered across multiple Drawing/Shape containers**, so the approach is:
 *   walk the whole record chain, collect text whenever these two kinds appear, and
 *   concatenate in order of appearance.
 *
 * This loses layout, images, and animations, but **it does read the text out** --
 * which is enough for the purpose of "previewing what a course deck says".
 */
function extractTextFromPpt(streams) {
  // The stream name may carry a leading \x05 or similar, so match loosely
  let ppt = streams.get("PowerPoint Document");
  if (!ppt) {
    for (const [k, v] of streams) {
      if (/PowerPoint\s*Document/i.test(k.replace(/[\u0000-\u001f]/g, ""))) { ppt = v; break; }
    }
  }
  if (!ppt || ppt.length < 16) throw new Error("Missing PowerPoint Document stream");

  const REC_TEXT_CHARS = 4000;   // UTF-16LE
  const REC_TEXT_BYTES = 4008;   // single-byte

  const chunks = [];
  let i = 0;
  let guard = 0;

  // Linear scan: we don't strictly parse nested containers (a container header is also a record header, so a linear scan can walk through them)
  while (i + 8 <= ppt.length && guard++ < 4_000_000) {
    const verInst = ppt.readUInt16LE(i);
    const recType = ppt.readUInt16LE(i + 2);
    const recLen = ppt.readUInt32LE(i + 4);

    // Unreasonable length -> this is not a record header, move forward one byte to realign
    if (recLen > ppt.length || i + 8 + recLen > ppt.length) { i += 1; continue; }

    if (recType === REC_TEXT_CHARS) {
      const t = ppt.subarray(i + 8, i + 8 + recLen).toString("utf16le");
      if (t.trim()) chunks.push(t);
    } else if (recType === REC_TEXT_BYTES) {
      const raw = ppt.subarray(i + 8, i + 8 + recLen);
      // Single-byte records are usually ASCII or the system code page; GBK occasionally appears in Chinese course decks
      let t;
      try { t = new TextDecoder("gbk", { fatal: false }).decode(raw); }
      catch { t = raw.toString("latin1"); }
      if (t.trim()) chunks.push(t);
    }

    // A container record (recVer === 0xF) still has child records inside, so keep going inward;
    // non-containers are skipped as a whole block. We uniformly "advance 8 bytes" to guarantee
    // nested content is not missed, because child records immediately follow the container header.
    if ((verInst & 0x000f) === 0x000f) {
      i += 8;                       // enter container
    } else {
      i += 8 + recLen;              // skip the whole block
    }
  }

  // Concatenation: one record is usually one line/paragraph. Order matters; see the two
  // gotchas below.

  // ★ Insert a blank line as the basis for "approximate pagination".
  //
  //   Why: in the record stream, each slide of a .ppt is a run of continuous text with no
  //   separator between slides. Concatenating directly yields one big blob that the user
  //   cannot navigate.
  //   PowerPoint's precise page numbers live in a different structure (PersistPtr /
  //   SlideListWithText), and implementing another layer isn't worth the benefit.
  //
  //   Compromise: **insert a blank line between every pair of text records**, then collapse
  //   consecutive blank lines into one.
  //   The result is an approximate "content-segmented" page break -- the UI will **clearly
  //   label it as approximate**, so users won't think it is the original page number.
  //
  //   ⚠️ Two gotchas (both hit and verified in practice):
  //     1. The newline is `\r`, not `\n` -- we must **normalize before filtering**, otherwise
  //        the whole block becomes one line and the `^...$` master-placeholder rules fail to
  //        match (30/36 files were missed).
  //     2. The filter rules must **not include /^\s*$/ to delete blank lines** -- blank lines
  //        are the pagination signal, and deleting them collapses approximate pagination down
  //        to 1 segment, effectively deleting the feature ourselves.

  const MASTER_PLACEHOLDERS = [
    // The Chinese version has two variants: the old "单击此处…" and the new "单击以…" (both seen in practice)
    /^单击(此处|以)?编辑母版.*$/,
    /^单击(此处|以)?编辑.*样式$/,
    /^Click to edit Master.*$/i,
    /^第二级$/, /^第三级$/, /^第四级$/, /^第五级$/,
    /^[·•\-\*]\s*$/,                      // bullet placeholder in the master
  ];

  const text = chunks
    .join("\n\n")                          // <- blank line between records = pagination signal
    .replace(/\r\n?/g, "\n")               // <- must normalize newlines before filtering
    .replace(/\u000b/g, "\n")
    .replace(/[\u0000-\u0008\u000e-\u001f]/g, "")
    .split("\n")
    .filter((l) => !MASTER_PLACEHOLDERS.some((re) => re.test(l.trim())))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")            // trailing whitespace
    .replace(/\n{3,}/g, "\n\n")            // collapse consecutive blank lines into one
    .trim();

  if (!text) throw new Error("No text found in the PowerPoint Document stream (the whole file may be images)");
  return { text, chunkCount: chunks.length };
}

/** Public: extract text from a .ppt file */
function extractPptText(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 8) return { ok: false, error: "File is empty or too small" };
    if (!buf.subarray(0, 8).equals(OLE_MAGIC)) {
      // It might be a renamed pptx
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        return { ok: false, error: "__IS_PPTX__", hint: "This file is actually in .pptx format (the extension says .ppt); just open it as pptx" };
      }
      return { ok: false, error: "Not an OLE compound document, cannot be recognized as .ppt" };
    }
    const { streams } = readOle(buf);
    const r = extractTextFromPpt(streams);
    return { ok: true, text: cleanText(r.text), method: `record-stream extraction (${r.chunkCount} segments)` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  extractDocText,
  extractPptText,
  readOle,
  extractTextFromDoc,
  extractTextFromPpt,
  rtfToText,
  cleanText,
};
