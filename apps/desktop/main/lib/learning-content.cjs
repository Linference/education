// Original, reviewed learning exercises. These are never labelled as past papers.
const source = '格致原创学习练习 · 非考试真题';
const concepts = [
  { id: '一元二次方程', subject: '数学' }, { id: '判别式', subject: '数学' }, { id: '二次函数', subject: '数学' },
  { id: '顶点式', subject: '数学' }, { id: '概率', subject: '数学' }, { id: '独立事件', subject: '数学' },
  { id: '受力分析', subject: '物理' }, { id: '牛顿第二定律', subject: '物理' }, { id: '匀速运动', subject: '物理' },
  { id: '摩擦力', subject: '物理' }, { id: '物质的量', subject: '化学' }, { id: '化学方程式', subject: '化学' },
];
const edges = [
  ['一元二次方程', '判别式'], ['二次函数', '顶点式'],
  ['概率', '独立事件'], ['受力分析', '牛顿第二定律'], ['受力分析', '摩擦力'],
].map(([from, to]) => ({ from, to, kind: 'prerequisite', source: '格致教学关系设计' }));
edges.push({ from: '判别式', to: '二次函数', kind: 'related', source: '格致教学关联设计：方程实根与函数零点' }, { from: '牛顿第二定律', to: '匀速运动', kind: 'related', source: '格致教学关联设计：匀速直线运动的受力解释' });
const question = (id, mode, concept, title, prompt, options, answer, explanation, extra = {}) => ({
  id, mode, concept, title, prompt, options: options.map((text, i) => ({ label: String.fromCharCode(65 + i), text })),
  answer, explanation, source, grading: 'choice', hint: '先核对定义和适用条件，再逐项判断。', ...extra,
});
const activities = [
  question('practice-discriminant', 'practice', '判别式', '重根与判别式', '方程 x² − 2x + 1 = 0 的判别式 Δ 是多少？', ['−4', '0', '1', '4'], 'B', 'Δ = b² − 4ac = 4 − 4 = 0，方程有两个相等的实数根。', { hint: '代入 a = 1，b = −2，c = 1，注意负数的平方。' }),
  question('practice-force', 'practice', '牛顿第二定律', '力决定什么', '质量不变时，物体所受合力直接决定哪个量？', ['位置', '速度', '加速度', '运动路程'], 'C', '牛顿第二定律描述合力与加速度的关系 F合 = ma，速度还取决于初始速度和时间。'),
  question('practice-moles', 'practice', '物质的量', '系数与比例', '反应 2H₂ + O₂ → 2H₂O 中，反应物 H₂ 与 O₂ 的物质的量之比为？', ['1 : 1', '2 : 1', '1 : 2', '4 : 1'], 'B', '配平后的化学计量数给出物质的量之比 2 : 1，并不直接给出质量比。'),
  question('detective-root', 'detective', '一元二次方程', '消失的一个解', '找出下面推导中最早发生错误的一步。', ['① x² = x', '② 两边同时除以 x，得到 x = 1', '③ 所以唯一的解是 x = 1'], 'B', '第②步未讨论 x = 0 就除以 x，遗漏了零解。应变形为 x(x − 1) = 0，得到 x = 0 或 x = 1。', { correctionOptions: ['x = 1 是唯一解', 'x = 0 或 x = 1', '无解'], correctionAnswer: 'B', hint: '什么时候可以除以一个含未知数的式子？检验 x = 0。' }),
  question('detective-force', 'detective', '牛顿第二定律', '速度大，合力一定大？', '找出下面论证中最早发生错误的一步。', ['① 牛顿第二定律为 F合 = ma', '② 将加速度 a 换成速度 v，得到 F合 = mv', '③ 因此速度越大，合力越大'], 'B', '第②步混淆速度和加速度。匀速运动的物体可以速度很大，但加速度为零，合力也为零。', { correctionOptions: ['高速匀速列车，合力为零', '速度大，所以合力必定很大', '只要运动，就有非零合力'], correctionAnswer: 'A', hint: '一个物体匀速直线运动时，加速度是多少？' }),
  question('detective-probability', 'detective', '独立事件', '连续抛硬币的陷阱', '找出最早发生错误的一步。假设硬币公平且每次抛掷相互独立。', ['① 前五次均为正面', '② 因为前面正面太多，第六次反面概率超过 1/2', '③ 因此应该押反面'], 'B', '第②步忽略独立性。前五次结果不会改变第六次的概率，第六次反面概率仍为 1/2。', { correctionOptions: ['反面概率变为 5/6', '正反面概率各为 1/2', '一定为反面'], correctionAnswer: 'B', hint: '独立事件的下一次概率会被过去的结果改变吗？' }),
  question('detective-chemistry', 'detective', '物质的量', '把系数当作质量比', '找出最早发生错误的一步。', ['① 2H₂ + O₂ → 2H₂O', '② 所以参与反应的 H₂ 与 O₂ 质量比为 2 : 1', '③ 2 g H₂ 恰好与 1 g O₂ 完全反应'], 'B', '第②步把物质的量比当作质量比。使用摩尔质量 H₂ = 2 g/mol、O₂ = 32 g/mol，质量比为 4 : 32 = 1 : 8。', { correctionOptions: ['质量比为 2 : 1', '质量比为 1 : 8', '质量比为 1 : 16'], correctionAnswer: 'B', hint: '先得到物质的量比，再分别乘以摩尔质量。' }),
  question('transfer-quadratic-1', 'transfer', '二次函数', '读懂顶点', '函数 y = (x − 2)² + 1 的顶点坐标是？', ['(−2, 1)', '(2, 1)', '(2, −1)', '(1, 2)'], 'B', '顶点式 y = a(x − h)² + k 的顶点为 (h, k)。', { level: 1, levelLabel: '基础辨认', chain: 'quadratic' }),
  question('transfer-quadratic-2', 'transfer', '二次函数', '改变关键条件', '把 y = (x − 2)² + 1 改为 y = −(x − 2)² + 1，下列说法正确的是？', ['顶点改变，开口不变', '顶点不变，开口向下', '顶点不变，开口向上', '对称轴变为 x = −2'], 'B', 'a 的符号改变开口方向；h、k 不变，所以顶点与对称轴不变。', { level: 2, levelLabel: '条件变化', chain: 'quadratic', requires: 'transfer-quadratic-1' }),
  question('transfer-quadratic-3', 'transfer', '二次函数', '喷泉里的抛物线', '喷泉水流模型为 y = −0.5(x − 2)² + 2（单位：米，0 ≤ x ≤ 4）。最高点的位置和高度是？', ['x = 0，高 2 m', 'x = 2，高 2 m', 'x = 4，高 2 m', 'x = 2，高 4 m'], 'B', '该模型开口向下，顶点 (2, 2) 就是定义域内的最高点。数学模型只用于这段水流轨迹。', { level: 3, levelLabel: '生活迁移', chain: 'quadratic', requires: 'transfer-quadratic-2' }),
  question('transfer-force-1', 'transfer', '牛顿第二定律', '从合力求加速度', '水平合力为 12 N，物体质量为 3 kg，加速度是多少？', ['0.25 m/s²', '4 m/s²', '9 m/s²', '36 m/s²'], 'B', 'a = F合 / m = 12 / 3 = 4 m/s²。', { level: 1, levelLabel: '基础应用', chain: 'force' }),
  question('transfer-force-2', 'transfer', '牛顿第二定律', '增加一个阻力', '质量仍为 3 kg，向右拉力 12 N，向左摩擦力 3 N，加速度是多少？', ['4 m/s²，向右', '3 m/s²，向右', '5 m/s²，向右', '1 m/s²，向左'], 'B', '先求合力：12 − 3 = 9 N，向右；再求 a = 9 / 3 = 3 m/s²。', { level: 2, levelLabel: '条件变化', chain: 'force', requires: 'transfer-force-1' }),
  question('transfer-force-3', 'transfer', '牛顿第二定律', '列车速度很大时', '列车在水平直轨道上以 30 m/s 匀速行驶。牵引力与总阻力的关系是？', ['牵引力大于总阻力', '牵引力等于总阻力', '牵引力小于总阻力', '无法根据匀速条件判断'], 'B', '匀速直线运动意味着加速度为零，合力为零，所以水平牵引力与总阻力大小相等、方向相反。', { level: 3, levelLabel: '生活迁移', chain: 'force', requires: 'transfer-force-2' }),
  question('transfer-probability-1', 'transfer', '独立事件', '一次抛掷', '公平硬币抛掷一次，正面的概率为？', ['0', '1/4', '1/2', '1'], 'C', '在公平硬币模型下，正反面概率各为 1/2。', { level: 1, levelLabel: '基础应用', chain: 'probability' }),
  question('transfer-probability-2', 'transfer', '独立事件', '两次至少一次', '公平硬币独立抛掷两次，至少出现一次正面的概率为？', ['1/4', '1/2', '3/4', '1'], 'C', '对立事件是两次均为反面，概率为 (1/2)² = 1/4；所求为 1 − 1/4 = 3/4。', { level: 2, levelLabel: '条件变化', chain: 'probability', requires: 'transfer-probability-1' }),
  question('transfer-probability-3', 'transfer', '独立事件', '抽奖次数与机会', '每次抽奖中奖概率为 0.2，各次独立。抽两次至少中一次的概率为？', ['0.2', '0.36', '0.4', '0.8'], 'B', '两次都不中的概率为 0.8² = 0.64，因此至少中一次为 1 − 0.64 = 0.36。', { level: 3, levelLabel: '生活迁移', chain: 'probability', requires: 'transfer-probability-2' }),
];
function publicActivity(a) {
  const { answer, correctionAnswer, explanation, ...visible } = a;
  return visible;
}
module.exports = { concepts, edges, activities, publicActivity, source };
if (process.env.GEZHI_DEMO_EN === '1') {
  const labels = require('../../shared/demo-en.json');
  const t = value => typeof value === 'string' ? labels[value] || value : value;
  module.exports = { concepts: concepts.map(c => ({ id:t(c.id), subject:t(c.subject) })), edges: edges.map(e => ({ ...e, from:t(e.from), to:t(e.to), source:'Gezhi teaching relationship' })), activities: activities.map(a => ({ ...a, concept:t(a.concept), title:t(a.title), prompt:t(a.prompt), options:a.options.map(o=>({...o,text:t(o.text)})), correctionOptions:a.correctionOptions?.map(t), explanation:t(a.explanation), hint:t(a.hint), levelLabel:t(a.levelLabel), source:t(source) })), publicActivity, source:t(source) };
}
