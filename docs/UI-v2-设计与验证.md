# 格致：数字人、工作台、图谱与品牌升级

2026-10-02。本次依据用户的当前请求修改软件，历史会话与记忆文件仅作为项目背景。

## 已接入的软件行为

- 小格采用内置 image_gen 生图工具生成的六表情素材：待机、眨眼、倾听、思考、轻张嘴、张嘴。采用 3×2 精灵图，直接更新背景位置，保留原有语音时间戳驱动。这是图像表情动画，不是可旋转的三维骨骼模型。
- 数字人保留费曼讲解、普通对话与能力检测。等待回答时显示思考状态；录音时显示倾听状态；播放时口型与音频时间轴联动，停止后闭嘴。
- 修复数字人自动朗读读取 React 状态更新副作用的问题：朗读文本直接来自 API 回答，不依赖状态更新器立即执行。
- 标题栏、工具栏、文件树、标签页、欢迎页、阅读区、AI 对话、日历、题库卡片、组卷篮采用统一的颜色、间距、圆角和焦点样式。浅色/深色切换会保存。主要按钮的深色背景与文字对比单独处理。
- 页面进入、面板切换、按钮悬停、数字人呼吸、说话波形和思考环采用短、克制的动画。系统启用减少动画时停止持续装饰动画，图谱仅显示布局最终位置。
- 图谱采用 Canvas + D3 force Worker：后台计算、位置数组传递、按需绘制、收敛后停止持续刷新。支持滚轮定点缩放、按钮/键盘缩放、空白平移、节点拖拽、邻居高亮、点击笔记返回阅读、全局/局部切换、BFS 深度、名称搜索、悬空/孤立节点筛选、文件夹颜色分组、显示和力量参数。
- 图谱载入上限为 1500 节点 / 6000 链接；超过上限显示截断提示。局部深度 1–4。设置存储有数值边界检查，切库/取消异步请求/卸载时清理资源。
- 新 Logo 采用四向交织与中心方形留白；参考用户提供的黑白几何与编织感，使用独立的四向结构。已更新标题栏、欢迎页、软件窗口、PNG 多尺寸、ICO 和安装器资产。原始旧 Logo 源文件仍保留。
- 安装包补入 packages/voice、腾讯云 SDK、凭据模块及其引用的数据库基础模块和 schema，保留包目录关系，避免数字人在打包后找不到语音模块。

## 素材与生成规范

使用方式：内置 image_gen；未使用 CLI，也未索取 API Key。具体底层模型版本由工具管理，未自行声明固定模型版本。

小格最终素材：`apps/desktop/renderer/src/assets/xiaoge-expressions-v2.png`，1536×1024，六格各 512×512。头像使用圆形视口。生成规范：

> A premium, handsome and approachable East Asian teenage male learning companion, about 17, softly tousled dark hair, expressive brown eyes, natural facial proportions, matte lavender knitted sweater with cream collar, soft 3D painterly studio lighting. One precisely aligned 3-column by 2-row expression sheet of the SAME character, identical head-and-shoulders frontal framing and scale. Top row: neutral friendly, eyes blinking closed, attentive listening. Bottom row: thoughtful, speaking with a small open mouth, speaking with a wider open mouth. Transparent background; no words, text, props or shadows.

生成后曾请求工具移除背景并保留六格位置；软件选择最初生成的六格素材。口型是离散表情切换，未声称连续三维唇形。

Logo 原始素材：`brand/source-woven-v2.png`，1254×1254，已检查实际透明 alpha；应用素材 `apps/desktop/renderer/src/assets/gezhi-mark-v2.png`。最终 Logo 提示词：

> Design ONE original premium black-and-white logo symbol for 格致 (Gezhi), a knowledge and learning desktop application. Use the attached image ONLY as a visual-language reference: sophisticated continuous geometry, confident black linework, balanced negative space, calm woven interconnected construction. Create a CLEARLY DISTINCT FOURFOLD woven rounded-square emblem, NOT the reference's sixfold flower/knot. Four rounded bent ribbon links interlock in a compact rotationally symmetric form around ONE clearly open square/diamond center: the grid refers to 格, the linked pathways refer to knowledge becoming connected. Strong simple silhouette, generously separated paths, medium-bold consistent strokes, smooth purposeful rounded joins. Design must remain crisp and recognizable at 24 pixels. A timeless professional identity that feels designed by a serious identity studio. Pure near-black monochrome, flat vector-style graphic, no colors or gradients, no 3D, no bevels, no shadows, no typography, no letters, no border, no wordmark, no decorative dots. One single centered mark with even generous margin, occupies 72% of a square canvas. True transparent alpha background. Do not reproduce OpenAI's sixfold logo or any existing trademark. The result should look like a single precisely constructed vector logo, not a sketch or an illustration.

导出使用 `node brand/export-logo-v2.mjs`，检查透明背景并导出图标尺寸、ICO 和 BMP。生成的是 PNG 位图标志；未把位图包装成可编辑矢量文件。深色界面采用 CSS 单色反白。

## 验证与复现

```powershell
node apps/desktop/node_modules/typescript/bin/tsc --noEmit -p apps/desktop/tsconfig.json
npm --prefix apps/desktop run build:renderer
node apps/desktop/verify-workbench.mjs
node scripts/check-licenses.mjs
node scripts/scan-secrets.mjs
node brand/export-logo-v2.mjs
node scripts/build-installer.mjs
```

打包后的真实应用使用同一验证脚本：

```powershell
$env:GEZHI_TEST_EXE = (Resolve-Path 'dist/installer/win-unpacked/格致.exe').Path
node apps/desktop/verify-workbench.mjs
Remove-Item Env:GEZHI_TEST_EXE
```

测试在 `产出/ui-v2/qa-*` 下创建独立的资料库和应用数据目录，不修改用户笔记或凭据。真实运行 Electron、preload、索引、Worker、Canvas、音频播放器与界面事件；AI 回答和云端 TTS 使用进程内测试替身，音频是三秒 WAV。测试不证明外部 DSH 引擎或腾讯云账户的联网可用性。

验证结果记录在 `产出/ui-v2/verification.json` 和打包测试的 `产出/ui-v2/packaged/verification.json`。截图覆盖欢迎页、数字人阅读工作台、图谱与设置、日历、题库、深色与小屏布局。最终运行结果以 JSON 中的结果为准；设计说明不代替验证。

本次最终打包运行：33 项检查全部通过，未捕获异常为 0。1500 节点 / 3000 链接布局用时 2041 ms；布局期间采样 143 次动画帧，帧间隔 P95 为 8.5 ms，最大为 16.8 ms。这是本机测试结果，不代表所有硬件的固定帧率。真实 TTS/ASR SDK、语音模块和凭据模块均在打包目录中成功加载；联网服务仍由测试替身验证交互。

最后在已验证的 `win-unpacked` 中补齐数据库基础模块后，使用 electron-builder 的 `--prepackaged dist/installer/win-unpacked` 生成 NSIS；完整从源码构建时，`package.json` 的 `extraResources` 已包含相同依赖。

## 图谱参考

交互参考 [Obsidian 官方 Graph view 文档](https://help.obsidian.md/plugins/graph)：全局/局部、筛选、分组、显示和力量设置。布局算法使用 [D3 many-body 文档](https://d3js.org/d3-force/many-body) 描述的 Barnes–Hut 方法。实现不是 Obsidian 的源码或其图谱引擎。
