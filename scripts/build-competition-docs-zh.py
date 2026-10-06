"""Translate the current illustrated submission into Chinese, without page limits."""
from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/gezhi-competition'
INTRO_EN = (OUT / 'ProjectIntroduction_Gezhi.tex').read_text(encoding='utf-8')
REPORT_EN = (OUT / 'ResearchReport_Gezhi.tex').read_text(encoding='utf-8')
PRE = INTRO_EN.split(r'\begin{document}', 1)[0]
PRE = PRE.replace(r'\documentclass[11pt,a4paper]{article}', r'\documentclass[11pt,a4paper,UTF8,fontset=none,scheme=plain]{ctexart}')
PRE = PRE.replace(r'\usepackage[T1]{fontenc}', r'\usepackage{fontspec}')
PRE = PRE.replace(r'\usepackage[utf8]{inputenc}', '')
PRE = PRE.replace(r'\usepackage{mathptmx,courier}', r'''\setmainfont{Times New Roman}
\setmonofont{Consolas}
\setCJKmainfont{SimSun}[BoldFont=SimHei,ItalicFont=KaiTi]
\setCJKsansfont{Microsoft YaHei}
\setCJKmonofont{Microsoft YaHei}
\linespread{1.12}''')
PRE = PRE.replace(r'\setlength{\parindent}{0pt}',r'\setlength{\parindent}{2\ccwd}')
PRE = PRE.replace(r'\fancyhead[L]{\footnotesize\textsc{Gezhi} --- \docname}',r'\fancyhead[L]{\footnotesize 格致：\docname}')
PRE = PRE.replace(r'\fancyhead[R]{\footnotesize AI for Education / 2026}',r'\fancyhead[R]{\footnotesize 人工智能与教育 / 2026}')
PRE = PRE.replace(r'\fancyfoot[L]{\scriptsize\color{muted} Hou Kong Middle School, Macau}',r'\fancyfoot[L]{\scriptsize\color{muted} 濠江中学（澳门）}')
PRE = PRE.replace(r'\captionsetup{font=small,labelfont=bf,skip=4pt,justification=raggedright,singlelinecheck=false}',r'\captionsetup{font=small,labelfont=bf,skip=4pt,justification=raggedright,singlelinecheck=false,hypcap=false}')
PRE = re.sub(r'\\newcommand\{\\papertitle\}\[2\]\{.*?\n', lambda _: r'''\newcommand{\papertitle}[2]{\begin{center}{\fontsize{20}{25}\selectfont\bfseries 格致：让理解看得见}\par\vspace{4pt}{\normalsize #2}\par\vspace{6pt}{\bfseries Lin Kit \enspace / \enspace Lei Chengchek \enspace / \enspace Feng Ziwen}\par 濠江中学（澳门）\par Hou Kong Middle School, Macau\par 指导教师：曾剑辉\par{\small AI for SDGs：2026 全球青少年人工智能创新大赛\par 澳门中学组 / 人工智能与教育 / 2026 年 10 月 2 日}\end{center}\vspace{-4pt}}
''', PRE, count=1)
PRE = PRE.replace(r'\newcommand{\docname}{Competition report}',r'\newcommand{\docname}{中文报告}')
PRE = PRE.replace('pdfsubject={AI for Education; SDG 4; working prototype and simulated educational testing}', 'pdfsubject={人工智能与教育；可运行原型及教育情境模拟测试}')
PRE += r'''\renewcommand{\figurename}{图}
\renewcommand{\tablename}{表}
\begin{document}
'''

FIGURES = {}
for source in (INTRO_EN, REPORT_EN):
    for figure in re.findall(r'\\begin\{figure\}.*?\\end\{figure\}', source, re.S):
        label = re.search(r'\\label\{([^}]+)\}', figure)
        if label:
            FIGURES[label.group(1)] = figure

