# 腾讯云语音接入实测（ASR / TTS）

> 实测时间：2026-10-01
> 验证脚本：[`packages/voice/verify-tencent.mjs`](../packages/voice/verify-tencent.mjs)（10 项断言，全过）
> 结果：**TTS + ASR 双向打通，闭环验证 100% 字命中**

---

## 一、最终能力矩阵（都是实测，不是文档抄来的）

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| TTS 合成中文语音 | ✅ | 14400 字节 / 652ms |
| **TTS 字级时间戳** | ✅ **15 个时间片** | `格[34-278] 致[278-476] 测[476-708] 试[708-952] ，[952-1126] 情[1126-1393]…` |
| 时间戳单调不减 | ✅ | 可做时间轴对齐 |
| 时间戳能拼回原文 | ✅ | 说明是**按字**给的，不是按句 |
| 口型帧生成 | ✅ | 111 帧，其中张嘴 108 帧 |
| ASR 一句话识别 | ✅ | 373–700ms |
| **ASR 词级时间戳** | ✅ **6 个词** | `格致[150-650] 测试[650-1200] 情态[1250-1750] 动词[1750-2225] 表示[2225-2600] 推测[2600-3050]` |
| **闭环：合成→识别** | ✅ **100% 字命中** | 喂进去「格致测试，情态动词表示推测。」，读回来一字不差 |

> **闭环这一条是最强证据**：它同时证明了密钥、签名、请求格式、音频格式、编码全链路正确。单看"接口返回 200"是证明不了这些的。

---

## 二、踩到的两个字段坑（都是我自己读错了）

### 坑 1：TTS 的时间戳字段是 `Subtitles`（数组），不是 `Subtitle`（JSON 字符串）

调研报告里写的是「`EnableSubtitle` 返回字级 `BeginTime`/`EndTime` + `Phoneme` 拼音」，
我据此写成 `JSON.parse(res.Subtitle)`。实际 SDK 类型定义（`tts_models.d.ts`）是：

```ts
export interface TextToVoiceResponse {
    Subtitles?: Array<Subtitle>;      // ← 复数，且已是数组
}
export interface Subtitle {
    Text?: string;
    BeginTime?: number;
    EndTime?: number;
    BeginIndex?: number;
    EndIndex?: number;
}
```

**注意：没有 `Phoneme` 字段。** 调研报告里那条"拼音"是不准确的 —— 口型只能靠"字 → 韵母"自己映射，或者按时间做开合弧线。

**教训**：接口"成功"不等于"要的字段有值"。SDK 不会因为你少拿一个字段而报错，必须**把原始响应的字段结构打出来看**。诊断脚本：[`diagnose-subtitle.mjs`](../packages/voice/diagnose-subtitle.mjs)。

### 坑 2：ASR 的 `WordList` 已经是数组，不能再 `JSON.parse`

```ts
export interface SentenceRecognitionResponse {
    WordList?: Array<SentenceWord>;   // ← 已解析
}
export interface SentenceWord { Word?: string; StartTime?: number; EndTime?: number; }
```

我写成 `JSON.parse(res.WordList)`，得到 `Unexpected token 'o', "[object Obj"...`。

**更值得反省的是**：我的断言写的是 `Array.isArray(asr.words)` —— 对空数组也成立，所以这个 bug **被判成"通过"**。

> **教训：断言要判「有内容」，不能只判「类型对」。** 已改成 `asr.words.length > 0`。

---

## 三、最重要的发现：教育音色不支持时间戳

扫了 12 个音色（[`probe-subtitle-voices.mjs`](../packages/voice/probe-subtitle-voices.mjs)），规律非常清楚：

