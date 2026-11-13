# Gezhi — Operations Guide / 格致 · 操作说明

> Bilingual (English / 中文). Commands are identical in both languages.
> 中英对照。命令部分两种语言相同。

---

## 0. What this repository is / 这个仓库是什么

**EN:** Gezhi is a local-first AI learning studio: a Markdown vault, a desktop editor, a question bank and paper generator, voice-driven explanation practice, and an English competition showcase. It runs as an Electron desktop app and keeps all learner data on the local machine.

**中文：** 格致是一个本地优先的 AI 学习工作室：Markdown 资料库、桌面编辑器、题库与组卷、语音讲解练习，以及英文比赛展示。它以 Electron 桌面应用运行，所有学习者数据都保存在本机。

**EN:** This is the **English edition**. Every document has an English main file and a Chinese original named `*.zh.md` next to it (e.g. `README.md` / `README.zh.md`). Code comments and user-facing text are English.

**中文：** 这是**英文版**。每份文档都有英文主文件，并在旁边保留中文原件 `*.zh.md`（例如 `README.md` / `README.zh.md`）。代码注释与界面文案均为英文。

---

## 1. Prerequisites / 环境要求

| Item / 项目 | Requirement / 要求 |
| --- | --- |
| OS / 系统 | Windows 10/11 x64 recommended (the app targets Windows); macOS works for development / 推荐 Windows 10/11 x64；macOS 可用于开发 |
| Node.js | **>= 22.5.0**, Node **24.x** recommended / **>= 22.5.0**，推荐 **24.x** |
| npm | Bundled with Node / 随 Node 安装 |
| Python 3 | Optional: export and document scripts / 可选：导出与文档脚本 |
| Typst | Optional: PDF export / 可选：PDF 导出 |
| LibreOffice | Optional: DOCX/XLSX/PPTX conversion / 可选：Office 转换 |
| DeepSeek Harness (DSH) | Optional: live AI / 可选：联网 AI |

**EN:** No `npm install` is required for the P0 foundation checks — those packages use only Node built-ins (`node:sqlite`, `node:test`, `node:fs`).

**中文：** P0 基础检查**不需要** `npm install` —— 这些包只使用 Node 内置模块（`node:sqlite`、`node:test`、`node:fs`）。

---

## 2. Repository layout / 目录结构

```
education/
├─ README.md                     # Project overview / 项目总览
├─ gezhi-development-plan.md     # Master plan and risk register / 总纲与风险登记册
├─ docs/                         # Implementation and validation notes / 实现与验证文档
├─ research/                     # Technical research reports / 技术调研报告
├─ submission/                   # Competition submission: papers, film plan / 比赛材料
│  └─ zh-reference/              # Chinese LaTeX reference edition / 中文 LaTeX 参考版
├─ poc/ime/                      # Chinese IME proof of concept / 中文输入法 PoC
├─ packages/
│  ├─ core/                      # Vault and path helpers / 库与路径
│  ├─ db/                        # SQLite schema and search / SQLite 结构与检索
│  ├─ dsh-bridge/                # DSH agent bridge / DSH 智能体桥
│  └─ voice/                     # Tencent Cloud ASR/TTS / 腾讯云语音
├─ apps/desktop/                 # Electron app (main + renderer) / Electron 桌面端
├─ scripts/                      # Gates, exports, video, installer / 门禁、导出、视频、安装包
├─ templates/                    # Typst/DOCX export templates / 导出模板
└─ vendor/                       # Third-party setup notes / 第三方程序说明
```

---

## 3. Quick start / 快速开始

### 3.1 Foundation checks / 基础检查

```bash
# One command for the P0 foundation checks / 一条命令跑完 P0 基础检查
node scripts/p0.mjs
```

**EN:** Expected: 8/9 on a machine without DSH; the DSH smoke test is skipped when the binary is absent.

**中文：** 预期结果：没有 DSH 的机器上为 8/9；缺少 DSH 可执行文件时该冒烟用例会被跳过。

### 3.2 Unit tests / 单元测试

```bash
node --test apps/desktop/learning.test.mjs \
           apps/desktop/bank-import.test.mjs \
           apps/desktop/companions.test.mjs \
           apps/desktop/assessment-review.test.mjs
```

