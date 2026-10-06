"""Standalone LaTeX submission sources, grounded in saved prototype evidence."""
from pathlib import Path
import json
import re
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/gezhi-competition'
OUT.mkdir(parents=True, exist_ok=True)

PRE = r'''\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{mathptmx,courier}
\usepackage[margin=20mm,top=19mm,bottom=19mm]{geometry}
\usepackage{xcolor,booktabs,tabularx,array,enumitem,amsmath,tikz,fancyhdr,microtype}
\usepackage{graphicx,caption,titlesec}
\usepackage[hidelinks]{hyperref}
\usepackage{xurl}
\usetikzlibrary{arrows.meta,positioning,calc}
\definecolor{ink}{HTML}{192338}
\definecolor{accent}{HTML}{6851AA}
\definecolor{wash}{HTML}{F3F1F9}
\definecolor{muted}{HTML}{5B6475}
\definecolor{teal}{HTML}{237C74}
\color{ink}
\setlength{\parindent}{0pt}
\setlength{\parskip}{3pt}
\setlength{\headheight}{14pt}
\emergencystretch=2em
\setlist[itemize]{leftmargin=1.3em,itemsep=1.5pt,topsep=2pt,parsep=0pt}
\setlist[enumerate]{leftmargin=1.5em,itemsep=1.5pt,topsep=2pt,parsep=0pt}
\newcolumntype{Y}{>{\raggedright\arraybackslash}X}
\newcolumntype{P}[1]{>{\raggedright\arraybackslash}p{#1}}
\renewcommand{\arraystretch}{1.13}
\setlength{\tabcolsep}{5pt}
\setlength{\textfloatsep}{9pt plus 2pt minus 2pt}
\setlength{\intextsep}{8pt plus 2pt minus 2pt}
\setlength{\floatsep}{7pt plus 2pt minus 2pt}
\renewcommand{\topfraction}{.92}
\renewcommand{\bottomfraction}{.88}
\renewcommand{\textfraction}{.07}
\renewcommand{\floatpagefraction}{.85}
\setcounter{topnumber}{4}
\setcounter{bottomnumber}{3}
\setcounter{totalnumber}{7}
\captionsetup{font=small,labelfont=bf,skip=4pt,justification=raggedright,singlelinecheck=false}
\titleformat{\section}{\normalfont\large\bfseries\color{ink}}{\thesection.}{.5em}{}
\titlespacing*{\section}{0pt}{9pt plus 2pt minus 1pt}{4pt}
\titleformat{\subsection}{\normalfont\normalsize\bfseries}{\thesubsection}{.5em}{}
\titlespacing*{\subsection}{0pt}{6pt plus 1pt minus 1pt}{2pt}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\footnotesize\textsc{Gezhi} --- \docname}
\fancyhead[R]{\footnotesize AI for Education / 2026}
\fancyfoot[L]{\scriptsize\color{muted} Hou Kong Middle School, Macau}
\fancyfoot[R]{\scriptsize\thepage}
\renewcommand{\headrulewidth}{0.35pt}
\newcommand{\tagline}[1]{{\small\bfseries\color{accent} #1}\par\vspace{4pt}}
\newcommand{\heading}[2]{\section{#2}}
\newcommand{\sub}[1]{\subsection{#1}}
\newcommand{\note}[2]{\par\noindent\colorbox{wash}{\parbox{\dimexpr\linewidth-2\fboxsep\relax}{\vspace{4pt}\textbf{#1}\par #2\vspace{4pt}}}\par}
\newcommand{\team}{\textbf{Hou Kong Middle School, Macau}\\ Lin Kit \enspace / \enspace Lei Chengchek \enspace / \enspace Feng Ziwen\\ Supervising teacher: Chang Kim Fai}
\hypersetup{pdfauthor={Lin Kit, Lei Chengchek, Feng Ziwen},pdfsubject={AI for Education; SDG 4; working prototype and simulated educational testing}}
\newcommand{\papertitle}[2]{\begin{center}{\fontsize{20}{23}\selectfont\bfseries Gezhi: Make Understanding Visible}\par\vspace{3pt}{\normalsize #2}\par\vspace{5pt}{\bfseries Lin Kit \enspace / \enspace Lei Chengchek \enspace / \enspace Feng Ziwen}\par Hou Kong Middle School, Macau\par Supervising teacher: Chang Kim Fai\par{\small AI for SDGs -- Global Youth AI Future Innovation Competition 2026\par Macau Secondary School Division / AI for Education / 2 October 2026}\end{center}\vspace{-4pt}}
\newcommand{\docname}{Competition report}
\begin{document}
'''

