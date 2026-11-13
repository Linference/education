# 格致后续优化：GitHub 项目调研

以下建议结合格致现有 Electron / React / SQLite / Typst 架构；开源项目能力来自官方仓库。尚未对这些候选在本项目中做性能或识别准确率测试，当前版本没有接入这些新依赖。

| 优先级 | 方向 | 参考项目 | 格致中的落点 |
| --- | --- | --- | --- |
| 第一批 | 扫描题库识别 | [RapidOCR](https://github.com/RapidAI/RapidOCR)、[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | 普通扫描题先尝试离线 OCR；复杂公式、表格和版面另测 PP-StructureV3。沿用现有逐题预览，显示原图对应区域、保留人工修改。 |
| 第一批 | 六维反馈可重复验证 | [Promptfoo](https://github.com/promptfoo/promptfoo) | 建立教师标注样例，检验引用、条件遗漏、无证据维度、重复评分稳定性，以及延迟和调用成本。工程测试替身不能代替评分校准。 |
| 第一批 | 回答附页码证据 | [LanceDB](https://github.com/lancedb/lancedb) | 先在现有 SQLite 检索中增加文档分段、页码与来源跳转；需要语义召回时再测试本地向量索引。 |
| 第二批 | 遗忘复习安排 | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | 用真实复习后的回忆表现安排延迟重测，并连接证据地图。AI 六维分数不能直接充当记忆评分。 |
| 第二批 | 边讲边画 | [Excalidraw](https://github.com/excalidraw/excalidraw) | 在角色空间补充白板、函数草图、受力分析；保存画布与讲解记录。识别手写数学需要另行验证。 |
| 第二批 | 离线语音备选 | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | 增加可选下载的多语言语音模型，作为现有云端转写的备选。中文不使用 `.en` 模型。 |
| 后续 | 空间内人物表现 | [TalkingHead](https://github.com/met4citizen/TalkingHead)、[three-vrm](https://github.com/pixiv/three-vrm) | 当前二维角色可以先补充状态和表情。三维实时口型需要合适的模型及中文适配，生成 PNG 不能自动成为可驱动的三维人物。 |
| 后续 | 更新体验 | [electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater) | 测试 NSIS 差分更新与签名检查，仍提供包含 DSH 的完整安装包；回退和数据备份需要额外实现。 |

TalkingHead 的内置口型语言列表没有中文，演示人物素材也不能统一按 MIT 许可复制。采用代码时同时核对模型与素材许可。

已有 D3 布局 worker 能完成 1500 节点 / 3000 链接的回归检查；目前不急于替换图谱引擎。后续出现更大规模的实测性能瓶颈时，可对比 [Sigma.js](https://github.com/jacomyal/sigma.js) 的 WebGL 渲染。

软件完善之后，最值得补充的是真实学生试用和教师评分对照：用实际任务、延迟重测与迁移题检验学习价值，避免只根据界面完成度评价效果。