def fig(label, caption):
    value = FIGURES[label]
    value = re.sub(r'\\caption\{.*?\}(?=\\label)', lambda _: r'\caption{'+caption+'}', value, count=1, flags=re.S)
    for original, translated in {
        r'Read\\a source':r'阅读\\学习资料',
        r'Explain\\or predict':r'解释概念\\或作出预测',
        r'Commit\\confidence':r'先记录\\自信度',
        r'Inspect\\and repair':r'检查反馈\\并纠错',
        r'Transfer\\and retest':r'迁移应用\\与复测',
        r'React / TypeScript\\Learner interface':r'React / TypeScript\\学习者界面',
        r'Electron main process\\IPC and validation':r'Electron 主进程\\IPC 与核验',
        r'Local files / SQLite\\Notes and attempts':r'本地文件 / SQLite\\笔记与作答记录',
        r'DSH agent bridge\\NDJSON events':r'DSH 智能体桥接\\NDJSON 事件流',
        r'Configured LLM service\\Selected context':r'配置的大语言模型\\选定的上下文',
        r'{network}':r'{网络请求}',
    }.items():
        value = value.replace(original, translated)
    return '\n'+value+'\n'

def table(caption, columns, body, heading=''):
    return '\n'+r'\par\addvspace{5pt}\noindent\begin{minipage}{\linewidth}'+'\n'+(r'\sub{'+heading+'}\n' if heading else '')+r'\captionof{table}{'+caption+'}\n'+r'\small'+'\n'+r'\begin{tabularx}{\linewidth}{'+columns+'}\n'+body+'\n'+r'\end{tabularx}'+'\n'+r'\end{minipage}\par\addvspace{5pt}'+'\n'

INTRO = r'''
\renewcommand{\docname}{项目介绍（中文版）}
\papertitle{项目介绍}{项目介绍：本地优先的人工智能学习工作空间}
\section{问题、使用者与目标}
学生可能认得某个答案，却说不清其成立条件，无法修正错误推导，或不能在另一种情境下使用同一知识。格致将这些学习活动与学生自己的笔记和文档连接起来。它是面向澳门中学生的可运行 Windows 软件原型，包含 AI 学习伙伴、原创练习及可追溯的学习记录。项目希望支持优质教育与批判性的 AI 素养；目前尚未测量实际学习收益。
\section{连续的学习体验}
学习者先阅读资料，解释概念或作出预测，在收到反馈前记录自信度，然后纠错并尝试迁移。三个交互模型允许学习者改变参数，检验自己的预测。图~\ref{fig:intro-lab} 展示真实软件中的二次函数概念实验台。
'''+fig('fig:intro-lab','真实概念实验台：改变系数、观察曲线并先作出预测。截图来自脚本化演示，并非真实学生试用。')+table('已实现的学习活动与记录内容。','@{}P{34mm}Y@{}',r'''
\toprule\textbf{学习活动}&\textbf{已实现的行为}\\\midrule
向小格讲解 & 通过文字或语音解释概念，获得结合上下文的 AI 反馈与追问。\\
自信度与纠错 & 揭晓反馈前记录三级自信度，定位首个错误步骤并选择修正方法。\\
证据与迁移 & 将知识点与作答、辅助使用记录关联，三阶段挑战改变题目条件。\\
概念实验 & 函数、受力与概率模型支持预测、测试、观察和解释。\\\bottomrule
''')+r'''
\section{真实 AI 调用与文档功能}
工作空间由 Electron、React/TypeScript 与本地 SQLite 存储支撑。DeepSeek Harness 0.2.0-rc.2 作为智能体子进程，调用用户配置的大语言模型账户。录制中真实执行的请求能够创建 Markdown 文件并反馈概念讲解。内置阅读器支持 Markdown、PDF 与 Word 文件，生成的笔记可以编辑和导出。选定内容与云端语音请求会使用外部服务。客观选项、受支持的数值答案以及实验公式由软件核验；AI 反馈需要审阅。
\section{原创性与教育价值}
“以教促学”与自我解释已有研究基础。格致将这些方法与可见的自信度记录、刻意设计的错误诊断、概念证据以及改变条件的迁移挑战整合到同一文档工作空间。图~\ref{fig:intro-evidence} 展示知识点与作答记录之间的联系。这些设计差异为后续评估提供依据，尚不能证明格致优于其他产品。
'''+fig('fig:intro-evidence','用户截取的真实证据地图：十二个节点及选中概念均保留。右侧显示四条记录、三次独立通过和三个迁移阶段，仍需延迟复测证据。这些均为模拟记录。')+r'''
\section{现有证据与下一步工作}
活动目录包含 16 道原创练习和三个实验模型。保存的报告记录了 19 项学习单元测试、26 项学习集成检查及 33 项界面检查通过。集成测试中的 AI 与语音响应采用测试替身；真实 AI 调用另有独立记录。英文演示约为 4 分 25 秒，展示文件创建、文档阅读及模拟学习流程。

\textbf{目前没有开展真实学生试用。} 项目尚无实测的学习增益比例，也没有经过验证的 AI 评分准确率。下一步包括教师复核 AI 反馈、经过知情同意的可用性研究、延迟迁移测试，以及准确记录每位成员的实际贡献。

{\small\textbf{AI 协助说明。} Codex 大量协助了编程、调试、测试、设计及文档起草。研究报告披露了 AI 生成的视觉素材和腾讯云合成旁白。本文件的界面配图均来自真实软件截图，原始像素未修改，仅为突出相关内容进行视口裁切。}
\end{document}
'''