INTRO = r'''
\heading{PROJECT INTRODUCTION}{Gezhi: Make Understanding Visible}
{\large A local-first AI learning workspace for secondary students}\par
\team\par
{\small AI for SDGs -- Global Youth AI Future Innovation Competition 2026\\
Macau Secondary School Division / AI for Education / 2 October 2026}

\sub{1. The problem and the people}
A student can recognise a worked answer yet struggle to explain why it is valid, notice a missing condition, or apply it in a different setting. A polished AI response can hide that gap. Gezhi makes the learner's own explanation, confidence and later attempts visible in one workspace.

The intended users are secondary-school students in Macau who already have some exposure to the topic and study from a mixture of notes and documents. Teachers can use the learner's exported evidence to discuss specific difficulties; a class dashboard is not currently provided.

\sub{2. What the prototype does}
\begin{tabularx}{\linewidth}{@{}p{39mm}Y@{}}
\toprule \textbf{Learning action} & \textbf{Implemented behaviour}\\\midrule
Explain to Xiaoge & The student explains by typing or speech input. The configured LLM identifies correct ideas, missing conditions and follow-up questions. Feedback requires review.\\
Commit confidence & Confidence is required before feedback. Answers, hints and reference help are recorded separately.\\
Be an error detective & Locate the first incorrect step, choose a repair, and write the reason. Objective choices are checked; prose is retained separately.\\
Inspect the evidence & Concept nodes link to attempts and assistance. A confident error is a possible misconception; one pass is not declared full mastery.\\
Transfer and experiment & Three-stage challenges change the conditions. Function, force and probability models support prediction, testing and explanation.\\\bottomrule
\end{tabularx}

The workspace also opens Markdown, PDF and Word documents. A real AI request can create a Markdown study guide in the demonstration library; the resulting file can be opened, edited and exported. Note relationships have their own graph, separate from learning evidence.

\note{The learning loop}{Read a source $\rightarrow$ explain or predict $\rightarrow$ commit confidence $\rightarrow$ inspect feedback $\rightarrow$ repair $\rightarrow$ transfer $\rightarrow$ retest.}

\newpage
\heading{PROJECT INTRODUCTION / CONTINUED}{AI, Evidence and Educational Value}
\sub{3. Where AI is used}
Gezhi is an Electron desktop application with a React/TypeScript interface and local SQLite stores. DeepSeek Harness (DSH) 0.2.0-rc.2 runs as an agent subprocess using the user's configured model account. It streams tool calls and responses, and supports real note creation. The explanation prompt supplies the learner's words and available note context, asks for specific gaps, and avoids a complete replacement lecture.

The system does not train a new foundation model. Objective answer checks, stage unlocking and numerical experiments use explicit software rules. LLM feedback is a distinct, fallible layer. Notes and learning records are stored locally; selected content is sent to the configured external AI service when AI is invoked. Cloud speech also needs a network service.

\sub{4. What is distinctive}
Learning by teaching and self-explanation are established approaches. Gezhi's contribution is their integration with a visible confidence record, deliberate error diagnosis, traceable concept evidence and condition-changing challenges in the student's document workspace. The experiment bench adds a complete ``predict, test, explain'' interaction rather than only displaying a graph.

Compared with a general chatbot, the prototype retains the evidence behind its learning states. Compared with a note graph, its concept map distinguishes recent independent passes, assistance and confident errors. These are design differences, not evidence that Gezhi outperforms other products.

\sub{5. Current evidence and its limits}
\begin{itemize}
\item The original activity catalogue contains 16 exercises: 3 practice items, 4 error-detective cases and 9 transfer stages, plus 3 interactive experiment models.
\item Saved checks report 19 learning unit tests, 26 learning integration checks and 33 interface checks passing. Integration AI/TTS responses were test doubles; actual model use is documented separately in the demonstration.
\item Live recording demonstrates real AI file creation and explanation feedback, together with actual MD/PDF/DOCX reading. The English video runs for approximately 4 minutes 25 seconds.
\end{itemize}
\note{No student trial has been conducted}{Evidence currently supports prototype operation and a simulated educational session. No learning-gain percentage, student sample, school approval or human-rated scoring accuracy is claimed.}

\sub{6. Expected impact and next steps}
The intended contribution to SDG 4 is accessible explanatory practice and better-informed study decisions. Asking students to question AI feedback also supports critical AI literacy. These are intended benefits, to be tested with learners and teachers. Priority next steps are a small consented usability trial, independent teacher review of AI feedback, delayed transfer tests and a reproducible record of each student's contribution.

\small\textbf{AI assistance disclosure.} Codex assisted substantially with coding, tests, design and document drafting. AI-generated visual assets and Tencent Cloud synthetic narration were used in the demonstration materials. The Research Report distinguishes human requirements and review from generated work and lists known tool versions.
\end{document}
'''

