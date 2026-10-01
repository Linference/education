// ZIP 读取 —— 渲染进程版
//
// 为什么渲染进程也要一份：PPTX / XLSX 都是 zip+XML。**在渲染进程里直接解析**，
// 就不用把 219 MB 的文件字节通过 IPC 拷到主进程再拷回来（一次大拷贝白费内存）。
// .doc 不同：它是 OLE 二进制，需要 Node 的 Buffer 操作，所以放主进程。
//
// 与 scripts/lib/zip-read.cjs 是同一套逻辑的两种运行时版本 ——
// 那个给 Node 脚本用，这个给浏览器用。两边都只做"读取"，逻辑很短，
// 重复的代价小于引入构建期共享的复杂度。
//
// 只实现**读取指定条目**，不做流式、不做写。

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface ZipEntry {
  name: string;
  offset: number;
  compressedSize: number;
  size: number;
  method: number;
}

/** 列出 zip 内所有条目 */
export function listZip(buf: Uint8Array): Map<string, ZipEntry> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // 从尾部找 EOCD（末尾可能有最多 64KB 注释）
  let eocd = -1;
  const maxBack = Math.min(buf.length - 22, 0xffff);
  for (let i = 0; i <= maxBack; i++) {
    const p = buf.length - 22 - i;
    if (p < 0) break;
    if (dv.getUint32(p, true) === SIG_EOCD) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 zip（找不到 EOCD）");

  const entryCount = dv.getUint16(eocd + 10, true);
  const cenOffset = dv.getUint32(eocd + 16, true);

  const entries = new Map<string, ZipEntry>();
  const dec = new TextDecoder("utf-8");
  let p = cenOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== SIG_CEN) break;
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { name, offset: localOffset, compressedSize, size, method });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * 读出某个条目的原始（可能压缩）数据。
 *
 * 返回 `{ raw, method }` 而不是直接解压 —— 因为解压要用
 * DecompressionStream('deflate-raw')，它是异步的。
 */
export function readZipRaw(buf: Uint8Array, entry: ZipEntry): { raw: Uint8Array; method: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const lp = entry.offset;
  if (dv.getUint32(lp, true) !== SIG_LOCAL) throw new Error("本地文件头签名不对");
  const nameLen = dv.getUint16(lp + 26, true);
  const extraLen = dv.getUint16(lp + 28, true);
  const dataStart = lp + 30 + nameLen + extraLen;
  return { raw: buf.subarray(dataStart, dataStart + entry.compressedSize), method: entry.method };
}

/** 解压（支持直存与 deflate） */
export async function inflate(raw: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return raw;
  if (method !== 8) throw new Error(`不支持的压缩方式：${method}`);

  // DecompressionStream 是现代浏览器内置的，Electron 的 Chromium 一定有
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/** 一步到位：读条目并解压成文本 */
export async function readZipText(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const { raw, method } = readZipRaw(buf, entry);
  const data = await inflate(raw, method);
  return new TextDecoder("utf-8").decode(data);
}
