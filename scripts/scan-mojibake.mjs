#!/usr/bin/env node
// Scan the repository for files corrupted by "double encoding".
//
// Symptom: Chinese content is first read as GBK/Latin-1, then written out as
//   UTF-8, so 「格致」(e6 a0 bc e8 87 b4) becomes 「鏍艰嚧」(e9 8f 8d e8 89 b0 ...).
// Signature: the text is full of rare-character combinations like 「锟斤拷」,
//   and **almost none of the common Chinese characters**.
//
// Why this is a real problem: these files still "open fine" and editors raise
//   no error — only a human reading them notices the corruption. So it must be
//   caught by a script.
import fs from "node:fs";
import path from "node:path";

/**
 * Skip rules.
 *
 * ★ Must include vendor/ and dist/installer:
 *   After bundling LibreOffice, the repo gained 9000+ third-party files
 *   (including the Python standard library). They contain character-table
 *   constants that already "look like mojibake" (for example idna's
 *   uts46data.py lists Han characters by Unicode block), which would be
 *   false positives. This is not our code; changing it would be wrong.
 *
 *   Rationale: the purpose of this scan is to find **our own text files**
 *   that were corrupted by double encoding.
 *
 * ⚠️ Rule syntax note: do not write `[\\/]vendor[\\/]` —
 *     that requires a separator on both sides of vendor, which **does not
 *     match a leading relative path**.
 *     Although the scan currently passes absolute paths (which do match),
 *     relying on that is fragile: a different invocation (passing relative
 *     paths) would silently stop matching.
 *     So use `(^|[\\/])vendor[\\/]` to cover both cases explicitly.
 */
const SEG = (name) => new RegExp(`(^|[\\\\/])${name}[\\\\/]`);
const SKIP = [
  SEG("node_modules"),
  SEG("\\.git"),
  SEG("dist"),
  SEG("产出"),
  SEG("vendor"),
  new RegExp(`(^|[\\\\/])\\.tmp[^\\\\/]*[\\\\/]`),
  /package-lock\.json$/,
  /\.asar$/,
  /\.min\.(js|css)$/,
];
const TEXT_EXT = new Set([".md", ".mjs", ".cjs", ".js", ".json", ".yaml", ".yml", ".txt", ".html", ".css", ".py", ".ps1", ".typ", ".sql", ".svg"]);

/** Common Han characters (high-frequency in normal Chinese text) — used to decide whether "this Chinese text is really Chinese". */
const COMMON_CHARS = "的一是不了在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日军者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应战向头文体政美相见被利什二等产或新己制身果加西斯月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活尔更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直德资命山金指克许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具罗字爱击流备兵连调深商算质团集百需价花党华城石级整府离况亚请技际约示复病息究线似官火断精满支视消越器容照须九增研写称企八功吗包片史委乎查轻容易早曾除农找装广显吧阿李标谈吃图念六引历首医局突专费号尽另周较注语仅考落青随选列武红响虽推势参希古众构房半节土投某案黑维革划敌致陈律足态护七兴派孩验责营星够章音跟志底站严巴例防族供效续施留讲型料终答紧黄绝奇察母京段依批群项故按河米围江织害斗双境客纪采举杀攻父苏密低朝友诉止细愿千值仍男钱破网热助倒育属坐帝限船脸职速刻乐否刚威毛状率甚独球般普怕弹校苦创假久错承印晚兰试股拿脑预谁益阳若哪微尼继送急血惊伤素药适波夜省初喜卫源食险待述陆习置居劳财环排福纳欢雷警获模充负云停木游龙树疑层冷洲冲射略范竟句室异激汉村哈策演简卡罪判担州静退既衣您宗积余痛检差富灵协角占配征修皮挥胜降阶审沉坚善妈刘读啊超免压银买皇养伊怀执副乱抗犯追帮宣佛岁航优怪香著田铁控税左右份穿艺背阵草脚概恶块顿敢守酒岛托央户烈洋哥索胡款靠评版宝座释景顾弟登货互付伯慢欧换闻危忙核暗姐介坏讨丽良序升监临亮露永呼味野架域沙掉括舰鱼杂误湾吉减编楚肯测败屋跑梦散温困剑渐封救贵枪缺楼县尚毫移娘朋画班智亦耳恩短掌恐遗固席松秘谢鲁遇康虑幸均销钟诗藏赶剧票损忽巨炮旧端探湖录叶春乡附吸予礼港雨呀板庭妇归睛饭额含顺输摇招婚脱补谓督毒油疗旅泽材灭逐莫笔亡鲜词圣择寻厂睡博勒烟授诺伦岸奥唐卖俄炸载洛健堂旁宫喝借君禁阴园谋宋避抓荣姑孙逃牙束跳顶玉镇雪午练迫爷篇肉嘴馆遍凡础洞卷坦牛宁纸诸训私庄祖丝翻暴森塔默握戏隐熟骨访弱蒙歌店鬼软典欲萨伙遭盘爸扩盖弄雄稳忘亿刺拥徒姆杨齐赛趣曲刀床迎冰虚玩析窗醒妻透购替塞努休虎扬途侵刑绿兄迅套贸毕唯谷轮库迹尤竞街促延震弃甲伟麻川申缓潜闪售灯针哲络抵朱埃抱鼓植纯夏忍页杰筑折郑贝尊吴秀混臣雅振染盛怒舞圆搞狂措姓残硕郊描鼻";

const CJK = /[\u4e00-\u9fff]/g;
const COMMON_SET = new Set(COMMON_CHARS);

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (SKIP.some((r) => r.test(p))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

/** The fraction of Han characters in a text that are "common". Normal Chinese should be high; after double encoding it is very low. */
function commonRatio(text) {
  const all = text.match(CJK);
  if (!all || all.length < 20) return { ratio: 1, cjk: all?.length ?? 0, sample: "" };
  let hit = 0;
  for (const ch of all) if (COMMON_SET.has(ch)) hit++;
  return { ratio: hit / all.length, cjk: all.length, sample: all.slice(0, 24).join("") };
}

const root = process.argv[2] ?? process.cwd();
const files = walk(root);
console.log("=== Scan for double-encoded (mojibake) files ===");
console.log(`  Directory: ${root}`);
console.log(`  Text files: ${files.length}\n`);

const suspects = [];
for (const f of files) {
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  const { ratio, cjk, sample } = commonRatio(text);
  // Enough Han characters, but an abnormally low common-character ratio → suspected double encoding
  if (cjk >= 20 && ratio < 0.35) {
    suspects.push({ file: f, ratio, cjk, sample });
  }
}

if (suspects.length === 0) {
  console.log("  ✔ No double-encoded files found");
  process.exit(0);
}

console.log(`  ✖ Found ${suspects.length} suspected corrupted file(s):\n`);
for (const s of suspects.sort((a, b) => a.ratio - b.ratio)) {
  console.log(`  ${path.relative(root, s.file)}`);
  console.log(`     Common-character ratio ${(s.ratio * 100).toFixed(1)}% (normal should be >60%) | ${s.cjk} Han characters`);
  console.log(`     Sample: ${s.sample}`);
}
console.log("\n  Fix idea: read the file as UTF-8 → re-encode the bytes as GBK → decode once more as UTF-8");
process.exit(1);