REPORT = r'''
\renewcommand{\docname}{研究报告（中文版）}
\papertitle{研究报告}{设计、实现与教育情境模拟测试}
\section*{摘要}
格致是一款 Windows 桌面学习工作空间，将学生自己的资料与概念讲解、自信度判断和可检查的学习证据连接起来。学习者向 AI 伙伴解释概念、诊断错误推导、在条件改变后应用知识，并通过交互实验进一步探究。独立的概念地图展示学习状态背后的真实作答记录与辅助使用情况。

项目结合 Electron、React/TypeScript、SQLite 与 DeepSeek Harness 智能体子进程。配置的大语言模型提供结合上下文的反馈，并创建实用的 Markdown 文件。客观答案核验与数学实验由确定性软件逻辑完成，并非模型生成的评分。本地存储和本地检索减少日常数据传输；选定上下文与云端语音请求仍会使用外部服务。

当前证据包括保存的自动化检查、真实 AI 交互及一次模拟学习流程。活动目录包含 16 道原创练习和三个实验模型。保存的报告记录了单元、集成、界面及文档转换检查通过；集成检查中的 AI 和语音合成使用了测试替身。另行保存的真实录制验证了文件创建、讲解反馈及内置文档阅读功能。

{\small\textbf{关键词：}自我解释；学习证据；自信度校准；AI 素养；知识迁移。}\par
\note{研究状态}{团队确认没有开展真实学生试用。本文件是原型工程与模拟测试报告，不是学习成效研究；不报告真实参与者的学习结果，也不声称 AI 评分准确性已经验证。}
'''+fig('fig:overview','真实软件中的二次函数概念实验台。演示采用原创资料与模拟作答记录。')+r'''
\section{理解需要可观察的证据}
\sub{研究背景}
熟悉某个结果，容易让人以为已经理解。当学习者需要解释一个条件、修正错误步骤，或处理符号与情境不同的相关题目时，这种差距才会显现。通用 AI 能支持这些活动，但一个答案本身不能说明学习者能够独立完成什么。

自我解释研究支持要求学习者主动建立因果关系与概念联系。Bisra 等人（2018）综合了通过提示引导自我解释的研究 [1]。较早的可教智能体研究探讨了学习者通过承担“教会虚拟学习者”的责任来学习 [2]。这些成果为项目设计提供动机；在没有研究格致实际实现的情况下，不能将其效果直接视为本项目的学习成效。

联合国教科文组织的学生 AI 能力框架包括以人为本的判断、伦理使用、技术与应用，以及系统设计 [3]。因此，格致鼓励学习者检查并质疑反馈，而非将 AI 视为权威评分者。项目希望支持优质的中学教育与相关技能培养，包括可持续发展目标 4.1 和 4.4 的方向 [4]。这是设计层面的对齐，不是已经测量出的可持续发展影响。
\sub{目标使用者与范围}
主要使用者是利用自身课程资料学习的澳门中学生。原型基于 Windows，采用单用户模式，围绕有限的原创练习目录，聚焦概念讲解与学习证据。它尚不构成完整课程、已授权的电子书库或课堂管理平台。
'''+table('研究问题、工程问题及当前证据状态。','@{}P{12mm}Y Y@{}',r'''
\toprule & \textbf{问题} & \textbf{当前证据状态}\\\midrule
RQ1 & 完整学习流程能否运行，并保存可追溯的作答？ & 已通过实现、录制的模拟流程及保存的检查提供工程证据。\\
RQ2 & 真实 AI 反馈能否利用笔记上下文，识别刻意遗漏的条件？ & 已录制的案例展示可行性，尚未测量一般情况下的准确率。\\
RQ3 & 该流程能否改善延迟迁移或自信度校准？ & 尚未针对真实学习者开展评估。\\
RQ4 & 学生能否批判性地区分正确与错误的 AI 反馈？ & 属于预期 AI 素养目标，需要后续试用研究。\\\bottomrule
''','研究问题与工程问题')+r'''
\sub{相较已有方法的定位}
原型将常见机制整合为连续流程：对话提供反馈，笔记图谱提供链接，测验核验选项，模拟实验显示模型。格致在这些机制之间增加共同的自信度、辅助使用和条件变化记录。项目并不声称发明了“以教促学”，也不声称是首个使用知识图谱的软件。

\section{由学习者主导的学习流程}
\sub{活动顺序}
'''+fig('fig:loop','由学习者主导的活动顺序。每个判断保留相应作答及辅助使用信息。')+r'''
解释内容与预测由学生自己提出。反馈在学习者作出判断后出现；后续练习应参考具体作答依据，而不仅是一项汇总分数。
'''+table('已实现的学习模块、交互及证据边界。','@{}P{34mm}Y Y@{}',r'''
\toprule\textbf{模块}&\textbf{交互方式}&\textbf{保留的证据或限制}\\\midrule
向 AI 讲解 & 输入文字或使用麦克风转写，获得结合上下文的模型回应与追问。 & 反馈可能出错，尚未实现经过验证的六维评分系统。\\
自信度记录 & 在揭晓反馈前，必须选择三级自信度。 & 保存答案、自信度、提示使用与参考帮助。\\
错误侦探 & 找出最早的错误步骤，选择修正方法并解释原因。 & 客观选项会核验，文字推理仅保存，未认证其语义正确性。\\
学习证据地图 & 搜索、筛选、缩放、平移、拖动并检查概念证据。 & “近期独立通过”与“可能存在误概念”采用保守标签。\\
迁移挑战 & 三条路径，每条含三个阶段：初次应用、改变条件与改变情境。 & 后续阶段要求前一阶段通过；使用提示的通过与独立迁移分开记录。\\
概念实验台 & 改变条件，记录预测与自信度，运行模型并记录观察。 & 数值核验与显示使用同一模型。\\\bottomrule
''','已实现的模块')+r'''
\sub{地图不等于掌握证明}
自信度高、但客观上答错的作答，可能触发“可能存在误概念”标签。一次独立通过仅支持近期成功的判断。延迟证据需要相隔至少 24 小时、来自不同题目的独立通过记录。无法可靠解析的纯文字答案仍采用自评。这些区分能减少将稀疏记录夸大为“已经掌握”的风险。

笔记链接图谱描述文件关系；学习地图描述知识点与作答记录。实线箭头表示设计的教学前置关系，虚线表示关联或共现，不代表已经证实的因果依赖。
'''+fig('fig:evidence','用户截取的学习证据地图，采用统一比例缩放。十二个节点与选中概念均保留。右侧显示四条记录、三次独立通过和三个迁移阶段，仍需延迟复测证据。这些记录来自模拟演示。')+r'''
\section{本地记录与按需外部 AI 调用}
'''+fig('fig:architecture','已经实现的系统架构。实线表示本地应用流程，虚线表示向配置的外部模型发送选定上下文。')+r'''
\sub{智能体集成}
桥接层将 DSH 作为独立进程启动，并消费 UTF-8 编码、以换行分隔的 JSON 事件，包括会话、状态、思考、工具调用、工具结果、文字及最终回应。会话标识支持继续对话。已在本机核验安装的 DSH 版本为 0.2.0-rc.2。进程以选定资料库为工作目录；实际文件访问限制还取决于智能体沙箱及主机策略。仅设置工作目录，并不能形成操作系统层面的安全边界。

应用接入用户配置的大语言模型账户，没有训练新的基础模型。保存的成功调用没有暴露精确的后端模型版本，因此本报告不编造这一信息，也不把 DSH 版本等同于模型版本。
\sub{提示词与反馈设计}
讲解提示词包含主题、学习者的语音转写或输入文字，并在可用时包含当前笔记最多 4,000 个字符的上下文。在英文演示中，提示词要求指出正确内容、缺失条件、模糊或错误表述，并提出两个后续问题。提示词明确区分 AI 反馈与经认证的评估，要求在参考信息不足时表达不确定性。该路径要求不调用工具、不修改文件；这些提示词限制仍需独立监测。
'''+table('确定性软件核验与模型判断的区别。','@{}Y Y@{}',r'''
\toprule\textbf{确定性软件逻辑}&\textbf{配置的大语言模型}\\\midrule
核验受支持的选项与数值答案，检查参数和阶段解锁，保存作答记录。 & 理解讲解内容，识别可能的缺漏，提出结合上下文的问题；判断可能出错。\\
依照明确公式计算图像、运动与采样结果。 & 在文件写入流程中，通过智能体工具创建和编辑学习文件。\\\bottomrule
''','两类不同的判断')+r'''
本地文档索引与关键词检索独立于外部推理。本报告不声称每句生成内容都有经过核验的页级引用，也不声称所有 AI 功能都能离线运行。

\section{原创活动与明确的模型假设}
'''+table('数据来源及其用途和解释范围。','@{}P{40mm}Y@{}',r'''
\toprule\textbf{来源}&\textbf{状态与用途}\\\midrule
原创活动目录 & 16 道练习：3 道普通练习、4 道刻意设计的错误案例、9 个迁移阶段。明确标为原创，并非考试真题。\\
演示笔记 & 为本次模拟流程创建的原创英文笔记，不含真实学习者身份或成绩。\\
AI 生成的学习指南 & 由真实模型创建的 Markdown 文件，已在软件中查看，并导出为 PDF 与 DOCX。生成内容仍可审阅。\\
用户学习资料 & 用户自行提供的 Markdown、PDF 与 Word 文件；可以访问并不代表拥有再分发受版权保护资料的权利。\\
公开研究文献 & 为设计提供动机与背景 [1--4]，文献结果不作为格致自身的学习成效。\\\bottomrule
''','数据来源')+fig('fig:markdown','在软件中打开的真实 AI 生成 Markdown 学习指南，其表格与例题可供检查和编辑。')+r'''
\sub{函数模型}
\[
y=a(x-h)^2+k.
\]
当 $a\ne0$ 时，顶点为 $(h,k)$，$a$ 的符号决定开口方向；当 $a=0$ 时，模型退化为常数函数 $y=k$。有限的显示窗口可能裁去部分曲线。学习者在查看结果之前，先预测某个数值。
\sub{受力与运动模型}
对于非负的水平拉力 $F$、质量 $m>0$ 与摩擦系数 $\mu\ge0$，
\[
a=\frac{\max(0,F-\mu mg)}{m},\qquad s(t)=\tfrac12 at^2,\qquad g=9.8\ \mathrm{m\,s^{-2}}.
\]
物体由静止开始，静摩擦系数与滑动摩擦系数视为相同，拉力保持恒定，并忽略空气阻力。当 $F=20$ N、$m=4$ kg、$\mu=0.1$ 时，$a=4.02$ m/s$^2$，$s(3)=18.09$ m。这些是模型计算结果，并非实体实验装置的测量值。
'''+fig('fig:force','真实受力模型运行画面：对 4 kg 物体施加 20 N 拉力，摩擦系数为 0.1，得到加速度 4.02 m/s$^2$，三秒后位移为 18.09 m。这是模拟输出。')+r'''
\sub{概率模型}
对于 $n$ 次独立试验，每次成功概率为 $p$，
\[
P(\text{至少一次成功})=1-(1-p)^n.
\]
采样器使用带种子的伪随机序列，并比较分组采样结果与理论概率。当 $p=0.5$、$n=2$ 时，理论值为 $0.75$。后续样本不一定每次都更接近理论值，记录的频率会发生波动。采样属于模拟，不是收集到的课堂数据。
'''+fig('fig:probability',r'真实概率实验：理论值为 75.00\%，本次记录的 3,000 组样本中有 2,263 组成功，频率为 75.43\%。采样存在波动，不是课堂数据。')+r'''
\section{区分工程检查与学习成效}
\sub{测试过程与证据类型}
自动化检查使用隔离的资料库和用户数据目录。已保存的集成检查实际覆盖 preload/IPC、SQLite、渲染与模型逻辑，同时为 AI 回应及音频提供测试替身。这验证了应用行为，但不能认证服务提供商输出的正确性。另行录制的演示则使用真实的已配置 AI 调用和真实文件工具。
'''+table('已保存的验证证据；数量表示检查项目，不是学生人数。','@{}P{43mm}P{19mm}Y@{}',r'''
\toprule\textbf{证据}&\textbf{结果}&\textbf{能够说明的内容}\\\midrule
学习单元测试 & 19 项通过 & 自信度要求、快照、保守核验、解锁、延迟证据与模型边界。\\
学习集成检查 & 26 项通过 & 真实 UI/IPC/存储流程，AI 与语音合成在该组测试中被替代。打包版本另有保存的 26 项检查报告。\\
界面回归检查 & 33 项通过 & 已记录的界面行为与 1,500 节点图谱压力场景；属于工程断言。\\
LaTeX 转 Typst 转换检查 & 37 项通过 & 已有转换器的回归检查，并非学习评分，也不是一般 PDF 准确性的证明。\\
真实 AI 文件写入录制 & 成功 & 实际创建 Markdown 文件，并随后打开及导出 PDF/DOCX，回应并非注入的替代文本。\\
真实讲解反馈 & 已记录 & 识别了刻意设置的最小值与最大值错误，尚未估计更广泛的回应准确率。\\\bottomrule
''')+r'''
这些测试组包含不同检查，不能简单相加，也不能视作学生样本。数量来自 2026 年 10 月 2 日保存的报告，不来自教育实验。
\sub{已记录的模拟流程}
保存的学习汇总包含\textbf{10 次作答}，其中有\textbf{8 次独立通过}和\textbf{2 次高自信度错误作答}。重拍演示可能产生重复的演示作答。这些记录由脚本化模拟刻意生成，说明系统会保留辅助使用及判断差异，并不是学习者成功率或学习提升估计。
'''+fig('fig:confidence','真实自信度选择与刻意答错后的反馈。系统保留高自信度错误，并与独立通过区分。')+table('用于复现的本地证据目录。','@{}P{11mm}Y@{}',r'''
\toprule\textbf{编号}&\textbf{项目证据位置}\\\midrule
E1 & 学习工作室发布清单。\\
E2 & 学习工作室集成检查报告及 \path{packaged/verification.json}。\\
E3 & UI v2 验证报告。\\
E4 & 首次真实 AI 事件日志及 \path{recorded-ai-events.json}。\\
E5 & 已记录的模拟学习汇总。\\
E6 & 视频交付验证报告。\\\bottomrule
''','证据目录')+r'''
英文提交文件采用英文证据目录，完整源文件路径保存在本地交付清单中。演示使用当前开发版本，先前经过测试的安装包不会自动包含后续演示修正。

\section{同一个概念的多种证据}
\sub{打开有用的资料}
原创笔记介绍 $y=a(x-h)^2+k$。一次真实 AI 请求创建简短的 Markdown 指南，其中包含特征比较表、示例和自检。生成文件在格致中打开，并导出为实际 PDF 和 Word 文件。三个内置阅读器保留学习上下文。这验证的是互操作性，并不证明生成资料的事实内容完全准确。
\sub{解释一条刻意不完整的规则}
脚本中的讲解指出顶点为 $(h,k)$，却刻意将其称为最小值，即使 $a<0$ 也如此。保存的 AI 反馈识别了缺失的符号条件，并正确指出，对于
\[
y=-(x-2)^2+1,
\]
$(2,1)$ 是最大值对应的顶点。反馈还指出 $a\ne0$ 的条件，并提出追问。回应中也包含一处关于混淆数值和位置的不够精确的评论，这说明教师仍应审阅反馈。核心诊断正确，不代表每句话都正确，也不代表自动评分可靠。
'''+fig('fig:feedback','脚本化讲解中的真实模型反馈，能够指出缺失条件；更广泛的准确性与评分可靠性仍需教师验证。')+r'''
\sub{在纠正之前记录自信度}
对于 $x^2-2x+1=0$，判别式为 $\Delta=(-2)^2-4(1)(1)=0$。模拟学习者选择错误选项，同时标记高自信度。地图将这种状态链接到实际保存的作答，并标记可能存在误概念，而不是直接把自信度转为掌握程度。
\sub{找出第一个不成立的步骤}
错误侦探案例从 $x^2=x$ 开始，然后除以 $x$，因此丢失解 $x=0$。正确修正是分解为 $x(x-1)=0$，得到 $x=0$ 或 $x=1$。应用会核验所选步骤和修正方案，同时独立保存文字解释。
'''+fig('fig:detective','错误侦探中实际核验通过的修正：除以 $x$ 会丢失零解。文字解释与客观核验结果分别保存。')+r'''
\sub{改变条件并探究}
迁移路径从读取顶点，推进到改变系数符号，再进入喷泉模型的解释。提示即使允许继续挑战，也会如实记录。实验台允许改变参数，并要求先预测，再展示数值证据。
\note{本案例支持的结论}{连续学习流程可以操作，AI 请求真实执行，并保留了不同类型的证据。该模拟无法证明真实学生学习进步、主动参与，或证明这一方法优于普通练习。}
英文视频为 265.33 秒，约 4 分 25 秒，使用真实软件画面，并明确披露合成旁白。实时网络服务不可用时，屏幕录制和原始文件可用于备用演示。

\section{已知结果与待验证事项}
\sub{局限性}
\begin{itemize}
\item \textbf{没有学习者试用。} 本次材料没有真实参与者样本、经过同意的学校研究、学习增益估计或用户满意度结果。
\item \textbf{AI 反馈尚未验证。} 尚无独立验证的评分量规、已实现的结构化六维评分，或测得的评分者一致性。
\item \textbf{内容覆盖有限。} 原创活动数量较少；真实考试题目及电子书需要另行获取，并审查版权。
\item \textbf{证据能力有限。} 文字推理没有自动认证，软件无法检测应用以外的参考资料使用；重复同一道题不等于延迟迁移。
\item \textbf{运行存在依赖。} 实时 AI 与云端语音需要配置账户及网络连接；最终现场演示前，需要统一最新开发录制与较早的安装包版本。
\end{itemize}
\sub{隐私、安全与版权}
笔记和作答记录保存在设备中。调用外部 AI 时，选定文本与指令会发送给配置的服务商；云端识别和合成也会传输请求内容。本地存储不代表所有数据都已加密，也不意味着绝对保密。账户密钥不得出现在提交材料中。运行日志与会话可能保留内容，因此本项目不声称所有内容都完全不留存。

演示使用原创资料及模拟作答，没有纳入真实参与者身份、生物特征或实际学校成绩。未来开展学习者研究时，需要遵循学校流程，取得知情同意，在要求适用时获得监护人参与，尽量减少数据，以编号标识记录，并明确退出和删除方式。本报告不追认或声称已经获得这些批准。

第三方组件仍受各自许可证约束。生成视觉素材和合成旁白已披露。与可持续发展目标对齐，不意味着联合国背书，也不意味着独占 AI 模型的所有权。
\sub{后续评估方案：尚未开展的计划}
先开展小规模、经知情同意的可行性研究，记录任务完成、失败和可用性。后续对比应采用平行题，在反馈前记录自信度，区分辅助与独立表现，并加入延迟迁移测试。两位教师应审阅一组固定、匿名化的讲解与 AI 回应，记录正确性、缺失条件及误导表述；报告所有失败和缺失观察，而不仅展示成功案例。

预期结果是提高解释准确性、独立迁移能力，并让自信度判断更有依据。在对效果作出结论之前，需要明确测量方案并收集真实学习者数据。

\section{AI 协助与可追溯来源}
'''+table('AI 工具使用与人工贡献边界。','@{}P{33mm}P{31mm}Y@{}',r'''
\toprule\textbf{工具或平台}&\textbf{已知版本}&\textbf{用途与贡献边界}\\\midrule
Codex AI 助手 & 会话后端标识未记录。 & 大量协助代码生成、调试、测试、界面素材、文档起草及视频制作；生成内容不表述为学生独立完成。\\
DeepSeek Harness & 0.2.0-rc.2，已在本机核验。 & 应用智能体运行时，实际文件写入与讲解反馈使用配置的大语言模型账户；保存结果未暴露精确后端版本。\\
OpenAI 图像生成 & 内置工具，模型修订版本未暴露。 & 生成 AI 伙伴、品牌素材与比赛海报；这些不是学生照片，也不是实测证据。\\
腾讯云语音合成 & SDK 4.1.237；YunLeo 403007。 & 常速英文合成旁白，记录公开设置与请求标识，排除密钥。\\\bottomrule
''','AI 工具使用披露')+r'''
\sub{人工输入与署名}
参赛成员为 Lin Kit、Lei Chengchek 和 Feng Ziwen，指导教师为曾剑辉。现有人工输入包括项目需求、功能优先顺序、视觉与视频输出审阅、录制问题识别，以及提供的团队信息。现有记录未明确每位成员各自的编程或研究贡献。团队应准确记录个人职责；本报告不编造分工，也不编造未实施的学习者研究。

\section*{参考文献}
'''+re.search(r'\\begin\{enumerate\}\[label=\{\[\\arabic\*\]\}.*?\\end\{enumerate\}',REPORT_EN,re.S).group(0)+r'''
\end{document}
'''

