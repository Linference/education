#!/usr/bin/env node
// 把对比用的 HTML 渲染成 PNG（这样能直接看效果）
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const HTML = path.join(ROOT, "产出", "logo尺码对比.html");
const PNG = path.join(ROOT, "产出", "logo尺码对比.png");

if (!fs.existsSync(HTML)) {
  console.error("先生成 HTML：node brand/logo-size-compare.mjs");
  process.exit(1);
}

const app = await electron.launch({
  executablePath: path.join(ROOT, "apps", "desktop", "node_modules", "electron", "dist", "electron.exe"),
  args: ["--no-sandbox"],
});
const page = await app.firstWindow();
await page.goto("file:///" + HTML.replace(/\\/g, "/"));
await page.waitForTimeout(1200);
await page.screenshot({ path: PNG, fullPage: true });
await app.close();

console.log(`已截图：${path.relative(ROOT, PNG)}（${(fs.statSync(PNG).size / 1024).toFixed(0)} KB）`);
