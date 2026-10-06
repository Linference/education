// Compile the reported matrix-product failure through the real PDF exporter.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { exportPdf } = require('../apps/desktop/main/lib/export.cjs');
const { latexToTypst } = require('../apps/desktop/main/lib/latex2typst.cjs');
const out = path.join(root, 'output/verification/math-pdf');
fs.mkdirSync(out, {recursive:true});
const run = fs.mkdtempSync(path.join(out,'run-'));
const L = text => text.replaceAll('@', String.fromCharCode(92));
const formulas = [
  L('@min @; c^T x + d^T y @quad @text{s.t.} @quad Ax + By @leq b, @quad y @in @{0,1@}^k, @quad x @geq 0'),
  L('Ax+By@leq b'),
  L('AB(x+y)=ABx+ABy'),
  L('@overline{AB} + @vec{AB}'),
  L('@mathbf{A}x+@mathbf{B}y=@mathbf{b}'),
  L('@text{subject to Ax and By}: Ax @leq b'),
  L('@operatorname{rank}(AB) @leq @min(@operatorname{rank}(A),@operatorname{rank}(B))'),
  L('x@in@mathbb{R}, @Delta x @to 0, E=mc^2'),
  L('@underbrace{AB} + @overbrace{Ax+By}'),
];
const markdown = '# 数学公式导出回归\n\n' + formulas.map((tex,i) => '## 公式 '+(i+1)+'\n\n$$\n'+tex+'\n$$\n\n行内：$'+tex+'$\n').join('\n');
const sourcePath = path.join(run,'矩阵与条件.md');
fs.writeFileSync(sourcePath, markdown);
const result = await exportPdf({markdown,sourcePath,outputPath:path.join(run,'矩阵与条件.pdf'),title:'数学公式导出回归',templatePath:path.join(root,'templates/typst/handout.typ'),bundledTypst:path.join(root,'vendor/typst/typst.exe')});
assert.equal(result.ok,true,result.error);
const pdf = path.join(run,'矩阵与条件.pdf');
assert.equal(fs.readFileSync(pdf).subarray(0,4).toString(),'%PDF');
assert.ok(fs.statSync(pdf).size>1000);
const conversions = formulas.map(tex=>({tex,...latexToTypst(tex)}));
assert.ok(conversions.every(r=>r.warnings.length===0));
assert.match(conversions[0].typst,/A x \+ B y lt.eq b/);
assert.match(conversions[5].typst,/upright\("subject to Ax and By"\)/);
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({ok:true,formulas:formulas.length,inlineAndDisplay:true,pdf,conversions},null,2));
console.log('[PASS] '+formulas.length+' 类公式的行内和块级公式经真实 Typst 编译，PDF 已生成：'+pdf);
