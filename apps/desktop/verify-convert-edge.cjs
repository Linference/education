// 转换的边界与防误判验证
//
// 起因：实测发现 LibreOffice 对**损坏/空的**文件常常"转换成功"：
//   · 29 字节垃圾命名为 .pptx → 退出码 0，产出 1 页 PDF（内容是乱码）
//   · 0 字节文件 → 产出 8 KB 空 PDF
// 用户看到白页会以为功能坏了。所以要主动识别这两种情况。
//
// 同时要防**误判**：真实的 pptx 被改名成 .docx 时，LibreOffice 会按内容
// 识别为 Impress —— 这时拒绝是**正确**的（内容与扩展名不符）。
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const soffice = require(path.resolve(__dirname, "main", "lib", "soffice.cjs"));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

(async () => {
  console.log("=== 转换边界与防误判验证 ===\n");

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-edge-"));
  const exe = soffice.findSoffice();
  check("找到引擎", Boolean(exe), exe ?? "没找到");

  const mk = (name, data) => {
    const p = path.join(work, name);
    fs.writeFileSync(p, data);
    return p;
  };

  // ---------- 应该被拒绝的 ----------
  console.log("── 应被拒绝的输入 ──");

  const empty = mk("空.pptx", "");
  const r1 = await soffice.convertToPdf({ exe, src: empty, workDir: work, timeoutMs: 60000 });
  check("★ 0 字节文件被拒绝（不产出空 PDF）",
    r1.ok === false && /空|没有内容/.test(r1.error ?? ""), String(r1.error ?? "").slice(0, 70));

  const tiny = mk("太短.pptx", "abc");
  const r2 = await soffice.convertToPdf({ exe, src: tiny, workDir: work, timeoutMs: 60000 });
  check("★ 3 字节文件被拒绝", r2.ok === false, String(r2.error ?? "").slice(0, 70));

  // ⚠️ 垃圾内容要**足够长**才能测到"文档类型识别"那条路径。
  //    第一次用了 56 字节的短字符串，被 64 字节阈值拦下，
  //    走的是体积检查 —— 断言写的是"识别为"，于是假失败。
  //    这里用一个 2 KB 的纯文本，确保通过体积检查、进到类型识别。
  const garbageText = "这不是一个真实的 pptx 文件。".repeat(120);
  const garbage = mk("垃圾.pptx", garbageText);
  check("测试数据已超过体积阈值（确保测的是类型识别）",
    fs.statSync(garbage).size > 64, `${fs.statSync(garbage).size} 字节`);
  const r3 = await soffice.convertToPdf({ exe, src: garbage, workDir: work, timeoutMs: 60000 });
  check("★ 垃圾内容被拒绝（靠文档类型识别，不是靠体积）",
    r3.ok === false && /损坏|识别为/.test(r3.error ?? ""), String(r3.error ?? "").slice(0, 90));

  const notFound = path.join(work, "不存在.pptx");
  const r4 = await soffice.convertToPdf({ exe, src: notFound, workDir: work });
  check("不存在的文件被拒绝", r4.ok === false && /不存在/.test(r4.error ?? ""), String(r4.error ?? "").slice(0, 60));

  const wrongExt = mk("脚本.cjs", "console.log(1)");
  const r5 = await soffice.convertToPdf({ exe, src: wrongExt, workDir: work });
  check("不支持的扩展名被拒绝", r5.ok === false && /不负责转换/.test(r5.error ?? ""), String(r5.error ?? "").slice(0, 60));

  // ---------- 应该成功的（防误判）----------
  console.log("\n── 应正常转换的输入 ──");
  const real = "D:\\Users\\LINKIT\\Desktop\\csp\\4.数据排序.pptx";
  if (fs.existsSync(real)) {
    const r = await soffice.convertToPdf({ exe, src: real, workDir: work, timeoutMs: 180000 });
    check("★ 真实 .pptx 正常转换（没被误判为损坏）", r.ok,
      r.ok ? `${(fs.statSync(r.pdf).size / 1024).toFixed(0)} KB` : String(r.error));

    // 改名成 .docx —— LibreOffice 会按内容识别，与扩展名不符 → 应拒绝
    const renamed = path.join(work, "改名成docx.docx");
    fs.copyFileSync(real, renamed);
    const r2b = await soffice.convertToPdf({ exe, src: renamed, workDir: work, timeoutMs: 180000 });
    check("★ 扩展名与内容不符时拒绝（并说明原因）",
      r2b.ok === false && /识别为/.test(r2b.error ?? ""), String(r2b.error ?? "").slice(0, 90));
  } else {
    console.log("  （跳过：找不到真实 pptx 样本）");
  }

  // ---------- 其他真实格式仍正常 ----------
  console.log("\n── 其他格式回归 ──");
  // ⚠️ 这里曾经写成"在 for 循环里往正在遍历的数组 push"，
  //    结果无限循环、测试跑了 10 分钟还没结束。
  //    先把样本收集完，再单独遍历。
  const otherSamples = [
    ["D:\\Users\\LINKIT\\Desktop\\物理竞赛\\历屆賽題\\全國物理競賽題集\\高中物理竞赛-热学部分.ppt", ".ppt"],
  ];
  const findDoc = (() => {
    const out = {};
    const walk = (d, dep) => {
      if (dep > 3) return;
      let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { walk(p, dep + 1); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if ((ext === ".docx" || ext === ".xlsx") && !out[ext]) {
          try { if (fs.statSync(p).size > 10 * 1024) out[ext] = p; } catch { /* 忽略 */ }
        }
      }
    };
    walk("D:\\Users\\LINKIT\\Desktop", 0);
    return out;
  })();
  if (findDoc[".docx"]) otherSamples.push([findDoc[".docx"], ".docx"]);
  if (findDoc[".xlsx"]) otherSamples.push([findDoc[".xlsx"], ".xlsx"]);

  for (const [p, ext] of otherSamples.slice(0, 3)) {
    if (!fs.existsSync(p)) continue;
    const r = await soffice.convertToPdf({ exe, src: p, workDir: work, timeoutMs: 180000 });
    check(`真实 ${ext} 仍能转换（没被新校验误伤）`, r.ok,
      r.ok ? `${(r.ms / 1000).toFixed(1)}s` : String(r.error ?? "").slice(0, 70));
  }

  fs.rmSync(work, { recursive: true, force: true });

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
  for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
  process.exit(passed === results.length ? 0 : 1);
})();
