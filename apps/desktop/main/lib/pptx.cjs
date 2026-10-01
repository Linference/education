// PPTX 解析 —— 主进程版
//
// ⚠️ 为什么必须在主进程解析，不能把字节传给渲染进程：
//    实测用户最大的 PPTX 是 **219 MB**。走 IPC 传 Uint8Array 时，
//    测试里用 Array.from() 展开成普通数组（2.19 亿个元素）直接把渲染进程搞崩了。
//    即便不展开，结构化克隆 219 MB 也要复制一遍、再在渲染进程里驻留一份。
//    正确做法：主进程读盘 + 解析，**只把"文字"传回去**
//    （219 MB 的课件，文字通常只有几百 KB，传输量降三个数量级）。
//
// ⚠️ 第二个坑（实测把主进程搞崩过）：
//    不要用"传文件路径、每次现读"的 zip 读取器。读 50 张幻灯片
//    就是 50 次 × 219 MB 的重复读盘与内存分配，进程直接 OOM。
//    **读盘一次，之后都从内存里的 buffer 取。**
const fs = require("node:fs");
const zlib = require("node:zlib");

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** 在内存里读 zip 的中央目录（只做一次） */
function listZipInBuffer(buf) {
  let eocd = -1;
  const minEocd = 22;
  const maxBack = Math.min(buf.length - minEocd, 0xffff);
  for (let i = 0; i <= maxBack; i++) {
    const p = buf.length - minEocd - i;
    if (p < 0) break;
    if (buf.readUInt32LE(p) === SIG_EOCD) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 zip（找不到 EOCD）");

  const entryCount = buf.readUInt16LE(eocd + 10);
  const cenOffset = buf.readUInt32LE(eocd + 16);

  const entries = new Map();
  let p = cenOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CEN) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.set(name, { name, offset: localOffset, compressedSize, size, method });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 从内存 buffer 里取出一个条目的解压后内容 */
function readEntryFromBuffer(buf, e) {
  const lp = e.offset;
  if (buf.readUInt32LE(lp) !== SIG_LOCAL) throw new Error("本地文件头签名不对");
  const nameLen = buf.readUInt16LE(lp + 26);
  const extraLen = buf.readUInt16LE(lp + 28);
  const dataStart = lp + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + e.compressedSize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`不支持的压缩方式：${e.method}`);
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function extractParagraphs(xml) {
  const lines = [];
  for (const p of xml.split(/<a:p[\s>]/)) {
    const texts = [];
    const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = re.exec(p)) !== null) {
      const t = unescapeXml(m[1]);
      if (t) texts.push(t);
    }
    const line = texts.join("").trim();
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * 解析 PPTX 文件，返回每页文字。
 *
 * @param {string} filePath
 * @returns {{ok: true, slides: Array, slideCount: number, hasNotes: boolean, ms: number} | {ok: false, error: string}}
 */
function parsePptxFile(filePath) {
  const t0 = Date.now();
  let buf = null;
  try {
    // ★ 读盘一次（219 MB 只读一次），后面所有条目都从这块内存里取
    buf = fs.readFileSync(filePath);
    const entries = listZipInBuffer(buf);
    const textOf = (name) => readEntryFromBuffer(buf, entries.get(name)).toString("utf8");

    // ---- 幻灯片顺序：不能按文件名排 ----
    // 真实顺序在 ppt/presentation.xml 的 <p:sldIdLst> 里，
    // 通过 ppt/_rels/presentation.xml.rels 映射到具体文件。
    let order = [];
    if (entries.has("ppt/presentation.xml") && entries.has("ppt/_rels/presentation.xml.rels")) {
      try {
        const presXml = textOf("ppt/presentation.xml");
        const relsXml = textOf("ppt/_rels/presentation.xml.rels");

        const map = new Map();
        const reRel = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
        let m;
        while ((m = reRel.exec(relsXml)) !== null) {
          let target = m[2];
          if (target.startsWith("/")) target = target.slice(1);
          else if (!target.startsWith("ppt/")) target = "ppt/" + target;
          map.set(m[1], target);
        }

        const reId = /<p:sldId[^>]*r:id="([^"]+)"/g;
        while ((m = reId.exec(presXml)) !== null) {
          const t = map.get(m[1]);
          if (t && entries.has(t)) order.push(t);
        }
      } catch {
        order = [];   // 落到兜底
      }
    }

    if (order.length === 0) {
      // 兜底：按文件名数字排序（顺序可能不准，但至少能读）
      order = [...entries.keys()]
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10) - parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10));
    }

    if (order.length === 0) {
      return { ok: false, error: "这个 PPTX 里没有幻灯片", ms: Date.now() - t0 };
    }

    const slides = [];
    for (let i = 0; i < order.length; i++) {
      const lines = extractParagraphs(textOf(order[i]));
      slides.push({ index: i + 1, title: lines[0] ?? `（第 ${i + 1} 页无文字）`, lines });
    }

    let hasNotes = false;
    for (const n of entries.keys()) {
      if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)) { hasNotes = true; break; }
    }

    return { ok: true, slides, slideCount: slides.length, hasNotes, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t0 };
  } finally {
    // 早点释放这块大内存（219 MB），别等着 GC
    buf = null;
  }
}

module.exports = { parsePptxFile };