REPORT = r'''
\heading{RESEARCH REPORT}{Gezhi: Make Understanding Visible}
{\large Design, implementation and simulated educational testing}\par
\team\par
{\small AI for SDGs -- Global Youth AI Future Innovation Competition 2026\\
Macau Secondary School Division / AI for Education / 2 October 2026}

\sub{Abstract}
Gezhi is a Windows desktop learning workspace that links a student's own materials to explanations, confidence judgments and inspectable evidence. The learner explains a concept to an AI companion, diagnoses an incorrect derivation, applies an idea under changed conditions, and investigates it through an interactive experiment. A separate concept map exposes the actual attempts and assistance behind a learning state.

The implementation combines Electron, React/TypeScript, SQLite and a DeepSeek Harness agent subprocess. The configured LLM provides contextual feedback and creates useful Markdown files. Objective answer checks and mathematical experiments are deterministic software functions, not model-generated grades. Local storage and local retrieval reduce routine transfers, while selected context and cloud speech requests still use external services.

The current evidence comprises saved automated checks, real AI interactions and a simulated learning session. The activity catalogue contains 16 original exercises and three experiment models. Saved reports document passing unit, integration, interface and document-conversion checks; the integration AI/TTS paths used test doubles. Separate real recordings establish file creation, explanation feedback and built-in document viewing.

\note{Study status}{The team confirmed that no real student trial has been conducted. This report is a prototype engineering and simulation report, not a study of learning effectiveness. It reports neither participant outcomes nor validated AI scoring accuracy.}

\sub{Report map}
\begin{tabularx}{\linewidth}{@{}p{13mm}Y p{13mm}Y@{}}
\toprule \textbf{Page}&\textbf{Topic}&\textbf{Page}&\textbf{Topic}\\\midrule
2 & Educational problem and related work & 6 & Verification and recorded results\\
3 & Learning design and feature scope & 7 & A worked demonstration case\\
4 & Architecture and AI method & 8 & Limits, ethics and evaluation plan\\
5 & Data sources and experiment models & 9 & AI disclosure and references\\\bottomrule
\end{tabularx}
\vfill
{\small\color{muted}Keywords: self-explanation; learning evidence; confidence calibration; AI literacy; local-first software; transfer; SDG 4.}

\newpage
\heading{01 / EDUCATIONAL PROBLEM}{Understanding Needs Observable Evidence}
\sub{Background}
A familiar result can feel like understanding. The gap becomes visible when a learner has to explain a condition, repair a faulty step, or solve a related problem with a different sign or context. General-purpose AI can support these activities, but an answer alone does not show what the learner can do independently.

Self-explanation research motivates requiring the learner to generate causal and conceptual connections. Bisra et al. (2018) synthesise studies of prompts that induce self-explanation [1]. Earlier teachable-agent research investigates learning through responsibility for a virtual learner [2]. These findings motivate the design; their effects cannot be transferred to Gezhi without a study of this implementation.

UNESCO's student AI framework includes human-centred judgment, ethical use, techniques and applications, and system design [3]. Gezhi therefore asks learners to inspect and question feedback rather than regard the AI as an authoritative grader. Its intended SDG connection is quality secondary learning and relevant skills, including the aims of targets 4.1 and 4.4 [4]. This is a design alignment, not a measured SDG impact.

\sub{Target and scope}
The primary audience is secondary-school students in Macau using their own course materials. The prototype is single-user and Windows-based. It focuses on explanation and evidence around a limited original exercise catalogue; it is not a complete curriculum, licensed electronic-book library or classroom management platform.

\sub{Research and engineering questions}
\begin{tabularx}{\linewidth}{@{}p{12mm}Y Y@{}}
\toprule & \textbf{Question} & \textbf{Current evidence status}\\\midrule
RQ1 & Can the complete learning workflow operate and retain traceable attempts? & Addressed through implementation, recorded simulation and saved checks.\\
RQ2 & Can real AI feedback identify a deliberately omitted condition using note context? & A recorded case demonstrates feasibility; general accuracy is not measured.\\
RQ3 & Does the workflow improve delayed transfer or confidence calibration? & Not yet evaluated with learners.\\
RQ4 & Can students critically identify correct and incorrect AI feedback? & Intended AI-literacy outcome; a future trial is needed.\\\bottomrule
\end{tabularx}

\sub{Position relative to existing approaches}
The prototype combines familiar mechanisms into a connected workflow. Chat supplies feedback; a note graph supplies links; a quiz checks a choice; a simulation displays a model. Gezhi adds a common record of confidence, assistance and condition changes. It does not claim to invent learning by teaching or to be the first application with a knowledge graph.

\newpage
\heading{02 / SOLUTION DESIGN}{A Learner-Produced Learning Loop}
\sub{Sequence}
\begin{center}
\begin{tikzpicture}[n/.style={draw=accent,fill=wash,rounded corners=4pt,text width=26mm,minimum height=17mm,align=center,font=\small},a/.style={-{Stealth[length=2mm]},thick,accent}]
\node[n] (a) {Read\\a source};
\node[n,right=4mm of a] (b) {Explain\\or predict};
\node[n,right=4mm of b] (c) {Commit\\confidence};
\node[n,right=4mm of c] (d) {Inspect\\and repair};
\node[n,right=4mm of d] (e) {Transfer\\and retest};
\draw[a] (a)--(b);\draw[a] (b)--(c);\draw[a] (c)--(d);\draw[a] (d)--(e);
\end{tikzpicture}
\end{center}
The student supplies the substantive explanation and prediction. Feedback comes after the commitment, and future practice should be informed by the underlying attempt rather than a single summary score.

\sub{Implemented modules}
\begin{tabularx}{\linewidth}{@{}p{34mm}Y Y@{}}
\toprule \textbf{Module} & \textbf{Interaction} & \textbf{Evidence retained or limit}\\\midrule
Explain to AI & Typed explanation or microphone transcription; contextual model response and follow-up questions. & Feedback text is fallible. A validated six-dimension grading system is not implemented.\\
Confidence record & Required three-level confidence before revealing feedback. & Answer, confidence, hint use and reference help are stored.\\
Error Detective & Identify the earliest faulty step, choose a repair and give a reason. & Objective choices are checked. Written reasoning is stored without semantic certification.\\
Evidence map & Search, filter, zoom, pan, drag and inspect concept evidence. & Recent independent passes and possible misconceptions are conservative labels.\\
Transfer challenge & Three paths, each with three stages: initial use, changed condition and context. & Later stages require an earlier pass; hinted passes are distinguished from independent transfer.\\
Concept workbench & Change a condition, commit prediction and confidence, run a model, record observation. & Numerical checks use the same model as the display.\\\bottomrule
\end{tabularx}

\sub{A map is not a mastery certificate}
A confident objectively wrong answer can trigger ``possible misconception''. One independent pass supports only a recent success. Different-question independent passes separated by at least 24 hours are needed for delayed evidence. Text-only answers that cannot be reliably parsed remain self-assessed. These distinctions reduce the risk of turning sparse data into an inflated mastery claim.

The note-link graph represents file relationships. The learning map represents concepts and attempts. Solid arrows denote designed prerequisites; dashed lines denote association or co-occurrence, not proven causal dependencies.

\newpage
\heading{03 / TECHNICAL METHOD}{Local Records, Selective External AI}
\begin{center}
\begin{tikzpicture}[n/.style={draw=accent,fill=wash,rounded corners=4pt,text width=43mm,minimum height=18mm,align=center,font=\small},a/.style={-{Stealth[length=2mm]},thick,accent}]
\node[n] (ui) {React / TypeScript\\Learner interface};
\node[n,right=10mm of ui] (main) {Electron main process\\IPC and validation};
\node[n,right=10mm of main] (db) {Local files / SQLite\\Notes and attempts};
\node[n,below=15mm of main] (dsh) {DSH agent bridge\\NDJSON events};
\node[n,right=10mm of dsh,draw=teal,fill=teal!6] (cloud) {Configured LLM service\\Selected context};
\draw[a] (ui)--(main);\draw[a] (main)--(db);\draw[a] (main)--(dsh);
\draw[a,dashed,teal] (dsh)--node[above,font=\scriptsize]{network}(cloud);
\end{tikzpicture}
\end{center}
\sub{Agent integration}
The bridge launches DSH as a separate process and consumes UTF-8, newline-delimited JSON events: session, status, thinking, tool call, tool result, text and final response. Session identifiers support continued conversations. The installed DSH version was verified as 0.2.0-rc.2. The process is launched with the selected vault as working directory; effective filesystem restrictions additionally depend on the agent sandbox and host policy. A working directory alone is not an operating-system security boundary.

The application integrates the user's configured LLM account. No new foundation model is trained. The successful captured calls do not expose the exact backend model revision, so this report does not invent one or equate the DSH version with the model version.

\sub{Prompt and feedback design}
The explanation prompt includes the topic, the learner's transcript or typed text, and up to 4,000 characters of the open note when available. It asks for correct content, missing conditions, unclear or incorrect claims, and two follow-up questions in the English demonstration. It explicitly distinguishes AI feedback from certified assessment and asks for uncertainty where the reference is insufficient. This path requests no tool calls or file modifications; prompt constraints still need independent monitoring.

\sub{Two different judgments}
\begin{tabularx}{\linewidth}{@{}Y Y@{}}
\toprule \textbf{Deterministic software} & \textbf{Configured LLM}\\\midrule
Checks supported choices and numbers; validates parameters and stage unlocking; stores attempts. & Interprets an explanation, identifies possible gaps and asks contextual questions; can be wrong.\\
Computes graphs, motion and sampling with explicit formulas. & Creates and edits study files through the agent tools in the file-writing workflow.\\\bottomrule
\end{tabularx}
Local document indexing and keyword retrieval are separate from external inference. No claim is made that every generated sentence has a verified page-level citation, or that all AI functionality works offline.

\newpage
\heading{04 / DATA AND MODELS}{Original Activities and Explicit Assumptions}
\sub{Data sources}
\begin{tabularx}{\linewidth}{@{}p{40mm}Y@{}}
\toprule \textbf{Source} & \textbf{Status and use}\\\midrule
Original activity catalogue & 16 exercises: 3 ordinary practice, 4 deliberate-error cases, 9 transfer stages. Labelled original, not examination questions.\\
Demonstration notes & Original English notes created for this simulated session; no real learner identities or grades.\\
AI-created study guide & A real model-created Markdown file, inspected in the application and exported to PDF/DOCX. Generated content remains reviewable.\\
User study materials & User-supplied Markdown, PDF and Word files. Availability does not imply a right to redistribute copyrighted materials.\\
Published literature & Motivation and design context [1--4]; research findings are not reported as Gezhi outcomes.\\\bottomrule
\end{tabularx}

\sub{Function model}
\[
y=a(x-h)^2+k.
\]
For $a\ne0$, the vertex is $(h,k)$; the sign of $a$ determines opening direction. For $a=0$ the model degenerates to the constant $y=k$. A finite display window can clip the graph. The learner predicts a numerical value before inspecting the result.

\sub{Force and motion model}
For non-negative horizontal force $F$, mass $m>0$ and friction coefficient $\mu\ge0$,
\[
a=\frac{\max(0,F-\mu mg)}{m},\qquad s(t)=\tfrac12 at^2,\qquad g=9.8\ \mathrm{m\,s^{-2}}.
\]
The block starts at rest; static and kinetic friction coefficients are treated as equal, force is constant and air resistance is ignored. With $F=20$ N, $m=4$ kg and $\mu=0.1$, $a=4.02$ m/s$^2$ and $s(3)=18.09$ m. These are model calculations, not measurements of a physical apparatus.

\sub{Probability model}
For $n$ independent trials with success probability $p$ per trial,
\[
P(\text{at least one success})=1-(1-p)^n.
\]
The sampler uses a seeded pseudorandom sequence and compares groups with the theoretical probability. For $p=0.5$ and $n=2$, theory gives $0.75$. A later sample need not always be closer to theory; the recorded frequency fluctuates. Sampling is a simulation, not collected classroom data.

\newpage
\heading{05 / VERIFICATION}{Separate Engineering Checks from Learning Outcomes}
\sub{Procedure and evidence types}
Automated checks use isolated libraries and user-data directories. Saved integration checks exercise actual preload/IPC, SQLite, rendering and model logic while supplying test-double AI responses and audio. This verifies application behaviour without certifying a provider's output. Separately, the recorded demonstration uses genuine configured AI calls and real file tools.

\begin{tabularx}{\linewidth}{@{}p{43mm}p{19mm}Y@{}}
\toprule \textbf{Evidence} & \textbf{Result} & \textbf{What it establishes}\\\midrule
Learning unit suite & 19 passed & Confidence requirements, snapshots, conservative checking, unlocking, delayed evidence and model boundaries.\\
Learning integration checks & 26 passed & Actual UI/IPC/storage workflow; AI/TTS substituted in this suite. The packaged build also has a saved 26-check report.\\
Interface regression checks & 33 passed & Recorded UI behaviour and a 1,500-node graph stress scenario; these are engineering assertions.\\
LaTeX-to-Typst conversion suite & 37 passed & Existing converter regressions; not a score for learning or general PDF accuracy.\\
Real AI file-writing recording & Successful & Actual Markdown creation and subsequent opening and PDF/DOCX export, not an injected reply.\\
Real explanation feedback & Recorded & A deliberate minimum/maximum error is identified; broader response accuracy is not estimated.\\\bottomrule
\end{tabularx}

These suites contain different checks and should not be summed or described as a student sample. Counts are taken from saved reports dated 2 October 2026, not from an educational experiment.

\sub{Recorded simulated session}
The saved learning summary contains \textbf{10 attempts}, including \textbf{8 independent passes} and \textbf{2 high-confidence wrong attempts}. Retakes can generate repeated demonstration attempts. These records were deliberately produced during a scripted simulation. They show that the system preserves assistance and judgment differences; they are not a learner success rate or an improvement estimate.

\sub{Evidence register}
\small
\begin{tabularx}{\linewidth}{@{}p{11mm}Y@{}}
\toprule ID & \textbf{Project evidence location}\\\midrule
E1 & \path{产出/learning-studio/release-manifest.json}\\
E2 & \path{产出/learning-studio/verification.json} and \path{packaged/verification.json}\\
E3 & \path{产出/ui-v2/verification.json}\\
E4 & \path{产出/demo-video-20261002/real-ai-events.json} and \path{recorded-ai-events.json}\\
E5 & \path{产出/demo-video-20261002/actual-learning-records.json}\\
E6 & \path{产出/demo-video-20261002/delivery-verification.json}\\\bottomrule
\end{tabularx}
\normalsize
The submission copy uses an English evidence register; full source paths are retained in the delivery manifest. The demonstration uses the current development build. The previously tested installer does not automatically contain later demonstration changes.

\newpage
\heading{06 / DEMONSTRATION CASE}{One Concept, Several Kinds of Evidence}
\sub{1. Open a useful source}
Original notes introduce $y=a(x-h)^2+k$. A real AI request creates a short Markdown guide with a feature table, a worked example and self-checks. The created file is opened in Gezhi and exported to real PDF and Word files. The three built-in readers retain the study context. This tests interoperability, not factual perfection of generated material.

\sub{2. Explain an intentionally incomplete rule}
The scripted explanation states the vertex is $(h,k)$ but deliberately calls it a minimum even for $a<0$. The recorded AI feedback identifies the missing sign condition and correctly treats $(2,1)$ as a maximum for
\[
y=-(x-2)^2+1.
\]
It also raises $a\ne0$ and asks follow-up questions. The response contains a less precise remark about mixing up the value and location, illustrating why a teacher should review feedback. A correct central diagnosis does not validate every sentence or imply reliable automatic scoring.

\sub{3. Commit confidence before correction}
For $x^2-2x+1=0$, the discriminant is $\Delta=(-2)^2-4(1)(1)=0$. The simulated learner selects a wrong option while marking confidence as high. The map links that state to the actual recorded attempt. It labels a possible misconception instead of silently converting confidence into mastery.

\sub{4. Find the first invalid step}
An error-detective case starts from $x^2=x$ and divides by $x$, losing the solution $x=0$. The repair is to factor $x(x-1)=0$, yielding $x=0$ or $x=1$. The application checks the chosen step and repair, while retaining the written explanation separately.

\sub{5. Change the conditions and investigate}
The transfer path moves from reading a vertex to changing the coefficient sign and then interpreting a fountain model. Hints are recorded even when they permit progression. The experiment bench changes parameters and asks for a prediction before showing numerical evidence.

\note{What this case supports}{The connected workflow is operable, AI requests are real, and distinct evidence is retained. The simulation does not establish that actual students improve, that they engage voluntarily, or that the approach is superior to ordinary practice.}

The English video is 265.33 seconds (approximately 4:25), with real application captures and clearly disclosed synthetic narration. Screen recordings and original files provide a fallback when a live network service is unavailable.

\newpage
\heading{07 / LIMITS AND RESPONSIBILITY}{What We Know, and What Must Be Tested}
\sub{Limitations}
\begin{itemize}
\item \textbf{No learner trial.} No participant sample, consented school study, learning-gain estimate or user-satisfaction result exists for this submission.
\item \textbf{AI feedback is unvalidated.} There is no independently validated rubric, structured six-dimension grading implementation or measured inter-rater reliability.
\item \textbf{Limited coverage.} The original catalogue is small. Real examination questions and electronic books require separate acquisition and copyright review.
\item \textbf{Restricted evidence.} Prose reasoning is not automatically certified. The software cannot detect reference use outside the application. Same-item repetition is not delayed transfer.
\item \textbf{Operational dependencies.} Live AI and cloud speech need configured accounts and connectivity. The latest development recording and the earlier installer must be reconciled before a final live demonstration.
\end{itemize}

\sub{Privacy, safety and copyright}
Notes and attempt records are stored on the device. Invoking external AI sends selected text and instructions to the configured provider; cloud recognition and synthesis also transfer their request content. Local storage is not a claim of blanket encryption or absolute secrecy. Account secrets must not appear in submitted material. Runtime logs and sessions may retain content, so the submission does not claim universal non-retention.

The demonstration uses original material and simulated attempts. No participant identities, biometric data or actual school grades are included. A future learner study would require the relevant school process, informed consent, guardian involvement where required, minimised data, coded records and an explicit withdrawal/deletion procedure. No such approval is claimed retrospectively.

Third-party components remain subject to their own licences. Generated visual assets and synthetic narration are disclosed. No United Nations endorsement or exclusive ownership of an AI model is implied by SDG alignment.

\sub{Next evaluation: a proposed plan, not completed work}
A small consented feasibility study should first measure task completion, failures and usability. A later comparison should use parallel questions, record confidence before feedback, separate assisted from independent performance, and include a delayed transfer test. Two teachers should review a fixed, anonymised set of explanations and AI replies, recording correctness, missing conditions and misleading statements. Report all failures and missing observations, not only successful demonstrations.

The intended outcomes are explanatory accuracy, independent transfer and more informative confidence judgments. Their measurement needs a protocol and actual learner data before claims about effectiveness.

\newpage
\heading{08 / DISCLOSURE AND SOURCES}{AI Assistance and Traceable References}
\sub{AI tool disclosure}
\begin{tabularx}{\linewidth}{@{}p{33mm}p{31mm}Y@{}}
\toprule \textbf{Tool / platform} & \textbf{Known version} & \textbf{Use and contribution boundary}\\\midrule
Codex AI assistant & Session backend identifier not recorded & Substantial assistance with code generation, debugging, tests, UI assets, document drafting and video production. Generated work is not represented as independently student-written.\\
DeepSeek Harness & 0.2.0-rc.2, checked locally & Application agent runtime. Real file writing and explanation feedback use the configured LLM account; its precise backend revision is not exposed in captured results.\\
OpenAI image generation & Built-in tool; model revision not exposed & AI-generated companion/brand assets and competition poster design; neither photographs of students nor measured evidence.\\
Tencent Cloud TTS & SDK 4.1.237; YunLeo 403007 & Normal-speed synthetic English narration. Public settings and request IDs are recorded; secrets are excluded.\\\bottomrule
\end{tabularx}

\sub{Human input and attribution}
The submitting members are Lin Kit, Lei Chengchek and Feng Ziwen, with supervising teacher Chang Kim Fai. The available human input includes the project requirements, feature priorities, review of the visual/video outputs, identification of recording defects, and the supplied team information. The available record does not identify each member's individual code or research contribution. Individual roles should be documented accurately by the team; this report does not invent a division of labour or an unperformed learner study.

\sub{References}
\begin{enumerate}[label={[\arabic*]},leftmargin=7mm,itemsep=5pt]
\item Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., and Winne, P. H. (2018). Inducing Self-Explanation: a Meta-Analysis. \emph{Educational Psychology Review}, 30, 703--725. \url{https://doi.org/10.1007/s10648-018-9434-x}
\item Chase, C. C., Chin, D. B., Oppezzo, M. A., and Schwartz, D. L. (2009). Teachable Agents and the Prot\'{e}g\'{e} Effect: Increasing the Effort Towards Learning. \emph{Journal of Science Education and Technology}, 18, 334--352. \url{https://doi.org/10.1007/s10956-009-9180-4}
\item Miao, F., Shiohira, K., and Lao, N. (2024). \emph{AI Competency Framework for Students}. UNESCO. \url{https://www.unesco.org/en/articles/ai-competency-framework-students}
\item United Nations Department of Economic and Social Affairs. \emph{Goal 4: Quality Education}. \url{https://sdgs.un.org/goals/goal4}
\item Macao Computer Society (2026). \emph{AI for SDGs -- Global Youth AI Future Innovation Competition 2026: Macau Secondary School Division Rules}. Six-page circular supplied by the team; submission requirements and rubric on pages 4--6.
\item Gezhi project (2 October 2026). Prototype release, verification reports, real AI event logs, simulated attempt summary and video verification. Evidence identifiers E1--E6; source locations are supplied in the local delivery manifest.
\end{enumerate}
\end{document}
'''

