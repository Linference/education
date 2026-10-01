#!/usr/bin/env node
// 格致桌面端 · Electron 启动与 IPC 冒烟测试
//
// 为什么需要它：这是 P1 第一次真正启动 GUI。自动化里看不见窗口，
// 所以必须把「窗口起来了」「preload 通了」「IPC 能读真实文件」变成可断言的事实。
//
// 实测踩过的两个坑（写下来免得重犯）：
//   ① Electron 支持**只在 Node 版 Playwright**（`playwright._electron`）。
//      Python 版没有 —— 它的入口只有 chromium/firefox/webkit/request。
//   ② 网上流传的「pyee 的 emit 会挡住 playwright」补丁是针对旧版 pyee 的，
//      本机 pyee 13 连 `_emit` 都没有，照搬直接 AttributeError。
//      **不要预先打补丁，先跑，让真实错误说话。**
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = HERE;
const OUT_DIR = path.resolve(HERE, "..", "..", "产出");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
  return Boolean(ok);
}

// Electron 可执行文件位置：
// Playwright 默认从**当前工作目录**解析 electron，而它装在 apps/desktop 下，
// 从仓库根跑测试时会找不到 —— 所以显式给路径，别依赖它自己找。
const electronExe = path.join(HERE, "node_modules", "electron", "dist", "electron.exe");
if (!fs.existsSync(electronExe)) {
  console.error(`找不到 Electron 可执行文件：${electronExe}`);
  console.error("请先在 apps/desktop 下执行 npm install（需要 ELECTRON_MIRROR 走镜像）。");
  process.exit(2);
}

console.log("=== 格致桌面端 · 启动与 IPC 冒烟 ===");
console.log(`  Electron: ${electronExe}`);

