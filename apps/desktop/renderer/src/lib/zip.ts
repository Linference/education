// ZIP reading — renderer version
//
// Why the renderer also needs a copy: PPTX / XLSX are zip+XML. **Parsing directly in the renderer**
// avoids copying 219 MB of file bytes over IPC to the main process and back (one big copy wastes memory).
// .doc is different: it is OLE binary and needs Node's Buffer operations, so it lives in the main process.
//
// This is the same logic as scripts/lib/zip-read.cjs, in two runtime versions —
// that one is for Node scripts, this one for the browser. Both only "read", and the logic is short,
// so duplicating it costs less than adding build-time sharing complexity.
//
// Only **reading a specific entry** is implemented; no streaming, no writing.

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

/** List all entries in the zip */
export function listZip(buf: Uint8Array): Map<string, ZipEntry> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Search for EOCD from the end (up to 64KB of trailing comment possible)
  let eocd = -1;
  const maxBack = Math.min(buf.length - 22, 0xffff);
  for (let i = 0; i <= maxBack; i++) {
    const p = buf.length - 22 - i;
    if (p < 0) break;
    if (dv.getUint32(p, true) === SIG_EOCD) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error("Not a valid zip (EOCD not found)");

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
 * Read the raw (possibly compressed) data of an entry.
 *
 * Returns `{ raw, method }` instead of decompressing directly — decompression uses
 * DecompressionStream('deflate-raw'), which is asynchronous.
 */
export function readZipRaw(buf: Uint8Array, entry: ZipEntry): { raw: Uint8Array; method: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const lp = entry.offset;
  if (dv.getUint32(lp, true) !== SIG_LOCAL) throw new Error("Invalid local file header signature");
  const nameLen = dv.getUint16(lp + 26, true);
  const extraLen = dv.getUint16(lp + 28, true);
  const dataStart = lp + 30 + nameLen + extraLen;
  return { raw: buf.subarray(dataStart, dataStart + entry.compressedSize), method: entry.method };
}

/** Decompress (supports stored and deflate) */
export async function inflate(raw: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return raw;
  if (method !== 8) throw new Error(`Unsupported compression method: ${method}`);

  // DecompressionStream is built into modern browsers; Electron's Chromium always has it
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/** All in one: read an entry and decompress it to text */
export async function readZipText(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const { raw, method } = readZipRaw(buf, entry);
  const data = await inflate(raw, method);
  return new TextDecoder("utf-8").decode(data);
}