# Keep bibliographic titles and author spellings in their source language for traceability.
# Translate the explanatory notes for local references without changing their identity.
REPORT = REPORT.replace('Six-page circular supplied by the team; submission requirements and rubric on pages 4--6.', '团队提供的六页比赛文件，提交要求与评分标准位于第 4--6 页。')
REPORT = REPORT.replace('Prototype release, verification reports, real AI event logs, simulated attempt summary and video verification. Evidence identifiers E1--E6; source locations are supplied in the local delivery manifest.', '原型发布清单、验证报告、真实 AI 事件日志、模拟作答汇总与视频验证，证据编号 E1--E6；源文件位置保存在本地交付清单中。')
for name, content in [('ProjectIntroduction_Gezhi_中文',INTRO),('ResearchReport_Gezhi_中文',REPORT)]:
    (OUT / (name+'.tex')).write_text(PRE+content,encoding='utf-8')
manifest = {'translatedFrom': ['ProjectIntroduction_Gezhi.tex','ResearchReport_Gezhi.tex'], 'translationDate':'2026-10-03', 'pageLimit':None, 'sourceIllustrationsPreserved':True, 'sourceBibliographyPreserved':True, 'members':['Lin Kit','Lei Chengchek','Feng Ziwen'], 'teacherChineseName':'曾剑辉', 'realStudentTrial':False}
(OUT/'translation-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Two complete Chinese LaTeX translations authored with the original figures and references.')