**EN:** Expected: 39/39 passing.

**中文：** 预期：39/39 通过。

### 3.3 Gate checks / 门禁检查

```bash
node scripts/check-licenses.mjs        # dependency licences / 依赖许可
node scripts/scan-secrets.mjs .        # leaked credentials / 密钥泄露
node scripts/scan-mojibake.mjs .       # encoding corruption / 乱码扫描
```

**EN:** Install the shared hook once with `git config core.hooksPath .githooks`.

**中文：** 用 `git config core.hooksPath .githooks` 安装一次共享钩子。

---

## 4. Run the desktop app / 运行桌面应用

```bash
npm ci
npm --prefix apps/desktop ci
npm --prefix packages/voice ci
npm --prefix apps/desktop run build:renderer
# Windows / Windows:
.\apps\desktop\node_modules\.bin\electron.cmd .\apps\desktop
# macOS / macOS:
./apps/desktop/node_modules/.bin/electron ./apps/desktop
```

**EN:** If the renderer build needs a dev server instead, see `apps/desktop/package.json` scripts. The Electron main process and preload are CommonJS (`.cjs`) by design.

**中文：** 如果渲染进程需要开发服务器，请查看 `apps/desktop/package.json` 中的脚本。Electron 主进程与 preload 按设计使用 CommonJS（`.cjs`）。

---

## 5. Build the installer / 构建安装包

1. **EN:** Prepare the third-party binaries following `vendor/typst/README.md`, `vendor/soffice/README.md` and `vendor/dsh/README.md`.
   **中文：** 按 `vendor/typst/README.md`、`vendor/soffice/README.md`、`vendor/dsh/README.md` 准备第三方程序。
2. **EN:** Run `node scripts/build-installer.mjs`.
   **中文：** 运行 `node scripts/build-installer.mjs`。
3. **EN:** Output goes to `dist/installer/0.0.8/`.
   **中文：** 输出位于 `dist/installer/0.0.8/`。

**EN:** The 1 GB LibreOffice tree and the DSH executable are deliberately not committed; see the vendor READMEs.

**中文：** 约 1 GB 的 LibreOffice 与 DSH 可执行文件刻意不纳入仓库，制备方法见 vendor 目录说明。

---

## 6. Export and document pipelines / 导出与文档管线

| Task / 任务 | Command / 命令 |
| --- | --- |
| Markdown → PDF | `node scripts/md2pdf.mjs <in.md> <out.pdf>` |
| HTML → PDF | `node scripts/html2pdf.mjs <in.html> <out.pdf>` |
| Formula regression / 公式回归 | `node scripts/latex2typst.test.cjs` |
| Real PDF compile check / 真实 PDF 编译检查 | `node scripts/verify-math-pdf.mjs` |
| DOCX template / DOCX 模板 | `python3 templates/docx/md2docx.py <in.md> <out.docx> [title]` |
| Competition papers / 比赛论文 | `python3 scripts/build-competition-docs.py` |
| Chinese edition papers / 中文版论文 | `python3 scripts/build-competition-docs-zh.py` |

**EN:** The English papers are `submission/ProjectIntroduction_Gezhi.tex` and `submission/ResearchReport_Gezhi.tex`. The Chinese reference edition lives in `submission/zh-reference/` and is intentionally kept in Chinese.

**中文：** 英文论文为 `submission/ProjectIntroduction_Gezhi.tex` 与 `submission/ResearchReport_Gezhi.tex`。中文参考版位于 `submission/zh-reference/`，刻意保留中文。

---

## 7. Cloud AI and voice / 云端 AI 与语音

**EN:** Live model calls and Tencent Cloud ASR/TTS require credentials. Never commit them; the app stores encrypted credentials outside the repository.

**中文：** 联网模型调用与腾讯云 ASR/TTS 需要凭据。绝不要提交凭据；应用会把加密凭据保存在仓库之外。

```bash
# Voice verification (requires environment credentials) / 语音验证（需环境变量凭据）
node packages/voice/verify-tencent.mjs

# DSH bridge smoke (requires the dsh binary) / DSH 桥冒烟（需 dsh 可执行文件）
node packages/dsh-bridge/smoke.mjs
```

