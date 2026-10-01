// XLSX / ODS 表格读取（纯 JS，主进程解析）
//
// ★ 为什么不做"转 PDF"：
//   表格数据要的是**排序、筛选、看单元格**。转 PDF 出来只是一张静态图，
//   用户既不能选中也不能排序 —— 那是把表格当图片处理，方向就错了。
//   （这条是用户直接指出的：把 csv/xlsx 都转 PDF 是错的。）
//
// ★ 为什么 CSV 不走这里：
//   CSV 是纯文本，渲染进程直接读就行（已有虚拟滚动查看器）。
//   这里只处理 **zip + XML** 的电子表格格式。
//
// 返回结构刻意做得"扁平"：只回传**用到的区域**（去掉尾部空行空列），
// 因为 219 MB 级别的表格全量回传会把渲染进程拖死。
const fs = require("node:fs");
const path = require("node:path");
// ⚠️ buffer 版的 zip 读取实现在 pptx.cjs 里（不是 zip-read.cjs ——
//    那个导出的是 listZip/readZipEntry/readZipText，签名不一样）。
//    这里复用同一份实现，避免两套 zip 解析逻辑各自出 bug。
const { listZipInBuffer, readEntryFromBuffer } = require("./pptx.cjs");

/** 单表最多回传多少行（超过的部分标记为截断，而不是静默丢弃） */
const MAX_ROWS = 20000;
/** 单表最多回传多少列 */
const MAX_COLS = 200;

/**
 * 把 A1 形式或 R1C1 形式的坐标转成 0 基索引。
 * xlsx 的单元格引用形如 A1 / AA10 / $C$3。
 */
function parseRef(ref) {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(ref).replace(/\s/g, ""));
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

/** XML 里最常用的实体还原（表格内容里 &amp; &lt; 之类不少见） */
function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** 取一段 XML 里所有 <t>…</t>（共享字符串项可能被拆成多段 run） */
function textOf(xml) {
  let out = "";
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out += unescapeXml(m[1]);
  return out;
}

/** 解析 sharedStrings.xml：索引 → 文本 */
function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(textOf(m[1]));
  return out;
}

/**
 * 解析一张工作表。
 *
 * 只做必要的事：拿每个单元格的值与类型。
 * 不处理样式（颜色、字体、合并单元格）—— 那是"看数据"之外的诉求，
 * 真要看版式应该用 LibreOffice 转 PDF，而不是在这里做半套。
 */
function parseSheet(xml, shared) {
  const cells = new Map();   // "r,c" → { v, t, f }
  let maxRow = -1;
  let maxCol = -1;

  // 逐个单元格扫。行/列有 r 属性就按它定位，没有就顺序推。
  const rowRe = /<row([^>]*)>([\s\S]*?)<\/row>/g;
  let rm;
  let autoRow = 0;

  while ((rm = rowRe.exec(xml)) !== null) {
    const rowAttrs = rm[1];
    const rowBody = rm[2];
    const rowNum = /r="(\d+)"/.exec(rowAttrs);
    const r = rowNum ? Number(rowNum[1]) - 1 : autoRow;
    autoRow = r + 1;

    const cellRe = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    let autoCol = 0;

    while ((cm = cellRe.exec(rowBody)) !== null) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const refM = /r="([A-Z]+\d+)"/.exec(attrs);
      let c;
      if (refM) {
        const p = parseRef(refM[1]);
        c = p ? p.col : autoCol;
      } else {
        c = autoCol;
      }
      autoCol = c + 1;

      const typeM = /t="([^"]+)"/.exec(attrs);
      const type = typeM ? typeM[1] : "n";

      let value = "";
      if (type === "s") {
        // 共享字符串：<v>索引</v>
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        const idx = vm ? Number(vm[1]) : -1;
        value = Number.isInteger(idx) && shared[idx] !== undefined ? shared[idx] : "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else if (type === "str") {
        // 公式的字符串结果
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        value = vm ? unescapeXml(vm[1]) : "";
      } else if (type === "b") {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        value = vm && vm[1] === "1" ? "TRUE" : "FALSE";
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        value = vm ? unescapeXml(vm[1]) : "";
      }

      const fm = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body);
      if (value !== "" || fm) {
        cells.set(`${r},${c}`, { v: value, f: fm ? unescapeXml(fm[1]) : undefined });
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;
      }
    }
  }

  // 铺成二维数组，只覆盖用到的区域
  const rows = [];
  const rowLimit = Math.min(maxRow + 1, MAX_ROWS);
  const colLimit = Math.min(maxCol + 1, MAX_COLS);
  for (let r = 0; r < rowLimit; r++) {
    const row = new Array(colLimit).fill("");
    for (let c = 0; c < colLimit; c++) {
      const cell = cells.get(`${r},${c}`);
      if (cell) row[c] = cell.v;
    }
    rows.push(row);
  }

  return {
    rows,
    rowCount: maxRow + 1,
    colCount: maxCol + 1,
    truncatedRows: maxRow + 1 > MAX_ROWS,
    truncatedCols: maxCol + 1 > MAX_COLS,
  };
}