ASSETS = OUT / 'assets'
ASSETS.mkdir(exist_ok=True)
FIGURE_SOURCES = {}

def screenshot(name, crop=None, width=r'\linewidth'):
    """Embed an unchanged recorded PNG; graphicx crops only the page viewport."""
    source = (ASSETS / 'evidence-user-capture.png') if name == '09-evidence' else ROOT / '产出/demo-video-20261002' / (name + '.png')
    if name == '09-evidence':
        # Preserve all nodes and the selected concept metrics. Omit the lower
        # attempt list, which contains an untranslated label and a clipped footer.
        crop = (0, 0, 1084, 606)
    target = ASSETS / (name + '.png')
    shutil.copy2(source, target)
    with Image.open(source) as im:
        w, h = im.size
        dpi = im.info.get('dpi', (72, 72))
    options = 'width=' + width
    if crop:
        x0, y0, x1, y1 = crop
        left, bottom, right, top = x0*72/dpi[0], (h-y1)*72/dpi[1], (w-x1)*72/dpi[0], y0*72/dpi[1]
        options += f',trim={left:.3f}bp {bottom:.3f}bp {right:.3f}bp {top:.3f}bp,clip'
    FIGURE_SOURCES[name] = {'source': str(source.relative_to(ROOT)), 'sourcePixels': [w,h], 'visibleCropPixels': crop, 'pixelEdits': False, 'kind': 'real application screenshot; scripted educational simulation'}
    return r'\includegraphics[' + options + ']{' + target.as_posix() + '}'