| 音色档位 | 音色 ID | 时间戳 |
| --- | --- | --- |
| 基础版 | 101001 / 101002 / 0 | ✅ 有 |
| 精品 | 1001 智瑜 / 1002 智聆 | ✅ 有 |
| **大模型** | **501008 智斌 / 501000 智兰 / 601008 智斌2** | ✅ 有 |
| **教育** | **403005 云雅琴 / 403003 云小天** | ❌ **无** |
| 超自然 | 602005 云幕 / 603001 云希 | ❌ 无 |

**我原本选的默认音色 403005「云雅琴 · 沉稳女老师」，恰好就是不支持时间戳的那一档。**
而时间戳是数字人口型的数据源 —— 这个选型错误会直接让数字人退化成"嘴巴乱动"。

**已修正**：默认音色改为 **501000 大模型·智兰** —— 音质属于高档，且时间戳可用。

```js
export const DEFAULT_VOICE = VOICE_PRESETS.llmZhiLan;   // 501000
export const VOICES_WITH_TIMING = new Set([501000, 501008, 601008, 1001, 1002, 101001, 101002, 0]);
```

> 如果哪天确定不要口型（例如只做纯朗读），再用教育音色。**但别在需要口型时用它。**

---

## 四、工程约束（写进实现，别忘）

| 约束 | 数值 | 影响 |
| --- | --- | --- |
| TTS 单次文本上限 | 中文 **150 字**（全角标点算一字） | AI 生成的讲解稿必然超长 → 已实现 `splitForTts()` 按句末标点切分，超长单句退化到逗号，无标点则硬切（有测试覆盖不丢字） |
| 一句话识别音频上限 | **60 秒 / 3 MB** | 费曼讲解超过 60 秒就要改用录音文件识别（异步），或边录边分段 |
| 支持的 ASR 引擎 | `16k_zh`、**`16k_zh-PY`（中英粤混说）**、**`16k_yue`（粤语）**、`16k_zh_dialect`（23 方言） | **澳门场景用 `16k_zh-PY` 作默认** —— 学生中英粤混说很常见 |
| 密钥位置 | **只在主进程** | 签名需要 SecretKey，一旦下发到渲染进程，任何能开 DevTools 的人都能拿走 |

---

## 五、密钥处理（这一节的纪律必须遵守）

- 验证期间密钥**只经环境变量传入**，没有写入任何文件、没有进 git
- `packages/voice/src/index.mjs` 的凭据解析顺序：环境变量 → 加密存储（`%APPDATA%\gezhi\credentials.enc`）
- `credentialsStatus()` 只报"来源与是否就绪"，**不返回任何密钥内容**（有断言检查状态对象里不出现 `AKID`/`secretKey`）

**本次验证用的密钥已经在聊天记录里出现过**，建议轮换。轮换后配置方式：

```powershell
# 方式一：临时环境变量（仅当次会话有效）
$env:TENCENT_SECRET_ID="新ID"; $env:TENCENT_SECRET_KEY="新Key"; node packages/voice/verify-tencent.mjs

# 方式二（推荐）：写进加密存储，之后不用再输
node -e "import('./packages/core/src/credentials.mjs').then(m => { m.saveSecrets({ tencent: { secretId: process.env.TID, secretKey: process.env.TKEY } }, { passphrase: '你的主密码' }); console.log('已保存到', m.credentialsPath()); })"
```

---

## 六、待验证 / 待决

- [ ] **录音文件识别（异步）** 未测 —— 讲解超过 60 秒时要用它，需先上传到 COS 或走 URL
- [ ] **实时语音识别（WebSocket 流式）** 未测 —— 想做"边说边转写"必须用它
- [ ] **计费**：本次消耗的调用量未统计；免费额度与后付费开关需在控制台确认
- [ ] **数字人口型**：目前是"字级时间戳 → 开合弧线"。若要更精细，需自己做"字 → 韵母 → 口型"映射表（腾讯云**不返回**拼音/音素）
- [ ] **音频留存政策**：腾讯云是否留存客户音频、能否删除 —— 仍未核实（这关系到"一键删除录音"能不能真正兑现）
