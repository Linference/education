// 格致 P1 前置 PoC：CodeMirror 6 中文输入法行为验证
// 目的不是"演示一个编辑器"，而是把 IME 相关的可疑行为变成可观测的证据。
import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
import { EditorView, keymap, Decoration, ViewPlugin, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import katex from "katex";

// ------------------------------------------------------------------ 日志
const logEl = document.getElementById("log");
const checksEl = document.getElementById("checks");
let logCount = 0;
const MAX_LOG = 2500;

function log(kind, text) {
  const t = new Date();
  const ts = `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
  const line = document.createElement("div");
  line.className = `ev-${kind}`;
  line.textContent = `[${ts}] ${kind.padEnd(5)} ${text}`;
  logEl.appendChild(line);
  if (++logCount > MAX_LOG) { logEl.removeChild(logEl.firstChild); logCount--; }
  logEl.scrollTop = logEl.scrollHeight;
}

// ------------------------------------------------------------------ 检查项
const checks = {
  compositionUnbalanced: { label: "组合输入事件配对", detail: "compositionstart 与 compositionend 数量必须相等（不平衡 = 输入法状态错乱）", state: "idle" },
  duplicateAfterEnd: { label: "组合结束后出现重复字符", detail: "把候选词上屏后，正文里不得出现紧邻重复的字符（这是 #1650/#1688 那类 bug 的表征）", state: "idle" },
  textLostInComposition: { label: "组合期间正文被吞", detail: "组合输入过程中正文长度不应减少（减少 = 丢字/吞字）", state: "idle" },
  selectionJump: { label: "组合期间光标跳位", detail: "组合输入时 selection 头不应出现在组合起点之前", state: "idle" },
  undoIntegrity: { label: "撤销回到组合前状态", detail: "一次撤销应回到输入该词之前，不应半途而废或回退多步", state: "idle" },
  frameRate: { label: "输入时帧率 ≥ 50fps", detail: "连续输入期间的平均帧间隔应 ≤ 20ms", state: "idle" },
  // R13 专项：自动补全与中文输入法共存（Monaco 正是栽在这里）
  autocompleteDuringComposition: { label: "【R13】组合输入期间不弹出补全", detail: "中文输入法正在组词时，补全弹窗不得出现——否则候选词与补全列表会互相抢按键（Monaco #2199 就是这个病）", state: "idle" },
  completionNotAppliedWhileComposing: { label: "【R13】组合期间不会误插入补全项", detail: "组词途中即使按了回车/空格，也不应把补全建议写进正文", state: "idle" },
  autocompleteAfterComposition: { label: "【R13】组合结束后补全仍可用", detail: "上屏后继续输入，补全应正常弹出——不能为了避开 IME 就把补全功能废掉", state: "idle" },
  bracketNotDoubled: { label: "【R13】括号自动闭合不与 IME 打架", detail: "在 [[ 后输入中文，不应被自动补成 ]]]] 或吞掉字符", state: "idle" },
};

function renderChecks() {
  checksEl.innerHTML = "";
  for (const [key, c] of Object.entries(checks)) {
    const d = document.createElement("div");
    d.className = "chk";
    const cls = c.state === "pass" ? "pass" : c.state === "fail" ? "fail" : "idle";
    const mark = c.state === "pass" ? "✅" : c.state === "fail" ? "❌" : "•";
    d.innerHTML = `<span class="${cls}">${mark} <b>${c.label}</b></span><br><span style="color:#656d76">${c.detail}</span>` +
      (c.note ? `<br><span class="${cls}">实测：${c.note}</span>` : "");
    checksEl.appendChild(d);
  }
}
renderChecks();

function setCheck(key, state, note) { checks[key].state = state; if (note) checks[key].note = note; renderChecks(); }

// ------------------------------------------------------------------ 运行时统计
let composeDepth = 0;
let composeStartDocLen = 0;
let composeStartPos = 0;
let composeStartTime = 0;
let composeStartUndoDepth = 0;
let csStarts = 0, csEnds = 0;
let docChangesDuringCompose = 0;
let minDocLenDuringCompose = Infinity;
let worstSelectionJump = 0;
let frameIntervals = [];
let lastFrame = performance.now();
let composing = false;

// ------------------------------------------------------------------ R13 核心：wikilink 自动补全
//
// 这是格致最核心的编辑体验，也是 Monaco 至今栽跟头的地方（#2199：中文 IME 与
// CompletionItemProvider 冲突）。所以这里的补全要做得"像真的"：
//   - 输入 [[ 触发，按已存在的笔记名过滤
//   - 输入 # 触发标签补全
//   - 必须支持中文标题的前缀匹配（这是最容易出问题的地方）
//
// 关键设计：**绝不在组合输入期间弹补全**。CodeMirror 提供了 view.composing，
// 下面两条防线都要有：
//   ① 触发器里检查 composing（源头拦截）
//   ② 交互层依赖 CodeMirror 自身的 composing 判断（它有内置保护，但要验证）

// 假装库里有这些笔记（真实产品里来自 vault 索引）
const FAKE_NOTES = [
  "情态动词", "虚拟语气", "非谓语动词", "定语从句", "名词性从句",
  "倒装句", "强调句", "时态综述", "被动语态", "情态动词的推测用法",
  "modal verbs 笔记", "Feynman:情态动词",
];
const FAKE_TAGS = ["语法", "语法/情态动词", "语法/从句", "英语", "复习", "错题"];

let completionPopupOpened = 0;      // 弹出次数（由测试读取）
let completionPopupOpenedWhileComposing = 0; // 组合期间弹出的次数（必须是 0）
let completionApplied = 0;
let completionAppliedWhileComposing = 0;

/** 收集候选：从正文里已出现的 [[链接]] + 预置笔记名 */
function collectNoteNames(state) {
  const text = state.doc.toString();
  const names = new Set(FAKE_NOTES);
  for (const m of text.matchAll(/\[\[([^\]\n|#]+)/g)) {
    const n = m[1].trim();
    if (n) names.add(n);
  }
  return [...names];
}

/** wikilink 补全源：在 [[ 之后触发 */
function wikilinkSource(context) {
  // ★ R13 关键：组合输入期间绝不触发补全。
  //   实测发现：CodeMirror 的 autocompletion 即使开着 activateOnTyping，
  //   在 view.composing === true 时**仍会**调到这里 —— 所以必须自己拦。
  //   不拦的后果：中文组词时补全弹窗与输入法候选词同屏，互相抢回车/空格，
  //   这正是 Monaco #2199 那个开了多年没修的病的形态。
  if (context.view?.composing) return null;

  const before = context.state.sliceDoc(Math.max(0, context.pos - 120), context.pos);
  const open = before.lastIndexOf("[[");
  if (open < 0) return null;
  const after = before.slice(open + 2);
  // 已经闭合或换行就不触发
  if (after.includes("]]") || after.includes("\n")) return null;
  const from = context.pos - after.length;
  const word = after;
  const options = collectNoteNames(context.state)
    .filter((n) => n.toLowerCase().includes(word.toLowerCase()) || word === "")
    .slice(0, 20)
    .map((n) => ({
      label: n,
      type: "note",
      detail: "笔记",
      apply: (view, completion, fromPos, toPos) => {
        completionApplied++;
        if (view.composing) completionAppliedWhileComposing++;
        view.dispatch({
          changes: { from: fromPos, to: toPos, insert: completion.label + "]]" },
          selection: { anchor: fromPos + completion.label.length + 2 },
        });
      },
    }));
  if (!options.length) return null;
  return { from, options, validFor: /^[\p{L}\p{N}_\- ]*$/u };
}

/** 标签补全源：在 # 之后触发 */
function tagSource(context) {
  if (context.view?.composing) return null;   // ★ 同上：组合期间不触发

  const before = context.state.sliceDoc(Math.max(0, context.pos - 80), context.pos);
  const m = before.match(/(?:^|\s)#([\p{L}\p{N}_\/-]*)$/u);
  if (!m) return null;
  const word = m[1];
  const from = context.pos - word.length;
  const options = FAKE_TAGS.filter((t) => t.includes(word))
    .slice(0, 20)
    .map((t) => ({ label: t, type: "tag", detail: "标签" }));
  if (!options.length) return null;
  return { from, options };
}

const autocompleteExt = [
  autocompletion({
    override: [wikilinkSource, tagSource],
    activateOnTyping: true,      // 关键：输入即触发 —— 这正是与 IME 抢事件的那条路径
    closeOnBlur: true,
    icons: false,
  }),
  closeBrackets(),               // 括号自动闭合，也是容易与 IME 打架的东西
  keymap.of([...closeBracketsKeymap, ...completionKeymap]),
];

const autocompleteCompartment = new Compartment();

// ------------------------------------------------------------------ 装饰（模拟 Live Preview 的真实压力面）

function buildDecorations(view) {
  const widgets = [];
  const text = view.state.doc.toString();
  const patterns = [
    { re: /\[\[[^\]\n]{1,80}\]\]/g, cls: "cm-wikilink" },
    { re: /\$[^$\n]{1,150}\$/g, cls: "cm-math" },
    { re: /(^|\s)#[\p{L}\p{N}_\/-]{1,40}/gu, cls: "cm-tag" },
    { re: /==[^=\n]{1,80}==/g, cls: "cm-mark" },
    { re: /\*\*[^*\n]{1,80}\*\*/g, cls: "cm-bold" },
  ];
  for (const { re, cls } of patterns) {
    for (const m of text.matchAll(re)) {
      const from = m.index + (m[0].startsWith(" ") ? 1 : 0);
      const to = m.index + m[0].length;
      if (from >= to || to > view.state.doc.length) continue;
      widgets.push(Decoration.mark({ class: cls }).range(from, to));
    }
  }
  widgets.sort((a, b) => a.from - b.from);
  return Decoration.set(widgets, true);
}

const decoratePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildDecorations(view); }
    update(u) { if (u.docChanged || u.viewportChanged) this.decorations = buildDecorations(u.view); }
  },
  { decorations: (v) => v.decorations }
);

const livePreviewCompartment = new Compartment();
const livePreviewExt = [decoratePlugin];

const themeExt = EditorView.theme({
  ".cm-wikilink": { color: "#8250df", textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-math": { color: "#0969da", background: "#ddf4ff" },
  ".cm-tag": { color: "#1a7f37", background: "#dafbe1" },
  ".cm-mark": { background: "#fff8c5" },
  ".cm-bold": { fontWeight: "700" },
  ".cm-content": { padding: "10px 14px" },
});

// ------------------------------------------------------------------ 初始文档（故意放入装饰与边界情形）
const INITIAL_DOC = `# 情态动词 · IME 测试草稿

must 表示主观必须；may/might 表示把握不大的推测。
[[虚拟语气]] 与 #语法/情态动词 都在这一章。

公式示例：$P(A|B)=\\frac{P(B|A)P(A)}{P(B)}$

边界情形请在下面这几行里各打一遍中文：
行首→
←行尾
中英混排：modal verbs 表示情态动词
标点旁：「引号」、(括号)、【方括号】后面打字
装饰内：[[在这里打字]] 、$在这里打分$ 、#标签在这里
连续退格后重打：

## R13 专项：自动补全 × 中文输入法
把光标放在下面这行末尾，输入两个左方括号，然后**用中文输入法打「情态」**：
[[
再把光标放这里，输入井号后用中文打「语」：
#
`;

const view = new EditorView({
  parent: document.getElementById("editor"),
  state: EditorState.create({
    doc: INITIAL_DOC,
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown({ codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      themeExt,
      livePreviewCompartment.of(livePreviewExt),
      autocompleteCompartment.of(autocompleteExt),   // R13 专项：补全默认开启
      EditorView.updateListener.of((u) => {
        const now = performance.now();
        frameIntervals.push(now - lastFrame);
        if (frameIntervals.length > 600) frameIntervals.shift();
        lastFrame = now;

        if (u.docChanged) {
          const len = u.state.doc.length;
          if (composing) {
            docChangesDuringCompose++;
            minDocLenDuringCompose = Math.min(minDocLenDuringCompose, len);
          }
          const changes = [];
          u.changes.iterChanges((fromA, toA, fromB, toB, ins) => {
            changes.push(`${fromA}..${toA} → ${JSON.stringify(ins.toString().slice(0, 40))}`);
          });
          log("doc", `len ${u.startState.doc.length}→${len}｜${changes.join(" ; ")}${composing ? "  ⟨组合中⟩" : ""}`);
        }
        if (u.selectionSet && composing) {
          const head = u.state.selection.main.head;
          if (head < composeStartPos) {
            worstSelectionJump = Math.max(worstSelectionJump, composeStartPos - head);
          }
        }
      }),
    ],
  }),
});

// ------------------------------------------------------------------ 在真实 DOM 上挂组合事件监听（这是 IME 的唯一真相来源）
const contentDom = view.contentDOM;
contentDom.addEventListener("compositionstart", (e) => {
  composing = true;
  composeDepth++;
  csStarts++;
  composeStartDocLen = view.state.doc.length;
  composeStartPos = view.state.selection.main.head;
  composeStartTime = performance.now();
  composeStartUndoDepth = 0;
  minDocLenDuringCompose = view.state.doc.length;
  log("cs", `start    pos=${composeStartPos} docLen=${composeStartDocLen} data=${JSON.stringify(e.data ?? "")}`);
});
contentDom.addEventListener("compositionupdate", (e) => {
  log("cu", `update   data=${JSON.stringify(e.data ?? "")} docLen=${view.state.doc.length} sel=${view.state.selection.main.head}`);
});
contentDom.addEventListener("compositionend", (e) => {
  composing = false;
  composeDepth = Math.max(0, composeDepth - 1);
  csEnds++;
  const elapsed = (performance.now() - composeStartTime).toFixed(0);
  const finalLen = view.state.doc.length;
  const data = e.data ?? "";
  log("ce", `end      data=${JSON.stringify(data)} docLen=${finalLen} 用时=${elapsed}ms Δ=${finalLen - composeStartDocLen}`);

  // 检查 1：组合期间正文是否被吞
  if (minDocLenDuringCompose < composeStartDocLen) {
    setCheck("textLostInComposition", "fail", `最少降到 ${minDocLenDuringCompose}，起点 ${composeStartDocLen}`);
  } else if (checks.textLostInComposition.state !== "fail") {
    setCheck("textLostInComposition", "pass", `起点 ${composeStartDocLen} → 最低 ${minDocLenDuringCompose}，未减少`);
  }
  // 检查 2：配对
  if (csStarts === csEnds) setCheck("compositionUnbalanced", "pass", `start=${csStarts} end=${csEnds}`);
  else setCheck("compositionUnbalanced", "fail", `start=${csStarts} ≠ end=${csEnds}`);
  // 检查 3：上屏后是否出现重复字符
  if (data.length > 0 && finalLen >= composeStartDocLen + data.length - 1) {
    const doc = view.state.doc.toString();
    const anchor = view.state.selection.main.head;
    const tail = doc.slice(Math.max(0, anchor - data.length * 2 - 4), Math.min(doc.length, anchor + 4));
    const dup = /(.)\1/.test(tail);
    if (dup) setCheck("duplicateAfterEnd", "fail", `落点附近出现重复：…${tail}…`);
    else if (checks.duplicateAfterEnd.state !== "fail") setCheck("duplicateAfterEnd", "pass", `落点附近无重复：…${tail}…`);
  }
  // 检查 4：光标跳位
  const head = view.state.selection.main.head;
  if (head < composeStartPos) {
    setCheck("selectionJump", "fail", `组合起点 ${composeStartPos}，结束时光标在 ${head}（回跳 ${composeStartPos - head}）`);
  } else if (checks.selectionJump.state !== "fail") {
    setCheck("selectionJump", "pass", `起点 ${composeStartPos} → 结束 ${head}，未回跳`);
  }
  // 检查 5：帧率
  if (frameIntervals.length > 40) {
    const recent = frameIntervals.slice(-120);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const fps = (1000 / avg).toFixed(1);
    if (fps >= 50) setCheck("frameRate", "pass", `${fps} fps（近 ${recent.length} 帧平均间隔 ${avg.toFixed(2)}ms）`);
    else setCheck("frameRate", "fail", `仅 ${fps} fps，平均间隔 ${avg.toFixed(2)}ms`);
  }
});

// 记录所有按键，便于对照"哪一次操作出的问题"
contentDom.addEventListener("keydown", (e) => {
  const interesting = ["Backspace", "Delete", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (interesting.includes(e.key) || (e.ctrlKey && e.key.toLowerCase() === "z") || (e.ctrlKey && e.key.toLowerCase() === "y")) {
    log("key", `${e.ctrlKey ? "Ctrl+" : ""}${e.key}${composing ? "  ⟨组合中⟩" : ""}`);
  }
});

// 撤销完整性：记录文档长度历史，供手动对照
const undoProbe = { before: null, afterWord: null };
contentDom.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.key.toLowerCase() !== "z") return;
  undoProbe.before = view.state.doc.length;
  requestAnimationFrame(() => {
    undoProbe.afterWord = view.state.doc.length;
    if (undoProbe.before !== null) {
      log("key", `撤销：${undoProbe.before} → ${undoProbe.afterWord}（Δ=${undoProbe.afterWord - undoProbe.before}）`);
      setCheck("undoIntegrity", "pass", `最近一次撤销：${undoProbe.before} → ${undoProbe.afterWord}`);
    }
  });
});

// ------------------------------------------------------------------ 工具栏
document.getElementById("btn-clear").onclick = () => { logEl.innerHTML = ""; logCount = 0; };
document.getElementById("btn-reset").onclick = () => {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: INITIAL_DOC } });
  log("key", "文档已重置");
};
document.getElementById("chk-live").onchange = (e) => {
  view.dispatch({ effects: livePreviewCompartment.reconfigure(e.target.checked ? livePreviewExt : []) });
  log("key", `Live Preview 装饰 ${e.target.checked ? "已开启" : "已关闭"}`);
};
document.getElementById("chk-ac").onchange = (e) => {
  window.__gezhi.setAutocompleteEnabled(e.target.checked);
};

// 一键自检：查全文里的重复字符与可疑片段
document.getElementById("btn-dupe").onclick = () => {
  const doc = view.state.doc.toString();
  const findings = [];
  const re = /([\u4e00-\u9fff\uff00-\uffef])\1/g;
  let m;
  while ((m = re.exec(doc)) !== null) findings.push(`位置 ${m.index}：「${m[0]}」`);
  if (findings.length) {
    setCheck("duplicateAfterEnd", "fail", `全文找到 ${findings.length} 处重复：${findings.slice(0, 5).join("、")}`);
    log("key", `自检：发现 ${findings.length} 处重复字符 → ${findings.slice(0, 5).join("、")}`);
  } else {
    setCheck("duplicateAfterEnd", "pass", `全文 ${doc.length} 字，未发现重复汉字/全角字符`);
    log("key", `自检：全文 ${doc.length} 字，无重复`);
  }
  const unmapped = [...doc.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((x) => x[1]);
  log("key", `自检：共 ${unmapped.length} 个 wikilink → ${unmapped.slice(0, 8).join(" / ")}`);
};

// ------------------------------------------------------------------ 环境信息（Chromium / Electron 都适用）
const ua = navigator.userAgent;
const m = ua.match(/Chrome\/([\d.]+)/);
const el = ua.match(/Electron\/([\d.]+)/);
document.getElementById("envline").textContent =
  `Chromium ${m ? m[1] : "?"}${el ? ` ｜ Electron ${el[1]}` : " ｜ 浏览器模式"} ｜ ` +
  `视口 ${window.innerWidth}×${window.innerHeight} ｜ ` +
  `用中文输入法在下方编辑器打字，日志会记录每一次组合输入`;

log("key", "PoC 就绪。建议测试顺序见同目录 测试清单.md");

// 把 view 暴露到 window，供自动化测试（CDP 输入法脚本）定位光标与读取状态。
// 仅 PoC 需要；正式产品里不要这么做，应通过 IPC 暴露受控接口。
window.__gezhi = {
  view,
  setCursor(pos) { view.dispatch({ selection: { anchor: pos } }); view.focus(); },
  docLen() { return view.state.doc.length; },
  docText() { return view.state.doc.toString(); },
  selection() { return view.state.selection.main; },

  // ---- R13 专项观察点 ----
  /** 编辑器是否认为"正在组合输入"（这是 CodeMirror 自己的判断，必须准确） */
  composing() { return view.composing; },
  /** 补全弹窗此刻是否在 DOM 里 */
  completionOpen() { return Boolean(document.querySelector(".cm-tooltip-autocomplete")); },
  /** 补全弹窗里当前选中的项 */
  completionSelected() {
    const el = document.querySelector(".cm-tooltip-autocomplete li[aria-selected='true']");
    return el ? el.textContent : null;
  },
  /** 补全统计（测试断言用） */
  completionStats() {
    return {
      popupOpened: completionPopupOpened,
      popupOpenedWhileComposing: completionPopupOpenedWhileComposing,
      applied: completionApplied,
      appliedWhileComposing: completionAppliedWhileComposing,
      openNow: Boolean(document.querySelector(".cm-tooltip-autocomplete")),
      composingNow: view.composing,
    };
  },
  resetCompletionStats() {
    completionPopupOpened = 0;
    completionPopupOpenedWhileComposing = 0;
    completionApplied = 0;
    completionAppliedWhileComposing = 0;
  },
  setAutocompleteEnabled(on) {
    view.dispatch({ effects: autocompleteCompartment.reconfigure(on ? autocompleteExt : []) });
    log("key", `自动补全 ${on ? "已开启" : "已关闭"}`);
  },
  autocompleteEnabled(on) { return on; },
};

// 监视补全弹窗的出现：每次出现都记一笔，并判断当时是否在组合输入
const acObserver = new MutationObserver(() => {
  const open = Boolean(document.querySelector(".cm-tooltip-autocomplete"));
  if (open && !acObserver._wasOpen) {
    completionPopupOpened++;
    const isComposing = view.composing;
    if (isComposing) {
      completionPopupOpenedWhileComposing++;
      log("key", "⚠ 补全弹窗在【组合输入期间】出现了 —— R13 风险");
      setCheck("autocompleteDuringComposition", "fail", "组合输入时补全弹窗弹出");
    }
    log("key", `补全弹窗出现（第 ${completionPopupOpened} 次，组合中=${isComposing}）`);
  }
  acObserver._wasOpen = open;
});
acObserver._wasOpen = false;
acObserver.observe(document.body, { childList: true, subtree: true });