def shotfigure(name, crop, caption, label, width=r'\linewidth'):
    return '\n'+r'\begin{figure}[!htbp]'+'\n'+r'\centering'+'\n'+screenshot(name,crop,width)+'\n'+r'\caption{'+caption+'}'+r'\label{'+label+'}\n'+r'\end{figure}'+'\n'

INTRO = r'''
\renewcommand{\docname}{Project introduction}
\papertitle{Project introduction}{Project introduction: a local-first AI learning workspace}
\section{Problem, users and purpose}
A student can recognise an answer yet struggle to explain its conditions, repair an invalid step, or apply it elsewhere. Gezhi connects these activities to the student's own notes and documents. It is a working Windows prototype for secondary-school students in Macau, with an AI companion, original practice activities and a traceable learning record. The intended SDG connection is quality education and critical AI literacy; learning benefits have not yet been measured.
\section{A connected learning experience}
The learner reads a source, explains or predicts, commits confidence before feedback, repairs an error and attempts transfer. Three interactive models let the learner test a prediction by changing parameters. Figure~\ref{fig:intro-lab} shows the actual quadratic-function workbench.
'''+shotfigure('11-quadratic',(76,110,1202,664),'Actual concept workbench: change a coefficient, inspect the curve and commit a prediction. The capture is a scripted demonstration, not a student trial.','fig:intro-lab')+r'''
\begin{table}[!htbp]
\caption{Implemented learning actions and retained evidence.}
\small
\begin{tabularx}{\linewidth}{@{}P{34mm}Y@{}}
\toprule\textbf{Action}&\textbf{Implemented behaviour}\\\midrule
Teach Xiaoge & Typed or spoken explanation; contextual AI feedback and follow-up questions.\\
Confidence and repair & Three-level confidence before feedback; locate the first invalid step and select a correction.\\
Evidence and transfer & Link concepts to attempts and assistance; three-stage paths change the conditions.\\
Experiment & Function, force and probability models; predict, test, observe and explain.\\\bottomrule
\end{tabularx}
\end{table}
\newpage
\section{Real AI and useful documents}
Electron, React/TypeScript and local SQLite stores support the workspace. DeepSeek Harness 0.2.0-rc.2 runs the configured LLM account as an agent subprocess. Real recorded requests create Markdown files and give explanation feedback. Built-in readers open Markdown, PDF and Word files; generated notes can be edited and exported. Selected content and cloud speech requests use external services. Objective choices, supported numbers and experiment formulas are checked by software; AI feedback requires review.
\section{Originality and educational value}
Learning by teaching and self-explanation are established approaches. Gezhi combines them with a visible confidence commitment, deliberate error diagnosis, concept evidence and condition-changing challenges in one document workspace. Figure~\ref{fig:intro-evidence} makes the connection between a concept and recorded attempts visible. These design differences motivate evaluation; they are not evidence of superiority to other products.
'''+shotfigure('09-evidence',None,'User-captured evidence map: all twelve nodes and the selected concept remain visible. The inspector shows four records, three independent passes and three transfer stages; delayed evidence is still needed. These are simulated records.','fig:intro-evidence')+r'''
\section{Current evidence and next steps}
The catalogue contains 16 original exercises and three experiment models. Saved reports record 19 learning unit tests, 26 learning integration checks and 33 interface checks passing. Integration AI and speech were test doubles; genuine AI calls are documented separately. The English demonstration runs approximately 4 minutes 25 seconds and shows file creation, document reading and a simulated learning workflow.
\textbf{No student trial has been conducted.} There is no measured learning-gain percentage or validated AI scoring accuracy. Next steps are teacher review of AI feedback, a consented usability study, delayed transfer testing and an accurate contribution record for each member.
\par\small\textbf{AI assistance.} Codex assisted substantially with coding, debugging, tests, design and document drafting. Generated visual assets and Tencent Cloud synthetic narration are disclosed in the research report. All interface figures here are unchanged pixels from actual application captures, with viewport cropping for relevance.
\end{document}
'''