const app = await electron.launch({ executablePath: electronExe, args: [APP_DIR] });
const page = await app.firstWindow();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.waitForLoadState("load", { timeout: 30000 });
  await page.waitForFunction(() => window.__gezhiReady === true, { timeout: 30000 });
  check("窗口启动且渲染进程就绪", true);

  const title = await page.title();
  check("窗口标题正确", title === "格致", `title=${JSON.stringify(title)}`);

  // ---------------------------------------------------------------- IPC 基础
  const info = await page.evaluate(() => window.gezhi.info());
  check("preload 暴露了受控 API（window.gezhi）", Boolean(info));
  check("IPC app:info 返回 Electron 版本", Boolean(info.electron), `electron=${info.electron}`);
  check("IPC 返回真实的「文档」目录（不是硬编码）",
    Boolean(info.documentsDir) && /Documents/i.test(info.documentsDir),
    `documentsDir=${info.documentsDir}`);

  // ---------------------------------------------------------------- 安全约束
  check("★ 渲染进程没有 Node require（contextIsolation 生效）",
    await page.evaluate(() => typeof window.require === "undefined"));
  check("★ 渲染进程没有 process 全局",
    await page.evaluate(() => typeof window.process === "undefined"));
  check("★ window.gezhi 上没有 ipcRenderer 本体",
    await page.evaluate(() => !("ipcRenderer" in window.gezhi)));
  check("★ window.gezhi 上没有暴露 fs / child_process",
    await page.evaluate(() => !("fs" in window.gezhi) && !("child_process" in window.gezhi)));

  // ---------------------------------------------------------------- 界面骨架
  for (const [sel, label] of [
    ["#titlebar", "标题栏"], ["#sidebar", "左侧栏"], ["#center", "中间区"],
    ["#rightbar", "右侧栏"], ["#tabs", "标签页条"], ["#statusbar", "状态栏"],
    ["#btn-open-vault", "打开库按钮"],
  ]) {
    check(`界面元素存在：${label}`, (await page.locator(sel).count()) === 1);
  }

  const statusRight = await page.locator("#status-right").innerText();
  check("状态栏显示了「文档」目录", statusRight.includes("文档目录"), statusRight);

  // ---------------------------------------------------------------- IPC 实操
  const listing = await page.evaluate((d) => window.gezhi.vault.list(d), info.documentsDir);
  check("IPC vault:list 能列真实目录", listing.ok === true, `${(listing.entries ?? []).length} 项`);

  const readme = path.resolve(HERE, "..", "..", "README.md");
  if (fs.existsSync(readme)) {
    const r = await page.evaluate((p) => window.gezhi.file.read(p), readme);
    check("IPC file:read 能读真实 Markdown", r.ok === true, `${(r.text ?? "").length} 字`);
    check("读到的内容确实是 README 开头", (r.text ?? "").startsWith("# 格致"), JSON.stringify((r.text ?? "").slice(0, 16)));
  } else {
    check("IPC file:read 能读真实 Markdown", false, "探针文件不存在");
  }

  // ---------------------------------------------------------------- 错误处理
  const bad = await page.evaluate(() => window.gezhi.vault.info("Z:\\不存在的目录\\xx"));
  check("非法路径返回错误对象而不是抛异常", bad.ok === false, String(bad.error ?? "").slice(0, 40));

  const binPath = path.join(HERE, "main", "not-a-text-file.bin");
  const r2 = await page.evaluate((p) => window.gezhi.file.read(p), binPath);
  check("不支持的文件类型给出明确提示", r2.ok === false, String(r2.error ?? "").slice(0, 40));

  // ---------------------------------------------------------------- 端到端：开库 + 读文件
  // 用一个临时"库"验证完整链路（renderer 里的 openVaultByPath 是给测试的钩子）
  const tmpVault = fs.mkdtempSync(path.join(process.env.TEMP ?? "/tmp", "gezhi-e2e-"));
  fs.mkdirSync(path.join(tmpVault, ".gezhi"), { recursive: true });
  fs.writeFileSync(path.join(tmpVault, ".gezhi", "vault.json"),
    JSON.stringify({ schemaVersion: 1, id: "e2e-test", name: "端到端测试库", createdAt: new Date().toISOString() }, null, 2), "utf8");
  fs.mkdirSync(path.join(tmpVault, "笔记"), { recursive: true });
  fs.writeFileSync(path.join(tmpVault, "笔记", "情态动词.md"), "# 情态动词\n\nmust 表示必须。\n", "utf8");

  const v = await page.evaluate((d) => window.__gezhiTest.openVaultByPath(d), tmpVault);
  check("能识别格致库（读到 .gezhi/vault.json）", v.ok === true && v.isVault === true, `name=${v.name}`);

  await page.waitForTimeout(400);
  const treeRows = await page.locator(".tree-row").count();
  check("文件树渲染出了条目", treeRows > 0, `${treeRows} 行`);

  // 点开「笔记」目录再点文件，走真实交互路径（不是直接调 API）
  await page.locator('.tree-row.is-dir:has-text("笔记")').first().click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row:has-text("情态动词.md")').first().click();
  await page.waitForTimeout(400);

  const tabCount = await page.evaluate(() => window.__gezhiTest.tabCount());
  check("点击文件后产生标签页", tabCount === 1, `${tabCount} 个`);

  const content = await page.locator("#file-content").innerText();
  check("编辑器区显示了文件内容", content.includes("must 表示必须"), JSON.stringify(content.slice(0, 24)));

  const activePath = await page.evaluate(() => window.__gezhiTest.activePath());
  check("活动标签指向被点的文件", activePath?.endsWith("情态动词.md") === true, path.basename(String(activePath)));

  // 再开一个文件，验证多标签。
  // ★ 注意：**不能**在这里重开库 —— openVault 的职责就是清空标签页与树缓存
  //   （切换库当然要重置）。第一版测试那样写，等于把刚打开的文件合法地清掉了，
  //   期望却还留在 2 个，于是误判失败。真实用法是：同一个库里连着开几个文件。
  fs.writeFileSync(path.join(tmpVault, "笔记", "虚拟语气.md"), "# 虚拟语气\n\nif 引导的虚拟条件句。\n", "utf8");
  // 刷新文件树（丢弃缓存重新读盘）。**这一步就是在验证"外部新建文件后能不能看到"**：
  // 第一版曾经因为"刷新时把旧数据又缓存了一遍"而永远看不到新文件，且静默无报错。
  await page.evaluate(() => window.__gezhiTest.refreshTree());
  await page.waitForTimeout(400);

  // ★ 测试要**幂等**：不能依赖"此刻目录是收起还是展开"。
  //   第一版用 .click() 切换，结果开库时已清空 expanded（收起），再点一下变成展开，
  //   而前一版又把顺序搞反导致"展开→折叠"。改成显式设定状态，避免这类时序耦合。
  const afterRefresh = await page.evaluate(async (dir) => {
    const st = window.__gezhiTest.state;
    st.expanded.add(dir);                 // 显式展开，不靠点击切换
    await window.__gezhiTest.refreshTree();
    return {
      rows: [...document.querySelectorAll(".tree-row")].map((r) => r.querySelector(".nm")?.textContent),
      expanded: [...st.expanded].map((p) => p.split(/[\\/]/).pop()),
    };
  }, path.join(tmpVault, "笔记"));
  console.log(`  [诊断] 刷新并展开后：${JSON.stringify(afterRefresh.rows)}`);

  const targetFile = page.locator(".tree-row:not(.is-dir)", { hasText: "虚拟语气.md" }).first();
  check("刷新后能看到新增的文件（验证缓存不会返回陈旧结果）",
    (await targetFile.count()) === 1, `匹配 ${await targetFile.count()} 个`);
  await targetFile.click();
  await page.waitForTimeout(450);
  const tabCount2 = await page.evaluate(() => window.__gezhiTest.tabCount());
  const tabNames = await page.evaluate(() => window.__gezhiTest.state.tabs.map((t) => t.name));
  check("能同时打开多个文件（多标签）", tabCount2 === 2, `${tabCount2} 个：${JSON.stringify(tabNames)}`);

  // 关闭标签
  await page.locator(".tab.active .tclose").click();
  await page.waitForTimeout(250);
  const tabCount3 = await page.evaluate(() => window.__gezhiTest.tabCount());
  check("能关闭标签页", tabCount3 === 1, `${tabCount3} 个`);

  check("渲染进程无 JS 报错", pageErrors.length === 0, pageErrors.slice(0, 2).join("；"));

  // ---------------------------------------------------------------- 截图
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const shot = path.join(OUT_DIR, "p1-窗口截图.png");
  await page.screenshot({ path: shot });
  console.log(`\n  截图：${path.relative(process.cwd(), shot)}`);

  fs.rmSync(tmpVault, { recursive: true, force: true });
} finally {
  await app.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);

fs.writeFileSync(path.join(HERE, "smoke-report.json"),
  JSON.stringify(results, null, 2), "utf8");
process.exit(passed === results.length ? 0 : 1);
