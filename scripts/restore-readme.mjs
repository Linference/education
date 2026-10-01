#!/usr/bin/env node
// 从 git 历史恢复被双重编码损坏的 README.md
//
// 背景：README.md 被 PowerShell 的 `Get-Content`(默认按 GBK 读) +
// `Set-Content -Encoding utf8` 组合损坏了 —— 中文变成了「鏍艰嚧」这种双重编码。
// 这种损坏**不可逆**（有字节掉进了私用区，信息已丢），所以只能从 git 恢复。
//
// 同时把损坏后新加的内容补回去（那些内容不在旧版本里）。
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const GOOD_COMMIT = "ec3b6b9";     // 首个提交，README 完好
const original = execFileSync("git", ["show", `${GOOD_COMMIT}:README.md`], { encoding: "utf8" });

// 损坏后发现的新约束，要补回 README 的硬约束表（内容我在会话里写的，据此重写）
const R13_ROW = "| **补全源必须首行判 composing** | 实测 CodeMirror 的 autocompletion 在 `view.composing === true` 时**仍会**调用补全源 → 中文组词时补全弹窗与输入法候选词抢按键（就是 Monaco #2199 那个病）。每个补全源第一行写 `if (context.view?.composing) return null;` |";
const MOJIBAKE_ROW = "| **别用 PowerShell 的 `Get-Content` 读 UTF-8 文件** | 它默认按系统 ANSI（本机 GBK）解码 → 中文变乱码；再 `Set-Content -Encoding utf8` 写回就**永久损坏**（本项目 README.md 已中招一次）。判断编码与读写请用 Node，或至少 `-Encoding UTF8` |";
const ELECTRON_ROW = "| **Electron 主进程/preload 必须是 CommonJS** | `import { app, BrowserWindow } from \"electron\"` 会报 `does not provide an export named 'BrowserWindow'` —— Electron 内置模块不提供 ESM 具名导出。主进程与 preload 用 `.cjs`，渲染进程照常 ESM |";
const RUNASNODE_ROW = "| **`ELECTRON_RUN_AS_NODE=1` 会让 Electron 变成 Node** | 环境里残留这个变量时，Electron 启动会报 `Cannot read properties of undefined (reading 'whenReady')`。调试 DSH 时设过它的话，记得清掉 |";

let fixed = original;

// 在硬约束表里插入新行（插在"子进程 stdout 要显式 UTF-8"那行之后）
const anchor = "| **子进程 stdout 要显式 UTF-8** |";
const idx = fixed.indexOf(anchor);
if (idx >= 0) {
  const lineEnd = fixed.indexOf("\n", idx);
  fixed = fixed.slice(0, lineEnd + 1) + [R13_ROW, MOJIBAKE_ROW, ELECTRON_ROW, RUNASNODE_ROW].join("\n") + "\n" + fixed.slice(lineEnd + 1);
} else {
  console.error("找不到插入锚点，硬约束表可能结构已变 —— 请人工确认");
  process.exit(2);
}

// 把新完成的验证成果补进"下一步"之前
fixed = fixed.replace(
  "## 下一步\n\nP0 已完成。P1 = 知识库与编辑器（Electron 壳 + 文件树 + 标签页 + CodeMirror 6 + Live Preview）。",
  `## 已验证的能力（都有可复跑的证据）

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| P0 地基（库结构 / DSH 桥 / 许可门禁 / 密钥防线） | ✅ 9/9 | \`node scripts/p0.mjs\` |
| 中文输入法（组合输入） | ✅ 8/8 | \`poc/ime/cdp_ime_final.py\` |
| R13 自动补全 × 输入法 | ✅ 5/5 | \`poc/ime/cdp_r13_test.py\` |
| 腾讯云 ASR / TTS（含合成→识别闭环） | ✅ 10/10 | \`packages/voice/verify-tencent.mjs\`（需环境变量密钥） |
| 产出物去品牌化 + 知识点详细度 | ✅ 10/10 | \`typst compile templates/typst/handout-sample.typ\` |
| Electron 壳（启动 / IPC / 安全约束 / 文件树 / 标签页） | 见 \`apps/desktop/smoke-electron.mjs\` | — |

## 下一步

P1 = 知识库与编辑器（Electron 壳 + 文件树 + 标签页 + CodeMirror 6 + Live Preview）。`
);