# Replace the presentation-like, forced-page layout with a conventional continuous report.
REPORT = re.sub(r'\\heading\{RESEARCH REPORT\}.*?(?=\\sub\{Abstract\})',
                lambda _: r'\renewcommand{\docname}{Research report}'+'\n'+r'\papertitle{Research report}{Design, implementation and simulated educational testing}'+'\n', REPORT, count=1, flags=re.S)
REPORT = re.sub(r'\\sub\{Report map\}.*?\\newpage', '', REPORT, count=1, flags=re.S)
REPORT = REPORT.replace(r'\newpage', '')
REPORT = REPORT.replace(r'\sub{Abstract}', r'\section*{Abstract}')
REPORT = REPORT.replace(r'\note{Study status}', r'{\small\textbf{Keywords:} self-explanation; learning evidence; confidence calibration; AI literacy; transfer.}\par'+ '\n' + r'\note{Study status}')
REPORT = REPORT.replace(r'\begin{center}'+'\n'+r'\begin{tikzpicture}', r'\begin{figure}[!htbp]'+'\n'+r'\centering'+'\n'+r'\begin{tikzpicture}')
diagram_captions = [
    ('Learner-led activity sequence. Each judgment retains the attempt and any assistance.','fig:loop'),
    ('Implemented architecture. Solid connections are local application flows; the dashed connection sends selected context to the configured external model.','fig:architecture')]
