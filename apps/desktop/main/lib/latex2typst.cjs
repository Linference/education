// LaTeX 数学公式 → Typst 数学语法
//
// 为什么必须做：
//   Typst 的数学语法**不是 LaTeX**。直接把 $...$ 里的内容搬过去会报错，
//   而且报得很难懂 —— 实测 `\frac{a}{b}` 报的是
//   `unknown variable: rac`（Typst 把 `\frac` 读成 `\f` 转义 + `rac` 变量）。
//   学生笔记里 \frac 是最常见的东西，不做这层转换，公式导出就是坏的。
//
// 主要差异：
//   \frac{a}{b}   →  (a)/(b)          Typst 用斜杠表示分数，自动排版
//   \sqrt{x}      →  sqrt(x)
//   \alpha        →  alpha            Typst 里希腊字母不加反斜杠
//   \times        →  times
//   ^ 与 _        →  相同（两边都是上标/下标）
//   \left( \right)→  ( )              Typst 自动调整括号大小，不需要 \left
//
// 转换策略：**能转的尽量转，转不了的保留原文并标记**，
// 绝不静默产生坏公式（用户看 PDF 时才发现公式错了是最糟的）。

/** 一元函数：\name{arg} → name(arg)，以及 \name arg → name(arg) */
/**
 * 匹配一个 {...} 分组（支持嵌套）。
 * 返回 [内容, 结束位置]，没找到返回 null。
 */
function readGroup(s, start) {
  if (s[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return [s.slice(start + 1, i), i + 1];
    }
  }
  return null;
}

/** 读一个"参数"：可能是 {分组}，也可能是单个字符（LaTeX 允许 \sqrt x） */
function readArg(s, start) {
  const g = readGroup(s, start);
  if (g) return g;
  if (start < s.length && s[start] !== " ") return [s[start], start + 1];
  return null;
}

/**
 * Typst 数学模式里**连续字母是一个标识符** —— 这与 LaTeX 完全不同。
 *
 * 实测（逐条编译验证过）：
 *   $mc^2$      ✖ error: unknown variable: mc
 *   $m c^2$     ✔
 *   $x_i$       ✔（单字母 + 下标没问题）
 *   $sin x$     ✔（Typst 认识 sin 这种预定义算子）
 *   $P(A|B)$    ✔（单字母）
 *
 * 所以：**把没有空格的字母串按字符拆开**（除非它整体是一个预定义算子名）。
 * 这是 LaTeX → Typst 转换里最容易漏的一步：LaTeX 里 `mc` 天然是两个变量相乘，
 * 到 Typst 就变成一个不存在的变量名。
 *
 * 拆之前先看两件事：
 *   1. 整个字母串是不是已知算子（sin/cos/lim/…）→ 保留，不拆
 *   2. 字母串前面是不是 `#`、`@` 之类的 Typst 语法 → 不拆（那是引用/字段）
 */
const TYPST_BUILTIN_OPS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan", "arctan2",
  "sinh", "cosh", "tanh", "coth",
  "log", "ln", "exp", "lim", "limsup", "liminf",
  "min", "max", "sup", "inf", "det", "dim", "ker", "deg", "gcd",
  "mod", "rem", "floor", "ceil", "round", "abs", "norm",
  "sum", "prod", "integral", "sqrt", "root",
  "and", "or", "not", "in", "in.not", "subset", "supset",
  "times", "dot", "div", "plus", "minus", "eq", "lt", "gt",
  "arrow", "infinity", "nothing", "forall", "exists", "therefore", "because",
  "upright", "italic", "bold", "bb", "cal", "frak", "sans", "mono", "op",
  "hat", "bar", "tilde", "dot", "vec", "underline", "overline", "boxed",
  "strike", "binom", "cases", "mat", "vec", "dif", "diff", "thin", "space",
  "thin.neg", "plus.minus", "minus.plus", "eq.not", "lt.eq", "gt.eq",
  "lt.double", "gt.double", "subset.eq", "supset.eq", "union", "sect",
  "without", "prop", "approx", "equiv", "circle.stroked.small", "bullet",
  "plus.circle", "minus.circle", "times.circle", "arrow.r", "arrow.l",
  "arrow.r.double", "arrow.l.double", "arrow.l.r", "arrow.r.bar",
  "arrow.r.double.long", "arrow.l.r.double.long",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma",
  "tau", "upsilon", "phi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon",
  "Phi", "Psi", "Omega", "diff", "nabla", "ell", "angle", "triangle",
  "square", "degree", "perp", "parallel", "dots", "space",
]);