fs.writeFileSync("README.md", fixed, "utf8");
console.log(`已恢复 README.md：${original.length} 字 → ${fixed.length} 字`);
console.log("校验：");
const cjk = [...fixed].filter((c) => /[\u4e00-\u9fff]/.test(c));
const common = "的一是不了在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日军者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应战向头文体政美相见被利什二等产或新己制身果加西斯月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活尔更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直德资命山金指克许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具罗字爱击流备兵连调深商算质团集百需价花党华城石级整府离况亚请技际约示复病息究线似官火断精满支视消越器容照须九增研写称企八功吗包片史委乎查轻容易早曾除农找装广显吧阿李标谈吃图念六引历首医局突专费号尽另周较注语仅考落青随选列武红响虽推势参希古众构房半节土投某案黑维革划敌致陈律足态护七兴派孩验责营星够章音跟志底站严巴例防族供效续施留讲型料终答紧黄绝奇察母京段依批群项故按河米围江织害斗双境客纪采举杀攻父苏密低朝友诉止细愿千值仍男钱破网热助倒育属坐帝限船脸职速刻乐否刚威毛状率甚独球般普怕弹校苦创假久错承印晚兰试股拿脑预谁益阳若哪微尼继送急血惊伤素药适波夜省初喜卫源食险待述陆习置居劳财环排福纳欢雷警获模充负云停木游龙树疑层冷洲冲射略范竟句室异激汉村哈策演简卡罪判担州静退既衣您宗积余痛检差富灵协角占配征修皮挥胜降阶审沉坚善妈刘读啊超免压银买皇养伊怀执副乱抗犯追帮宣佛岁航优怪香著田铁控税左右份穿艺背阵草脚概恶块顿敢守酒岛托央户烈洋哥索胡款靠评版宝座释景顾弟登货互付伯慢欧换闻危忙核暗姐介坏讨丽良序升监临亮露永呼味野架域沙掉括舰鱼杂误湾吉减编楚肯测败屋跑梦散温困剑渐封救贵枪缺楼县尚毫移娘朋画班智亦耳恩短掌恐遗固席松秘谢鲁遇康虑幸均销钟诗藏赶剧票损忽巨炮旧端探湖录叶春乡附吸予礼港雨呀板庭妇归睛饭额含顺输摇招婚脱补谓督毒油疗旅泽材灭逐莫笔亡鲜词圣择寻厂睡博勒烟授诺伦岸奥唐卖俄炸载洛健堂旁宫喝借君禁阴园谋宋避抓荣姑孙逃牙束跳顶玉镇雪午练迫爷篇肉嘴馆遍凡础洞卷坦牛宁纸诸训私庄祖丝翻暴森塔默握戏隐熟骨访弱蒙歌店鬼软典欲萨伙遭盘爸扩盖弄雄稳忘亿刺拥徒姆杨齐赛趣曲刀床迎冰虚玩析窗醒妻透购替塞努休虎扬途侵刑绿兄迅套贸毕唯谷轮库迹尤竞街促延震弃甲伟麻川申缓潜闪售灯针哲络抵朱埃抱鼓植纯夏忍页杰筑折郑贝尊吴秀混臣雅振染盛怒舞圆搞狂措姓残硕郊描鼻";
let hit = 0;
for (const c of cjk) if (common.includes(c)) hit++;
console.log(`  汉字 ${cjk.length} 个，常用字占比 ${((hit / cjk.length) * 100).toFixed(1)}%（>60% 为正常）`);
console.log(`  开头：${JSON.stringify(fixed.slice(0, 30))}`);
