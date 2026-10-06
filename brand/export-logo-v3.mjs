// Export the generated identity to application sizes and native ICO/BMP containers.
// No retouching, tracing or background removal: original generated alpha is preserved.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "assets");
const root = path.resolve(HERE, "..");
const source = fs.readFileSync(path.join(HERE, "source-insight-window-v3.png"));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const assets = await page.evaluate(async data => {
    const img = new Image(); img.src = data; await img.decode();
    const probe = document.createElement("canvas"); probe.width = img.width; probe.height = img.height;
    const pc = probe.getContext("2d", { willReadFrequently: true }); pc.drawImage(img, 0, 0);
    const pixels = pc.getImageData(0, 0, img.width, img.height).data;
    let solid=0, transparent=0, bright=0; for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)transparent++;if(pixels[i+3]>200){solid++;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>90)bright++;}}
    if(transparent/(img.width*img.height)<.3 || solid/(img.width*img.height)<.08 || bright>0)throw Error("Source must contain only a dark mark and real transparent negative space.");
    const corners = pixels.subarray(0,4);
    if (corners[3] > 0) throw new Error("Generated logo must have real transparent alpha; no local background removal is performed.");
    const images = {};
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
      const c = document.createElement("canvas"); c.width = c.height = size; const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      // Native icons use the generated alpha; no opaque rounded background.
      ctx.drawImage(img, 0, 0, size, size);
      images[`icon-${size}.png`] = c.toDataURL("image/png");
    }
    const master = document.createElement("canvas"); master.width = master.height = 1024;
    master.getContext("2d").drawImage(img, 0, 0, 1024, 1024);
    images["logo-mark-1024.png"] = master.toDataURL("image/png");
    images["logo-mark-mono-1024.png"] = images["logo-mark-1024.png"];
    images["icon-mono-1024.png"] = images["icon-1024.png"];
    const reverse = document.createElement("canvas"); reverse.width = reverse.height = 1024; const rc = reverse.getContext("2d");
    rc.filter = "brightness(0) invert(1)"; rc.drawImage(img, 0, 0, 1024, 1024);
    images["logo-mark-reversed-1024.png"] = reverse.toDataURL("image/png");
    const tile = document.createElement("canvas"); tile.width = tile.height = 1024; const tc = tile.getContext("2d");
    tc.drawImage(reverse, 0, 0);
    images["icon-reversed-1024.png"] = tile.toDataURL("image/png");
    const header = document.createElement("canvas"); header.width = 150; header.height = 57; const hc = header.getContext("2d");
    hc.fillStyle = "#fafafa"; hc.fillRect(0, 0, 150, 57); hc.drawImage(img, 3, 3, 51, 51);
    hc.fillStyle = "#16151c"; hc.font = "600 13px Segoe UI, sans-serif"; hc.fillText("GEZHI", 64, 34);
    for(const size of [16,24,32,48,64,128,256,512,1024]){const test=new Image();test.src=images[`icon-${size}.png`];await test.decode();const probe=document.createElement("canvas");probe.width=probe.height=size;const ctx=probe.getContext("2d");ctx.drawImage(test,0,0);const data=ctx.getImageData(0,0,size,size).data;for(const at of [0,(size-1)*4,(size*(size-1))*4,(size*size-1)*4])if(data[at+3]!==0)throw Error(`Opaque native icon corner at ${size}px`);}
    return { images, transparency: {solid,transparent,bright}, rgba: Array.from(hc.getImageData(0, 0, 150, 57).data), dimensions: [img.width, img.height], alpha: corners[3] };
  }, `data:image/png;base64,${source.toString("base64")}`);
  const decode = s => Buffer.from(s.split(",")[1], "base64");
  for (const [name, data] of Object.entries(assets.images)) fs.writeFileSync(path.join(OUT, name), decode(data));
  function ico(sizes) {
    const pngs = sizes.map(size => decode(assets.images[`icon-${size}.png`]));
    const head = Buffer.alloc(6 + sizes.length * 16); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    let offset = head.length;
    sizes.forEach((size, i) => { const o = 6 + i * 16; head[o] = head[o + 1] = size === 256 ? 0 : size; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(pngs[i].length, o + 8); head.writeUInt32LE(offset, o + 12); offset += pngs[i].length; });
    return Buffer.concat([head, ...pngs]);
  }
  fs.writeFileSync(path.join(OUT, "app.ico"), ico([16, 24, 32, 48, 64, 128, 256]));
  fs.writeFileSync(path.join(OUT, "favicon.ico"), ico([16, 32]));
  // Windows installer header: uncompressed 24-bit BMP with four-byte scanline alignment.
  const w = 150, h = 57, stride = Math.ceil(w * 3 / 4) * 4;
  const bmp = Buffer.alloc(54 + stride * h); bmp.write("BM"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(w, 18); bmp.writeInt32LE(h, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(stride * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const src = ((h - 1 - y) * w + x) * 4, dst = 54 + y * stride + x * 3; bmp[dst] = assets.rgba[src + 2]; bmp[dst + 1] = assets.rgba[src + 1]; bmp[dst + 2] = assets.rgba[src]; }
  fs.writeFileSync(path.join(OUT, "nsis-header-v3.bmp"), bmp);
  fs.copyFileSync(path.join(OUT, "logo-mark-1024.png"), path.join(root, "apps/desktop/renderer/src/assets/gezhi-mark-v3.png"));
  assert.equal(assets.alpha, 0); assert.equal(ico([16, 32]).readUInt16LE(4), 2);
  console.log(JSON.stringify({ source: "brand/source-insight-window-v3.png", dimensions: assets.dimensions, alpha: assets.alpha, transparency: assets.transparency, pngSizes: Object.keys(assets.images), icoSizes: [16, 24, 32, 48, 64, 128, 256] }, null, 2));
  // A review sheet shows the same mark in context at actual UI sizes.
  await page.setViewportSize({ width: 1080, height: 760 });
  await page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;background:#f1f1f3;font-family:'Segoe UI','Microsoft YaHei',sans-serif;color:#202027}.sheet{padding:42px}.heading{font-size:12px;color:#777;letter-spacing:3px}.row{display:flex;gap:24px;margin-top:30px}.card{flex:1;background:white;border-radius:18px;padding:32px;min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center}.dark{background:#202027;color:white}.hero{width:200px;height:200px}.dark .hero{filter:brightness(0) invert(1)}h1{font-size:25px;font-weight:600;letter-spacing:8px;margin:8px 0}.caption{font-size:11px;color:#999;letter-spacing:2px}.sizes{display:flex;align-items:center;gap:36px;margin-top:30px;padding:22px 28px;background:white;border-radius:14px}.sizes div{display:flex;align-items:center;gap:12px;font-size:12px}.sizes small{font-size:10px;color:#999}footer{margin-top:20px;color:#888;font-size:11px;line-height:2}</style></head><body><main class="sheet"><div class="heading">GEZHI / IDENTITY 03</div><div class="row"><div class="card"><img class="hero" src="${assets.images["logo-mark-1024.png"]}"><h1>格致</h1><span class="caption">格物 · 致知</span></div><div class="card dark"><img class="hero" src="${assets.images["logo-mark-1024.png"]}"><h1>格致</h1><span class="caption">格物 · 致知</span></div></div><div class="sizes">${[16, 24, 32, 48, 64].map(s => `<div><img src="${assets.images[`icon-${s}.png`]}" width="${s}" height="${s}"><span>格致<br><small>${s} px</small></span></div>`).join("")}</div><footer>六维之窗 · 透明底图标 · 单色识别<br>六个方向围合开放空间，中间的路径代表理解与探索。</footer></main></body></html>`);
  await page.waitForFunction(() => [...document.images].every(im => im.complete));
  const preview = path.join(root, "产出", "ui-v2", "logo-v3.png"); fs.mkdirSync(path.dirname(preview), { recursive: true });
  await page.screenshot({ path: preview });
} finally { await browser.close(); }
