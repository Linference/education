# LibreOffice（随包分发）

格致内置的 Office 文档转换引擎。用途：把 PPT / Word / Excel / 旧版 `.doc` / `.ppt`
转换成 PDF，交给格致已有的 PDF 查看器显示 —— **视觉 100% 还原**。

## 为什么需要它

纯文字提取对手写课件没有意义。实测数据：

| 文件 | 体积 | 提取出的文字 | 说明 |
|---|---|---|---|
| `part4_linear algebra.pptx` | 219 MB | 197 页 / 10,647 字 | **每页仅 54 字**，内容全在图片里 |
| `01.概述、线性代数和NDArray.pptx` | 15.3 MB | 33 页 / 2,029 字 | **15 MB 只提出 2 KB 文字** |

也就是说，打开这类文件时用户看到的是一串文字，而不是幻灯片。
LibreOffice 转换后，排版、图片、公式、背景全部还原。

实测转换耗时（随包版本）：

| 文件 | 耗时 | 结果 |
|---|---|---|
| 高中物理竞赛-热学部分.**ppt**（旧版） | 10.4s | 37 页，排版/背景/公式全还原 |
| 4.数据排序.pptx | 19.4s | 29 页 |
| part4_linear algebra.pptx（219 MB） | 37.7s | 197 页 |

## 版本与来源

- 版本：LibreOffice 26.8.0（Windows x86-64）
- 来源：<https://download.documentfoundation.org/libreoffice/stable/>
- 获取方式：`msiexec /a` 解包（administrative install，未安装进系统）

## 许可：MPL-2.0

LibreOffice 以 **Mozilla Public License v. 2.0** 分发。

**为什么可以随格致分发**：MPL-2.0 是**弱 copyleft**，且是**文件级**的 ——
它要求"对 MPL 覆盖文件的修改"需要以 MPL 公开，但**不要求**调用它的
其他程序（格致）也采用 MPL。格致与 LibreOffice 的关系是：

- 格致**不修改** LibreOffice 的任何源码
- 格致把它作为**独立进程**启动（`soffice.exe --headless --convert-to pdf`）
- 两者之间只通过命令行参数与文件交互

这与 AGPL 有本质区别（AGPL 对网络分发有传染性）。项目的依赖许可门禁
（`scripts/check-licenses.mjs`）允许 MPL-2.0，阻止 AGPL/SSPL/Commons Clause。

许可文件已随包携带：
- `license.txt` —— MPL-2.0 全文 + 第三方代码声明
- `LICENSE.html` —— 同上（HTML 版）
- `NOTICE` —— Apache-2.0 部分的署名要求
- `CREDITS.fodt` —— 贡献者名单

## 裁剪说明

原始安装包解包后 **1523 MB**（19,457 个文件）。为控制体积做了裁剪，
最终 **1014 MB**（9,112 个文件），LZMA 压缩后约 **198 MB**。

砍掉的（**每一项都验证过转换仍正常**）：

| 目录 | 体积 | 内容 |
|---|---|---|
| `share/extensions` | 462 MB | 拼写检查词典与语言包（转换不需要纠错） |
| `help` | 11 MB | 离线帮助手册 |
| `share/gallery` | 13 MB | 剪贴画 |
| `share/template` | 8 MB | 文档模板 |
| `share/autotest` / `autotext` | 3 MB | 自动图文集 |
| `share/wizards` | 5 MB | 向导 |
| `readmes` | 2 MB | 说明文件 |
| `share/xslt` | 4 MB | XSLT 样式 |
| `share/palette` | 1 MB | 调色板 |

### ⚠️ 不能砍的：`share/config`

**砍掉 `share/config` 后转换会失败**，报错：

```
Error: source file could not be loaded
```

原因是那里放着文件类型识别（type detection）与导出过滤器注册所需的配置。
这个坑实测踩过一次 —— 脚本 `prepare-vendor.cjs` 裁完立刻跑转换才发现的。

**教训**：裁剪 LibreOffice 不能只看体积。每砍一刀都要重跑一次真实转换，
因为砍错的表现是"静默失败"，不是报错崩溃。

## 代码位置

- `apps/desktop/main/lib/soffice.cjs` —— 探测与转换（含串行队列）
- `apps/desktop/main/convert-ipc.cjs` —— IPC 封装
- `apps/desktop/verify-soffice-convert.cjs` —— 验收测试

## 调用方式（给维护者）

```
soffice.exe
  --headless --norestore --invisible --nolockcheck --nodefault --nofirststartwizard
  -env:UserInstallation=file:///<每次独立的 profile 目录>
  --convert-to pdf:impress_pdf_Export
  --outdir <输出目录>
  <源文件>
```

三个必须注意的点：

1. **`-env:UserInstallation` 必须每次独立** —— 同一 profile 不能并发启动，
   并发时第二个会静默失败或挂住
2. **判定成功不能只看退出码** —— 转换失败时 LibreOffice 可能仍返回 0，
   必须检查"输出目录里有非空 PDF"
3. **`--norestore` 与 `--nofirststartwizard` 不能省** ——
   否则可能弹出恢复对话框/首次运行向导，自动化会永久挂住

已知限制：`--convert-to` 的 `FilterOptions`（压缩参数）在命令行里**不生效**。
所以 219 MB 图片型课件转出的 PDF 约 260 MB，加载需要几秒。