/** 从 workbook.xml + rels 里拿工作表名字与顺序 */
function parseWorkbook(xml, relsXml) {
  const relTarget = new Map();
  if (relsXml) {
    const re = /<Relationship([^>]*)\/>/g;
    let m;
    while ((m = re.exec(relsXml)) !== null) {
      const attrs = m[1];
      const id = /Id="([^"]+)"/.exec(attrs);
      const target = /Target="([^"]+)"/.exec(attrs);
      if (id && target) relTarget.set(id[1], target[1]);
    }
  }

  const sheets = [];
  const re = /<sheet([^>]*)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const name = /name="([^"]*)"/.exec(attrs);
    const rid = /r:id="([^"]+)"/.exec(attrs);
    const target = rid ? relTarget.get(rid[1]) : null;
    sheets.push({
      name: name ? unescapeXml(name[1]) : `Sheet${sheets.length + 1}`,
      target: target ?? null,
    });
  }
  return sheets;
}

/**
 * 读取一个电子表格文件。
 *
 * @param {string} filePath
 * @returns {{ok:boolean, sheets?:Array<{name:string,rows:string[][],rowCount:number,colCount:number}>, ms?:number, error?:string}}
 */
function parseSheetFile(filePath) {
  const t0 = Date.now();
  try {
    const st = fs.statSync(filePath);
    if (st.isDirectory()) return { ok: false, error: "这是一个目录" };
    // 整个文件读一次进内存；下面所有 entry 都从这份 buffer 取，
    // 避免逐个 entry 重读文件（219 MB 的表格重读几十次会直接 OOM）
    const buf = fs.readFileSync(filePath);

    const entries = listZipInBuffer(buf);

    const readEntry = (name) => {
      const e = entries.get(name);
      if (!e) return null;
      try { return readEntryFromBuffer(buf, e).toString("utf8"); } catch { return null; }
    };

    // 共享字符串
    const shared = parseSharedStrings(readEntry("xl/sharedStrings.xml"));

    // 工作表清单
    const workbookXml = readEntry("xl/workbook.xml");
    if (!workbookXml) {
      return { ok: false, error: "这不是一个有效的 Excel 文件（找不到 xl/workbook.xml）" };
    }
    const relsXml = readEntry("xl/_rels/workbook.xml.rels");
    const sheetList = parseWorkbook(workbookXml, relsXml);

    if (!sheetList.length) return { ok: false, error: "这个工作簿里没有工作表" };

    const sheets = [];
    for (const s of sheetList) {
      // rels 里的 Target 可能是 "worksheets/sheet1.xml"，也可能是绝对路径
      let target = s.target;
      if (!target) target = `worksheets/sheet${sheets.length + 1}.xml`;
      if (target.startsWith("/")) target = target.slice(1);
      const full = target.startsWith("xl/") ? target : `xl/${target}`;

      const xml = readEntry(full);
      if (!xml) {
        sheets.push({ name: s.name, rows: [], rowCount: 0, colCount: 0, error: `找不到 ${full}` });
        continue;
      }
      const parsed = parseSheet(xml, shared);
      sheets.push({ name: s.name, ...parsed });
      // 只解析前 8 张表（再多也没人会一页页看，而且很占内存）
      if (sheets.length >= 8) break;
    }

    return {
      ok: true,
      sheets,
      sheetCount: sheetList.length,
      name: path.basename(filePath),
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

module.exports = { parseSheetFile, parseRef, parseSheet, parseSharedStrings, MAX_ROWS, MAX_COLS };
