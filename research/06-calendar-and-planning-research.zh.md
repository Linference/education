# 格致 · 日历与计划模块技术调研（06）

> 调研对象：Windows 桌面端「个人学习 + AI 陪练」应用中的 **日历 + 计划安排表** 模块
> 覆盖范围：日历 UI 选型、SQLite 数据模型、AI 自动分割计划、到期提醒、倒计时、习惯与统计、参考开源项目、验收标准
> 调研日期：**2026-10-01**
> 版本口径：npm 版本号与发布时间取自 `registry.npmjs.org` 实时查询；仓库 star / License / 归档状态取自 GitHub REST API 实时查询。

---

## 0. 阅读约定与调研方法（含可信度声明）

**标注约定**

- `【事实】` = 已通过官方文档 / 官方仓库 API / npm registry 直接核对，附真实 URL。
- `【推断】` = 基于事实的工程判断，可能因你的技术栈不同而改变。
- `【未验证】` = 本次调研未能直接核实，落地前需自行验证。

**本次调研的工具限制（重要，影响部分结论的可核查性）**

- `web_fetch` 在本机网络环境下**无法访问 `github.com` 与 `raw.githubusercontent.com`**（代理判定为非公网 IP，直接拒绝）。因此 GitHub 仓库信息（star、License、archived、最后 push 时间）是通过 **GitHub REST API** 核实并写入本报告的，可自行复核：`https://api.github.com/repos/<owner>/<repo>`。
- 因此**所有 `.github.com/...` 链接均未被逐页打开**，其内容来自 API 元数据 + 搜索引擎摘要拼接。报告中凡涉及"README 里写了什么语法/功能"的内容，若未能通过其他可访问域名（官方文档站、npm registry、官方 publish 站点）二次确认，均标为 `【未验证】`。
- `platform.openai.com` 被 Cloudflare 拦截（HTTP 403），OpenAI 结构化输出文档**未直接打开**，仅在"参考链接"中给出，其细节标 `【未验证】`。

---

## 1. 日历 UI 组件选型

### 1.1 结论速览表

| 方案 | 版本（实时核实） | License | 月/周/日/议程 | 拖拽改期 | 多日历 | 中文 | recurrence | 结论 |
|---|---|---|---|---|---|---|---|---|
| **FullCalendar** | 7.1.0（2026-09-05） | 标准版 **MIT**；Premium 另售 | 全支持 | 免费（`/interaction`） | 免费（事件分组/样式） | 有 locale 机制，zh-cn 属标准 locale 集 | 免费（`@fullcalendar/rrule`，MIT） | ✅ **推荐** |
| react-big-calendar | 1.20.0 | **MIT** | month/week/work_week/day/agenda | 库内置拖拽（`draggable`）`【未验证】` | 靠事件样式自行分组 | 靠 dayjs/moment locale | 无内置，需自行接 rrule | ⭕ 备选 |
| Schedule-X | @schedule-x/calendar 4.9.1 | 核心 **MIT**，拖拽/侧栏/弹窗等为 **Premium** | Day/Week/Month grid/Year/3×Agenda/List | **Premium（€479/年）** | 有 calendars 概念 | 有 Language 文档 | 有 recurrence 插件 | ❌ 拖拽要付费，排除 |
| Toast UI Calendar | @toast-ui/calendar 2.1.3（2022-08-16） | **MIT** | 支持日/周/月 | 支持 | 支持 | 韩系，中文可自定义 | 不支持 RRULE | ❌ **仓库已归档** |
| v-calendar | 2.4.2（latest）/ 3.1.2（next） | **MIT** | 月为主 + **周视图**(v3) | ❌ 非日程拖拽库 | 靠 attributes | 有 i18n/locales | 重复日期范围（非 RRULE） | ⚠️ 仅 Vue；Vue 3 线仍是 `next` |
| 日期库 | dayjs 1.11.23 / date-fns 4.4.0 / luxon 3.7.2 / temporal-polyfill 1.0.5 | 依次 MIT / MIT / MIT / MIT | — | — | — | 前三者均含 zh-CN | — | 见 1.4 |

`【事实】` 版本、License、发布时间：npm registry 实时查询（例：`https://registry.npmjs.org/fullcalendar`、`https://registry.npmjs.org/@schedule-x/calendar/latest`、`https://registry.npmjs.org/@toast-ui/calendar/latest`、`https://registry.npmjs.org/v-calendar`）。
`【事实】` 仓库 star / License / archived：GitHub REST API 实时查询——
`fullcalendar/fullcalendar` 20,658★ MIT 未归档；`bigcalendar/react-big-calendar` 8,760★ MIT 未归档（注意：仓库已从 `jquense/` 迁移到 `bigcalendar/`）；`schedule-x/schedule-x` 2,589★ MIT 未归档；`nhn/tui.calendar` 12,696★ MIT **archived=true**；`nathanreyes/v-calendar` 4,518★ MIT 未归档，最后 push 2024-08-07。

---

### 1.2 FullCalendar：免费版与 Premium 的边界（这是选型的核心问题）

`【事实】` 官方 License 页明确区分两套包：

| 包 | License | 关键内容 |
|---|---|---|
| `fullcalendar` / `@fullcalendar/react` 等标准包 | **MIT** | `/interaction`（点击、选择、**拖拽改变日期与改时长**）、`/daygrid`（`dayGridMonth/Week/Day/Year`）、`/timegrid`（**`timeGridWeek` / `timeGridDay`**）、`/list`（议程列表）、`/multimonth` |
| `fullcalendar-scheduler` / `@fullcalendar/react-scheduler` | **Premium（商业授权）** | `/scrollgrid`、`/timeline`、`/adaptive`（印刷）、`/resource-daygrid`、**`/resource-timegrid`**、`/resource-timeline` |