**EN:** Without credentials the app still runs in offline mode; the competition showcase includes an offline five-role demonstration.

**中文：** 没有凭据时应用仍可离线运行；比赛展示包含五角色离线示范。

---

## 8. English edition notes / 英文版说明

- **EN:** Chinese originals are preserved as `*.zh.md` next to each English document.
  **中文：** 中文原件以 `*.zh.md` 形式保留在英文文档旁边。
- **EN:** `submission/zh-reference/` keeps the Chinese LaTeX edition (`*_zh.tex`) as reference material.
  **中文：** `submission/zh-reference/` 保留中文 LaTeX 版（`*_zh.tex`）作为参考资料。
- **EN:** Scripts whose filenames end in `-zh` intentionally generate or verify Chinese output; their Chinese content is functional data, not untranslated leftovers.
  **中文：** 文件名以 `-zh` 结尾的脚本刻意生成/校验中文产物；其中的中文是功能性数据，不是未翻译的残留。
- **EN:** Chinese sample data inside IME, CJK search, mojibake and encoding tests is kept because the tests target Chinese-language behaviour.
  **中文：** 输入法、中文检索、乱码与编码测试中的中文样例被保留，因为这些测试针对中文行为。

---

## 9. Troubleshooting / 常见问题

| Symptom / 现象 | Cause and fix / 原因与处理 |
| --- | --- |
| `spawn dsh ENOENT` | DSH binary not installed; see `vendor/dsh/README.md`. / 未安装 DSH，见说明。 |
| PDF export fails on formulas | Ensure Typst is available and `vendor/typst/README.md` steps were followed. / 确认 Typst 可用并完成 vendor 步骤。 |
| DOCX/XLSX/PPTX conversion fails | LibreOffice path is missing; prepare `vendor/soffice/`. / 缺少 LibreOffice，准备 `vendor/soffice/`。 |
| `EINVAL` when spawning `.cmd` | Do not spawn `.cmd` from Node 24+; the bridge calls the executable directly. / Node 24+ 不要 spawn `.cmd`，桥接直接调用可执行文件。 |
| Chinese text looks corrupted in PowerShell | PowerShell reads UTF-8 as ANSI/GBK; read/write with Node or `-Encoding UTF8`. / PowerShell 按 ANSI/GBK 解码，用 Node 或 `-Encoding UTF8`。 |
| Electron reports missing named export | Main process/preload must be CommonJS `.cjs`. / 主进程/preload 必须是 `.cjs`。 |
| `whenReady` undefined | `ELECTRON_RUN_AS_NODE=1` is still set; unset it. / 清除该环境变量。 |
| Search returns zero results for Chinese | FTS needs trigram tokenization; see `docs/02-storage-and-retrieval-measurements.md`. / 中文 FTS 需 trigram，见文档。 |

---

## 10. Verification checklist / 验证清单

- [ ] `node scripts/p0.mjs` — 8/9 or 9/9 / 8/9 或 9/9
- [ ] `node --test apps/desktop/*.test.mjs` — all passing / 全部通过
- [ ] `node scripts/check-licenses.mjs` — no licence violations / 无许可风险
- [ ] `node scripts/scan-secrets.mjs .` — no leaked credentials / 无密钥泄露
- [ ] `node scripts/scan-mojibake.mjs .` — no encoding corruption / 无乱码
- [ ] Desktop app starts and the English UI renders / 桌面应用启动且英文界面正常
- [ ] `submission/*.pdf` open and embed fonts / 论文 PDF 可打开且字体嵌入

---

## 11. Where to read more / 延伸阅读

- Project overview / 项目总览 — `README.md`
- Development plan and risks / 开发计划与风险 — `gezhi-development-plan.md`
- History / 发展历程 — `docs/history.md`
- Learning studio / 学习工作室 — `docs/learning-studio-implementation-and-validation.md`
- Digital Space / 数字空间 — `docs/multi-role-learning-space-0.0.3.md`
- Competition showcase / 比赛展示 — `docs/competition-showcase-and-human-review-0.0.8.md`
- Submission checklist / 交件清单 — `submission-checklist.md`
