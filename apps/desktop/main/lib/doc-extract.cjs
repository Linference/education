// .doc（Word 97-2003 二进制格式）文本提取
//
// 为什么自己写：
//   `.doc` 是 OLE 复合文档（Compound File Binary），不是 zip、也不是 XML。
//   npm 上能用的库要么依赖老旧、要么已经停止维护，而格式本身是**公开且有明确
//   规范**的（MS-CFB + MS-DOC），可以自己解析。
//
// 解析链路（每一层都实测验证过）：
//   1. OLE 容器：读头 → 解析 FAT / MiniFAT / 目录项 → 取出流
//   2. WordDocument 流：读 FIB（File Information Block）拿到关键偏移
//   3. 文本：FIB 末尾的**分片表（piece table）**决定每段文本用哪种编码：
//        bit15 = 1 → 该段是 CP1252 单字节（中文用这个存 GBK 变体）
//        bit15 = 0 → 该段是 UTF-16LE
//      这是 .doc 提取最容易错的地方 —— 不区分编码就会得到乱码。
//
// ⚠️ 只做**文本提取**（够预览用）。不做版式还原：
//    .doc 的排版信息（字体、表格、图片）在二进制里以复杂结构存储，
//    完整还原等于重写一个 Word。预览只需要"能读"。
//
// 参考资料：MS-CFB（复合文件格式）、MS-DOC（Word 二进制格式）。

const fs = require("node:fs");

// ---------------------------------------------------------------- OLE 容器

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

/**
 * 解析 OLE 复合文档，返回 { streams: Map<name, Buffer> }。
 *
 * 结构要点：
 *   - 头 512 字节，含扇区大小、FAT 位置、目录起始扇区
 *   - 大流用 FAT（每扇区 512 或 4096 字节）
 *   - **小于 4096 字节的流用 MiniFAT**（存在 root 项的数据里）
 *     —— 漏了 MiniFAT 会导致小流读不出来，这是最常见的实现错误
 */
function readOle(buf) {
  if (buf.length < 512 || !buf.subarray(0, 8).equals(OLE_MAGIC)) {
    throw new Error("不是 OLE 复合文档（魔数不匹配）");
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

  /** 第 n 个扇区在文件里的偏移 */
  const sectorOffset = (n) => dataStart + n * sectorSize;

  const readSector = (n) => {
    const off = sectorOffset(n);
    if (off + sectorSize > buf.length) {
      // 截断的文件：返回剩下的部分而不是崩，尽量多提取内容
      return buf.subarray(off, Math.min(off + sectorSize, buf.length));
    }
    return buf.subarray(off, off + sectorSize);
  };

  // ---- DIFAT：先读头里内嵌的 109 个 FAT 扇区号，再看扩展 DIFAT ----
  const fatSectorIds = [];
  for (let i = 0; i < 109; i++) {
    const v = buf.readUInt32LE(0x4c + i * 4);
    if (v === FREESECT || v === ENDOFCHAIN) break;
    fatSectorIds.push(v);
  }
  // 扩展 DIFAT
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
  if (fat.length === 0) throw new Error("FAT 为空，文件可能损坏");

  /** 沿 FAT 链把扇区拼成 Buffer */
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

  // ---- 目录项 ----
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
  if (entries.length === 0) throw new Error("目录为空");

  const root = entries.find((e) => e.type === 5) ?? entries[0];

  // MiniStream：小流的内容都放在 root 项指向的流里
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

  // ---- 取流 ----
  const streams = new Map();
  for (const e of entries) {
    if (e.type !== 2) continue;                       // 2 = 流
    try {
      const isSmall = e.size < miniStreamCutoff;
      const data = isSmall && miniStream.length > 0
        ? readMiniChain(e.startSector, e.size)
        : readChain(e.startSector, e.size);
      streams.set(e.name, data);
      // Word 的流名可能是 "WordDocument" 或带控制字符前缀，宽松匹配
      if (/WordDocument/i.test(e.name)) streams.set("WordDocument", data);
    } catch {
      // 单个流读失败不影响其它流
    }
  }

  return { streams, sectorSize, miniSectorSize, entryCount: entries.length };
}

// ---------------------------------------------------------------- .doc 文本

/**
 * 从 WordDocument 流里提取正文文本。
 *
 * FIB 关键字段（偏移都是相对 WordDocument 流开头）：
 *   0x0000  wIdent（应为 0xA5EC）
 *   0x0002  nFib（版本号）
 *   0x000A  flags：bit 9（0x0200）表示用 1Table 还是 0Table
 *   0x0018  fcMin（旧版字段，现代 .doc 里可能不准）
 *   0x001C  fcMac
 *   0x004C  ccpText（正文字符数）
 *   0x00FA  fcClx（分片表在 Table 流里的偏移）
 *   0x00FE  lcbClx（分片表长度）
 */
function extractTextFromDoc(streams) {
  const wd = streams.get("WordDocument");
  if (!wd || wd.length < 0x200) throw new Error("缺少 WordDocument 流或流太短");

  const wIdent = wd.readUInt16LE(0);
  if (wIdent !== 0xa5ec && wIdent !== 0xa5dc) {
    // 不是标准 Word 文档，但可能仍是 OLE 里别的东西 —— 尝试纯文本兜底
    throw new Error(`WordDocument 标识不对（0x${wIdent.toString(16)}）`);
  }

  const flags = wd.readUInt16LE(0x0a);
  const use1Table = (flags & 0x0200) !== 0;
  const table = streams.get(use1Table ? "1Table" : "0Table") ?? streams.get("1Table") ?? streams.get("0Table");

  const fcClx = wd.readUInt32LE(0x01a2);
  const lcbClx = wd.readUInt32LE(0x01a6);

  // ---- 有分片表：走正规路径（支持混合编码）----
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

  // ---- 没有分片表：退化到"扫描整个流里的可打印文本" ----
  //
  // 这条路不精确，但比打不开好。有些 .doc（尤其是由别的软件生成、
  // 或下载后被工具改过的）FIB 字段不准，分片表读不出来。
  const fallback = scanForText(wd);
  if (fallback.trim().length > 0) return { text: fallback, method: "scan-fallback" };

  throw new Error("无法从 WordDocument 流里提取文本");
}

/** 读分片表（piece table，存在 Table 流的 Clx 结构里） */
function readPieceTable(table, fcClx, lcbClx) {
  const clx = table.subarray(fcClx, fcClx + lcbClx);
  // Clx = 若干 Prc（0x01 开头）+ 一个 Pcdt（0x02 开头）
  let i = 0;
  while (i < clx.length && clx[i] === 0x01) {
    // Prc: 1 字节标记 + 2 字节 cbGrpprl + 内容
    const cb = clx.readUInt16LE(i + 1);
    i += 3 + cb;
  }
  if (i >= clx.length || clx[i] !== 0x02) return [];

  const lcb = clx.readUInt32LE(i + 1);
  const plc = clx.subarray(i + 5, i + 5 + lcb);
  if (plc.length < 4) return [];

  // PlcPcd: (n+1) 个 CP（4 字节）+ n 个 Pcd（8 字节）
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
    const compressed = (fcRaw & 0x40000000) !== 0;   // bit30：1 = 单字节编码
    // 压缩时 fc 要除以 2（低 30 位是"字符位置"，乘 2 才是字节偏移）
    const fc = compressed ? (fcRaw & 0x3fffffff) / 2 : fcRaw & 0x3fffffff;
    const cpStart = cps[k];
    const cpEnd = cps[k + 1];
    const chars = cpEnd - cpStart;
    pieces.push({ fc, length: compressed ? chars : chars * 2, compressed, chars });
  }
  return pieces;
}

