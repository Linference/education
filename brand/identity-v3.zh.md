# 格致正式标志：六维之窗

2026-10-06，用户选定概念板第一款，并要求软件及安装包图标背景透明。

保留六个外侧构件和中心斜向路径。黑色、反白标志与桌面 ICO 均保留真实 Alpha 通道；导出程序不绘制白色或深色圆角底板。

- 母版：`source-insight-window-v3.png`，内置 Image 工具根据用户所选图片生成。
- 软件标志：`../apps/desktop/renderer/src/assets/gezhi-mark-v3.png`。
- 安装程序、程序与快捷方式：`assets/app.ico`，含 16、24、32、48、64、128、256 七个尺寸。
- 独立 PNG：`assets/icon-*.png`；黑色和反白母版：`assets/logo-mark-1024.png`、`assets/logo-mark-reversed-1024.png`。
- 正确导出命令：`node brand/export-logo-v3.mjs`。
- 旧资产备份：`archive/v2-before-insight-window-20261006/`。

导出检查覆盖四角透明、内部负形透明、图标非空及无白色底。PNG 母版源图的透明像素 1092251，实色像素 460709；总画布 1254×1254。安装器窗口保持原生 UI，透明要求落实到 PNG/ICO 图标本身。

## Image 编辑提示词

Use case: logo-brand, precise background extraction and production cleanup.
Input image: the user's chosen GEZHI Insight Window mark. This is the edit target.
Create a production-quality transparent PNG of EXACTLY this selected mark. Preserve the six outer geometric segments and the single diagonal rounded bar inside, their relative positions, proportions, slopes, corner radii, openings and overall silhouette. Do not redesign it or add/remove elements.
Remove the white background completely, including all white negative spaces between and inside the seven components. Output a genuine transparent alpha background, not white, not a checkerboard illustration. The mark itself should be solid near-black, clean flat monochrome, without grain, texture, lighting gradients, shadows, outlines or reflections. Smooth crisp antialiased edges.
Center the unchanged mark on a square transparent canvas, with approximately 10 percent clear margin on each side so it is ready for desktop and installer icons. High resolution, vector-like edge quality. No text, no wordmark, no container tile. Preserve only the chosen logo.