function splitLetterRuns(s) {
  // 规则（每一条都对应实测踩过的坑）：
  //
  //   1. **已知命令/算子名一律保留**，不管大小写。
  //      `Delta`、`Omega`、`alpha`、`sin`、`thin` 都是 Typst 认识的标识符。
  //      ⚠️ 第一版只看小写，把 `\Delta` 拆成了 `De l t a`、把间距命令
  //      `thin` 拆成了 `t h i n` —— 判断顺序错了：应该**先查名单再看大小写**。
  //   2. 后面紧跟 `.` 或 `(` 的保留（`arrow.r`、`overline(`）。
  //   3. 前面是 `#` `@` `.` `\` 的保留（Typst 语法：引用、字段、命名空间）。
  //   4. 剩下的**全小写**串才拆 —— `mc` 是 m×c。
  //      大写串不拆：数学里 `AB` 通常是一个符号（向量/矩阵/点）。
  return s.replace(/[A-Za-z]{2,}/g, (run, offset, whole) => {
    if (TYPST_BUILTIN_OPS.has(run)) return run;              // 规则 1 优先
    const prev = offset > 0 ? whole[offset - 1] : "";
    if (prev === "#" || prev === "@" || prev === "." || prev === "\\") return run;
    const next = whole[offset + run.length] ?? "";
    if (next === "." || next === "(") return run;
    if (!/^[a-z]+$/.test(run)) return run;                    // 含大写 → 保留
    return run.split("").join(" ");
  });
}

/**
 * 把 LaTeX 数学转成 Typst 数学。
 *
 * 注意这个函数**不做整体括号补全**：Typst 的 `a/b` 只把紧邻的东西当分子分母，
 * 所以 \frac{a+b}{c} 必须转成 `(a+b)/(c)` 而不是 `a+b/c` —— 这里靠显式加括号解决。
 */