for cap, label in diagram_captions:
    REPORT = REPORT.replace(r'\end{tikzpicture}'+'\n'+r'\end{center}',r'\end{tikzpicture}'+'\n'+r'\caption{'+cap+'}'+r'\label{'+label+'}\n'+r'\end{figure}',1)

# Every screenshot is inserted alongside the method or claim it supports.
REPORT = REPORT.replace(r'\heading{01 / EDUCATIONAL PROBLEM}', shotfigure('11-quadratic',(76,110,1202,664),'Actual application capture of the quadratic-function concept workbench. The demonstration uses original material and simulated attempts.','fig:overview')+r'\heading{01 / EDUCATIONAL PROBLEM}',1)
REPORT = REPORT.replace(r'\heading{03 / TECHNICAL METHOD}',shotfigure('09-evidence',None,'User-captured learning evidence map, scaled uniformly. All twelve nodes and the selected concept remain visible. The inspector shows four records, three independent passes and three transfer stages; delayed evidence is still needed. The records are simulated.','fig:evidence')+r'\heading{03 / TECHNICAL METHOD}',1)
REPORT = REPORT.replace(r'\sub{Function model}',shotfigure('03-markdown',(310,93,1096,745),'An actual AI-created Markdown study guide opened in the application. Its table and example remain inspectable and editable.','fig:markdown',r'.82\linewidth')+r'\sub{Function model}',1)
REPORT = REPORT.replace(r'\sub{Probability model}',shotfigure('12-force',(76,65,1202,666),'Actual force-model run: 20 N applied to 4 kg with friction coefficient 0.1 gives 4.02 metres per second squared and 18.09 metres after three seconds. This is a simulation output.','fig:force',r'.88\linewidth')+r'\sub{Probability model}',1)
REPORT = REPORT.replace(r'\heading{05 / VERIFICATION}',shotfigure('13-probability',(76,48,1202,441),'Actual probability experiment: theory is 75.00 percent; this recorded sample has 2,263 successes among 3,000 groups (75.43 percent). Sampling fluctuates and is not classroom data.','fig:probability',r'.92\linewidth')+r'\heading{05 / VERIFICATION}',1)
REPORT = REPORT.replace(r'\sub{Evidence register}',shotfigure('07-confidence',(284,366,1178,782),'Actual confidence commitment and feedback for a deliberately wrong answer. The system retains a confident error and distinguishes it from an independent pass.','fig:confidence',r'.9\linewidth')+r'\sub{Evidence register}',1)
REPORT = REPORT.replace(r'\sub{3. Commit confidence before correction}',shotfigure('06-teach-ai',(60,416,552,755),'Actual model feedback from the scripted explanation. It identifies missing conditions; its broader correctness and grading reliability still require teacher validation.','fig:feedback',r'.74\linewidth')+r'\sub{3. Commit confidence before correction}',1)
REPORT = REPORT.replace(r'\sub{5. Change the conditions and investigate}',shotfigure('08-detective',(284,463,1178,664),'Actual verified repair in Error Detective: division by x loses the zero solution. The written explanation is retained separately from the objective check.','fig:detective',r'.92\linewidth')+r'\sub{5. Change the conditions and investigate}',1)