来源：[fullcalendar.io/license](https://fullcalendar.io/license)、[fullcalendar.io/docs/plugin-index](https://fullcalendar.io/docs/plugin-index)、[fullcalendar.io/pricing](https://fullcalendar.io/pricing)

`【事实】` Premium 授权分层：商业用途须购买商用授权（**起价 $480**）；注册非营利组织可免费使用非商业授权（**政府机构与大学不在覆盖范围内**）；前端与后端**全部** AGPLv3 的开源项目可在 AGPLv3 下免费使用（v7 起由 GPLv3 改为 AGPLv3）；其他许可证的开源项目只能以"依赖安装 + 不硬编码 license key"的方式引用。来源：[fullcalendar.io/license](https://fullcalendar.io/license)、[fullcalendar.io/pricing](https://fullcalendar.io/pricing)

`【事实】` npm 侧旁证：`fullcalendar` 与 `@fullcalendar/core` 最新版 7.1.0 的 `license` 字段为 `MIT`；而 `fullcalendar-scheduler` 与 `@fullcalendar/resource-timeline` 的 `license` 字段为 `SEE LICENSE IN LICENSE.md`（非开源）。来源：`https://registry.npmjs.org/fullcalendar-scheduler/latest`、`https://registry.npmjs.org/@fullcalendar/resource-timeline/latest`

`【事实】` **recurrence 不需要 Premium**：`@fullcalendar/rrule` 被官方归入"supplemental plugin（补充插件），可与任何 UI 库配合使用"，7.1.0 版本 `license: MIT`，依赖仅 `@fullcalendar/core`。来源：[plugin-index](https://fullcalendar.io/docs/plugin-index)、`https://registry.npmjs.org/@fullcalendar/rrule/latest`

`【推断】` 对「格致」来说，**免费套餐就够用**：月视图（看考试/倒计时）、周视图（当课程表）、日视图（当日任务）、list 视图（复习队列）全部在 MIT 包内；拖拽改期也在 MIT 包内。**唯一真的想要但要付费的是"资源视图/时间轴"**——即"左边一列老师/科目、右边时间网格"的那种表。下面 1.5 给出不付费的替代做法。

---

### 1.3 其余方案的关键事实

- **react-big-calendar** `【事实】` npm 1.20.0，`license: MIT`，peerDeps `react ^16.14 || ^17 || ^18 || ^19`，运行期依赖同时包含 `dayjs`、`luxon`、`moment`、`globalize`（历史包袱，打包体积需注意）。来源：`https://registry.npmjs.org/react-big-calendar/latest`。`【未验证】` 视图清单（month/week/work_week/day/agenda）与拖拽能力来自搜索引擎抓取的 README 片段，未能直接打开仓库确认；落地前请以实际版本 README 为准。
- **Schedule-X** `【事实】` 核心 `@schedule-x/calendar` 4.9.1 `license: MIT`，peerDeps 为 `preact` / `@preact/signals` / `temporal-polyfill`（说明它走 **Temporal API** 路线）。免费视图 7 种：Day、Week、Month grid、Year grid、Month agenda、Week agenda、List。Premium 定价 **€479/年** 或 **€999 买断**（2–3 开发者）。拖拽改期（drag-and-drop）、缩放、拖拽创建、侧栏、事件弹窗、资源视图、甘特图均标 ⭐ = Premium。来源：[schedule-x.dev/docs/calendar/views](https://schedule-x.dev/docs/calendar/views)、[schedule-x.dev/premium](https://schedule-x.dev/premium)、[drag-to-create 插件](https://schedule-x.dev/docs/calendar/plugins/drag-to-create)
- **Toast UI Calendar** `【事实】` `@toast-ui/calendar` 2.1.3 发布于 **2022-08-16**，`license: MIT`，但 GitHub 仓库 `nhn/tui.calendar` 的 API 元数据为 **`archived: true`**（最后 push 2024-06-24）。`【事实】` 其依赖含 `preact` 与 `tui-date-picker`/`tui-time-picker`。**结论：不推荐用在 2026 年的新项目**（归档 = 不再修 bug、不再适配新版 Chromium/Node）。
- **v-calendar** `【事实】` npm `latest` 仍是 2.4.2（Vue 2 peerDep: `vue ^2.5.18`）；Vue 3 版本在 `next` 标签上，为 **3.1.2**。官方 v3 文档宣称 v3 带来 **weekly views**、简化时间选择器、**repeating date ranges**、time rules、性能改进，并提供 i18n/locales/timezones 三节文档。`【事实】` 仓库 4,518★ MIT，但最后 push 为 **2024-08-07**（近两年无提交），维护节奏需评估。来源：[vcalendar.io](https://vcalendar.io/)、`https://registry.npmjs.org/v-calendar`、GitHub API。**且它是 Vue 生态**——若「格致」用 React 或非 Vue 栈，直接排除。

---

### 1.4 日期库对比（Day.js / date-fns / Luxon / Temporal）

| 库 | 最新版 | License | 体积/风格 | zh-CN | 适用判断 |
|---|---|---|---|---|---|
| **Day.js** | 1.11.23（2026-08-17 发布） | MIT | ~2KB，moment 风格链式 API，插件化（utc/timezone/duration/relativeTime/isoWeek…） | ✅ `dayjs/locale/zh-cn` | ✅ 前端 UI 格式化首选，`relativeTime` 插件直接产出"还有 3 天" |
| **date-fns** | 4.4.0 | MIT | 函数式、tree-shakable，`exports` 中显式含 `./locale/zh-CN` | ✅ | ✅ 计算类逻辑（addDays / differenceInDays / eachDayOfInterval）首选 |
| **Luxon** | 3.7.2 | MIT | 基于 Intl，时区/夏令时最稳 | ✅（Intl locale） | ⭕ 只在真的跨时区/跨夏令时场景引入 |
| **Temporal（polyfill）** | `temporal-polyfill` 1.0.5（MIT）/ `@js-temporal/polyfill` 0.5.1（ISC） | MIT / ISC | 新 API，ZonedDateTime / PlainDate 语义清晰 | 由 Intl 提供 | ⚠️ 原生支持情况 `【未验证】`（本次未查到权威的浏览器/Node 基线声明）；**不要作为唯一依赖** |

`【事实】` 版本、License、发布时间来源：`https://registry.npmjs.org/dayjs`、`https://registry.npmjs.org/date-fns/latest`、`https://registry.npmjs.org/luxon/latest`、`https://registry.npmjs.org/temporal-polyfill/latest`、`https://registry.npmjs.org/@js-temporal/polyfill/latest`。
`【事实】` date-fns 4.4.0 的包 `exports` 字段中确实存在 `./locale/zh-CN` 入口（本次通过 npm registry 元数据直接核验）。`【事实】` Day.js 官方提供 locale 加载文档（`require('dayjs/locale/de')` 式按需加载）：[day.js.org/docs/en/i18n/loading-into-nodejs](https://day.js.org/docs/en/i18n/loading-into-nodejs)。
`【推断】` **推荐组合：date-fns（算）+ Day.js（显示）**，不要同时上 Luxon + Moment（体积/语义重复）。Temporal 先只在"新代码想用就用"的层面观望。

---

### 1.5 中文、农历、recurrence 三件事

**（a）中文界面**
`【事实】` FullCalendar 提供 `locale` / `locales` 选项与"locale 对象形状"定义（`prevText`/`nextText`/`todayText`/`weekText`/`listText` 等），并支持 ES6 逐语言引入（`fullcalendar/locales/es`）与 `locales-all` 全量引入。来源：[fullcalendar.io/docs/locale](https://fullcalendar.io/docs/locale)。
`【未验证】` **FullCalendar 7 是否内置 `zh-cn` 的具体文件名/导出路径**，本次未能逐项确认（官方 locale 列表页未打开）。落地第一步请执行一次 `node -e "console.log(require('@fullcalendar/core/locales/zh-cn'))"` 验证；若不内置，用官方文档给出的 locale 对象形状自行提供一份即可（工作量约 30 行）。

**（b）农历**
`【事实】` `lunar-javascript`（作者 6tail）最新版 **1.7.7**，发布 **2025-11-05**，`license: MIT`，仓库 `6tail/lunar-javascript` 1,688★ 未归档。包描述为"无第三方依赖的公历（阳历）、农历（阴历、老黄历）、佛历和道历工具"，关键词覆盖 节气 / 干支 / 生肖 / 节日 等。来源：`https://registry.npmjs.org/lunar-javascript/latest`、GitHub API。
`【推断】` **农历生日倒计时用 `lunar-javascript` 单独实现，不要指望日历组件自带**。做法：存"农历月/日"（如 `七月十五`→ `{lunar_month:7, lunar_day:15, is_leap:0}`），每年用该库把农历转成当年公历日期，再生成一条 `countdowns` 记录（见第 2 节）。
`【未验证】` 该库的 API 具体函数名（如 `Lunar.fromDate` / `Solar.fromYmd`）本次未打开 README 确认，落地时以实际文档为准。

**（c）recurrence（RRULE）**
`【事实】` RFC 5545（iCalendar）定义了 `RRULE`（Recurrence Rule）属性，位于 §3.8.5.3，属 Proposed Standard，2009-09 发布，被 RFC 7529（非公历循环规则）等更新。来源：[RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3)。
`【事实】` `rrule` npm 包最新版 **2.8.1，发布于 2023-11-10**，`license: BSD-3-Clause`；仓库 `jkbrzt/rrule` 3,743★ 未归档，最后 push **2024-06-27**。来源：`https://registry.npmjs.org/rrule/latest`、GitHub API。
`【推断】` rrule 2.8.1 近三年无新版本 → **属于"稳定但低活跃"**，用作规则展开完全够用（RRULE 本身不常变），但不要指望它跟进 Temporal；若上 Temporal 路线，可关注同生态的 `rrule-temporal`（2.2.7，MIT，2026-09-25 发布，`https://registry.npmjs.org/rrule-temporal/latest`）。
`【事实】` FullCalendar 官方提供 `@fullcalendar/rrule` 插件"用于利用 RRule 库处理事件重复"，MIT。来源：[plugin-index](https://fullcalendar.io/docs/plugin-index)。
`【事实】` Schedule-X 有独立的 Event Recurrence 插件页：`https://schedule-x.dev/docs/calendar/plugins/recurrence`（`【未验证】` 该插件是否 Premium——其文档导航中未标 ⭐，但 Preview 页未逐一列出，落地前需确认）。

---

### 1.6 最终推荐与本项目落地形态

**✅ 推荐：FullCalendar 7.x（MIT 标准包）+ `@fullcalendar/react` + `@fullcalendar/rrule` + Day.js/date-fns**

理由（全部基于 1.2 节事实）：
1. 月 / 周 / 日 / 议程 / 多年视图 **全在 MIT 包内**，满足"课程表 + 考试 + 复习 + 自定义"四类日历；
2. **拖拽改期在 MIT 的 `/interaction` 插件内**（这是相对 Schedule-X 的关键优势——后者 €479/年）；
3. **RRULE 免费**（`@fullcalendar/rrule`，MIT）——课程表"每周一 3-4 节"、复习"每 3 天"都能用标准 RRULE 表达；
4. 有官方 locale 机制，中文可控；
5. 20,658★、v7.1.0 在 2026-09 仍在发版，活跃度最好。

**关于"周视图像课程表"的两种做法**

- **做法 A（推荐，零付费）——用 `timeGridWeek` 当课程表**：
  `【事实】` `timeGridPlugin` 提供 `timeGridWeek` / `timeGridDay`，并以 `slotMinTime`（每天第一个时段）、`slotMaxTime`（最后一个时段，官方强调是**排他性结束时间**）、`slotDuration`（时段频率）、`slotLabelInterval`、`allDaySlot`、`eventMinHeight`、`slotEventOverlap`、`nowIndicator`、`expandRows` 等选项控制网格外观。来源：[fullcalendar.io/docs/timegrid-view](https://fullcalendar.io/docs/timegrid-view)。
  `【推断】` 配置思路：`slotMinTime: '07:00'`、`slotMaxTime: '23:00'`（按你的作息裁剪，避免整天滚动）、`slotDuration: '00:30'`、`allDaySlot: true`（放"今日待办/倒计时"）、`nowIndicator: true`。课程事件用 RRULE（`FREQ=WEEKLY;BYDAY=MO;COUNT=20`）周期性生成，`editable: true` 支持拖拽调课。**周视图 = 课程表，日视图 = 今日任务表**，两者共用一套 `events` + `eventClick` 弹窗。
- **做法 B（需要"科目成行"时）——自己拼 resource 视图，或降级为"同一天多列"**：
  真正的"左列科目、右列时间轴"是 `/resource-timeline` / `/resource-timegrid`，**属 Premium**。若产品上确实需要"科目成行"：
  - 方案 B1：`【推断】` 左侧用普通 DOM 渲染科目列，右侧用 FullCalendar 的 `dayGridWeek` 做"每格一个科目-任务"的卡片网格（放弃时间比例尺，只表达"周几 + 第几节"）——这对"课程表"语义其实更贴切，且完全免费。
  - 方案 B2：`【推断】` 若一定要时间比例尺成行，考虑申请 FullCalendar Premium 的**非商业授权**（`【事实】` 注册非营利组织免费，但**学校/政府不在覆盖范围**，个人学习软件需按商业授权评估，起价 $480/年）。
  - 方案 B3：`【推断】` 自研一张"周网格"组件（7 列 × N 行的 CSS Grid），课程数据直接来自 `events` 表——对本项目（单人、固定作息、不需要时区/冲突检测）成本可能低于任何付费方案。

**多日历（课程表/考试/复习/自定义）的实现方式**
`【推断】` 不建议开多个 Calendar 实例（性能与交互同步成本高）。做法：单一 Calendar 实例 + 事件对象自带的业务字段 `calendarKey ∈ {course, exam, review, custom}`，通过 `eventClassNames` / `eventContent` 上色与图标，用左侧自定义图例做显隐开关（把被隐藏类别的 events 在 `eventSources` 层过滤掉）。这与 Schedule-X 的 "calendars" 概念同构，但用免费库实现。

---

## 2. 数据模型设计（SQLite）

### 2.1 总体设计原则

1. **目标 / 计划 / 任务三层分离**：`goals`（为什么学）→ `plans`（阶段与周，用 `parent_id` 自嵌套）→ `tasks`（可勾选的最小执行单元）。
2. **固定日程与任务分开**：`events` 存"不可协商的时间块"（上课、考试、补习），`tasks` 存"要完成的事"。**课程表上的"每周一 3-4 节数学"是 `events`（带 RRULE），不是 task**；而"做完函数单调性 20 题"是 task。两者的唯一交汇点是"剩余可学习天数 / 今日容量"的计算（见第 5 节）。
3. **复习队列独立于任务**：`reviews` 是 FSRS 状态机（每个知识点一行），**每天由调度器把到期复习"投影"为当天的 task 行**，而不是让复习直接当任务。这样"重排计划"时不会破坏 FSRS 的记忆状态。
4. **题库/知识点通过外键挂接**：`tasks` 与 `reviews` 都能指向 `knowledge_points`（知识点）与 `questions`（题目），从而实现"今天该复习什么 / 该做哪套卷"。
5. **不建大杂烩表**：`events`（时间块）、`countdowns`（重要日子）、`tasks` 三者的字段重叠度低，强行合并会导致大量 NULL 与语义歧义（这是很多 Todo 应用最后失控的地方）。

### 2.2 表与字段定义

> 字段类型遵循 SQLite 的 **类型亲和性（type affinity）**。日期时间统一采用 **`TEXT` + ISO-8601 本地时间字符串**（`YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS`），理由见 2.4。

#### `goals`（学习目标）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | 「两个月内补完高中物理力学」 |
| `subject_id` | INTEGER | FK → `subjects(id)` | 主学科（可空=综合目标） |
| `description` | TEXT | | 原始自然语言描述（AI 拆解的输入原文，务必保留） |
| `deadline` | TEXT | | `YYYY-MM-DD`，目标截止日 |
| `target_level` | INTEGER | DEFAULT 3 | 目标掌握度 1–5，与费曼评分口径一致 |
| `current_level` | REAL | | 诊断出的当前水平（来自费曼评分模块），拆解时冻结快照 |
| `daily_minutes_cap` | INTEGER | DEFAULT 90 | **每日该目标的投入上限（分钟）**，AI 生成计划的硬约束 |
| `status` | TEXT | CHECK IN ('active','paused','done','dropped') | |
| `source` | TEXT | CHECK IN ('manual','ai') | |
| `created_at` / `updated_at` | TEXT | | |

#### `plans`（计划：里程碑 / 月 / 周，自嵌套）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `goal_id` | INTEGER | FK → `goals(id)` ON DELETE CASCADE, NOT NULL | |
| `parent_id` | INTEGER | FK → `plans(id)` ON DELETE CASCADE | **NULL = 顶层（里程碑）**；支持任意层级分解 |
| `kind` | TEXT | CHECK IN ('milestone','month','week','day') | 层级语义，便于 UI 折叠与统计 |
| `title` | TEXT | NOT NULL | 「第 3 周：函数单调性与奇偶性」 |
| `seq` | INTEGER | | 同层内排序 |
| `start_date` / `end_date` | TEXT | | `YYYY-MM-DD` |
| `planned_minutes` | INTEGER | | 该计划块的总预算分钟 |
| `status` | TEXT | CHECK IN ('pending','active','done','skipped') | |
| `is_buffer` | INTEGER | DEFAULT 0 | **=1 表示这是刻意留出的缓冲/休息块**（第 3 节约束的落库形式） |
| `source` | TEXT | CHECK IN ('manual','ai') | |
| `ai_run_id` | INTEGER | FK → `ai_plan_runs(id)` | 可追溯是哪个 AI 版本生成的，支持一键回滚 |
| `created_at` / `updated_at` | TEXT | | |

> 层级查询用递归 CTE（SQLite 原生支持 `WITH RECURSIVE`，官方文档：`https://sqlite.org/lang_with.html`）。`【未验证】` 该 URL 本次未直接打开，但 `WITH RECURSIVE` 为 SQLite 长期内置特性。

#### `tasks`（具体任务）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `plan_id` | INTEGER | FK → `plans(id)` ON DELETE SET NULL | 可空（临时任务不挂在计划上） |
| `goal_id` | INTEGER | FK → `goals(id)` ON DELETE SET NULL | 冗余字段，便于直接按目标统计 |
| `title` | TEXT | NOT NULL | 「物理必修一 P42–P48 例题 + 变式」 |
| `task_type` | TEXT | CHECK IN ('read','practice','review','paper','recite','other') | `paper` = 做整套卷 |
| `estimated_minutes` | INTEGER | NOT NULL DEFAULT 25 | **番茄钟个数 = ceil(estimated/25)** |
| `actual_minutes` | INTEGER | DEFAULT 0 | 由 `time_logs` 汇总回写 |
| `done` | INTEGER | NOT NULL DEFAULT 0 | 0/1 |
| `done_at` | TEXT | | |
| `due_date` | TEXT | | `YYYY-MM-DD`，**日粒度**（学习计划不需要到分钟） |
| `due_time` | TEXT | | 可空 `HH:MM`，仅"考试/交卷"类需要 |
| `priority` | INTEGER | DEFAULT 2 | 0 高 / 1 中 / 2 低 |
| `source` | TEXT | NOT NULL CHECK IN ('manual','ai','review','reschedule') | `review` = FSRS 投影生成；`reschedule` = 重排生成 |
| `origin_task_id` | INTEGER | FK → `tasks(id)` | 重排后指向"被推迟的原任务"，保证可追溯 |
| `knowledge_point_id` | INTEGER | FK → `knowledge_points(id)` | 与知识点表联动 |
| `question_set_id` | INTEGER | FK → `question_sets(id)` | 与题库联动（"该做哪套卷"） |
| `countdown_id` | INTEGER | FK → `countdowns(id)` | 为某个重要日子服务的任务（冲刺任务） |
| `sort_key` | REAL | | 当天排序（插队时取中值，避免整体重写） |
| `created_at` / `updated_at` | TEXT | | |

#### `events`（固定日程：上课 / 考试 / 补习）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `calendar_key` | TEXT | NOT NULL CHECK IN ('course','exam','review','custom') | **多日历的落点** |
| `title` | TEXT | NOT NULL | 「数学（必修一）」「期中考试·物理」 |
| `location` | TEXT | | |
| `start_at` / `end_at` | TEXT | NOT NULL | `YYYY-MM-DD HH:MM:SS` |
| `all_day` | INTEGER | DEFAULT 0 | |
| `rrule` | TEXT | | **RFC 5545 RRULE 字符串**，如 `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=20` |
| `rrule_dtstart` | TEXT | | RRULE 的起点（通常 = `start_at`） |
| `exdate` | TEXT | | 例外日期，JSON 数组字符串（调休、停课） |
| `is_blocking` | INTEGER | DEFAULT 1 | **=1 表示占用可学习时间**（计算"剩余可学习天数"时要扣除） |
| `knowledge_point_id` | INTEGER | FK → `knowledge_points(id)` | 课程对应的知识点（可选） |
| `countdown_id` | INTEGER | FK → `countdowns(id)` | 考试事件挂倒计时 |
| `note` | TEXT | | |
| `created_at` / `updated_at` | TEXT | | |

#### `countdowns`（重要日子）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `title` | TEXT | NOT NULL | 「中考」「高考」「四校联考」「保送面试」 |
| `kind` | TEXT | CHECK IN ('exam','interview','deadline','birthday','custom') | |
| `target_date` | TEXT | NOT NULL | `YYYY-MM-DD` |
| `target_time` | TEXT | | `HH:MM`，可空 |
| `calendar_type` | TEXT | NOT NULL DEFAULT 'solar' CHECK IN ('solar','lunar') | **农历生日的开关** |
| `lunar_month` / `lunar_day` / `lunar_is_leap` | INTEGER | | `calendar_type='lunar'` 时使用 |
| `is_recurring_yearly` | INTEGER | DEFAULT 0 | 生日类 = 1（每年自动算下一次） |
| `pinned` | INTEGER | DEFAULT 0 | 是否钉在顶栏倒计时条 |
| `importance` | INTEGER | DEFAULT 1 | 1–3，影响显示优先级与提醒强度 |
| `show_progress` | INTEGER | DEFAULT 1 | 是否显示"复习进度百分比" |
| `linked_goal_id` | INTEGER | FK → `goals(id)` | 倒计时对应的目标（用于进度百分比） |
| `note` | TEXT | | |

#### `reviews`（复习队列，FSRS 状态）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `knowledge_point_id` | INTEGER | FK → `knowledge_points(id)` **UNIQUE**, NOT NULL | **一个知识点一条 FSRS 状态**（这与 Anki 的"笔记→卡片"结构同构，见第 7 节） |
| `state` | INTEGER | NOT NULL DEFAULT 0 | 0 New / 1 Learning / 2 Review / 3 Relearning（对应 ts-fsrs 的 `State`） |
| `due` | TEXT | NOT NULL | 下次到期日（日粒度即可，与 `tasks.due_date` 对齐） |
| `last_review` | TEXT | | |
| `stability` | REAL | | FSRS 记忆稳定性 S |
| `difficulty` | REAL | | FSRS 难度 D |
| `elapsed_days` | INTEGER | DEFAULT 0 | |
| `scheduled_days` | INTEGER | DEFAULT 0 | |
| `reps` | INTEGER | DEFAULT 0 | 总复习次数 |
| `lapses` | INTEGER | DEFAULT 0 | 遗忘次数 |
| `learning_steps` | INTEGER | DEFAULT 0 | 短期学习步骤索引 |
| `last_rating` | INTEGER | | 1 Again / 2 Hard / 3 Good / 4 Easy |
| `priority` | INTEGER | DEFAULT 0 | 手动加急标记 |
| `suspended` | INTEGER | DEFAULT 0 | 暂停（如已保送、该科不再考） |
| `updated_at` | TEXT | | |

`【事实】` ts-fsrs（最新 **5.4.2**，MIT，2026-09-01 发布；仓库 801★）实现 **FSRS v6**，提供 `State.New/Learning/Review/Relearning`、`Rating.Again/Hard/Good/Easy`，以及可配置参数 `request_retention`（0.0–1.0，目标记忆保持率，越高复习量越大）、`maximum_interval`（最长间隔上限）、`enable_fuzz`（给长间隔加抖动，**避免同一天到期任务爆炸**）、`enable_short_term`、`learning_steps`、`relearning_steps`；并提供 `get_retrievability()`、`forgetting_curve()`、`next_state()`、`next_interval()`、`rollback()`、`forget()`、`reschedule()` 等函数；包要求 Node.js ≥ 20。来源：[open-spaced-repetition.github.io/ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/)、`https://registry.npmjs.org/ts-fsrs/latest`。
`【推断】` `enable_fuzz: true` 对本项目几乎是必开项——否则"同一天导入的 200 个知识点"会在未来同一天集中到期，日计划直接崩掉。

#### `tags` 与多对多

| 表 | 字段 | 说明 |
|---|---|---|
| `tags` | `id` PK, `name` TEXT UNIQUE NOT NULL, `color` TEXT, `kind` TEXT CHECK IN ('topic','source','custom') | 「力学」「错题」「学校作业」 |
| `task_tags` | `task_id` FK→`tasks` ON DELETE CASCADE, `tag_id` FK→`tags` ON DELETE CASCADE, **PRIMARY KEY(task_id, tag_id)** | |
| `event_tags` | 同上，指向 `events` | |
| `kp_tags` | 同上，指向 `knowledge_points` | |

#### 与「题库 / 知识点」表的外键关系

`【推断】` 以下四张表属于**已有/并行模块**（不在本报告范围内），此处只约定接口字段，命名可按你现有 schema 调整：

| 外部表 | 关键字段（约定） | 被谁引用 | 用途 |
|---|---|---|---|
| `subjects` | `id`, `name`, `stage` | `goals.subject_id`、`knowledge_points.subject_id` | 学科 |
| `knowledge_points` | `id`, `subject_id`, `chapter_id`, `name`, `difficulty_hint` | **`reviews.knowledge_point_id`（UNIQUE）**、`tasks.knowledge_point_id`、`events.knowledge_point_id` | 复习与任务的最小知识单元 |
| `chapters` | `id`, `subject_id`, `textbook_id`, `index`, `title` | `knowledge_points.chapter_id` | **教材章节顺序**，AI 拆解必须引用它（第 3 节约束） |
| `questions` | `id`, `knowledge_point_id`, `difficulty`, `type` | 经由 `question_set_items` 进入任务 | 题目 |
| `question_sets` | `id`, `title`, `kind` CHECK IN ('paper','drill','wrong_review'), `total_minutes` | `tasks.question_set_id` | 套卷/题组："今天该做哪套卷" |
| `question_set_items` | `set_id` FK, `question_id` FK, `seq`, PK(set_id, question_id) | — | 题目与套卷的多对多 |
| `feynman_scores` | `id`, `knowledge_point_id`, `score` 1–5, `scored_at` | 计划拆解读取（当前水平诊断） | 费曼评分模块输出 |

**外键落地的两条硬事实（容易踩坑）**
- `【事实】` SQLite 的**外键约束默认关闭**，必须在每个连接上执行 `PRAGMA foreign_keys = ON` 才生效；且不能在多语句事务中途切换（会静默无效）。来源：[sqlite.org/foreignkeys.html](https://www.sqlite.org/foreignkeys.html)。
- `【事实】` 官方建议：**子表的外键列应建索引**，否则父表删除/改主键时会全表扫描子表，性能可能"prohibitively expensive"。来源同上。

### 2.3 索引建议

```sql
-- 外键列（官方明确建议，避免父表操作全表扫描）
CREATE INDEX idx_plans_goal        ON plans(goal_id, parent_id);
CREATE INDEX idx_tasks_plan        ON tasks(plan_id);
CREATE INDEX idx_tasks_goal        ON tasks(goal_id);
CREATE INDEX idx_tasks_kp          ON tasks(knowledge_point_id);
CREATE INDEX idx_tasks_set         ON tasks(question_set_id);
CREATE INDEX idx_events_kp         ON events(knowledge_point_id);
CREATE INDEX idx_task_tags_tag     ON task_tags(tag_id);
CREATE INDEX idx_event_tags_tag    ON event_tags(tag_id);
CREATE INDEX idx_kp_tags_tag       ON kp_tags(tag_id);

-- 高频查询：今日任务面板（最高频，务必覆盖）
CREATE INDEX idx_tasks_due_open    ON tasks(due_date, done) WHERE done = 0;
-- 复习队列取到期
CREATE INDEX idx_reviews_due       ON reviews(due) WHERE suspended = 0;
-- 倒计时排序
CREATE INDEX idx_countdowns_date   ON countdowns(target_date);
-- 日历取区间事件
CREATE INDEX idx_events_range      ON events(start_at, end_at);
-- 日历按类别过滤
CREATE INDEX idx_events_cal        ON events(calendar_key, start_at);
-- 统计：按天聚合学习时长
CREATE INDEX idx_timelogs_day      ON time_logs(day, task_id);
```

`【推断】` **部分索引（`WHERE done = 0`）** 是本设计的关键优化：今日面板只关心未完成任务，部分索引体积小、命中率高；`reviews` 同理（绝大部分复习条目是未来的，只需索引未暂停的）。

### 2.4 日期时间存储选型（结论）

| 方案 | 优点 | 缺点 | 本项目取舍 |
|---|---|---|---|
| Unix 秒（INTEGER） | 排序/比较最快，跨时区无歧义 | 人类不可读，调试痛苦；**"某天的任务"需要时区换算** | 仅用于 `created_at`/日志类 |
| **ISO-8601 TEXT**（推荐） | 可直接字符串比较与排序（字典序=时间序）；SQLite 日期函数原生吃这个格式；可读 | 存储略大（可忽略） | ✅ **`due_date` / `target_date` / `start_at` 全部用它** |
| INTEGER 天序号（Julian/自定义） | "相差几天"是纯整数减法，非常适合倒计时 | 需要转换层，可读性差 | 仅作为**计算中间量**，不落库 |
| 本地时间 + 时区字段 | 语义完整 | 单人本地应用属过度设计 | ❌ 不采用 |

`【事实】` SQLite 官方明确"**没有专门的 date/time 数据类型**"，日期时间的存储形式是 ISO-8601 文本、Julian day number、或 Unix 时间戳三种；`date()` 返回 `YYYY-MM-DD` 文本，所有日期函数内部按 UTC 计算，`localtime` / `utc` 修饰符用于换算；`julianday(A)-julianday(B)` 或 `unixepoch()` 差值是"精确差值"的正确做法，而 `timediff()` 是给人看的。来源：[sqlite.org/lang_datefunc.html](https://www.sqlite.org/lang_datefunc.html)。
`【推断】` 学习计划是**本地单人、日粒度**场景：存 `YYYY-MM-DD` 文本 + 用 `julianday()` 求天数差，是复杂度最低且不会踩 DST/时区坑的组合。**倒计时"还有 N 天"必须用"日期差"而不是"秒差 ÷ 86400"**，否则跨夏令时/跨零点会差一天。

### 2.5 其他 schema 相关表（服务于第 4、6 节）

| 表 | 关键字段 | 用途 |
|---|---|---|
| `time_logs` | `id`, `task_id` FK, `day` TEXT, `start_at`, `end_at`, `minutes`, `kind` CHECK IN ('pomodoro','free','break') | 番茄钟/专注时长明细 → 热力图与时长统计 |
| `focus_sessions` | `id`, `task_id`, `planned_minutes`, `actual_minutes`, `interruptions`, `completed` | 单次番茄钟会话 |
| `daily_stats`（物化） | `day` PK, `planned_minutes`, `done_minutes`, `tasks_planned`, `tasks_done`, `review_count`, `streak` | 预聚合，热力图/完成率曲线直接查它，避免每次扫 `tasks` |
| `notifications` | `id`, `dedupe_key` TEXT **UNIQUE**, `task_id`, `scheduled_at`, `fired_at`, `state` CHECK IN ('scheduled','fired','dismissed','snoozed'), `snooze_until`, `snooze_count` | 提醒去重与稍后提醒的持久化（见 4.4） |
| `ai_plan_runs` | `id`, `goal_id`, `model`, `prompt_version`, `input_json`, `output_json`, `validation_errors`, `created_at` | **AI 拆解的可追溯/可回滚/可 A-B 对比**（强烈建议有） |
| `settings` | `key` PK, `value` | 每日简报时间、番茄钟长度、缓冲日比例等 |

`【事实】` 桌面应用建议开启 WAL：官方列出 WAL 的优势为"多数场景显著更快""读不阻塞写、写不阻塞读""I/O 更顺序""更少 fsync"，劣势为"所有进程必须在同一台机器上（网络文件系统不可用）""会多出 `-wal` / `-shm` 文件"。`PRAGMA journal_mode=WAL;` 是**持久化设置**（一次设置，重开仍是 WAL）。来源：[sqlite.org/wal.html](https://www.sqlite.org/wal.html)。
⚠️ `【事实】` **注意一个真实的安全项**：SQLite 官方公告的 **WAL-reset bug** 存在于 3.7.0（2010-07-21）至 3.51.2（2026-01-09），在 3.51.3（2026-03-13）修复；触发条件为 WAL 模式下**两个及以上连接在不同线程/进程同时写或 checkpoint**，后果是数据库损坏。来源同上。`【推断】` 本项目若采用"主进程写 + 渲染进程读"的双连接结构，**必须确认打包的 SQLite 版本 ≥ 3.51.3**（Electron 内置 SQLite 版本需自查；若用 `better-sqlite3` 等原生模块则可自行升级）。

---

## 3. AI 自动分割计划的实现思路

### 3.1 输入契约（Input）

`【推断】` 输入必须是**结构化 + 已量化**的，绝不能把"我想补物理"这句话直接丢给模型：

| 输入项 | 来源 | 必需 | 说明 |
|---|---|---|---|
| 目标描述 | 用户输入 | ✅ | 原文保留在 `goals.description` |
| 截止日期 | 用户输入 | ✅ | `goals.deadline` |
| 每日可投入分钟 | 用户输入 | ✅ | 分工作日/周末两组（`weekday_minutes` / `weekend_minutes`） |
| 不可用星期 | 用户输入 | ✅ | 如"周三、周日下午没空"→ 拆解时这些日子容量记为 0 |
| 当前水平诊断 | **费曼评分模块** | ✅ | 按知识点聚合的 `feynman_scores`（1–5 分）→ 决定"哪些章节可以跳过/快速过" |
| 教材章节清单 | `chapters` 表 | ✅ | **必须给模型真实的 chapter_id + 顺序**，这是防幻觉的关键 |
| 已有固定日程 | `events`（`is_blocking=1`） | ✅ | 用于计算真实剩余容量（第 5 节） |
| 复习到期量 | `reviews` | ✅ | 每天必须预留的复习时间（不可被新计划挤占） |
| 历史完成率 | `daily_stats` 近 14 天 | ⭕ 建议 | 用于设置"现实的"每日任务量 |

### 3.2 输出契约（Output）：JSON Schema

`【推断】` 要求模型输出**三层结构（里程碑 → 周 → 日任务）**，且**只能引用输入中给出的 `chapter_id`**。示意 schema（可直接用于 OpenAI `response_format: json_schema`（strict）或 Gemini `responseSchema`）：

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["goal_summary", "assumptions", "milestones", "warnings"],
  "properties": {
    "goal_summary": { "type": "string" },
    "assumptions": {
      "type": "array", "items": { "type": "string" },
      "description": "AI 对被省略信息的显式假设，便于用户纠正"
    },
    "warnings": {
      "type": "array", "items": { "type": "string" },
      "description": "无法在期限内完成的提示，如'按当前容量缺口约 12 小时'"
    },
    "milestones": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["title", "start_date", "end_date", "chapter_ids", "weeks"],
        "properties": {
          "title": { "type": "string" },
          "start_date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
          "end_date":   { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
          "chapter_ids": { "type": "array", "items": { "type": "integer" } },
          "weeks": {
            "type": "array",
            "items": {
              "type": "object", "additionalProperties": false,
              "required": ["title", "start_date", "end_date", "planned_minutes", "is_buffer", "tasks"],
              "properties": {
                "title": { "type": "string" },
                "start_date": { "type": "string" },
                "end_date":   { "type": "string" },
                "planned_minutes": { "type": "integer", "minimum": 0 },
                "is_buffer": { "type": "boolean" },
                "tasks": {
                  "type": "array",
                  "items": {
                    "type": "object", "additionalProperties": false,
                    "required": ["date", "title", "task_type", "estimated_minutes",
                                 "chapter_id", "knowledge_point_ids"],
                    "properties": {
                      "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
                      "title": { "type": "string" },
                      "task_type": { "enum": ["read","practice","review","paper","recite","other"] },
                      "estimated_minutes": { "type": "integer", "minimum": 5, "maximum": 90 },
                      "chapter_id": { "type": ["integer","null"] },
                      "knowledge_point_ids": { "type": "array", "items": { "type": "integer" } },
                      "question_set_id": { "type": ["integer","null"] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**落地必做三道校验（服务端，不依赖模型自觉）**

1. **Schema 校验**：用 `zod`（4.6.5，MIT）或 `ajv`（8.20.0，MIT）严格校验；失败 → 自动重试一次并把错误信息回灌给模型（`【事实】` ts-fsrs 官方文档也建议"外部来源的参数在应用边界用 zod 之类做运行时校验"，同一原则）。
2. **业务规则校验**（第 3.5 节的硬约束全部要代码化）：
   - 每日 `sum(estimated_minutes) ≤ daily_minutes_cap`（且要扣除当日复习预留）；
   - 日期必须落在 `goal.start ~ goal.deadline` 区间内；
   - **`chapter_id` 必须存在于 `chapters` 表**，且同一里程碑内 `chapters.index` **单调不减**（保证教材顺序）；
   - 每个 `week` 至少 1 天 `is_buffer`（或整周 `is_buffer=true`）；
   - 不可用星期不得安排任务。
3. **失败降级**：校验不通过且重试仍失败 → 不让 AI 直接落库，改为**落成"草稿计划"让用户确认**（`plans.status='pending'` + UI 标黄），绝不静默写入不可执行的数据。

### 3.3 具体拆解示例：「高二学生 60 天提升英语语法 + 数学函数」

**输入（示意）**
- 目标：60 天内提升英语语法与数学函数，`deadline = D+59`
- 容量：工作日 60 min，周末 150 min；**周三、周日晚上没空**（容量减半）
- 诊断（费曼评分）：数学"函数单调性" 3/5、"奇偶性" 2/5、"指数对数函数" 1/5；英语"时态" 2/5、"非谓语动词" 1/5、"定语从句" 4/5（可快速过）
- 教材章节：数学必修一 第3章 函数概念与性质（index 3.1 单调性 / 3.2 奇偶性）、第4章 指数函数与对数函数；英语 语法专题 07 时态 / 11 非谓语 / 12 定语从句
- 复习预留：每天 15 min（FSRS 到期量）

**输出（三级分解样例，片段）**

| 层级 | 内容 |
|---|---|
| **L1 里程碑 M1**（D1–D24，约 3.5 周） | 「函数基础重建 + 时态系统化」`chapter_ids: [3.1, 3.2, 07]` |
| **L2 周计划 W1**（D1–D7，planned 540 min） | 主题「函数单调性定义与判定」；`is_buffer=false` |
| **L3 日任务**（示例 1 天） | `D1`：① 阅读 3.1 定义与例题 25 min（`read`, kp=单调性）② 变式 12 题 25 min（`practice`）③ 英语时态 08:00 一般现在/过去 25 min ④ **FSRS 到期复习 15 min（系统自动插入，不占 AI 配额）** |
| **L2 缓冲周 W4**（D22–D24 收尾 + 1 天机动） | `is_buffer=true`，仅安排复习与错题回炉——**刻意留白** |
| **L1 里程碑 M2**（D25–D48） | 「指数/对数函数 + 非谓语动词攻坚」`chapter_ids:[4.x, 11]` |
| **L1 里程碑 M3**（D49–D58） | 「套卷实战 + 错题闭环」——`task_type='paper'`，关联 `question_set_id` |
| **D59–D60** | 全程 `is_buffer=true`：只做 FSRS 复习与轻量回顾 |

`【推断】` 这个例子体现了三个设计要点：(1) **难度分配遵循诊断结果**（定语从句 4/5 → 只做少量验证题，把时间让给 1/5 的非谓语）；(2) **每周留缓冲周**；(3) **复习任务由系统插入而非 AI 生成**（AI 不感知 FSRS 状态，让它排复习必然排错）。

### 3.4 滚动重排（Rolling Replan）

`【推断】` 核心原则：**小步高频重排，不要大重排**。基于事实的组件：FSRS 的 `reschedule()` / `rollback()` 允许从复习日志重建状态（[ts-fsrs 文档](https://open-spaced-repetition.github.io/ts-fsrs/)），所以"任务层"可以自由重排而不伤记忆模型。

**触发条件（任一命中即触发）**

| 触发器 | 阈值（建议初值，可调） | 动作 |
|---|---|---|
| 逾期任务堆积 | 逾期未完成 `estimated_minutes` 之和 > 未来 3 天可用容量 | 重排未来 7 天 |
| 完成率过低 | 近 7 天 `done_minutes/planned_minutes < 0.7` | 下调每日配额 20%，并把"精通级"任务降级为"理解级" |
| 连续 3 天空转 | 0 完成 | 只保留"最小可行动作"（每天 1 个 ≤15 min 任务），重建习惯 |
| 新增硬日程 | 新增 `events(is_blocking=1)` 且与既定任务冲突 | 局部重排冲突日 ±2 天 |
| 诊断变化 | 同知识点费曼评分上升 ≥2 分 | 压缩该知识点任务量，提前进入下一章 |
| 容量变更 | 用户修改每日可投入时间 | 全量重算（但保留已完成/已开始任务不动） |

**重排策略（按优先级顺序执行）**

1. **已完成/已开始的任务永不移动**（`done=1` 或 `actual_minutes>0`）。
2. **轻量任务自动"顺延"**：`task_type IN ('read','recite')` 且 `estimated_minutes ≤ 30` → 直接 `due_date += 1`（这类任务推迟的成本最低）。
3. **重量任务必须重新拆分**：`task_type IN ('paper','practice')` 且 `estimated_minutes ≥ 60` → 拆成 2–3 个 25 min 子任务分散到不同天（避免"一张卷子堵死一天"）。
4. **每天预留缓冲**：重排后每天的任务总量**不得超过当日容量的 80%**（硬规则，见 3.5）。剩余 20% 用于吸收意外。
5. **复习任务优先占位**：先把未来 N 天的 FSRS 到期量（按 `reviews.due` 汇总预估分钟）钉进每天，再往里塞新任务；若复习量已超容量 60%，当天**不再安排新任务**并提示用户。
6. **生成 `source='reschedule'` + `origin_task_id`**，UI 上显示"从 10-03 推迟过来"，避免用户困惑任务凭空出现。
7. **可撤销**：每次重排写一条审计（哪些任务从哪天移到哪天），提供"撤销本次重排"。

**艾宾浩斯 / FSRS 复习任务的自动插入（关键机制）**

`【推断】` 不要用"艾宾浩斯固定间隔表"（1/2/4/7/15 天）——那是"按时间撒复习"，会在同一知识点上重复浪费时间。**用 FSRS，且明确区分两类复习**：

- **到期复习（Due review）**：每天调度器查询 `reviews WHERE due <= today AND suspended = 0`，为每条生成 `tasks(source='review', task_type='review')`，`estimated_minutes` 由该知识点的历史耗时中位数决定（默认 3–5 min/条）。
- **新学内容的首次固化**：新知识点的 `reviews` 行初始 `state=New`、`due=次日`，由 FSRS 的 `learning_steps`（如 `['1m','10m']`，`【事实】` ts-fsrs 支持该参数）在当天内做短期步骤，**长间隔交给 `request_retention` 控制**。
- **容量保护（必须做）**：设 `每日新学上限`（如 15 个知识点）与 `每日复习上限`（如 60 条）。超出部分**不删**，只标"顺延到明天"，并用 `reviews.priority` 让系统按"到期时间 + 当前掌握度"排序（`get_retrievability()` 越低越优先）。
- `【事实】` `enable_fuzz: true` 会给长间隔加随机抖动，官方定位就是"避免复习任务在同一天堆积"，与本场景高度契合。来源：[ts-fsrs 文档](https://open-spaced-repetition.github.io/ts-fsrs/)。

### 3.5 Prompt 设计要点与"防不切实际"硬约束

**Prompt 结构（分四段）**

1. **角色与输出格式**：明确"你是学习计划排程器，只输出符合给定 JSON Schema 的结构化结果，不要解释、不要 Markdown"。
2. **事实清单（只给事实，不给自由发挥的空间）**：用户容量表（逐日可用分钟，含"周三=0"）、真实 `chapter_id` 与顺序、诊断分、已有 `events` 占用时段、每天复习预留分钟、期限。
3. **硬约束（用"必须/禁止"句式，逐条可代码校验）**，见下表。
4. **自检清单（Self-check）**：要求模型在 `warnings` 里显式报告"哪些约束无法满足"。`【推断】` **允许模型说"做不到"是防幻觉最重要的一条**——否则它会为了"完成拆解"而编造乐观计划。

**六条防"不切实际"硬约束（全部要代码校验，不能只写进 prompt）**

| # | 约束 | 校验方式 |
|---|---|---|
| C1 | **每天总量上限**：`sum(estimated_minutes) + 当日复习预留 ≤ 当日可用分钟 × 0.8` | SQL 聚合校验；超限即拒绝 |
| C2 | **必须留缓冲日**：每 7 天至少 1 天 `is_buffer=true`（只放复习/错题）；里程碑间至少 1 天机动 | 遍历校验 |
| C3 | **必须对齐教材章节顺序**：任务只能引用输入给的 `chapter_id`；同一里程碑内章节 `index` 单调不减 | 外键存在性 + 序单调校验 |
| C4 | **单任务不超过 90 min**（超过必须拆分），且 `task_type='paper'` 每周 ≤ 2 次 | 字段范围校验 |
| C5 | **容量=0 的日子不得排新任务**（`weekday∈不可用集合` 或当天已被 `events` 占满） | 日历交集校验 |
| C6 | **不做"复习"任务**（由 FSRS 调度器负责）；AI 不得编造 `knowledge_point_id` / `question_set_id` | 白名单校验 |

`【推断】` 另外三个工程要点：
- **prompt 版本化**：`ai_plan_runs.prompt_version` 必须记录，否则无法复盘"为什么这次的计划变差了"。
- **温度调低**（0–0.3）：排程是确定性问题，不需要创意。
- **把"配额/容量"作为显式数值给模型，而不是让它推算**——`【推断】` 让模型做日期算术是最常见的失败来源；`【推断】` 更稳的做法是**让模型只输出"第 N 天做 X，估时 M 分钟"这类相对描述，由本地代码负责映射到真实日期**，这样容量约束就完全由本地算法把关（这也是最推荐的做法）。

---

## 4. 到期提醒（Windows 原生通知）

### 4.1 三种技术路径的事实对照

| 能力 | Electron | Tauri v2 | node-notifier |
|---|---|---|---|
| 当前版本 | **44.5.1**（2026-09-30 发布），MIT | `@tauri-apps/plugin-notification` **2.5.1**，MIT OR Apache-2.0 | **10.0.1**，最后发布 **2022-02-01** |
| Windows 通知 | `Notification`（主进程）；渲染进程走 Web Notifications API | 原生 toast | 底层封装 Windows toast（`【未验证】` 具体走 SnoreToast/PowerToast 的哪一个） |
| 自定义 toast | `toastXml`（Windows）可完全自定义 | `【未验证】` 是否暴露同等自由度 | ❌ |
| 按钮 / 下拉选择 | `actions` 支持 `button`（macOS+Windows）与 `selection`（**仅 Windows**，为下拉框，`items` 指定选项，回调返回 `selectedIndex`） | `Action` / `ActionType` 存在（`【未验证】` Windows 覆盖度） | 有限 |
| 内联回复 | `hasReply`（macOS+Windows） | — | ❌ |
| **系统级定时投递** | ❌ 无内建（需自建定时器 / Task Scheduler） | ✅ 有 `Schedule` 类：`at()` / `every(ScheduleEvery.Day)` / `interval()`，以及 `pending()` / `cancel()` / `cancelAll()` | ❌ |
| 开机自启 | `app.setLoginItemSettings`（官方 API 页列出） | `@tauri-apps/plugin-autostart` **2.7.0** | ❌ |
| 常驻托盘 | `Tray`（官方 API 页列出） | `TrayIcon`：`TrayIcon.new({icon, menu, menuOnLeftClick})`，需在 `Cargo.toml` 启用 `tray-icon` feature | ❌ |
| 维护状态 | 活跃（近月发版） | 活跃（2026-10-01 发版） | ⚠️ **自 2022-02 无新版** |

`【事实】` 来源：
- Electron Notification：[electronjs.org/docs/latest/api/notification](https://www.electronjs.org/docs/latest/api/notification)（其中明确：`id` 在 Windows 上映射到 toast 的 `Tag`；`groupId` 映射到 toast 的 `Group`；`toastXml` 可覆盖以上全部属性；`Notification.handleActivation()` 统一处理点击/回复/按钮激活，**支持"应用冷启动"与"对象已被 GC"的场景**；Windows 上 `urgency: 'critical'` 只提高排序，要阻止自动消失需同时设 `timeoutType: 'never'`）
- NotificationAction：[electronjs.org/docs/latest/api/structures/notification-action](https://www.electronjs.org/docs/latest/api/structures/notification-action)
- Electron app（`setLoginItemSettings` / `requestSingleInstanceLock` / `getPath('userData')`）：[electronjs.org/docs/latest/api/app](https://www.electronjs.org/docs/latest/api/app)
- Tauri 通知插件：[v2.tauri.app/plugin/notification](https://v2.tauri.app/plugin/notification/)（`【事实】` Windows 一栏注明"**仅对已安装的应用有效**；开发模式下显示 PowerShell 的名称与图标"）；JS API：[v2.tauri.app/reference/javascript/notification/](https://v2.tauri.app/reference/javascript/notification/)
- Tauri 自启：[v2.tauri.app/plugin/autostart](https://v2.tauri.app/plugin/autostart/)
- Tauri 托盘：[v2.tauri.app/learn/system-tray](https://v2.tauri.app/learn/system-tray/)
- node-notifier 版本/发布时间：`https://registry.npmjs.org/node-notifier/latest`

### 4.2 选型建议

`【推断】`
- **若用 Electron**：直接用内置 `Notification`，不要引入 `node-notifier`（后者自 2022 年无更新，且能力是内置 API 的子集）。Electron 在 Windows 上需要正确的 **AppUserModelID + 开始菜单快捷方式**才能正常显示通知——`【未验证】` Electron 官方文档中对该前置条件的完整说明本次未逐页确认，落地前请查 Electron 的 "Notifications" 教程页并实测。
- **若用 Tauri**：`plugin-notification` + `plugin-autostart` + `TrayIcon` 三件套，**且定时投递可以直接交给系统**（`Schedule.every(ScheduleEvery.Day).at(...)`）——这是 Tauri 相对 Electron 的实质优势：**应用没运行时系统仍会投递**（`【推断】`，基于该插件提供 `pending()` 查询待投递通知的 API 语义）。但要注意 Windows 上**必须是已安装的应用**才能正常显示。
- **每日简报的可靠实现（两条都必须做）**：
  1. **主路径**：开机自启 + 常驻托盘 + 主进程内定时器（Tauri 用 `Schedule`，Electron 用 `setTimeout` 到下一个 07:00 再自续期）。**不要用渲染进程的 `setInterval`**——窗口最小化/后台节流会导致延迟或漏发。
  2. **兜底路径**：`schtasks` 注册一条每日任务。`【事实】` `schtasks /create` 支持 `/sc DAILY`（`/mo` 指定每 N 天）、`/st <HH:mm>` 指定 24 小时制启动时间，`/tn` 任务名、`/tr` 要运行的程序、`/it` 仅在用户登录时运行、`/f` 覆盖同名任务；并且"任务以 System 账户运行时用户看不到也无法交互"。来源：[schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create)。`【推断】` 兜底命令形如 `schtasks /create /tn "GeZhiDaily" /tr "<exe路径>" /sc daily /st 07:00 /it /f`，**必须用 `/it`**（否则 System 会话里弹的通知用户看不见）。安装/卸载时创建/删除该任务。

### 4.3 提醒去重与 Windows 侧机制

`【事实】` Windows toast 有 `Tag`（组内唯一标识）与 `Group`（分组）两个属性；`Tag` **在 Creators Update (15063) 之前上限 16 字符，之后放宽到 64 字符**；设为 `null` 或空字符串会抛异常。来源：[ToastNotification.Tag](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag)。Electron 的 `Notification` 选项 `id` / `groupId` 正是映射到这两个属性（见 4.1 来源）。
`【事实】` Electron 另有 `groupTitle`（Windows）：当同时指定 `groupId` 与 `groupTitle` 时，Windows 会在通知上方显示分组标题（映射到 toast 的 `header` 元素）。来源：[Notification API](https://www.electronjs.org/docs/latest/api/notification)。

`【推断】` **去重设计（本项目建议）**：
1. **语义去重键**：`notifications.dedupe_key` 用 `"{kind}:{task_id}:{yyyy-mm-dd}"`（如 `task_due:1024:2026-10-02`），并加 **UNIQUE 索引**。同一天同一任务的同类提醒**永远只发一次**（数据库层保证，不靠内存标记——应用重启后依然有效）。
2. **Windows 侧二次去重**：把 `dedupe_key` 的哈希截断到 ≤64 字符作为 toast 的 `Tag`，`kind` 作为 `Group`。`【推断】` 相同 `Tag`+`Group` 的新 toast 会替换 Action Center 中的旧条目，用户不会看到重复堆积。**注意 64 字符上限要主动截断/哈希，否则超长 key 在某些系统版本会异常。**
3. **时间窗去重**：同一 `knowledge_point_id` 的复习提醒，若 8 小时内已发过且未被处理，则跳过（避免"你还有 37 条复习"刷屏）。
4. **诚实失败**：通知发送失败（例如 Windows 未安装/无快捷方式）要写 `notifications.state='failed'` 并在应用内**降级为应用内横幅**，不要让用户以为"今天没任务"。

### 4.4 稍后提醒（Snooze）的实现

`【推断】` Windows 原生 toast 的 snooze 通常依赖系统通知的"稍后提醒"按钮或自定义 Action。工程上更稳的做法是**自建 snooze 语义**（不依赖平台）：
- 通知上挂 2–3 个按钮：`完成` / `+30 分钟` / `今晚`（Electron 用 `actions: [{type:'button', text:'完成'}, ...]`；Tauri 用 `Action`）。
- `notifications.snooze_until` + `snooze_count`。`【推断】` **snooze 次数上限建议 3 次**，第 3 次后改为"升级提醒"（`urgency:'critical'` + `timeoutType:'never'`，见 4.1 的 Windows 行为说明）或直接转为应用内"待办逾期"红点，避免无限 snooze 让提醒失去意义。
- 点击"完成" → 直接 `tasks.done=1` 并记 `done_at`（**闭环到数据模型**，不要只是关掉通知）。
- `【事实】` Electron 提供 `Notification.handleActivation(callback)`，其回调覆盖"点击 / 回复 / 按下 Action 按钮"，且**处理了冷启动、GC 后、AC 中持久化通知等场景**——这是实现"点通知直接勾任务"的正确接入点。来源同 4.1。
- `【事实】` Electron 还提供 `Notification.remove(id)` / `removeGroup(groupId)` / `removeAll()`，但**这些是 macOS 专属**（见 API 页的平台标注）；Windows 上请用 `notification.close()` 或依赖 `Tag` 替换语义。`【推断】` 这一条如果不注意，会导致"Mac 上删得掉、Windows 上删不掉"的诡异 bug。

### 4.5 每日简报（07:00 一句话）

`【推断】` 内容模板（控制在 1–2 行，Windows toast 正文过长会被截断）：

```
今天 3 项任务 · 预计 75 分钟 | 复习 12 条 · 距高考还有 208 天
→ 点击开始第一个：函数单调性 · 变式 12 题（25 分钟）
```

生成规则：`tasks WHERE due_date = today AND done = 0` 取数量与 `sum(estimated_minutes)`；`reviews WHERE due <= today` 取条数；`countdowns` 取 `pinned=1` 且 `target_date >= today` 的最小值。全部是单表聚合查询，`【推断】` 在 10 万级任务量下 < 10ms（配合 2.3 的部分索引）。

---

## 5. 倒计时与「重要日子」

### 5.1 多倒计时

`【推断】` 数据上由 `countdowns` 表承载（见 2.2），支持：
- **多个平行倒计时**：中考 / 高考 / 四校联考 / 保送面试，各自独立；
- **农历生日**：`calendar_type='lunar'` + `lunar_month/lunar_day/lunar_is_leap`，每年用 `lunar-javascript`（1.7.7，MIT，2025-11 仍有更新）换算到当年公历日期，写入 `target_date`（建议做成"每年 1 月 1 日批量刷新"的定时任务）；
- **一次性 vs 每年循环**：`is_recurring_yearly`；
- **与目标/任务挂钩**：`linked_goal_id`、`tasks.countdown_id`（冲刺任务）。

`【推断】` 提醒强度按 `importance` 分级：`importance=3`（高考）→ 每天简报必带 + 顶栏常驻 + 里程碑提醒（100/50/30/10/1 天）；`importance=1`（自定义日子）→ 仅当天提醒。

### 5.2 进度百分比（两种口径，都要给）

- **任务口径（执行进度）**：`done_minutes / (done_minutes + remaining_planned_minutes)`。`【推断】` 用**分钟**而不是"任务条数"——否则 5 道小题和 1 套卷权重相同，进度条会失真。
- **掌握度口径（学习进度）**：按 `linked_goal_id` 关联知识点，用费曼评分加权：`Σ(score_i × weight_i) / Σ(5 × weight_i)`，`weight` 建议用题量或课时数。
- `【推断】` **两个进度都要显示**，因为它们经常背离——"任务 100% 完成但掌握度只有 60%"是最有价值的预警信号（说明计划量不足或完成质量差）。

### 5.3 「剩余可学习天数」的算法（重点）

`【推断】` 这是本模块最有价值、也最容易被做错的指标。**不能简单用 `deadline - today`**，因为其中很多天根本没有可支配时间。

**建议算法（伪流程，非实现代码）**：

1. 令 `[today, deadline]` 为区间，逐日枚举（`julianday` 差值循环）。
2. 对每一天 `d`：
   - 若 `d` 的星期 ∈ 用户"完全没空"集合 → 容量 0，**记为"不可学习日"**；
   - 否则取该日基准容量（工作日/周末不同），**减去**当天 `events(is_blocking=1)` 的实际占用分钟（`RRULE` 需先用 rrule 展开到具体日期），再**减去**每日 FSRS 复习预留（如 15 min）；
   - 若剩余容量 < 阈值（如 20 min）→ 记为"不可学习日"。
3. `剩余可学习天数 = 合格天数`；`剩余可学习容量(分钟) = Σ 各天剩余容量`。
4. **与计划比对**：`剩余待完成任务的 estimated_minutes 之和` 与 `剩余可学习容量` 比较：
   - 容量 ≥ 需求 → 绿色，展示"剩余可学习 41 天 / 约 62 小时"；
   - 缺口 0–20% → 黄色，"偏紧，建议减少 1 项扩展任务"；
   - 缺口 > 20% → 红色，并**触发重排提示**（正是 3.4 的触发器之一）。
5. Day 粒度一律用 `julianday(A) - julianday(B)` 求整数差，避免 DST/时区造成 ±1 天误差（依据 [SQLite 日期函数文档](https://www.sqlite.org/lang_datefunc.html) 对"精确差值"的说明）。

`【推断】` 另外给两个派生指标，用户感知更强：
- **"今天还剩多少可支配时间"** = 今日基准容量 − 今日已排 `events` − 今日已完成分钟；
- **"复习压力指数"** = 未来 7 天 FSRS 到期总量 ÷ 未来 7 天可学习容量（> 0.6 就该减少新学量）。

### 5.4 UI 呈现建议

`【推断】` 三层呈现，信息密度递减：

| 位置 | 内容 | 交互 |
|---|---|---|
| **顶栏（常驻）** | 1–3 个钉子倒计时，紧凑格式：`高考 208天`；鼠标悬停展开"剩余可学习 41 天 · 进度 63%" | 点击跳转到仪表盘对应目标 |
| **仪表盘（首页第一屏）** | 倒计时卡片组（可排序/钉选）+ 今日任务清单 + 复习队列条 + 7 天容量条形图 | 直接勾选任务、开始番茄钟 |
| **桌面小组件** | `【推断】` 两种做法：(a) Electron 开一个 `frameless + transparent + alwaysOnTop + skipTaskbar` 的小窗，自己画倒计时（完全可控、跨 Win10/11）；(b) 依赖 Windows 11 小组件面板（Widgets Board）——`【未验证】` 第三方应用接入 Widgets Board 的可行性与 API 稳定性，本次未核实，**不建议在 v1 采用** | 双击唤出主窗口 |
| **托盘 tooltip** | `高考 208 天 · 今日 3 任务` | 右键菜单：今日任务速览、暂停提醒、退出 |

`【推断】` 视觉警戒指数：`>90 天` 中性色；`30–90 天` 提示色；`7–30 天` 强调色 + 顶栏加粗；`<7 天` 每日简报置顶 + 托盘图标加角标。

---

## 6. 习惯与统计

### 6.1 番茄钟 / 专注计时

`【推断】`
- 数据落 `focus_sessions` + `time_logs`（见 2.5）：一次番茄钟 = 一条 session（`planned_minutes` / `actual_minutes` / `interruptions` / `completed`）。
- **计时器必须跑在主进程**（或 Node/Web Worker），不能用渲染进程的 `setInterval`——窗口失焦/最小化会被 Chromium 节流，导致"25 分钟"实际走了 27 分钟。
- **提前结束要区分"完成"与"放弃"**：`completed=1` 才计入 `daily_stats.done_minutes` 的"有效专注"；放弃的时长单独统计（这是判断"任务估时是否合理"的关键数据）。
- 番茄钟与任务强绑定：`tasks.actual_minutes` 由 `time_logs` 汇总回写（`【推断】` 用一个 `AFTER INSERT/UPDATE` 触发器或应用层聚合皆可，应用层更好调试）。
- 休息提醒用系统通知（第 4 节能力），**休息期间不计入学习时长**。

### 6.2 每日学习时长统计

`【推断】` `daily_stats` 物化表（`day` 主键）字段建议：`planned_minutes`、`done_minutes`、`focus_minutes`（纯番茄钟）、`tasks_planned`、`tasks_done`、`review_count`、`review_minutes`、`streak`。
- **写入时机**：每次任务完成/番茄钟结束增量更新；每天 00:05 兜底全量重算当天（防止漏更新）。`【推断】` 这是"物化视图在 SQLite 里最常见的坑"——一定要有对账机制。
- **展示**：今日 / 本周 / 本月 / 累计；周对比"上周同期"。

### 6.3 热力图（GitHub 式贡献图）

**开源实现库（已核实）**

| 库 | 最新版 | License | 最后发布 | 说明 |
|---|---|---|---|---|
| `react-activity-calendar` | 3.2.1 | MIT | 2026-07-07 | ⭐ 维护最活跃，React 组件，专做活动热力图 |
| `cal-heatmap` | 4.2.4 | MIT | 2023-12-29 | 框架无关，功能最全（3,137★） |
| `react-calendar-heatmap` | 1.10.0 | MIT | 2025-02-23 | 轻量 SVG（1,300★），"inspired by github's contribution graph" |
| `uiwjs/react-heat-map` | — | MIT | — | `【未验证】` 未查版本；GitHub API 显示 286★、2026-05-28 push |
| `gurbaaz27/shadcn-calendar-heatmap` | — | MIT | — | 185★，Tailwind/shadcn 风格 |

`【事实】` 版本/许可/发布时间：`https://registry.npmjs.org/react-activity-calendar/latest`、`https://registry.npmjs.org/cal-heatmap/latest`、`https://registry.npmjs.org/react-calendar-heatmap/latest`；star 与 push 时间：GitHub API。

`【推断】` **推荐：直接用 ECharts 的 `calendar` 坐标系 + `heatmap` 系列自绘**，理由：
1. 你为了雷达图/完成率曲线**本来就会引入 ECharts**（见 6.5），不必再加一个图表库；
2. 官方 chart configuration 文档中 `calendar` 是一等公民坐标系（`https://echarts.apache.org/en/option.html#calendar`），社区大量 GitHub 贡献图复刻示例；
3. 日历坐标系天然支持"按月分块 + 星期对齐 + 值域分档"，且中文标签（周一/周二）无需额外处理。
若要更"GitHub 原味"且不想自己写，用 `react-activity-calendar`（活跃度最好）。

`【推断】` **热力图的值域要选对**：建议用 **`focus_minutes`（有效专注分钟）** 而不是"任务完成条数"。理由：条数会被"勾了 10 个 5 分钟小任务"刷高，而时长更接近真实投入。分档用固定阈值（0 / 1–25 / 26–60 / 61–120 / >120 分钟），不要用自动分位数——否则"每天都学 3 小时"和"每天学 5 分钟"的图看起来一样深。

### 6.4 完成率曲线

`【推断】`
- **7 天移动平均完成率**：`done_minutes / planned_minutes`，避免单日波动误导；
- **计划偏差曲线**：`实际用时 / 估时` 的滚动均值——**这是校准 AI 估时的关键反馈回路**：若系统性 > 1.2，说明 AI 低估，应把 `estimated_minutes` 的全局系数上调（这个系数可以喂回 3.5 的 prompt）；
- **逾期率**：当日 `due_date < today AND done = 0` 的条数占比。
- 用 ECharts `line` + `dataZoom` 实现，配合 `daily_stats` 直接查（不要实时扫 `tasks`）。

### 6.5 与费曼评分联动的「知识掌握度雷达图」

`【推断】` 维度取"学科"或"章节"（建议 6–8 个，多了不可读）；每个维度的值 = 该维度下知识点的**加权掌握度**：优先用最新费曼评分（1–5），无评分时回退到 FSRS 的 `get_retrievability()`（`【事实】` ts-fsrs 提供该函数）——这样"没做过费曼的知识点"也有值，不会在图上开天窗。

**图表库对比（全部核实）**

| 库 | 最新版 | License | 仓库 star | 中文友好度 | 单图体积 | 判断 |
|---|---|---|---|---|---|---|
| **Apache ECharts** | **6.1.0**（2026-05-19） | **Apache-2.0** | 67,423★ | ⭐⭐⭐ 官方中文文档/中文示例/中文社区最全 | 中（支持按需引入/自定义构建） | ✅ **推荐** |
| Chart.js | 4.5.1（2025-10-13） | MIT | 67,728★ | ⭐⭐ 文档英文为主，社区中文教程多 | 小 | ⭕ 简单图够用；**热力图需插件** `chartjs-chart-matrix` `【未验证】` |
| Recharts | 3.10.1（2026-07-25） | MIT | 27,606★ | ⭐⭐ | 中 | ⭕ React 原生体验好，但热力图/日历坐标系需自绘 |
| visx (airbnb) | `@visx/visx` 4.0.0（2026-06-11） | MIT | 21,071★ | ⭐ 底层原语，学习成本高 | 极小（tree-shakable） | ⭕ 只在需要完全定制时选 |
| Observable Plot | 0.6.17（**2025-02-14**） | **ISC** | 5,396★ | ⭐ | 小 | ❌ 发布时间最久远，中文资料最少 |

`【事实】` 版本/许可/发布时间：`https://registry.npmjs.org/echarts`、`/chart.js`、`/recharts`、`/@visx/visx`、`/@observablehq/plot`；star：GitHub API（`apache/echarts`、`chartjs/Chart.js`、`recharts/recharts`、`airbnb/visx`、`observablehq/plot`）。
`【事实】` ECharts 官方 chart configuration 页面以 `#calendar` 锚点提供 calendar 坐标系配置文档：`https://echarts.apache.org/en/option.html#calendar`；`echarts-for-react` 3.0.6（MIT，2026-01-21）为 React 封装。

`【推断】` **推荐 ECharts，核心理由是"中文友好"这一条在本项目上是硬需求**——你要的是中学学科名、章节名、周一到周日、农历节日的正确渲染与排版，以及出问题时的中文社区检索效率；ECharts 在这三点上明显领先。代价是包体积，用**按需引入**（`echarts/core` + 只引 `CalendarChart`/`HeatmapChart`/`RadarChart`/`LineChart` + 对应 `components`）可以压到可接受范围。

---

## 7. 参考开源项目（能抄什么）

> 合规提醒：**抄"数据模型 + 交互模式 + 算法"是安全的；抄"代码"要看你最终的分发许可。** 下表标注了 License，**AGPL-3.0 项目的代码如果被链接进你的应用，会触发 AGPL 的开源义务**（Vikunja、Logseq、AppFlowy 属此类）——建议只借鉴其模型与 API 设计，不复制代码。

### 7.1 Obsidian 生态：任务语法与查询（最值得抄的"交互契约"）

| 项目 | 仓库 | Star / License / 最后 push（API 核实） | 抄什么 |
|---|---|---|---|
| **Obsidian Tasks** | `obsidian-tasks-group/obsidian-tasks` | 4,035★ / **MIT** / 2026-09-30 | **内联任务语法**：用 emoji 在纯文本里表达元数据的思路——`📅` 到期日、`⏳` 计划日、`🛫` 开始日、`➕` 创建日、`🔁` 重复、以及优先级标记。`【未验证】` 各 emoji 的精确语义与"when done"重复规则本次未能打开 README 原文确认（GitHub 域名不可达），落地前请核对官方文档。**可抄的核心是设计哲学**：让用户用"一行文本"就能描述复杂任务，AI 生成结果也应遵循同一套可读语法，导出/导入零成本 |
| **Obsidian Dataview** | `blacksmithgu/obsidian-dataview` | 9,366★ / **MIT** / 2025-11-17 | **查询层**：DQL 风格查询 + 内联字段。`【未验证】` 具体语法细节未逐条核实。**可抄**：为「格致」做一层"保存的视图（Saved View）"——用户不写 SQL，用下拉/条件构造器表达"本周未完成的数学任务"，后端翻译成 `WHERE`。这与你的"今天该复习什么"天然契合 |
| **Obsidian Calendar 插件** | `liamcain/obsidian-calendar-plugin` | 2,278★ / **MIT** / 2024-06-22 | 日历 + 每日笔记的联动模式（点某天 → 看/写那天的内容）。**可抄**：日视图与任务面板的双向联动 |
| **Heatmap Calendar** | `Richardsl/heatmap-calendar-obsidian` | 960★ / **Apache-2.0** / 2025-02-10 | 在日历网格上叠加多类型标记（习惯/复习/活动）。**可抄**：热力图不是"单指标深浅"，而是"多事件类型叠加"——你的日历需要同时显示"上课/复习/任务"三种 |
| **obsidian-tasks-calendar-wrapper** | `Leonezz/obsidian-tasks-calendar-wrapper` | 259★ / MIT / 2026-09-25 | **把任务查询结果渲染成日历**的直接参考 |

### 7.2 任务 / 时间盒 / 项目管理

| 项目 | 仓库 | Star / License / 最后 push | 抄什么 |
|---|---|---|---|
| **Super Productivity** | `super-productivity/super-productivity` | **22,418★** / **MIT** / 2026-10-01 | ⭐ 与本模块重合度最高。**抄它的"时间盒 + 计时 + 暂停/中断记录"完整交互模型**，以及"任务估时 vs 实际耗时"的对比呈现。MIT 许可，代码可安全参考 |
| **Vikunja** | `go-vikunja/vikunja` | 5,565★ / **AGPL-3.0** / 2026-10-01 | 任务层级（`parent_id` 嵌套）、列表/看板/日历多视图、REST API 分层设计。**只抄模型与 API 形状，不抄代码**（AGPL） |
| **Tasks.org** | `tasks/tasks` | 5,618★ / **GPL-3.0** / 2026-09-30 | 开源待办中"重复任务 + 子任务 + 提醒 + 位置/时间触发"实现最完整的之一。**抄**：重复任务与提醒的边界处理（GPL，勿抄代码） |
| **Logseq** | `logseq/logseq` | 45,099★ / **AGPL-3.0** / 2026-10-01 | 大纲式任务 + 每日日志（journal）的组织方式 |
| **Joplin** | `laurent22/joplin` | 56,547★ / NOASSERTION / 2026-10-01 | 本地优先 + 多端同步的冲突处理思路 |
| **AppFlowy** | `AppFlowy-IO/AppFlowy` | 77,038★ / **AGPL-3.0** / 2026-10-01 | 数据库/看板/日历多视图切换的产品化做法 |

### 7.3 Anki / FSRS（复习队列的算法来源）

| 项目 | 仓库 | Star / License / 最后 push | 抄什么 |
|---|---|---|---|
| **Anki** | `ankitects/anki` | **31,680★** / NOASSERTION（仓库有 `LICENSE` 文件，API 未解析出 SPDX） / 2026-10-01 | ⭐ **数据模型**：`notes`（笔记/知识点）→ `cards`（卡片）→ `revlog`（复习日志）三层。**直接对应你的**：`knowledge_points` → `reviews`（当前状态）→ 复习日志表（建议加 `review_logs`）。`cards` 上存 `due` / `interval` / `ease`(SM-2) 或 FSRS 的 `stability`/`difficulty` / `reps` / `lapses` / `state` 的做法可直接照搬。`【未验证】` 本次未能打开 Anki 的 database structure 文档逐字段核对，落地前请查官方仓库文档确认字段名 |
| **FSRS4Anki** | `open-spaced-repetition/fsrs4anki` | 4,085★ / **MIT** / 2026-08-14 | FSRS 的 Anki 实现与说明（"modern Anki custom scheduling"） |
| **TS-FSRS** | `open-spaced-repetition/ts-fsrs` | 801★ / **MIT** / 2026-09-29（npm 5.4.2） | ⭐ **本项目直接可用**：TypeScript 实现 FSRS v6，含 `State`/`Rating`/`request_retention`/`maximum_interval`/`enable_fuzz`/`learning_steps` 与 `reschedule()`/`rollback()`/`get_retrievability()`。文档：[open-spaced-repetition.github.io/ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/)（有简体中文 README） |
| **py-fsrs** | `open-spaced-repetition/py-fsrs` | 499★ / MIT / 2026-08-09 | 若做 Python 侧批处理（FSRS 参数优化）可用 |
| **srs-benchmark** | `open-spaced-repetition/srs-benchmark` | 272★ / 无 License 文件 / 2026-09-18 | 算法对比基准。`【未验证】` "FSRS 优于 SM-2"的具体数值本次未从该仓库核实，报告中不引用具体数字 |
| **fsrs-optimizer** | `open-spaced-repetition/fsrs-optimizer` | 112★ / BSD-3-Clause / 2026-08-06 | 用你自己的复习日志**个性化优化 FSRS 参数**（`w` 向量）。`【推断】` v2 功能：当积累 1000+ 条复习日志后再开启，比默认参数明显更准 |

### 7.4 "AI 计划分解"类开源项目：**这是一个诚实的空白**

`【事实】` 本次用 GitHub Search API 检索 `AI study planner LLM`、`task planner AI agent LLM`、`curriculum generator LLM education`、`goal decomposition` 等关键词，**排序靠前的项目 star 数均为个位数至数十**（例如 `SAfsehEhsani/AI-AcademIQ-Planner` 1★、`NoNightWatch/agent-manager-for-ai-planner` 7★、`klausners/course-builder` 16★、`ICUnit/Tokai` 37★），**没有一个可以作为工程参考的成熟项目**。检索到的 `archiki/ADaPT`（As-Needed Decomposition and Planning）`【未验证】` 未核实其 star/License，但它是学术研究代码，与"学习计划"领域不同。

`【推断】` 结论：**"AI 把学习目标拆成计划"这一环没有现成的开源轮子可抄，必须自研。** 这反而是本模块的差异化价值点。可复用的只有上游零件：
- **结构化输出**：OpenAI Structured Outputs（`json_schema` strict 模式，`https://platform.openai.com/docs/guides/structured-outputs`）、Gemini 的 `responseSchema`、Claude 的 structured outputs（`https://platform.claude.com/docs/en/build-with-claude/structured-outputs`）。⚠️ `【未验证】` 这三个页面本次均**未能直接打开验证**（OpenAI 被 Cloudflare 403、Claude 站跨域重定向未跟随、Gemini 仅取到第三方镜像），细节请在落地前自查。
- **JSON Schema 规范**：`https://json-schema.org/`（本次未打开，`【未验证】` 具体草案版本号）。
- **运行时校验**：`zod` 4.6.5（MIT）/ `ajv` 8.20.0（MIT）（版本已核实）。

### 7.5 一句话总结"能抄什么 / 不能抄什么"

- **直接可用的库（MIT/Apache）**：`ts-fsrs`（FSRS 算法）、`rrule`（BSD-3）、`lunar-javascript`（农历）、`react-activity-calendar` 或 ECharts（图表）。
- **可抄的设计（不抄代码）**：Obsidian Tasks 的**内联任务元数据语法**、Anki 的 **notes→cards→revlog** 三层模型、Super Productivity 的**时间盒交互**、Vikunja 的**多视图 + parent_id 嵌套**。
- **不能抄代码**：AGPL/GPL 项目（Vikunja、Logseq、AppFlowy、Tasks.org）。
- **没有轮子**：AI 计划分解 → 自研，做好 prompt 版本化与 schema 校验。

---

## 8. 模块验收标准（Acceptance Criteria，一页纸）

> 语气约定：每条都是**可测试**的（有明确输入、可观察输出、可判定阈值）。`[默认值]` 表示初值可调。

### A. 日历视图

- **A1** 打开日历页，可在 **月 / 周 / 日 / 议程** 四种视图间切换，切换后 300ms 内完成渲染（本地 1000 条事件规模下）。
- **A2** 给定 3 类日历源（课程 / 考试 / 复习 / 自定义），可**单独显示或隐藏**任意一类；隐藏后该类事件在月视图中的计数同步更新。
- **A3** 周视图默认以 `[07:00–23:00]` 时段网格呈现；一节课（如"每周一 08:00–09:40 数学"）通过 **RRULE** 定义，在周/月视图中正确展开为多周实例。
- **A4** 拖动一个可编辑事件到另一天，**释放鼠标后 ≤1 秒**持久化到数据库；刷新或重启应用后位置不变；拖拽产生一条可撤销记录。
- **A5** 界面语言为简体中文（按钮、月份、星期、议程标题全部中文）；**农历**日期以副标签形式显示在日期格内，且与权威农历数据在测试集（含闰月）上 **100% 一致**。
- **A6** 打开日历页时，`is_blocking=1` 的事件不与他处计算的"剩余可学习天数"冲突：同一时间段在两处显示一致。

### B. 倒计时与重要日子

- **B1** 给定一个期末考日期，**打开应用后 3 秒内**在顶栏看到该倒计时（数字为整数天）。
- **B2** 同时配置 **≥4 个倒计时**（中考 / 高考 / 四校联考 / 保送面试），全部正确显示，无重叠错位；可钉选最多 3 个到顶栏。
- **B3** 倒计时天数 = **日历日期差**（不受时区/夏令时影响）：给定 `今天=2026-10-01`、`目标=2026-12-20`，显示 **80 天**（自动化测试覆盖该断言）。
- **B4** 农历生日：录入"农历七月十五"，应用给出**当年**正确公历日期并在每年自动滚动到下一次；跨闰月场景有测试用例。
- **B5** 「剩余可学习天数」扣除已排课程：构造"未来 10 天中有 4 天被 `is_blocking=1` 事件占满"的数据，该指标返回 **6 天**（而不是 10 天）。
- **B6** 进度百分比同时展示"任务口径"与"掌握度口径"，两者数据来源可追溯（点击可看到计算明细）。

### C. 计划与 AI 拆解

- **C1** 给定目标 + 截止日 + 每日可投入时间 + 不可用星期 + 诊断结果，点击"生成计划"，**≤30 秒**（含模型调用）产出三层结构（里程碑 / 周 / 日任务）并落库为草稿。
- **C2** 生成结果**必须通过** JSON Schema 校验与 6 条硬约束校验（每天总量 ≤ 容量×0.8、每 7 天 ≥1 个缓冲日、章节 `index` 单调不减、单任务 ≤90 min、容量 0 的日子无新任务、不生成复习任务）；**任一失败时不得静默入库**，而是标记草稿并给出人类可读的失败原因。
- **C3** 关键字段非空率：`estimated_minutes` / `due_date` / `task_type` 三项在生成任务中**100% 非空**。
- **C4** 引用完整性：生成任务里的每个 `chapter_id` 与 `knowledge_point_id` **都必须存在于数据库**（不允许 AI 编造 ID）；有自动化测试注入伪造 ID 验证被拒绝。
- **C5** 计划的 `ai_run_id` 可回溯：能看到当次使用的模型、prompt 版本、原始输出；支持"一键撤销本次生成"并恢复到生成前状态。
- **C6** 重排：构造"过去 5 天完成率 40%"的数据，触发重排后**未来 7 天每天任务总量 ≤ 当日容量的 80%**，且已完成任务 **0 条**被移动。
- **C7** 复习插入：给定 40 条 FSRS 到期复习，调度器把它们插入当天任务，且当天新学任务总量不超过 `[每日新学上限]`；若复习量超过容量 60%，当天新任务数为 **0** 并有明确提示。
- **C8** 复习状态机正确：对同一知识点连续评分 `Again→Good→Good`，`reviews` 的 `state`/`stability`/`difficulty`/`due` 与 `ts-fsrs` 在相同入参下的输出**逐字段一致**（用 ts-fsrs 做黄金标准对拍测试）。

### D. 提醒与简报

- **D1** 每天 **07:00** 推送当日简报通知（Windows 实际弹出，非仅日志）；内容包含：今日任务数 + 预计分钟 + 复习条数 + 最近倒计时天数。
- **D2** **去重**：同一天内，同一 `dedupe_key`（`kind:task_id:日期`）**只投递一次**；应用重启、跨天后行为一致；数据库层有 UNIQUE 约束防止竞态。
- **D3** **稍后提醒**：通知上的"完成"按钮点击后，对应 `tasks.done=1` 且 `done_at` 被写入；"+30 分钟"按钮使通知在 30 分钟后重新出现；同一任务 **snooze 上限 3 次**，超过后不再重复弹出、转为应用内逾期提示。
- **D4** **开机自启 + 常驻托盘**：开机登录后应用静默启动到托盘（不弹主窗口）；托盘 tooltip 显示倒计时与今日任务数；关闭主窗口不退出进程。
- **D5** **兜底投递**：模拟应用未运行（结束进程）的场景，安装时注册的 Windows 计划任务仍会在 07:00 唤起并投递简报（并在被唤起后自行退出到托盘）。
- **D6** **失败可见**：通知投递失败时，`notifications.state='failed'` 落库，且应用内出现降级横幅；不存在"用户什么都没看到且系统无记录"的情况。

### E. 统计与习惯

- **E1** 番茄钟：启动一个 25 分钟专注，**最小化窗口 25 分钟**后，记录的 `actual_minutes` 与真实墙钟时间误差 **≤2 秒**（验证不受后台节流影响）。
- **E2** 完成一个任务后，`daily_stats.done_minutes` 在 **≤1 秒**内更新，且当日/本月聚合数字随之刷新。
- **E3** 热力图：给定 365 天的 `focus_minutes` 数据，热力图渲染 **≤1 秒**；分档为固定阈值，且"每天 3 小时"与"每天 5 分钟"在图上视觉可区分。
- **E4** 完成率曲线展示 7 天移动平均；数据点与 `daily_stats` 的查询结果一致（自动化对拍）。
- **E5** 掌握度雷达图：6–8 个维度；对**没有费曼评分**的知识点，回退到 FSRS 可提取性取值，图上**无空缺维度**；切换维度后 500ms 内重绘。

### F. 数据与健壮性

- **F1** 所有 `PRAGMA foreign_keys` 在**每个数据库连接**上均被开启；有测试删除一个被引用的知识点，验证约束生效（要么级联、要么被拒绝，符合设计）。
- **F2** 数据库处于 WAL 模式；打包的 SQLite 版本 **≥ 3.51.3**（规避官方公告的 WAL-reset bug），并在启动时把版本号写入日志。
- **F3** 离线可用：断网时日历、倒计时、复习队列、统计全部正常工作；仅"生成新计划"功能提示需要网络。
- **F4** 数据规模验收：10 万条 `tasks`、5 万条 `reviews` 下，"今日面板"查询 **≤100ms**（P95），"剩余可学习天数"计算 **≤50ms**。
- **F5** 时区/夏令时：把系统时区切换到任意其他时区后重启，所有 `YYYY-MM-DD` 语义的字段（`due_date`/`target_date`）**不发生偏移**（有测试用例）。

### G. 联动验收（跨模块，最能体现"这个模块做完了"）

- **G1** 在题库做错一道题并标记 → 其关联知识点进入 `reviews` 队列，且在**次日**的今日任务中出现一条复习任务。
- **G2** 某知识点费曼评分从 2 提升到 5 → 该知识点的复习间隔显著拉长（`due` 后移），后续计划中该知识点的任务量减少。
- **G3** 给定一个考试日期，倒计时、冲刺计划（`tasks.countdown_id` 关联）、复习优先级三者**指向同一目标**，且在仪表盘上表现为一个连贯的"备考卡片"。

---

## 9. 一句话建议

- **日历库**：用 **FullCalendar 7.x 的 MIT 标准包**（`/interaction` + `/timegrid` + `/list` + `@fullcalendar/rrule`）——月/周/日/议程与**拖拽改期全部免费**，把周视图配成课程表；"科目成行"的资源视图属 Premium（$480 起），v1 用"左侧自绘科目列 + 右侧 dayGrid"替代，别为此付费。
- **数据模型**：`goals → plans(parent_id 自嵌套) → tasks` 三层，`events`（固定日程，带 RRULE）与 `tasks` 严格分离，`reviews` 每个知识点一行存 FSRS 状态并由调度器**投影**为当天任务（照抄 Anki 的 notes→cards→revlog 结构）；日期一律用 **ISO-8601 文本 + `julianday()` 求差**，`PRAGMA foreign_keys=ON`，开启 WAL 且 SQLite ≥ 3.51.3。
- **AI 拆解策略**：让模型只输出**结构化三层 JSON**（里程碑→周→日），**容量约束与日期映射交给本地代码**，AI 只负责"内容拆解"；上线 6 条硬约束（80% 容量上限、必留缓冲日、章节顺序单调、单任务 ≤90min、空容量日不排、复习不由 AI 生成）并**代码校验**，校验失败就落草稿——**允许 AI 说"排不下"是防幻觉的第一道闸门**，同时记住：这一环没有成熟开源轮子，必须自研。
- **提醒实现**：Electron 用内置 `Notification`（`id`→Windows toast `Tag` 做 ≤64 字符语义去重键、`actions` 做按钮、`handleActivation` 处理冷启动点击），Tauri 用 `plugin-notification` + `Schedule` + `plugin-autostart` + `TrayIcon`；**无论哪条路，都用"开机自启常驻托盘 + 主进程定时器"作主路径、`schtasks /sc daily /st 07:00 /it` 作兜底**，snooze 上限 3 次，投递失败必须落库并降级可见。
- **图表库**：**ECharts 6.x（Apache-2.0）**，一处解决热力图（`calendar` 坐标系 + `heatmap` 系列自绘 GitHub 贡献图）、雷达图、完成率曲线，且中文文档/中文示例/中文检索效率最优；不引入第二个图表库。

---

## 附录 A：本报告引用链接清单（按可访问性分组）

**✅ 本次已实际打开并核对（可复现）**

- FullCalendar：[License](https://fullcalendar.io/license) ｜ [Pricing](https://fullcalendar.io/pricing) ｜ [Plugin Index](https://fullcalendar.io/docs/plugin-index) ｜ [Timeline View](https://fullcalendar.io/docs/timeline-view) ｜ [TimeGrid View](https://fullcalendar.io/docs/timegrid-view) ｜ [locale](https://fullcalendar.io/docs/locale)
- Schedule-X：[Views](https://schedule-x.dev/docs/calendar/views) ｜ [Premium](https://schedule-x.dev/premium) ｜ [Drag to create](https://schedule-x.dev/docs/calendar/plugins/drag-to-create)
- v-calendar：[vcalendar.io](https://vcalendar.io/)
- Electron：[Notification](https://www.electronjs.org/docs/latest/api/notification) ｜ [NotificationAction](https://www.electronjs.org/docs/latest/api/structures/notification-action) ｜ [app](https://www.electronjs.org/docs/latest/api/app)
- Tauri：[Notifications 插件](https://v2.tauri.app/plugin/notification/) ｜ [JS API](https://v2.tauri.app/reference/javascript/notification/) ｜ [Autostart](https://v2.tauri.app/plugin/autostart/) ｜ [System Tray](https://v2.tauri.app/learn/system-tray/)
- Microsoft Learn：[ToastNotification.Tag](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag) ｜ [schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create)
- SQLite：[Foreign Keys](https://www.sqlite.org/foreignkeys.html) ｜ [WAL](https://www.sqlite.org/wal.html) ｜ [Date & Time Functions](https://www.sqlite.org/lang_datefunc.html)
- 标准：[RFC 5545 iCalendar](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3)
- FSRS：[ts-fsrs 文档站](https://open-spaced-repetition.github.io/ts-fsrs/)
- 图表：[ECharts option（含 #calendar）](https://echarts.apache.org/en/option.html#calendar) ｜ [Day.js i18n](https://day.js.org/docs/en/i18n/loading-into-nodejs)
- npm registry 实时查询（版本/License/发布时间）：`registry.npmjs.org/<pkg>` 或 `/latest`
- GitHub REST API 实时查询（star/License/archived/push）：`api.github.com/repos/<owner>/<repo>`

**⚠️ 给出但本次未能打开（落地前请自行核实）**

- GitHub 仓库页面（`github.com/*`，本机代理不可达）：`fullcalendar/fullcalendar`、`bigcalendar/react-big-calendar`、`nhn/tui.calendar`、`nathanreyes/v-calendar`、`schedule-x/schedule-x`、`jkbrzt/rrule`、`6tail/lunar-javascript`、`obsidian-tasks-group/obsidian-tasks`、`blacksmithgu/obsidian-dataview`、`liamcain/obsidian-calendar-plugin`、`Richardsl/heatmap-calendar-obsidian`、`super-productivity/super-productivity`、`go-vikunja/vikunja`、`tasks/tasks`、`ankitects/anki`、`open-spaced-repetition/*`、`apache/echarts`、`chartjs/Chart.js`、`recharts/recharts`、`airbnb/visx`、`observablehq/plot`、`grubersjoe/react-activity-calendar`、`wa0x6e/cal-heatmap`、`kevinsqi/react-calendar-heatmap`
- 结构化输出文档：OpenAI（被 Cloudflare 403）、Claude（跨域重定向未跟随）、JSON Schema 规范首页
- Obsidian Tasks Emoji Format 文档页（重定向到 obsidian.md 后未跟随）
- 其他：`github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm`、`sqlite.org/lang_with.html`、Microsoft "adaptive interactive toasts" 页面（本次 URL 404，正确路径为 `https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts`，未验证）

## 附录 B：`【未验证】` 事项汇总（落地前必须自查）

1. FullCalendar 7 的 `zh-cn` locale 是否存在及其导入路径。
2. react-big-calendar 1.20.0 的视图清单与内置拖拽 API 细节。
3. Schedule-X 的 Event Recurrence 插件是否属 Premium。
4. `lunar-javascript` 的具体 API 函数名与闰月处理方式。
5. Obsidian Tasks 各 emoji 的精确语义与"when done"重复规则。
6. Anki 数据库 `notes`/`cards`/`revlog` 的字段级定义。
7. TS-FSRS 是否提供 Windows 桌面可用的参数优化入口（`@open-spaced-repetition/binding` 的可用性）。
8. Electron 在 Windows 上通知所需的 AppUserModelID / 快捷方式前置条件的完整要求。
9. node-notifier 在 Windows 上的底层实现（SnoreToast / PowerToast）。
10. Tauri 通知插件在 Windows 上对 `Action` 按钮与 `Attachment` 的支持程度；`Schedule` 在应用未运行时的实际投递保证。
11. Windows 11 小组件面板（Widgets Board）对第三方桌面应用开放的接入方式。
12. OpenAI / Gemini / Claude 结构化输出的当前参数细节（`strict`、`responseSchema` 等）。
13. Temporal API 的原生支持基线。
14. `chartjs-chart-matrix` 用于热力图的成熟度。
