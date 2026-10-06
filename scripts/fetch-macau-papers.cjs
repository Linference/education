// 下载澳门四校联考历年试题（教育及青年发展局官方源）
//
// ★ 只下载**已确认存在**的官方 PDF。做法上刻意保守：
//   · 先 HEAD 确认存在与大小，再 GET 正文
//   · 请求之间留间隔（不把人家服务器打爆）
//   · 记录来源 URL 与校验和，便于日后核对（题库里每个文件都要能溯源）
//
// ★ 为什么不做"全站爬取"：
//   1) 官方并没有一个可枚举的历年归档（实测 2019 目录是软 404，
//      只有 2021 目录有真文件）—— 硬爬只会得到一堆假 200
//   2) 考试题的版权归主办方，批量镜像别人的题库不是我们该做的事；
//      能下多少下多少、每份都标清来源，这才是正当的做法
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/** 已实测确认存在的官方文件 */
const CONFIRMED = [
  { dir: 2021, file: "JM01_2020.pdf", subject: "中文", year: 2020 },
  { dir: 2021, file: "JM02_2020.pdf", subject: "数学", year: 2020 },
  { dir: 2020, file: "JM01-pp.pdf", subject: "中文（练习卷）", year: 2020 },
];

const BASE = "https://es.dsedj.gov.mo/unification";
const OUT = path.resolve(__dirname, "题库源", "澳门四校联考");

function head(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: "HEAD", timeout: 25000 }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, len: Number(res.headers["content-length"] ?? 0) });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject).on("timeout", function () { this.destroy(); reject(new Error("timeout")); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("=== 澳门四校联考 · 官方历年试题 ===\n");

  const manifest = [];
  let ok = 0, skip = 0, fail = 0;

  for (const item of CONFIRMED) {
    const url = `${BASE}/${item.dir}/${item.file}`;
    // 文件名带上年份与科目，便于题库里直接读出来
    const name = `四校联考-${item.year}-${item.subject}.pdf`;
    const dest = path.join(OUT, name);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) {
      console.log(`  ⏭  已存在  ${name}`);
      manifest.push({ ...item, url, file: name, bytes: fs.statSync(dest).size, skipped: true });
      skip++;
      continue;
    }

    const h = await head(url);
    if (h.status !== 200 || h.len < 10000) {
      console.log(`  ✖  不可用  ${name}  (HTTP ${h.status}, ${h.len} bytes)`);
      fail++;
      await sleep(400);
      continue;
    }

    try {
      const buf = await get(url);
      // 再确认一次"真的是 PDF"—— 有的站点会用 200 返回一个 HTML 错误页
      const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
      if (!isPdf) {
        console.log(`  ✖  不是 PDF  ${name}  （前 5 字节：${buf.subarray(0, 5).toString("latin1")}）`);
        fail++;
        await sleep(400);
        continue;
      }
      fs.writeFileSync(dest, buf);
      const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
      console.log(`  ✔  ${name}  ${(buf.length / 1024).toFixed(0)} KB  sha256:${sha}`);
      manifest.push({ ...item, url, file: name, bytes: buf.length, sha256: sha });
      ok++;
    } catch (e) {
      console.log(`  ✖  下载失败  ${name}  ${e.message}`);
      fail++;
    }
    await sleep(500);
  }

  // 清单：每一份的来源 URL 与校验和都记下来（题库要能溯源）
  const manifestPath = path.join(OUT, "_清单.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    source: "澳门特别行政区政府 教育及青年发展局（DSEDJ）",
    sourceUrl: "https://portal.dsedj.gov.mo/webdsejspace/internet/Inter_main_page.jsp?id=80793",
    license: "官方公开发布的历年试题，供考生参考。版权归主办方所有，此处仅作个人学习存档。",
    downloadedAt: new Date().toISOString(),
    files: manifest,
  }, null, 2), "utf8");

  console.log(`\n  新下载 ${ok} 份 · 已存在 ${skip} 份 · 失败 ${fail} 份`);
  console.log(`  存放：${OUT}`);
  console.log(`  清单：${manifestPath}`);
})();
