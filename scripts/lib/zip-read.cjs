// 极简 ZIP 读取器 —— 只为验证导出产物用
//
// 为什么自己写：验证 docx 不该反过来依赖 Python 或 PowerShell
// （Expand-Archive 还只认 .zip 扩展名，.docx 直接拒绝）。
// docx 就是 zip，读出条目的中央目录即可，几十行的事。
//
// 只实现**读取**，而且只实现"按名字取一个条目"这一个用途。
const fs = require("node:fs");
const zlib = require("node:zlib");

const SIG_EOCD = 0x06054b50;        // End of Central Directory
const SIG_CEN = 0x02014b50;         // Central Directory Entry
const SIG_LOCAL = 0x04034b50;       // Local File Header

/**
 * 列出 zip 里的所有条目名。
 * @param {string} filePath
 * @returns {Map<string, {offset:number, compressedSize:number, size:number, method:number}>}
 */
function listZip(filePath) {
  const buf = fs.readFileSync(filePath);

  // ---- 从尾部找 EOCD ----
  let eocd = -1;
  const minEocd = 22;
  const maxComment = 0xffff;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - maxComment); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 zip（找不到 EOCD）");

  const entryCount = buf.readUInt16LE(eocd + 10);
  const cenOffset = buf.readUInt32LE(eocd + 16);

  // ---- 遍历中央目录 ----
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
    entries.set(name, { offset: localOffset, compressedSize, size, method });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * 读出某个条目的内容（自动解压 deflate 或直存）。
 * @returns {Buffer}
 */
function readZipEntry(filePath, name) {
  const buf = fs.readFileSync(filePath);
  const entries = listZip(filePath);
  const e = entries.get(name);
  if (!e) throw new Error(`zip 里没有条目：${name}`);

  // 本地头长度可能和中央目录里的 extra 长度不同，必须重新读本地头
  const lp = e.offset;
  if (buf.readUInt32LE(lp) !== SIG_LOCAL) throw new Error("本地文件头签名不对");
  const nameLen = buf.readUInt16LE(lp + 26);
  const extraLen = buf.readUInt16LE(lp + 28);
  const dataStart = lp + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + e.compressedSize);

  if (e.method === 0) return Buffer.from(raw);                      // 直存
  if (e.method === 8) return zlib.inflateRawSync(raw);              // deflate
  throw new Error(`不支持的压缩方式：${e.method}`);
}

/** 读出某个条目并当 UTF-8 文本返回 */
function readZipText(filePath, name) {
  return readZipEntry(filePath, name).toString("utf8");
}

module.exports = { listZip, readZipEntry, readZipText };
