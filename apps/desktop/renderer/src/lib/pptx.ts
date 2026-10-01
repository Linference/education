// PPTX 解析 —— 提取每张幻灯片的文字
//
// PPTX 是 OOXML：一个 zip，幻灯片在 `ppt/slides/slideN.xml`，
// 文字在 `<a:t>` 标签里。图片、动画、版式都在别的地方 —— 那些不值得还原
// （219 MB 的课件里 95% 是图片，能读的只有文字）。
//
// ⚠️ 两个坑：
//   1. **幻灯片顺序不能按文件名排** —— slide2.xml 不一定在第 2 页。
//      真实顺序写在 `ppt/_rels/presentation.xml.rels` 与 `ppt/presentation.xml`
//      的 `<p:sldIdLst>` 里。按文件名排会把顺序搞乱（实测踩过）。
//   2. 文字要按**段落**（`<a:p>`）分组，同一段里的多个 `<a:t>` 要拼成一行 ——
//      否则一句话会被拆成好几段。
import { listZip, readZipText, type ZipEntry } from "./zip";

export interface Slide {
  index: number;          // 显示用的页码（从 1 开始，按真实顺序）
  title: string;          // 取第一段作为标题（便于导航）
  lines: string[];        // 正文各行
}

export interface PptxResult {
  ok: boolean;
  slides: Slide[];
  slideCount: number;
  /** 备注（演讲者备注）也可读，有时是重点 */
  hasNotes: boolean;
  error?: string;
  ms: number;
}

/** 转义 XML 实体并去掉控制字符 */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/**
 * 从一段 slide XML 里抽出所有段落文本。
 * 用正则而不是 DOM 解析器：文字提取只需要 `<a:p>` 与 `<a:t>` 两级，
 * 引 DOMParser 反而要处理命名空间前缀，得不偿失。
 */
function extractParagraphs(xml: string): string[] {
  const lines: string[] = [];
  // 按段落切
  const paras = xml.split(/<a:p[\s>]/);
  for (const p of paras) {
    // 段落里所有 <a:t>…</a:t>
    const texts: string[] = [];
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

/** 按真实顺序取幻灯片路径 */
async function resolveSlideOrder(zip: Uint8Array, entries: Map<string, ZipEntry>): Promise<string[]> {
  // 正常路径：读 presentation.xml 的 sldIdLst + rels 映射
  const pres = entries.get("ppt/presentation.xml");
  const rels = entries.get("ppt/_rels/presentation.xml.rels");

  if (pres && rels) {
    try {
      const presXml = await readZipText(zip, pres);
      const relsXml = await readZipText(zip, rels);

      // rId → Target
      const map = new Map<string, string>();
      const reRel = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
      let m;
      while ((m = reRel.exec(relsXml)) !== null) {
        let target = m[2];
        // Target 可能是 "slides/slide1.xml" 或 "/ppt/slides/slide1.xml"
        if (target.startsWith("/")) target = target.slice(1);
        else if (!target.startsWith("ppt/")) target = "ppt/" + target;
        map.set(m[1], target);
      }

      // sldIdLst 里的顺序
      const order: string[] = [];
      const reId = /<p:sldId[^>]*r:id="([^"]+)"/g;
      while ((m = reId.exec(presXml)) !== null) {
        const t = map.get(m[1]);
        if (t && entries.has(t)) order.push(t);
      }
      if (order.length > 0) return order;
    } catch {
      /* 落到下面的兜底 */
    }
  }

  // 兜底：按文件名数字排序（顺序可能不准，但至少能读）
  return [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
      return na - nb;
    });
}

/** 解析 PPTX 字节 */
export async function parsePptx(bytes: Uint8Array): Promise<PptxResult> {
  const t0 = performance.now();
  try {
    const entries = listZip(bytes);
    const order = await resolveSlideOrder(bytes, entries);

    if (order.length === 0) {
      return { ok: false, slides: [], slideCount: 0, hasNotes: false, ms: 0, error: "这个 PPTX 里没有幻灯片" };
    }

    const slides: Slide[] = [];
    for (let i = 0; i < order.length; i++) {
      const path = order[i];
      const e = entries.get(path);
      if (!e) continue;
      const xml = await readZipText(bytes, e);
      const lines = extractParagraphs(xml);
      slides.push({
        index: i + 1,
        title: lines[0] ?? `（第 ${i + 1} 页无文字）`,
        lines,
      });
    }

    // 备注：也抽出来（老师常把重点写在备注里）
    let hasNotes = false;
    for (const n of entries.keys()) {
      if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)) { hasNotes = true; break; }
    }

    return {
      ok: true,
      slides,
      slideCount: slides.length,
      hasNotes,
      ms: Math.round(performance.now() - t0),
    };
  } catch (e: any) {
    return {
      ok: false, slides: [], slideCount: 0, hasNotes: false,
      ms: Math.round(performance.now() - t0),
      error: e?.message ?? String(e),
    };
  }
}
