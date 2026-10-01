# submission/ — 交件材料（LaTeX 源 + 已编译 PDF）

## 当前产物

| 文件 | 页数 | 大小 | 规格要求 | 状态 |
| --- | --- | --- | --- | --- |
| `ProjectIntroduction_Gezhi.pdf` | **2** | 292 KB | 建议 ≤2 页，PDF ≤50MB | ✅ 符合 |
| `ResearchReport_Gezhi.pdf` | **11** | 395 KB | 建议 6–12 页，PDF ≤50MB | ✅ 符合 |

两份都是 A4、**全英文**、按竞赛命名规则命名。A4 是国际通用规格；章程只规定了海报尺寸，未规定文档纸张，A4 可直接提交。

## 重新编译

```powershell
$mik = 'D:\MiKTeX\miktex\bin\x64'
cd 'D:\Users\LINKIT\Desktop\格致\submission'

# 每份跑两遍（第二遍是为了解析交叉引用与目录）
foreach ($f in 'ProjectIntroduction_Gezhi','ResearchReport_Gezhi') {
  & "$mik\pdflatex.exe" -interaction=nonstopmode "$f.tex" > $null
  & "$mik\pdflatex.exe" -interaction=nonstopmode "$f.tex" > $null
}
```

改完 `.tex` 后**务必重跑两遍**，否则页码引用会显示成 `??`。

页数检查：

```powershell
& "$mik\pdfinfo.exe" ResearchReport_Gezhi.pdf | Select-String 'Pages'
```

## ⚠️ 提交前必须处理：红色占位符

文档里所有**红色粗体** `[TO BE COMPLETED: ...]` 都是必须由你们自己填的真实数据，**不能估算、不能取整、不能推断**。

| 文件 | 占位符数量 | 说明 |
| --- | --- | --- |
| `ProjectIntroduction_Gezhi.tex` | 3 | 误解库条数、覆盖科目、试用学生人数 |
| `ResearchReport_Gezhi.tex` | 38 | 受试者信息、测试时长、轮次上限、**全部结果数据**、质性观察、AI 工具披露表 |

一键找出全部占位符：

```powershell
Select-String -Path *.tex -Pattern '\\fillin\{|\\fillc\{'
```

**第 8 节 Results 整节都是占位符**——这一节是评审表里「原型、测试与成效」20% 的直接依据，必须用你们真实跑出来的数据填。填不出数字就写定性结论，**绝不要编造**（章程对虚假数据有明确的取消资格条款）。

## 编译告警说明

- `Font shape 'T1/lmr/bx/sc' undefined` — 粗体小型大写字母没有对应字形，自动回退，**不影响输出**。
- `Overfull \hbox (1.8pt)` — 一行超出版心 1.8 磅（约 0.6 毫米），肉眼不可见，**无需处理**。

## 预览

`_preview/` 是渲染出来的逐页 PNG，用于快速肉眼检查排版；**不是交付物**，可随时删除。

## 还需要另外做的两份材料

本目录只有章程里的第 1、2 份。另外两份（见 `..\交件清单与检查表.md`）：

- **Poster** — 直向 0.8 m × 1.1 m PDF（硬性尺寸，不是 A4）
- **DemoVideo** — ≤5 分钟，英文旁白/字幕

## 中文参考版

`zh-reference/` 下有两份**与英文版结构一一对应的中文稿**（简介 2 页、报告 10 页），供
指导老师审阅与队内讨论使用。

> 🚫 **切勿提交中文版。** 章程规定所有材料只接受英文，且「未使用英文」属于可「不予
> 评审」的情形。详见 `zh-reference/README.md`。