function latexToTypst(tex) {
  let s = tex;
  let out = "";
  let i = 0;
  const warnings = [];

  /**
   * 递归调用自己并**只取字符串结果**。
   *
   * 为什么需要这个包装：latexToTypst 返回 { typst, warnings }（要上报未识别命令），
   * 但递归拼接时需要的只是字符串。第一版直接 `(${latexToTypst(x)})`，
   * 结果每个嵌套分组都渲染成 `[object Object]` —— 实测踩过，\frac 全坏。
   * 所有递归都必须走这里。
   */
  const rec = (t) => {
    const r = latexToTypst(t);
    for (const w of r.warnings) warnings.push(w);
    return r.typst;
  };

  while (i < s.length) {
    const ch = s[i];

    // ---- 命令 ----
    if (ch === "\\") {
      // \\ 是换行
      if (s[i + 1] === "\\") { out += "\\ "; i += 2; continue; }

      const m = s.slice(i + 1).match(/^([A-Za-z]+)/);
      if (!m) {
        const next = s[i + 1];
        // 单字符间距命令：LaTeX 用 \, \; \! \:，Typst 有对应的命名间距。
        //
        // ⚠️ 两侧都要加空格！这是个隐蔽的坑：
        //    Typst 的间距是**标识符** `thin`，如果前面紧邻字母就会粘成一个词。
        //    实测：输入 "a\,b" → "a" + "thin " + "b" = "athin b"，
        //    然后字母拆分规则把 "athin" 当成未知名词拆成 "a t h i n" —— 全错。
        //    两侧加空格后 "a thin b"（Typst 里多余空格无副作用）就正常了。
        const SPACING = { ",": "thin", ";": "space", ":": "space", "!": "thin.neg" };
        if (next && SPACING[next]) { out += ` ${SPACING[next]} `; i += 2; continue; }
        // \{ \} \% \$ \& \_ \# 这类转义字符
        if (next && "{}%$&_#".includes(next)) { out += next; i += 2; continue; }
        i += 1;
        continue;
      }
      const name = m[1];
      i += 1 + name.length;
      // ⚠️ **不要吃掉命令后面的空格。**
      //    LaTeX 里 `\ln x` 的空格是命令分隔符，但 Typst 里 `ln x` 的空格
      //    是**真的有意义的**（分开 `ln` 和 `x`）。第一版把空格吃掉，
      //    结果 `\ln x` 变成 `lnx`、`\forall x` 变成 `forallx` —— 全错。
      //    留着空格两边都对。

      // \frac / \dfrac / \tfrac
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const a = readArg(s, i);
        if (!a) { out += "frac"; continue; }
        i = a[1];
        const b = readArg(s, i);
        if (!b) { out += `(${rec(a[0])})`; continue; }
        i = b[1];
        out += `(${rec(a[0])})/(${rec(b[0])})`;
        continue;
      }

      // \sqrt[n]{x}
      if (name === "sqrt") {
        let degree = null;
        if (s[i] === "[") {
          const close = s.indexOf("]", i);
          if (close > 0) { degree = s.slice(i + 1, close); i = close + 1; }
        }
        const a = readArg(s, i);
        if (!a) { out += "sqrt"; continue; }
        i = a[1];
        out += degree ? `root(${rec(degree)}, ${rec(a[0])})` : `sqrt(${rec(a[0])})`;
        continue;
      }

      // \binom{n}{k}
      if (name === "binom" || name === "dbinom" || name === "tbinom") {
        const a = readArg(s, i);
        if (a) i = a[1];
        const b = readArg(s, i);
        if (b) i = b[1];
        if (a && b) { out += `binom(${rec(a[0])}, ${rec(b[0])})`; continue; }
        out += "binom";
        continue;
      }

      // \text{...} / \mathrm{...} 等 → upright("...")
      if (name === "text" || name === "textrm" || name === "mbox" || name === "operatorname") {
        const a = readArg(s, i);
        if (!a) { out += "upright"; continue; }
        i = a[1];
        out += `upright("${a[0].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
        continue;
      }

      // 装饰：\hat{x} → hat(x)
      if (DECORATIONS.includes(name)) {
        const a = readArg(s, i);
        if (!a) { out += name; continue; }
        i = a[1];
        const inner = rec(a[0]);
        out += `${name}(${inner})`;
        continue;
      }

      // 丢弃的排版命令
      //
      // \left \right \big 这类：Typst 自动调整括号大小，不需要它们。
      // **只丢命令本身，不要动后面的空格** —— 输入里的空格是内容的一部分，
      // 我第一版"顺手"把空格也吃掉，结果是 `\left( x \right)` 变成 `(x)`
      // 而 `\left( \frac{a}{b} \right)` 变成 `((a)/(b))`：
      // 看起来更紧凑，但那是**猜**用户的意图。用户的空格就该照原样保留。
      if (DROP.has(name)) {
        continue;
      }

      // 一元函数
      if (FUNCTIONS.includes(name)) {
        // \lim_{x \to 0} 的下标要跟着
        out += name;
        continue;
      }

      // 直接换名
      if (RENAME[name]) { out += RENAME[name]; continue; }

      // 不认识的命令：**保留原文**并记警告，绝不静默丢内容
      warnings.push(name);
      out += `\\${name}`;
      continue;
    }

    // ---- 分组：保留括号并递归 ----
    if (ch === "{") {
      const g = readGroup(s, i);
      if (g) {
        out += `(${rec(g[0])})`;
        i = g[1];
        continue;
      }
    }

    // ---- 其他字符原样 ----
    // 注意 `^` `_` `(` `)` `+` `-` `=` 在两边语法相同，不用动
    out += ch;
    i += 1;
  }

  // 最后一道：拆开多字母标识符（Typst 与 LaTeX 最隐蔽的差异）
  return { typst: splitLetterRuns(out), warnings };
}



const FUNCTIONS = [
  "sqrt", "abs", "floor", "ceil", "round", "sgn",
  "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh",
  "log", "ln", "exp", "lim", "min", "max", "sup", "inf",
  "det", "dim", "ker", "deg", "gcd", "Pr",
];

/** 直接换名的命令（LaTeX → Typst） */
const RENAME = {
  // 希腊字母
  alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta",
  epsilon: "epsilon", varepsilon: "epsilon.alt", zeta: "zeta", eta: "eta",
  theta: "theta", vartheta: "theta.alt", iota: "iota", kappa: "kappa",
  lambda: "lambda", mu: "mu", nu: "nu", xi: "xi", pi: "pi", varpi: "pi.alt",
  rho: "rho", varrho: "rho.alt", sigma: "sigma", varsigma: "sigma.alt",
  tau: "tau", upsilon: "upsilon", phi: "phi", varphi: "phi.alt",
  chi: "chi", psi: "psi", omega: "omega",
  Gamma: "Gamma", Delta: "Delta", Theta: "Theta", Lambda: "Lambda",
  Xi: "Xi", Pi: "Pi", Sigma: "Sigma", Upsilon: "Upsilon", Phi: "Phi",
  Psi: "Psi", Omega: "Omega",
  // 运算
  times: "times", div: "div", cdot: "dot.op", pm: "plus.minus", mp: "minus.plus",
  ast: "ast", star: "star", circ: "circle.stroked.small", bullet: "bullet",
  oplus: "plus.circle", ominus: "minus.circle", otimes: "times.circle",
  // 关系
  leq: "lt.eq", le: "lt.eq", geq: "gt.eq", ge: "gt.eq", neq: "eq.not",
  ne: "eq.not", approx: "approx", equiv: "equiv", sim: "tilde.op",
  simeq: "approx", propto: "prop", ll: "lt.double", gg: "gt.double",
  // 集合与逻辑
  in: "in", notin: "in.not", subset: "subset", supset: "supset",
  subseteq: "subset.eq", supseteq: "supset.eq", cup: "union", cap: "sect",
  setminus: "without", emptyset: "nothing", varnothing: "nothing",
  forall: "forall", exists: "exists", nexists: "exists.not",
  neg: "not", land: "and", lor: "or", wedge: "and", vee: "or",
  therefore: "therefore", because: "because",
  // 箭头
  to: "arrow.r", rightarrow: "arrow.r", leftarrow: "arrow.l",
  Rightarrow: "arrow.r.double", Leftarrow: "arrow.l.double",
  leftrightarrow: "arrow.l.r", mapsto: "arrow.r.bar",
  implies: "arrow.r.double.long", iff: "arrow.l.r.double.long",
  // 大型算符
  sum: "sum", prod: "prod", int: "integral", iint: "integral.double",
  oint: "integral.cont", lim: "lim", limsup: "lim.sup", liminf: "lim.inf",
  // 其他常用
  infty: "infinity", partial: "diff", nabla: "nabla", ell: "ell",
  ldots: "dots.h", cdots: "dots.h.c", vdots: "dots.v", ddots: "dots.down",
  quad: "space", qquad: "space", ":": "space", ",": "thin",
  angle: "angle", triangle: "triangle", square: "square",
  degree: "degree", perp: "perp", parallel: "parallel",
  // 文本类
  text: "upright", mathrm: "upright", mathbf: "bold", mathit: "italic",
  mathbb: "bb", mathcal: "cal", mathfrak: "frak", mathsf: "sans",
  operatorname: "op",
};

/** 需要丢掉的排版命令（Typst 自动处理，留着会报错） */
const DROP = new Set([
  "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr",
  "displaystyle", "textstyle", "scriptstyle", "limits", "nolimits",
  "quad", "qquad", "hspace", "vspace", "phantom",
  "label", "tag", "nonumber", "notag",
]);

/** 上下标/装饰类：\name{arg} → name(arg) */
const DECORATIONS = [
  "hat", "bar", "tilde", "dot", "ddot", "vec", "underline", "overline",
  "overrightarrow", "overleftarrow", "widehat", "widetilde", "boxed",
  "cancel", "sout", "overbrace", "underbrace",
];

module.exports = { latexToTypst };


