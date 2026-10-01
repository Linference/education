#!/usr/bin/env node
// 扫描仓库里被"双重编码"损坏的文件
//
// 症状：中文内容先被当成 GBK/Latin-1 读入，再以 UTF-8 写出，于是
//   「格致」(e6 a0 bc e8 87 b4) 变成「鏍艰嚧」(e9 8f 8d e8 89 b0 ...)
// 特征：文本里出现大量「锟斤拷」类的生僻字组合，且**几乎不含常用汉字**。
//
// 为什么这是一个真问题：这些文件还能"正常打开"，编辑器也不报错 ——
// 只有人去读才会发现是乱码。所以必须用脚本扫。
import fs from "node:fs";
import path from "node:path";

const SKIP = [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]dist[\\/]/, /[\\/]产出[\\/]/, /package-lock\.json$/, /\.asar$/];
const TEXT_EXT = new Set([".md", ".mjs", ".cjs", ".js", ".json", ".yaml", ".yml", ".txt", ".html", ".css", ".py", ".ps1", ".typ", ".sql", ".svg"]);

/** 常见汉字（在正常中文文本里高频出现）—— 用来判断"这段中文是不是真的中文" */
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

/** 一段文本里，汉字中"常用字"的占比。正常中文应该很高；双重编码后极低。 */
function commonRatio(text) {
  const all = text.match(CJK);
  if (!all || all.length < 20) return { ratio: 1, cjk: all?.length ?? 0, sample: "" };
  let hit = 0;
  for (const ch of all) if (COMMON_SET.has(ch)) hit++;
  return { ratio: hit / all.length, cjk: all.length, sample: all.slice(0, 24).join("") };
}

const root = process.argv[2] ?? process.cwd();
const files = walk(root);
console.log("=== 扫描双重编码损坏的文件 ===");
console.log(`  目录：${root}`);
console.log(`  文本文件：${files.length} 个\n`);

const suspects = [];
for (const f of files) {
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  const { ratio, cjk, sample } = commonRatio(text);
  // 汉字数量够多、但常用字占比异常低 → 疑似双重编码
  if (cjk >= 20 && ratio < 0.35) {
    suspects.push({ file: f, ratio, cjk, sample });
  }
}

if (suspects.length === 0) {
  console.log("  ✔ 没有发现双重编码损坏的文件");
  process.exit(0);
}

console.log(`  ✖ 发现 ${suspects.length} 个疑似损坏：\n`);
for (const s of suspects.sort((a, b) => a.ratio - b.ratio)) {
  console.log(`  ${path.relative(root, s.file)}`);
  console.log(`     常用字占比 ${(s.ratio * 100).toFixed(1)}%（正常应 >60%）｜汉字 ${s.cjk} 个`);
  console.log(`     样例：${s.sample}`);
}
console.log("\n  修复思路：把文件按 UTF-8 读出 → 用 GBK 编码回字节 → 再按 UTF-8 解码一次");
process.exit(1);