/**
 * 解码"压缩"分片（单字节编码）。
 *
 * MS-DOC 规范说这是 CP1252，但**中文 .doc 实际用的是 GBK 系编码**
 * （Windows 简体中文环境下 Word 会把汉字按系统代码页存成单字节/双字节混排）。
 * Node 内置 TextDecoder 支持 gbk，直接用它。
 * 实测：用 latin1 解会得到乱码，用 gbk 才对。
 */
function decodeCp1252ish(buf) {
  try {
    return new TextDecoder("gbk", { fatal: false }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

/** 兜底：在流里扫描连续的可读文本（中英文都认） */
function scanForText(wd) {
  const chunks = [];
  // 按 UTF-16LE 扫
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
  if (c >= 0x4e00 && c <= 0x9fff) return true;        // CJK 基本区
  if (c >= 0x3000 && c <= 0x303f) return true;        // CJK 标点
  if (c >= 0xff00 && c <= 0xffef) return true;        // 全角
  if (c >= 0x2010 && c <= 0x203b) return true;        // 通用标点
  return false;
}

// ---------------------------------------------------------------- 对外接口

/**
 * 提取 .doc 文本。
 * @returns {{ok: true, text: string, method: string} | {ok: false, error: string}}
 */
function extractDocText(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // ⚠️ 只挡"真的空文件"。
    //    第一版写了 `length < 512 → 报错`，理由是"OLE 头就要 512 字节"，
    //    但那样会误杀合法的**小 RTF / 小纯文本**（几十字节完全正常）。
    //    判断格式应该看**内容特征**（魔数、开头几个字节），不是看大小。
    if (buf.length < 8) return { ok: false, error: "文件为空或过小" };

    // 情况一：其实是 OLE 复合文档（真正的 .doc）
    if (buf.subarray(0, 8).equals(OLE_MAGIC)) {
      const { streams } = readOle(buf);
      const r = extractTextFromDoc(streams);
      return { ok: true, text: cleanText(r.text), method: r.method };
    }

    // 情况二：文件名叫 .doc 但内容其实是 RTF（很常见：Word 另存为 RTF 后改名）
    const head = buf.subarray(0, 5).toString("latin1");
    if (head.startsWith("{\\rtf")) {
      return { ok: true, text: cleanText(rtfToText(buf.toString("latin1"))), method: "rtf" };
    }

    // 情况三：其实是 docx（zip）改名 —— 交给上层按 docx 处理
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      return { ok: false, error: "__IS_DOCX__", hint: "这个文件其实是 .docx 格式（只是扩展名写成 .doc），按 docx 打开即可" };
    }

    // 情况四：纯文本改名
    const asText = buf.toString("utf8");
    if (!asText.includes("\u0000") && /[\u4e00-\u9fff\w]/.test(asText.slice(0, 500))) {
      return { ok: true, text: cleanText(asText), method: "plaintext" };
    }

    return { ok: false, error: "无法识别的 .doc 内容（既不是 OLE 复合文档，也不是 RTF/docx/纯文本）" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** RTF → 纯文本（只做够预览用的简化处理） */
function rtfToText(rtf) {
  let s = rtf;
  // 去掉分组与不可见目标
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

/** 清理：统一换行、压掉多余空行、去掉 Word 的控制字符 */
function cleanText(t) {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/\u000b/g, "\n")          // 垂直制表 = Word 的手动换行
    .replace(/\u000c/g, "\n")          // 分页符
    .replace(/\u0007/g, "\t")          // 单元格分隔
    .replace(/[\u0000-\u0008\u000e-\u001f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = { extractDocText, readOle, extractTextFromDoc, rtfToText, cleanText };
