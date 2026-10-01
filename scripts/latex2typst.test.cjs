#!/usr/bin/env node
// LaTeX → Typst 数学转换的自测
//
// ★ 教训一：**不要在源码里写字面反斜杠**。
//   前后三版用例都被不同的转义层破坏过：
//     "\frac"  变成换行 + "rac"
//     "\bar"   变成退格符 + "ar"
//     "\tilde" 变成制表符 + "ilde"
//   表现是"转换器坏了"，其实是测试文件坏了，白查很久。
//   → 统一用 BS = String.fromCharCode(92) 拼接。
//
// ★ 教训二：断言必须**精确相等**。只查"没有警告"是假通过（空输入也是 0 警告）。
const BS = String.fromCharCode(92);
const { latexToTypst } = require("../apps/desktop/main/lib/latex2typst.cjs");

/** 把 "frac{a}{b}" 变成 "\frac{a}{b}" */
const L = (s) => s.split("@").join(BS);

const CASES = [
  // ---- 分数 ----
  [L("P(A|B) = @frac{P(B|A)P(A)}{P(B)}"), "P(A|B) = (P(B|A)P(A))/(P(B))"],
  [L("@frac{a+b}{c}"), "(a+b)/(c)"],
  [L("@frac{1}{2}"), "(1)/(2)"],
  [L("@dfrac{1}{n}"), "(1)/(n)"],
  // ---- 根号 ----
  [L("@sqrt{x^2 + y^2}"), "sqrt(x^2 + y^2)"],
  [L("@sqrt[3]{x}"), "root(3, x)"],
  // ---- 希腊字母 ----
  [L("@alpha + @beta = @gamma"), "alpha + beta = gamma"],
  [L("@Delta x @to 0"), "Delta x arrow.r 0"],
  [L("@Omega"), "Omega"],
  // ---- 大型算符 ----
  [L("@sum_{i=1}^{n} x_i"), "sum_(i=1)^(n) x_i"],
  [L("@prod_{k=1}^{n} a_k"), "prod_(k=1)^(n) a_k"],
  [L("@lim_{x @to 0} @frac{@sin x}{x} = 1"), "lim_(x arrow.r 0) (sin x)/(x) = 1"],
  // ---- 装饰 ----
  [L("@hat{y} = @vec{x} @cdot @vec{w}"), "hat(y) = vec(x) dot.op vec(w)"],
  [L("@bar{x}"), "bar(x)"],
  [L("@tilde{n} @approx 3"), "tilde(n) approx 3"],
  [L("@overline{AB}"), "overline(AB)"],
  [L("@hat{@beta}_0"), "hat(beta)_0"],
  // ---- 关系与集合 ----
  [L("a @leq b @neq c"), "a lt.eq b eq.not c"],
  [L("x @in A @cup B"), "x in A union B"],
  [L("@forall x @exists y"), "forall x exists y"],
  [L("A @subseteq B @Rightarrow C"), "A subset.eq B arrow.r.double C"],
  // ---- 其他命令 ----
  [L("@infty"), "infinity"],
  [L("@partial f / @partial x"), "diff f / diff x"],
  [L("@ln x + @exp(y)"), "ln x + exp(y)"],
  [L("@log_{10} x"), "log_(10) x"],
  [L("@binom{n}{k}"), "binom(n, k)"],
  [L("@text{速度} = @frac{s}{t}"), 'upright("速度") = (s)/(t)'],
  // ---- 排版命令丢掉，但输入里的空格照原样保留 ----
  [L("@left( @frac{a}{b} @right)"), "( (a)/(b) )"],
  [L("@left( x @right)"), "( x )"],
  // ---- 间距命令：Typst 用命名标识符，**两侧必须留空格** ----
  // 不留空格会与相邻字母粘成一个词：`a`+`thin`+`b` = `athin`，然后被当成
  // 未知名词拆成 `a t h i n`。这个坑实测踩过。
  [L("a@,b"), "a thin b"],
  [L("a@;b"), "a space b"],
  [L("@int_0^1 f(x)@,dx"), "integral_0^1 f(x) thin d x"],
  // ---- ★ Typst 连续字母是一个标识符，必须拆 ----
  ["E = mc^2", "E = m c^2"],
  ["F = ma", "F = m a"],
  ["x^2 + y_1", "x^2 + y_1"],
  ["AB", "AB"],
  ["sin x", "sin x"],
];

let pass = 0;
const fails = [];

// 防呆：确认用例里没有意外的转义字符
const BAD = [[0x08, "\\b 退格"], [0x09, "\\t 制表"], [0x0c, "\\f 换页"], [0x0d, "\\r 回车"], [0x0b, "\\v"]];
for (const [src] of CASES) {
  for (const [code, label] of BAD) {
    if (src.includes(String.fromCharCode(code))) {
      console.error(`用例里混入转义字符（${label}）：${JSON.stringify(src)}`);
      process.exit(2);
    }
  }
  if (src.includes(BS + BS)) {
    console.error(`用例出现双反斜杠（那是 LaTeX 换行）：${JSON.stringify(src)}`);
    process.exit(2);
  }
}

for (const [src, want] of CASES) {
  const { typst, warnings } = latexToTypst(src);
  const ok = typst.length > 0 && typst === want && warnings.length === 0;
  if (ok) pass++;
  else fails.push({ src, want, got: typst, warnings });
}

console.log("=== LaTeX → Typst 数学转换自测 ===\n");
for (const [src] of CASES.slice(0, 6)) {
  const { typst } = latexToTypst(src);
  console.log(`  ✔ ${src}`);
  console.log(`      → ${typst}`);
}
console.log(`  …（共 ${CASES.length} 条）\n`);

for (const f of fails) {
  console.log(`  [FAIL] ${f.src}`);
  console.log(`         得到：${JSON.stringify(f.got)}`);
  console.log(`         期望：${JSON.stringify(f.want)}`);
  if (f.warnings.length) console.log(`         未识别命令：${f.warnings.join(", ")}`);
}

console.log(`\n=== 结果：${pass}/${CASES.length} 通过 ===`);

// 未识别命令必须被保留（而不是静默丢弃）
const { typst: unknown, warnings: w2 } = latexToTypst(L("@weirdcmd{x}"));
const keptOk = unknown.includes("weirdcmd") && w2.includes("weirdcmd");
console.log(`\n未识别命令处理：得到 ${JSON.stringify(unknown)}，警告 ${JSON.stringify(w2)}`);
console.log(keptOk ? "  ✔ 未识别命令被保留并记警告（不静默丢内容）" : "  ✖ 未识别命令处理有问题");

process.exit(fails.length === 0 && keptOk ? 0 : 1);