# Number the tables and put descriptive captions above them.
table_titles = ['Research and engineering questions with their current evidence status.',
                'Implemented learning modules, interactions and limits.',
                'Deterministic checks and configured-model judgments.',
                'Data sources and permitted interpretation.',
                'Saved verification evidence; counts refer to checks, not students.',
                'Local evidence register for reproducibility.',
                'AI tool disclosure and human contribution boundaries.']
counter = [0]
def table_open(match):
    index = counter[0]; counter[0] += 1
    return r'\begin{table}[!htbp]'+'\n'+r'\caption{'+table_titles[index]+'}\n'+r'\small'+'\n'+match.group(0)
REPORT = re.sub(r'\\begin\{tabularx\}\{\\linewidth\}\{[^\n]+\}', table_open, REPORT)
REPORT = REPORT.replace(r'\end{tabularx}', r'\end{tabularx}'+'\n'+r'\end{table}')
REPORT = REPORT.replace(r'\small'+'\n'+r'\begin{table}', r'\begin{table}')
REPORT = REPORT.replace(r'\sub{References}',r'\section*{References}')
REPORT = REPORT.replace(r'\sub{AI tool disclosure}',r'\sub{AI tool disclosure}')
REPORT = REPORT.replace(r'\begin{enumerate}[label={[\arabic*]},leftmargin=7mm,itemsep=5pt]',r'\begin{enumerate}[label={[\arabic*]},leftmargin=7mm,itemsep=2pt]')
REPORT = re.sub(r'\\sub\{\d+\.\s*([^}]+)\}',lambda m: r'\sub{'+m.group(1)+'}',REPORT)

# Keep each table and its immediately preceding heading together. This prevents
# floats from moving a table above its own heading or leaving an empty subsection.
def anchored_table(match):
    heading = match.group(1) or ''
    body = match.group(2).replace(r'\caption{',r'\captionof{table}{',1)
    return '\n'+r'\par\addvspace{5pt}\noindent\begin{minipage}{\linewidth}'+'\n'+heading+body+'\n'+r'\end{minipage}\par\addvspace{5pt}'+'\n'
REPORT = re.sub(r'(\\sub\{[^}]+\}\s*)?\\begin\{table\}\[!htbp\](.*?)\\end\{table\}',anchored_table,REPORT,flags=re.S)

# Keep competition content entirely English while retaining exact source paths in a separate manifest.
for key, label in [('产出/learning-studio/release-manifest.json','Learning Studio release manifest'),
                   ('产出/learning-studio/verification.json','Learning Studio integration report'),
                   ('产出/ui-v2/verification.json','UI v2 verification report'),
                   ('产出/demo-video-20261002/real-ai-events.json','Initial real AI event log'),
                   ('产出/demo-video-20261002/actual-learning-records.json','Recorded simulated learning summary'),
                   ('产出/demo-video-20261002/delivery-verification.json','Video delivery verification report')]:
    REPORT = REPORT.replace(r'\path{'+key+'}', label)
for name, body in [('ProjectIntroduction_Gezhi', INTRO), ('ResearchReport_Gezhi', REPORT)]:
    (OUT / (name+'.tex')).write_text(PRE+body.replace('p{', 'P{'), encoding='utf-8')

(OUT/'figure-sources.json').write_text(json.dumps(FIGURE_SOURCES,ensure_ascii=False,indent=2),encoding='utf-8')

manifest = {
    'date':'2026-10-02',
    'school':'Hou Kong Middle School, Macau',
    'members':['Lin Kit','Lei Chengchek','Feng Ziwen'],
    'teacher':{'draftRomanization':'Chang Kim Fai','officialIdentitySpellingVerified':False},
    'realStudentTrial':False,
    'dshVersion':'0.2.0-rc.2',
    'evidence': {
        'E1':'产出/learning-studio/release-manifest.json',
        'E2':'产出/learning-studio/verification.json',
        'E3':'产出/ui-v2/verification.json',
        'E4':'产出/demo-video-20261002/recorded-ai-events.json',
        'E5':'产出/demo-video-20261002/actual-learning-records.json',
        'E6':'产出/demo-video-20261002/delivery-verification.json'},
    'rubric':{'problemAndEducationalValue':20,'creativityAndOriginality':20,'aiTechnicalApplication':25,'prototypeTestingAndImpact':20,'englishAndPresentation':10,'ethicsSafetyPrivacy':5}
}
(OUT/'delivery-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Two standalone English LaTeX documents authored; no fabricated participant data.')
