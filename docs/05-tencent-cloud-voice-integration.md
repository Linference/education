# Tencent Cloud Voice Integration Measurements (ASR / TTS)

> Measurement date: 2026-10-01
> Verification script: [`packages/voice/verify-tencent.mjs`](../packages/voice/verify-tencent.mjs) (10 assertions, all passed)
> Result: **TTS + ASR work in both directions; closed-loop verification hit 100% of characters**

---

## 1. Final Capability Matrix (All Measured, Not Copied from Documentation)

| Capability | Status | Evidence |
| --- | --- | --- |
| TTS synthesizes Chinese speech | ✅ | 14,400 bytes / 652 ms |
| **TTS character-level timestamps** | ✅ **15 time slices** | `格[34-278] 致[278-476] 测[476-708] 试[708-952] ，[952-1126] 情[1126-1393]…` |
| Timestamps monotonically non-decreasing | ✅ | Usable for timeline alignment |
| Timestamps can be reassembled into the original text | ✅ | Shows they are given **per character**, not per sentence |
| Mouth-shape frame generation | ✅ | 111 frames, of which 108 are mouth-open |
| ASR one-sentence recognition | ✅ | 373–700 ms |
| **ASR word-level timestamps** | ✅ **6 words** | `格致[150-650] 测试[650-1200] 情态[1250-1750] 动词[1750-2225] 表示[2225-2600] 推测[2600-3050]` |
| **Closed loop: synthesis→recognition** | ✅ **100% character match** | Fed in "格致测试，情态动词表示推测。", read back character-for-character identical |

> **The closed-loop item is the strongest evidence**: it simultaneously proves that the key, signature, request format, audio format and encoding are all correct across the whole chain. Merely seeing "the API returned 200" cannot prove any of that.

---

## 2. Two Field Pitfalls Encountered (Both Were My Own Misreadings)

### Pitfall 1: TTS's timestamp field is `Subtitles` (array), not `Subtitle` (JSON string)

The research report said "`EnableSubtitle` returns character-level `BeginTime`/`EndTime` + `Phoneme` pinyin", based on which I wrote `JSON.parse(res.Subtitle)`. The actual SDK type definition (`tts_models.d.ts`) is:

```ts
export interface TextToVoiceResponse {
    Subtitles?: Array<Subtitle>;      // ← plural, and already an array
}
export interface Subtitle {
    Text?: string;
    BeginTime?: number;
    EndTime?: number;
    BeginIndex?: number;
    EndIndex?: number;
}
```

**Note: there is no `Phoneme` field.** The "pinyin" item in the research report is inaccurate — mouth shapes can only be produced by mapping "character → final" ourselves, or by drawing open/close arcs over time.

**Lesson**: an API "succeeding" does not mean "the field you want has a value". The SDK will not report an error just because you fail to read one field; you must **print the field structure of the raw response and look at it**. Diagnostic script: [`diagnose-subtitle.mjs`](../packages/voice/diagnose-subtitle.mjs).

### Pitfall 2: ASR's `WordList` is already an array; it must not be `JSON.parse`d again

```ts
export interface SentenceRecognitionResponse {
    WordList?: Array<SentenceWord>;   // ← already parsed
}
export interface SentenceWord { Word?: string; StartTime?: number; EndTime?: number; }
```

I wrote `JSON.parse(res.WordList)` and got `Unexpected token 'o', "[object Obj"...`.

**What is more worth reflecting on**: my assertion was `Array.isArray(asr.words)` — which is also true for an empty array, so this bug **was judged as "passed"**.

> **Lesson: assertions must check "has content", not just "type is right".** Changed to `asr.words.length > 0`.

---

## 3. The Most Important Finding: Educational Voices Do Not Support Timestamps

Scanned 12 voices ([`probe-subtitle-voices.mjs`](../packages/voice/probe-subtitle-voices.mjs)); the pattern is very clear:

| Voice tier | Voice IDs | Timestamps |
| --- | --- | --- |
| Basic | 101001 / 101002 / 0 | ✅ Yes |
| Premium | 1001 Zhiyu / 1002 Zhiling | ✅ Yes |
| **Large model** | **501008 Zhibin / 501000 Zhilan / 601008 Zhibin 2** | ✅ Yes |
| **Educational** | **403005 Yun Yaqin / 403003 Yun Xiaotian** | ❌ **No** |
| Supernatural | 602005 Yun Mu / 603001 Yun Xi | ❌ No |

**The default voice I originally chose, 403005 "Yun Yaqin · composed female teacher", happened to be exactly the tier that does not support timestamps.**
And timestamps are the data source for the digital human's mouth shapes — this selection error would directly degrade the digital human into "a randomly moving mouth".

**Fixed**: the default voice is now **501000 Large Model · Zhilan** — high-end sound quality, and timestamps are available.

```js
export const DEFAULT_VOICE = VOICE_PRESETS.llmZhiLan;   // 501000
export const VOICES_WITH_TIMING = new Set([501000, 501008, 601008, 1001, 1002, 101001, 101002, 0]);
```

> If one day mouth shapes are definitively not needed (e.g., pure read-aloud), use an educational voice then. **But do not use it when mouth shapes are needed.**

---

## 4. Engineering Constraints (Write These into the Implementation; Do Not Forget)

| Constraint | Value | Impact |
| --- | --- | --- |
| TTS single-request text limit | Chinese **150 characters** (full-width punctuation counts as one character) | AI-generated explanation scripts will inevitably be too long → `splitForTts()` is implemented to split at sentence-ending punctuation, degrade overlong single sentences to commas, and hard-split when there is no punctuation (tests cover no character loss) |
| One-sentence recognition audio limit | **60 seconds / 3 MB** | Feynman explanations over 60 seconds must switch to recording-file recognition (asynchronous), or record in segments |
| Supported ASR engines | `16k_zh`, **`16k_zh-PY` (mixed Chinese/English/Cantonese)**, **`16k_yue` (Cantonese)**, `16k_zh_dialect` (23 dialects) | **Use `16k_zh-PY` as the default for Macau scenarios** — students commonly mix Chinese, English and Cantonese |
| Key location | **Main process only** | Signing requires the SecretKey; once it is sent to the renderer process, anyone who can open DevTools can take it |

---

## 5. Key Handling (The Discipline in This Section Must Be Followed)

- During verification, the keys were **passed only via environment variables**, never written to any file, never entered git
- The credential resolution order in `packages/voice/src/index.mjs`: environment variables → encrypted storage (`%APPDATA%\gezhi\credentials.enc`)
- `credentialsStatus()` only reports "source and whether ready", **and returns no key content whatsoever** (there are assertions checking that `AKID`/`secretKey` do not appear in the status object)

**The key used for this verification has already appeared in the chat log**; rotating it is recommended. After rotation, configure it as follows:

```powershell
# Option 1: temporary environment variables (valid only for the current session)
$env:TENCENT_SECRET_ID="new ID"; $env:TENCENT_SECRET_KEY="new Key"; node packages/voice/verify-tencent.mjs

# Option 2 (recommended): write into encrypted storage, no need to enter it again afterward
node -e "import('./packages/core/src/credentials.mjs').then(m => { m.saveSecrets({ tencent: { secretId: process.env.TID, secretKey: process.env.TKEY } }, { passphrase: 'your master password' }); console.log('Saved to', m.credentialsPath()); })"
```

---

## 6. To Verify / To Decide

- [ ] **Recording-file recognition (asynchronous)** not tested — needed when explanations exceed 60 seconds; requires uploading to COS first or using a URL
- [ ] **Real-time speech recognition (WebSocket streaming)** not tested — required for "transcribe while speaking"
- [ ] **Billing**: the call volume consumed this time was not tallied; the free quota and pay-as-you-go switch need to be confirmed in the console
- [ ] **Digital-human mouth shapes**: currently "character-level timestamps → open/close arcs". For greater precision, a "character → final → mouth shape" mapping table must be built ourselves (Tencent Cloud **does not return** pinyin/phonemes)
- [ ] **Audio retention policy**: whether Tencent Cloud retains customer audio and whether it can be deleted — still unverified (this affects whether "one-click delete recording" can truly be honored)
