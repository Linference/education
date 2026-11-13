# Gezhi · Calendar and Planning Module Technical Research (06)

> Research target: the **calendar + planning schedule** module in a Windows desktop "personal learning + AI sparring" application
> Scope: calendar UI selection, SQLite data model, AI automatic plan splitting, due reminders, countdown, habits and statistics, reference open-source projects, acceptance criteria
> Research date: **2026-10-01**
> Version basis: npm version numbers and release dates taken from live queries to `registry.npmjs.org`; repo star / License / archived status taken from live GitHub REST API queries.

---

## 0. Reading Conventions and Research Method (Including Confidence Statement)

**Annotation conventions**

- `[Fact]` = verified directly against official docs / official repo API / npm registry, with a real URL attached.
- `[Inference]` = engineering judgment based on facts, which may change depending on your tech stack.
- `[Unverified]` = could not be directly verified in this research; verify yourself before implementation.

**Tooling limitations of this research (important, affects the verifiability of some conclusions)**

- `web_fetch` under this machine's network environment **cannot access `github.com` and `raw.githubusercontent.com`** (the proxy judges them as non-public IPs and refuses outright). Therefore GitHub repo information (star, License, archived, last push time) was verified via the **GitHub REST API** and written into this report; you can re-verify it yourself: `https://api.github.com/repos/<owner>/<repo>`.
- Therefore **no `.github.com/...` link was opened page by page**; their content comes from API metadata + search-engine snippet stitching. Any content in this report involving "what syntax/features the README says", if it could not be secondarily confirmed through another accessible domain (official docs site, npm registry, official publish site), is marked `[Unverified]`.
- `platform.openai.com` is blocked by Cloudflare (HTTP 403); the OpenAI structured outputs documentation was **not opened directly**, only given in "Reference links", and its details are marked `[Unverified]`.

---

## 1. Calendar UI Component Selection

### 1.1 Conclusion Overview Table

| Solution | Version (live-verified) | License | Month/Week/Day/Agenda | Drag-to-reschedule | Multi-calendar | Chinese | recurrence | Conclusion |
|---|---|---|---|---|---|---|---|---|
| **FullCalendar** | 7.1.0 (2026-09-05) | Standard **MIT**; Premium sold separately | Full support | Free (`/interaction`) | Free (event grouping/styling) | Has locale mechanism, zh-cn is in the standard locale set | Free (`@fullcalendar/rrule`, MIT) | ✅ **Recommended** |
| react-big-calendar | 1.20.0 | **MIT** | month/week/work_week/day/agenda | Library built-in drag (`draggable`) `[Unverified]` | Group via event styling | via dayjs/moment locale | None built-in, wire up rrule yourself | ⭕ Alternative |
| Schedule-X | @schedule-x/calendar 4.9.1 | Core **MIT**, drag/sidebar/popup etc. are **Premium** | Day/Week/Month grid/Year/3×Agenda/List | **Premium (€479/yr)** | Has calendars concept | Has Language docs | Has recurrence plugin | ❌ Drag is paid, ruled out |
| Toast UI Calendar | @toast-ui/calendar 2.1.3 (2022-08-16) | **MIT** | Supports day/week/month | Supported | Supported | Korean-origin, Chinese customizable | Does not support RRULE | ❌ **Repo archived** |
| v-calendar | 2.4.2 (latest) / 3.1.2 (next) | **MIT** | Month-first + **week view** (v3) | ❌ Not a schedule drag library | via attributes | Has i18n/locales | Repeating date ranges (not RRULE) | ⚠️ Vue only; Vue 3 line is still `next` |
| Date libraries | dayjs 1.11.23 / date-fns 4.4.0 / luxon 3.7.2 / temporal-polyfill 1.0.5 | MIT / MIT / MIT / MIT respectively | — | — | — | First three all include zh-CN | — | See 1.4 |

`[Fact]` Versions, License, release dates: live npm registry queries (e.g. `https://registry.npmjs.org/fullcalendar`, `https://registry.npmjs.org/@schedule-x/calendar/latest`, `https://registry.npmjs.org/@toast-ui/calendar/latest`, `https://registry.npmjs.org/v-calendar`).
`[Fact]` Repo star / License / archived: live GitHub REST API queries —
`fullcalendar/fullcalendar` 20,658★ MIT not archived; `bigcalendar/react-big-calendar` 8,760★ MIT not archived (note: the repo has migrated from `jquense/` to `bigcalendar/`); `schedule-x/schedule-x` 2,589★ MIT not archived; `nhn/tui.calendar` 12,696★ MIT **archived=true**; `nathanreyes/v-calendar` 4,518★ MIT not archived, last push 2024-08-07.

---

### 1.2 FullCalendar: the boundary between the free tier and Premium (this is the core selection question)

`[Fact]` The official License page clearly distinguishes two sets of packages:

| Package | License | Key contents |
|---|---|---|
| `fullcalendar` / `@fullcalendar/react` and other standard packages | **MIT** | `/interaction` (click, select, **drag to change date and duration**), `/daygrid` (`dayGridMonth/Week/Day/Year`), `/timegrid` (**`timeGridWeek` / `timeGridDay`**), `/list` (agenda list), `/multimonth` |
| `fullcalendar-scheduler` / `@fullcalendar/react-scheduler` | **Premium (commercial license)** | `/scrollgrid`, `/timeline`, `/adaptive` (printing), `/resource-daygrid`, **`/resource-timegrid`**, `/resource-timeline` |

Source: [fullcalendar.io/license](https://fullcalendar.io/license), [fullcalendar.io/docs/plugin-index](https://fullcalendar.io/docs/plugin-index), [fullcalendar.io/pricing](https://fullcalendar.io/pricing)

`[Fact]` Premium licensing tiers: commercial use requires purchasing a commercial license (**starting at $480**); registered non-profit organizations may use a non-commercial license for free (**government agencies and universities are not covered**); open-source projects whose frontend and backend are **entirely** AGPLv3 may use it free under AGPLv3 (switched from GPLv3 to AGPLv3 starting in v7); open-source projects under other licenses can only reference it by "installing as a dependency + not hardcoding a license key". Source: [fullcalendar.io/license](https://fullcalendar.io/license), [fullcalendar.io/pricing](https://fullcalendar.io/pricing)

`[Fact]` npm-side corroboration: the latest 7.1.0 `license` field of `fullcalendar` and `@fullcalendar/core` is `MIT`; while the `license` field of `fullcalendar-scheduler` and `@fullcalendar/resource-timeline` is `SEE LICENSE IN LICENSE.md` (not open source). Source: `https://registry.npmjs.org/fullcalendar-scheduler/latest`, `https://registry.npmjs.org/@fullcalendar/resource-timeline/latest`

`[Fact]` **recurrence does not require Premium**: `@fullcalendar/rrule` is classified by the official docs as a "supplemental plugin (usable with any UI library)", version 7.1.0 `license: MIT`, depends only on `@fullcalendar/core`. Source: [plugin-index](https://fullcalendar.io/docs/plugin-index), `https://registry.npmjs.org/@fullcalendar/rrule/latest`

`[Inference]` For "Gezhi", **the free tier is enough**: month view (for exams/countdowns), week view (as a class timetable), day view (today's tasks), and list view (review queue) are all in the MIT packages; drag-to-reschedule is also in the MIT packages. **The only thing you'd genuinely want but must pay for is the "resource view / timeline"** — i.e. the table with a left column of teachers/subjects and a right-side time grid. Section 1.5 below gives the no-payment alternatives.

---

### 1.3 Key facts about the remaining options

- **react-big-calendar** `[Fact]` npm 1.20.0, `license: MIT`, peerDeps `react ^16.14 || ^17 || ^18 || ^19`, runtime dependencies include `dayjs`, `luxon`, `moment`, and `globalize` at once (historical baggage, watch the bundle size). Source: `https://registry.npmjs.org/react-big-calendar/latest`. `[Unverified]` the view list (month/week/work_week/day/agenda) and drag capability come from README snippets scraped by search engines, not from directly opening the repo; before implementation, defer to the actual README of the version you use.
- **Schedule-X** `[Fact]` core `@schedule-x/calendar` 4.9.1 `license: MIT`, peerDeps are `preact` / `@preact/signals` / `temporal-polyfill` (meaning it goes the **Temporal API** route). 7 free views: Day, Week, Month grid, Year grid, Month agenda, Week agenda, List. Premium is **€479/yr** or **€999 one-time** (2–3 developers). Drag-to-reschedule (drag-and-drop), zoom, drag-to-create, sidebar, event popup, resource view, and Gantt are all marked ⭐ = Premium. Source: [schedule-x.dev/docs/calendar/views](https://schedule-x.dev/docs/calendar/views), [schedule-x.dev/premium](https://schedule-x.dev/premium), [drag-to-create plugin](https://schedule-x.dev/docs/calendar/plugins/drag-to-create)
- **Toast UI Calendar** `[Fact]` `@toast-ui/calendar` 2.1.3 released on **2022-08-16**, `license: MIT`, but the GitHub repo `nhn/tui.calendar` API metadata is **`archived: true`** (last push 2024-06-24). `[Fact]` its dependencies include `preact` and `tui-date-picker`/`tui-time-picker`. **Conclusion: not recommended for a new 2026 project** (archived = no more bug fixes, no more adaptation to newer Chromium/Node).
- **v-calendar** `[Fact]` npm `latest` is still 2.4.2 (Vue 2 peerDep: `vue ^2.5.18`); the Vue 3 version is on the `next` tag, at **3.1.2**. The official v3 docs claim v3 brings **weekly views**, a simplified time picker, **repeating date ranges**, time rules, performance improvements, and provides i18n/locales/timezones documentation sections. `[Fact]` the repo is 4,518★ MIT, but the last push was **2024-08-07** (nearly two years with no commits), so maintenance cadence needs evaluation. Source: [vcalendar.io](https://vcalendar.io/), `https://registry.npmjs.org/v-calendar`, GitHub API. **And it's Vue ecosystem** — if "Gezhi" uses React or a non-Vue stack, rule it out immediately.

---

### 1.4 Date library comparison (Day.js / date-fns / Luxon / Temporal)

| Library | Latest version | License | Size/style | zh-CN | Suitability |
|---|---|---|---|---|---|
| **Day.js** | 1.11.23 (released 2026-08-17) | MIT | ~2KB, moment-style chainable API, plugin-based (utc/timezone/duration/relativeTime/isoWeek…) | ✅ `dayjs/locale/zh-cn` | ✅ First choice for frontend UI formatting; the `relativeTime` plugin directly produces "3 days left" |
| **date-fns** | 4.4.0 | MIT | Functional, tree-shakable; `exports` explicitly includes `./locale/zh-CN` | ✅ | ✅ First choice for computation logic (addDays / differenceInDays / eachDayOfInterval) |
| **Luxon** | 3.7.2 | MIT | Intl-based, most robust for timezones/DST | ✅ (Intl locale) | ⭕ Only introduce when you genuinely have cross-timezone/cross-DST scenarios |
| **Temporal (polyfill)** | `temporal-polyfill` 1.0.5 (MIT) / `@js-temporal/polyfill` 0.5.1 (ISC) | MIT / ISC | New API, clear ZonedDateTime / PlainDate semantics | Provided by Intl | ⚠️ Native support status `[Unverified]` (no authoritative browser/Node baseline statement found this time); **do not make it the only dependency** |

`[Fact]` Versions, License, release dates source: `https://registry.npmjs.org/dayjs`, `https://registry.npmjs.org/date-fns/latest`, `https://registry.npmjs.org/luxon/latest`, `https://registry.npmjs.org/temporal-polyfill/latest`, `https://registry.npmjs.org/@js-temporal/polyfill/latest`.
`[Fact]` date-fns 4.4.0's package `exports` field indeed contains a `./locale/zh-CN` entry (verified directly from npm registry metadata this time). `[Fact]` Day.js officially provides locale loading docs (`require('dayjs/locale/de')`-style on-demand loading): [day.js.org/docs/en/i18n/loading-into-nodejs](https://day.js.org/docs/en/i18n/loading-into-nodejs).
`[Inference]` **Recommended combo: date-fns (compute) + Day.js (display)**; don't add Luxon + Moment at the same time (size/semantic duplication). Treat Temporal as "use it if you want in new code" and otherwise wait and see.

---

### 1.5 Three things: Chinese, lunar calendar, and recurrence

**(a) Chinese UI**
`[Fact]` FullCalendar provides `locale` / `locales` options and a "locale object shape" definition (`prevText`/`nextText`/`todayText`/`weekText`/`listText`, etc.), and supports ES6 per-language imports (`fullcalendar/locales/es`) and the `locales-all` full import. Source: [fullcalendar.io/docs/locale](https://fullcalendar.io/docs/locale).
`[Unverified]` **Whether FullCalendar 7 bundles `zh-cn` as a specific filename/export path** could not be confirmed item by item this time (the official locale list page was not opened). As the first implementation step, run `node -e "console.log(require('@fullcalendar/core/locales/zh-cn'))"` to verify; if it isn't bundled, provide one yourself using the locale object shape from the official docs (about 30 lines of work).

**(b) Lunar calendar**
`[Fact]` `lunar-javascript` (author 6tail) latest version **1.7.7**, released **2025-11-05**, `license: MIT`, repo `6tail/lunar-javascript` 1,688★ not archived. The package description is "a tool for the Gregorian calendar (solar), lunar calendar (yinli, Chinese almanac), Buddhist calendar, and Taoist calendar with no third-party dependencies", with keywords covering solar terms / ganzhi / zodiac / festivals, etc. Source: `https://registry.npmjs.org/lunar-javascript/latest`, GitHub API.
`[Inference]` **Implement the lunar-birthday countdown with `lunar-javascript` on its own; don't expect the calendar component to ship it.** Approach: store "lunar month/day" (e.g. the 15th day of the 7th lunar month → `{lunar_month:7, lunar_day:15, is_leap:0}`), then each year use the library to convert the lunar date to that year's Gregorian date, and generate a `countdowns` record (see Section 2).
`[Unverified]` The library's specific API function names (e.g. `Lunar.fromDate` / `Solar.fromYmd`) were not confirmed this time because the README was not opened; defer to the actual docs during implementation.

**(c) recurrence (RRULE)**
`[Fact]` RFC 5545 (iCalendar) defines the `RRULE` (Recurrence Rule) property in §3.8.5.3, Proposed Standard, published 2009-09, updated by RFC 7529 (non-Gregorian recurrence rules) and others. Source: [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3).
`[Fact]` the `rrule` npm package latest version **2.8.1, released 2023-11-10**, `license: BSD-3-Clause`; repo `jkbrzt/rrule` 3,743★ not archived, last push **2024-06-27**. Source: `https://registry.npmjs.org/rrule/latest`, GitHub API.
`[Inference]` rrule 2.8.1 has had no new release in nearly three years → it's **"stable but low activity"**; it's entirely sufficient for rule expansion (RRULE itself rarely changes), but don't expect it to track Temporal; if you go the Temporal route, keep an eye on the same-ecosystem `rrule-temporal` (2.2.7, MIT, released 2026-09-25, `https://registry.npmjs.org/rrule-temporal/latest`).
`[Fact]` FullCalendar officially provides the `@fullcalendar/rrule` plugin "for handling event recurrence using the RRule library", MIT. Source: [plugin-index](https://fullcalendar.io/docs/plugin-index).
`[Fact]` Schedule-X has a dedicated Event Recurrence plugin page: `https://schedule-x.dev/docs/calendar/plugins/recurrence` (`[Unverified]` whether that plugin is Premium — its doc navigation doesn't mark ⭐, but the Preview page wasn't listed item by item, so confirm before implementation).

---

### 1.6 Final recommendation and this project's implementation shape

**✅ Recommended: FullCalendar 7.x (MIT standard packages) + `@fullcalendar/react` + `@fullcalendar/rrule` + Day.js/date-fns**

Rationale (all based on Section 1.2 facts):
1. Month / week / day / agenda / multi-month views **are all in the MIT packages**, covering the four calendar types "timetable + exam + review + custom";
2. **Drag-to-reschedule is in the MIT `/interaction` plugin** (the key advantage over Schedule-X — which costs €479/yr);
3. **RRULE is free** (`@fullcalendar/rrule`, MIT) — "Monday, periods 3–4 every week" for the timetable and "every 3 days" for review can both be expressed with standard RRULE;
4. Has an official locale mechanism, so Chinese is controllable;
5. 20,658★ and v7.1.0 was still shipping in 2026-09 — the best activity level.

**Two approaches to "week view as a class timetable"**

- **Approach A (recommended, zero cost) — use `timeGridWeek` as the timetable**:
  `[Fact]` `timeGridPlugin` provides `timeGridWeek` / `timeGridDay`, and controls the grid appearance with options like `slotMinTime` (first slot of each day), `slotMaxTime` (last slot; the official docs emphasize it is an **exclusive end time**), `slotDuration` (slot frequency), `slotLabelInterval`, `allDaySlot`, `eventMinHeight`, `slotEventOverlap`, `nowIndicator`, `expandRows`. Source: [fullcalendar.io/docs/timegrid-view](https://fullcalendar.io/docs/timegrid-view).
  `[Inference]` Configuration idea: `slotMinTime: '07:00'`, `slotMaxTime: '23:00'` (clipped to your routine to avoid scrolling all day), `slotDuration: '00:30'`, `allDaySlot: true` (for "today's todos / countdowns"), `nowIndicator: true`. Class events are generated periodically with RRULE (`FREQ=WEEKLY;BYDAY=MO;COUNT=20`), and `editable: true` supports dragging to reschedule classes. **Week view = timetable, day view = today's task list**, both sharing one set of `events` + an `eventClick` popup.
- **Approach B (when you need "subject-per-row") — assemble a resource view yourself, or downgrade to "multiple columns on the same day"**:
  A real "subjects in the left column, timeline on the right" is `/resource-timeline` / `/resource-timegrid`, which are **Premium**. If the product genuinely needs "subject-per-row":
  - Option B1: `[Inference]` render the subject column on the left with plain DOM, and use FullCalendar's `dayGridWeek` on the right to make a card grid of "one subject-task per cell" (give up the time scale and only express "day of week + period number") — this is actually closer to the "timetable" semantics and completely free.
  - Option B2: `[Inference]` if you must have a time-scale per row, consider applying for FullCalendar Premium's **non-commercial license** (`[Fact]` free for registered non-profits, but **schools/government are not covered**; personal-learning software must be evaluated under the commercial license, from $480/yr).
  - Option B3: `[Inference]` build your own "week grid" component (a 7-column × N-row CSS Grid) with class data coming directly from the `events` table — for this project (single user, fixed routine, no timezone/conflict detection needed) the cost may be lower than any paid option.

**How to implement multi-calendar (timetable/exam/review/custom)**
`[Inference]` Don't open multiple Calendar instances (high performance and interaction-sync cost). Approach: a single Calendar instance + a business field on the event object itself `calendarKey ∈ {course, exam, review, custom}`, color and icon via `eventClassNames` / `eventContent`, and a custom legend on the left for show/hide toggles (filter out hidden categories' events at the `eventSources` layer). This is structurally identical to Schedule-X's "calendars" concept, but implemented with a free library.

---

## 2. Data Model Design (SQLite)

### 2.1 Overall design principles

1. **Separate the three layers goal / plan / task**: `goals` (why you're learning) → `plans` (stages and weeks, self-nested via `parent_id`) → `tasks` (the smallest checkable execution unit).
2. **Separate fixed schedules from tasks**: `events` stores "non-negotiable time blocks" (classes, exams, tutoring); `tasks` stores "things to get done". **"Math, periods 3–4 every Monday" on the timetable is an `event` (with RRULE), not a task**; while "finish 20 problems on function monotonicity" is a task. The only intersection between the two is the computation of "remaining learnable days / today's capacity" (see Section 5).
3. **Keep the review queue independent of tasks**: `reviews` is an FSRS state machine (one row per knowledge point); **each day the scheduler "projects" due reviews into that day's task rows**, rather than making reviews be tasks directly. This way "rescheduling the plan" doesn't damage FSRS memory state.
4. **Hang the question bank / knowledge points on via foreign keys**: both `tasks` and `reviews` can point to `knowledge_points` and `questions`, thereby enabling "what to review today / which paper to do".
5. **Don't build a catch-all table**: `events` (time blocks), `countdowns` (important days), and `tasks` have low field overlap; forcibly merging them leads to lots of NULLs and semantic ambiguity (this is where many Todo apps eventually spin out of control).

### 2.2 Table and field definitions

> Field types follow SQLite's **type affinity**. Date/time uniformly use **`TEXT` + ISO-8601 local time strings** (`YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS`); see 2.4 for the rationale.

#### `goals` (learning goals)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | "Finish high school physics mechanics within two months" |
| `subject_id` | INTEGER | FK → `subjects(id)` | Primary subject (nullable = composite goal) |
| `description` | TEXT | | Raw natural-language description (the input for AI decomposition; must be preserved) |
| `deadline` | TEXT | | `YYYY-MM-DD`, the goal's deadline |
| `target_level` | INTEGER | DEFAULT 3 | Target mastery 1–5, consistent with the Feynman scoring scale |
| `current_level` | REAL | | Diagnosed current level (from the Feynman scoring module); frozen as a snapshot at decomposition time |
| `daily_minutes_cap` | INTEGER | DEFAULT 90 | **Daily investment cap for this goal (minutes)**, a hard constraint for AI-generated plans |
| `status` | TEXT | CHECK IN ('active','paused','done','dropped') | |
| `source` | TEXT | CHECK IN ('manual','ai') | |
| `created_at` / `updated_at` | TEXT | | |

#### `plans` (plans: milestone / month / week, self-nested)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `goal_id` | INTEGER | FK → `goals(id)` ON DELETE CASCADE, NOT NULL | |
| `parent_id` | INTEGER | FK → `plans(id)` ON DELETE CASCADE | **NULL = top level (milestone)**; supports decomposition at arbitrary depth |
| `kind` | TEXT | CHECK IN ('milestone','month','week','day') | Level semantics, for UI collapsing and statistics |
| `title` | TEXT | NOT NULL | "Week 3: Function monotonicity and parity" |
| `seq` | INTEGER | | Ordering within the same level |
| `start_date` / `end_date` | TEXT | | `YYYY-MM-DD` |
| `planned_minutes` | INTEGER | | Total budgeted minutes for this plan block |
| `status` | TEXT | CHECK IN ('pending','active','done','skipped') | |
| `is_buffer` | INTEGER | DEFAULT 0 | **=1 means this is an intentionally reserved buffer/rest block** (the persisted form of the Section 3 constraints) |
| `source` | TEXT | CHECK IN ('manual','ai') | |
| `ai_run_id` | INTEGER | FK → `ai_plan_runs(id)` | Traceable to which AI version generated it; supports one-click rollback |
| `created_at` / `updated_at` | TEXT | | |

> Hierarchical queries use recursive CTEs (SQLite natively supports `WITH RECURSIVE`, official docs: `https://sqlite.org/lang_with.html`). `[Unverified]` this URL was not opened directly this time, but `WITH RECURSIVE` is a long-standing built-in SQLite feature.

#### `tasks` (concrete tasks)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `plan_id` | INTEGER | FK → `plans(id)` ON DELETE SET NULL | Nullable (ad-hoc tasks aren't attached to a plan) |
| `goal_id` | INTEGER | FK → `goals(id)` ON DELETE SET NULL | Redundant field, for direct per-goal statistics |
| `title` | TEXT | NOT NULL | "Physics Compulsory 1 P42–P48 worked examples + variations" |
| `task_type` | TEXT | CHECK IN ('read','practice','review','paper','recite','other') | `paper` = do a full paper |
| `estimated_minutes` | INTEGER | NOT NULL DEFAULT 25 | **Number of pomodoros = ceil(estimated/25)** |
| `actual_minutes` | INTEGER | DEFAULT 0 | Written back by aggregating `time_logs` |
| `done` | INTEGER | NOT NULL DEFAULT 0 | 0/1 |
| `done_at` | TEXT | | |
| `due_date` | TEXT | | `YYYY-MM-DD`, **day granularity** (learning plans don't need minute precision) |
| `due_time` | TEXT | | Nullable `HH:MM`, only for "exam / paper submission" types |
| `priority` | INTEGER | DEFAULT 2 | 0 high / 1 medium / 2 low |
| `source` | TEXT | NOT NULL CHECK IN ('manual','ai','review','reschedule') | `review` = generated by FSRS projection; `reschedule` = generated by rescheduling |
| `origin_task_id` | INTEGER | FK → `tasks(id)` | After rescheduling, points to the deferred original task, ensuring traceability |
| `knowledge_point_id` | INTEGER | FK → `knowledge_points(id)` | Links to the knowledge-point table |
| `question_set_id` | INTEGER | FK → `question_sets(id)` | Links to the question bank ("which paper to do") |
| `countdown_id` | INTEGER | FK → `countdowns(id)` | Tasks serving a specific important day (sprint tasks) |
| `sort_key` | REAL | | Same-day sorting (take the midpoint when inserting, to avoid rewriting everything) |
| `created_at` / `updated_at` | TEXT | | |

#### `events` (fixed schedules: classes / exams / tutoring)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `calendar_key` | TEXT | NOT NULL CHECK IN ('course','exam','review','custom') | **Where multi-calendar is anchored** |
| `title` | TEXT | NOT NULL | "Math (Compulsory 1)" "Midterm exam · Physics" |
| `location` | TEXT | | |
| `start_at` / `end_at` | TEXT | NOT NULL | `YYYY-MM-DD HH:MM:SS` |
| `all_day` | INTEGER | DEFAULT 0 | |
| `rrule` | TEXT | | **RFC 5545 RRULE string**, e.g. `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=20` |
| `rrule_dtstart` | TEXT | | The starting point of RRULE (usually = `start_at`) |
| `exdate` | TEXT | | Exception dates, JSON array string (make-up days, cancelled classes) |
| `is_blocking` | INTEGER | DEFAULT 1 | **=1 means it occupies learnable time** (to be deducted when computing "remaining learnable days") |
| `knowledge_point_id` | INTEGER | FK → `knowledge_points(id)` | The knowledge point a class corresponds to (optional) |
| `countdown_id` | INTEGER | FK → `countdowns(id)` | Exam events attach a countdown |
| `note` | TEXT | | |
| `created_at` / `updated_at` | TEXT | | |

#### `countdowns` (important days)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `title` | TEXT | NOT NULL | "Zhongkao" "Gaokao" "Four-school joint exam" "Recommended-admission interview" |
| `kind` | TEXT | CHECK IN ('exam','interview','deadline','birthday','custom') | |
| `target_date` | TEXT | NOT NULL | `YYYY-MM-DD` |
| `target_time` | TEXT | | `HH:MM`, nullable |
| `calendar_type` | TEXT | NOT NULL DEFAULT 'solar' CHECK IN ('solar','lunar') | **The switch for lunar birthdays** |
| `lunar_month` / `lunar_day` / `lunar_is_leap` | INTEGER | | Used when `calendar_type='lunar'` |
| `is_recurring_yearly` | INTEGER | DEFAULT 0 | Birthday-type = 1 (automatically compute the next occurrence each year) |
| `pinned` | INTEGER | DEFAULT 0 | Whether pinned to the top-bar countdown strip |
| `importance` | INTEGER | DEFAULT 1 | 1–3, affects display priority and reminder intensity |
| `show_progress` | INTEGER | DEFAULT 1 | Whether to show the "review progress percentage" |
| `linked_goal_id` | INTEGER | FK → `goals(id)` | The goal this countdown corresponds to (used for the progress percentage) |
| `note` | TEXT | | |

#### `reviews` (review queue, FSRS state)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | INTEGER | PK | |
| `knowledge_point_id` | INTEGER | FK → `knowledge_points(id)` **UNIQUE**, NOT NULL | **One FSRS state per knowledge point** (isomorphic to Anki's "note→card" structure, see Section 7) |
| `state` | INTEGER | NOT NULL DEFAULT 0 | 0 New / 1 Learning / 2 Review / 3 Relearning (corresponding to ts-fsrs `State`) |
| `due` | TEXT | NOT NULL | Next due date (day granularity is enough, aligned with `tasks.due_date`) |
| `last_review` | TEXT | | |
| `stability` | REAL | | FSRS memory stability S |
| `difficulty` | REAL | | FSRS difficulty D |
| `elapsed_days` | INTEGER | DEFAULT 0 | |
| `scheduled_days` | INTEGER | DEFAULT 0 | |
| `reps` | INTEGER | DEFAULT 0 | Total review count |
| `lapses` | INTEGER | DEFAULT 0 | Forget count |
| `learning_steps` | INTEGER | DEFAULT 0 | Short-term learning step index |
| `last_rating` | INTEGER | | 1 Again / 2 Hard / 3 Good / 4 Easy |
| `priority` | INTEGER | DEFAULT 0 | Manual escalation flag |
| `suspended` | INTEGER | DEFAULT 0 | Suspended (e.g. already admitted via recommendation, subject no longer tested) |
| `updated_at` | TEXT | | |

`[Fact]` ts-fsrs (latest **5.4.2**, MIT, released 2026-09-01; repo 801★) implements **FSRS v6**, providing `State.New/Learning/Review/Relearning`, `Rating.Again/Hard/Good/Easy`, and configurable parameters `request_retention` (0.0–1.0, target memory retention; higher means more reviews), `maximum_interval` (maximum interval cap), `enable_fuzz` (adds jitter to long intervals, **avoiding a same-day due-task explosion**), `enable_short_term`, `learning_steps`, `relearning_steps`; and provides `get_retrievability()`, `forgetting_curve()`, `next_state()`, `next_interval()`, `rollback()`, `forget()`, `reschedule()`, and other functions; the package requires Node.js ≥ 20. Source: [open-spaced-repetition.github.io/ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/), `https://registry.npmjs.org/ts-fsrs/latest`.
`[Inference]` `enable_fuzz: true` is almost a mandatory switch for this project — otherwise "200 knowledge points imported on the same day" will all come due on the same future day and the daily plan will collapse immediately.

#### `tags` and many-to-many

| Table | Fields | Description |
|---|---|---|
| `tags` | `id` PK, `name` TEXT UNIQUE NOT NULL, `color` TEXT, `kind` TEXT CHECK IN ('topic','source','custom') | "Mechanics" "Wrong questions" "School homework" |
| `task_tags` | `task_id` FK→`tasks` ON DELETE CASCADE, `tag_id` FK→`tags` ON DELETE CASCADE, **PRIMARY KEY(task_id, tag_id)** | |
| `event_tags` | same as above, pointing to `events` | |
| `kp_tags` | same as above, pointing to `knowledge_points` | |

#### Foreign-key relationships with the "question bank / knowledge point" tables

`[Inference]` The following four tables belong to **existing / parallel modules** (outside this report's scope); only interface fields are agreed here, and naming can be adjusted to your existing schema:

| External table | Key fields (agreed) | Referenced by | Purpose |
|---|---|---|---|
| `subjects` | `id`, `name`, `stage` | `goals.subject_id`, `knowledge_points.subject_id` | Subject |
| `knowledge_points` | `id`, `subject_id`, `chapter_id`, `name`, `difficulty_hint` | **`reviews.knowledge_point_id` (UNIQUE)**, `tasks.knowledge_point_id`, `events.knowledge_point_id` | The smallest knowledge unit for review and tasks |
| `chapters` | `id`, `subject_id`, `textbook_id`, `index`, `title` | `knowledge_points.chapter_id` | **Textbook chapter order**; AI decomposition must reference it (Section 3 constraints) |
| `questions` | `id`, `knowledge_point_id`, `difficulty`, `type` | Enters tasks via `question_set_items` | Question items |
| `question_sets` | `id`, `title`, `kind` CHECK IN ('paper','drill','wrong_review'), `total_minutes` | `tasks.question_set_id` | Paper / question group: "which paper to do today" |
| `question_set_items` | `set_id` FK, `question_id` FK, `seq`, PK(set_id, question_id) | — | Many-to-many between questions and papers |
| `feynman_scores` | `id`, `knowledge_point_id`, `score` 1–5, `scored_at` | Read by plan decomposition (current-level diagnosis) | Output of the Feynman scoring module |

**Two hard facts about foreign keys in practice (easy pitfalls)**
- `[Fact]` SQLite's **foreign-key constraints are off by default**; you must run `PRAGMA foreign_keys = ON` on every connection for them to take effect; and you cannot toggle them mid-transaction within a multi-statement transaction (it silently does nothing). Source: [sqlite.org/foreignkeys.html](https://www.sqlite.org/foreignkeys.html).
- `[Fact]` Official recommendation: **child-table foreign-key columns should be indexed**, otherwise deleting/altering primary keys on the parent table causes a full scan of the child table, which can be "prohibitively expensive". Source: same as above.

### 2.3 Index recommendations

```sql
-- Foreign-key columns (officially recommended, to avoid full-table scans on parent-table operations)
CREATE INDEX idx_plans_goal        ON plans(goal_id, parent_id);
CREATE INDEX idx_tasks_plan        ON tasks(plan_id);
CREATE INDEX idx_tasks_goal        ON tasks(goal_id);
CREATE INDEX idx_tasks_kp          ON tasks(knowledge_point_id);
CREATE INDEX idx_tasks_set         ON tasks(question_set_id);
CREATE INDEX idx_events_kp         ON events(knowledge_point_id);
CREATE INDEX idx_task_tags_tag     ON task_tags(tag_id);
CREATE INDEX idx_event_tags_tag    ON event_tags(tag_id);
CREATE INDEX idx_kp_tags_tag       ON kp_tags(tag_id);

-- High-frequency query: today's task panel (highest frequency, must cover)
CREATE INDEX idx_tasks_due_open    ON tasks(due_date, done) WHERE done = 0;
-- Review queue: fetch due items
CREATE INDEX idx_reviews_due       ON reviews(due) WHERE suspended = 0;
-- Countdown sorting
CREATE INDEX idx_countdowns_date   ON countdowns(target_date);
-- Calendar: fetch events in range
CREATE INDEX idx_events_range      ON events(start_at, end_at);
-- Calendar: filter by category
CREATE INDEX idx_events_cal        ON events(calendar_key, start_at);
-- Statistics: aggregate study time by day
CREATE INDEX idx_timelogs_day      ON time_logs(day, task_id);
```

`[Inference]` **Partial indexes (`WHERE done = 0`)** are the key optimization of this design: today's panel only cares about unfinished tasks, so a partial index is small with a high hit rate; same for `reviews` (the vast majority of review entries are in the future, so only index the non-suspended ones).

### 2.4 Date/time storage choice (conclusion)

| Approach | Pros | Cons | This project's choice |
|---|---|---|---|
| Unix seconds (INTEGER) | Fastest sorting/comparison, unambiguous across timezones | Not human-readable, painful to debug; **"tasks for a given day" requires timezone conversion** | Only for `created_at`/log-type fields |
| **ISO-8601 TEXT** (recommended) | Directly string-comparable and sortable (lexicographic order = chronological order); SQLite date functions consume this format natively; readable | Slightly larger storage (negligible) | ✅ **`due_date` / `target_date` / `start_at` all use it** |
| INTEGER day number (Julian/custom) | "Difference in days" is a pure integer subtraction, ideal for countdowns | Needs a conversion layer, poor readability | Only as a **computation intermediate**, not persisted |
| Local time + timezone field | Semantically complete | Over-engineering for a single-user local app | ❌ Not adopted |

`[Fact]` SQLite officially states there is **no dedicated date/time data type**; date/time is stored in one of three forms: ISO-8601 text, Julian day number, or Unix timestamp; `date()` returns `YYYY-MM-DD` text, all date functions compute internally in UTC, and the `localtime` / `utc` modifiers are for conversion; `julianday(A)-julianday(B)` or the `unixepoch()` difference is the correct way to get an "exact difference", while `timediff()` is for human display. Source: [sqlite.org/lang_datefunc.html](https://www.sqlite.org/lang_datefunc.html).
`[Inference]` A learning plan is a **local, single-user, day-granularity** scenario: store `YYYY-MM-DD` text + compute day differences with `julianday()`, which is the lowest-complexity combination and won't trip over DST/timezone pitfalls. **For "N days left" countdowns you must use "date difference" rather than "seconds ÷ 86400"**, otherwise crossing DST/midnight will be off by a day.

### 2.5 Other schema-related tables (serving Sections 4 and 6)

| Table | Key fields | Purpose |
|---|---|---|
| `time_logs` | `id`, `task_id` FK, `day` TEXT, `start_at`, `end_at`, `minutes`, `kind` CHECK IN ('pomodoro','free','break') | Pomodoro/focus-time details → heatmap and duration statistics |
| `focus_sessions` | `id`, `task_id`, `planned_minutes`, `actual_minutes`, `interruptions`, `completed` | A single pomodoro session |
| `daily_stats` (materialized) | `day` PK, `planned_minutes`, `done_minutes`, `tasks_planned`, `tasks_done`, `review_count`, `streak` | Pre-aggregated; heatmap/completion-rate curves query it directly to avoid scanning `tasks` every time |
| `notifications` | `id`, `dedupe_key` TEXT **UNIQUE**, `task_id`, `scheduled_at`, `fired_at`, `state` CHECK IN ('scheduled','fired','dismissed','snoozed'), `snooze_until`, `snooze_count` | Persistence of reminder dedup and snooze (see 4.4) |
| `ai_plan_runs` | `id`, `goal_id`, `model`, `prompt_version`, `input_json`, `output_json`, `validation_errors`, `created_at` | **Traceability / rollback / A-B comparison for AI decomposition** (strongly recommended) |
| `settings` | `key` PK, `value` | Daily briefing time, pomodoro length, buffer-day ratio, etc. |

`[Fact]` Desktop apps should enable WAL: the official docs list WAL's advantages as "significantly faster in most scenarios", "reads don't block writes and writes don't block reads", "more sequential I/O", "fewer fsyncs", and its disadvantages as "all processes must be on the same machine (network filesystems won't work)" and "extra `-wal` / `-shm` files appear". `PRAGMA journal_mode=WAL;` is a **persistent setting** (set once, remains WAL after reopening). Source: [sqlite.org/wal.html](https://www.sqlite.org/wal.html).
⚠️ `[Fact]` **Note one real safety item**: the officially announced **WAL-reset bug** exists from 3.7.0 (2010-07-21) through 3.51.2 (2026-01-09), fixed in 3.51.3 (2026-03-13); the trigger is **two or more connections writing or checkpointing simultaneously on different threads/processes** in WAL mode, and the consequence is database corruption. Source: same as above. `[Inference]` If this project uses a "main process writes + renderer process reads" dual-connection structure, **you must confirm the bundled SQLite version ≥ 3.51.3** (Electron's built-in SQLite version needs self-checking; if using a native module like `better-sqlite3`, you can upgrade it yourself).

---

## 3. Approach to AI Automatic Plan Splitting

### 3.1 Input contract

`[Inference]` Input must be **structured + quantified**; never throw the raw sentence "I want to catch up on physics" at the model:

| Input item | Source | Required | Notes |
|---|---|---|---|
| Goal description | User input | ✅ | Original text preserved in `goals.description` |
| Deadline | User input | ✅ | `goals.deadline` |
| Daily investable minutes | User input | ✅ | Two groups: weekday/weekend (`weekday_minutes` / `weekend_minutes`) |
| Unavailable weekdays | User input | ✅ | E.g. "no time on Wednesday and Sunday afternoon" → those days' capacity is treated as 0 during decomposition |
| Current-level diagnosis | **Feynman scoring module** | ✅ | `feynman_scores` aggregated by knowledge point (1–5) → determines "which chapters can be skipped / skimmed" |
| Textbook chapter list | `chapters` table | ✅ | **Must give the model the real chapter_id + order**; this is the key to preventing hallucination |
| Existing fixed schedules | `events` (`is_blocking=1`) | ✅ | Used to compute real remaining capacity (Section 5) |
| Due review volume | `reviews` | ✅ | Review time that must be reserved each day (cannot be squeezed out by new plans) |
| Historical completion rate | `daily_stats` for the last 14 days | ⭕ Recommended | Used to set a "realistic" daily task volume |

### 3.2 Output contract: JSON Schema

`[Inference]` Require the model to output a **three-level structure (milestone → week → daily task)**, and **only reference `chapter_id`s given in the input**. Illustrative schema (usable directly with OpenAI `response_format: json_schema` (strict) or Gemini `responseSchema`):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["goal_summary", "assumptions", "milestones", "warnings"],
  "properties": {
    "goal_summary": { "type": "string" },
    "assumptions": {
      "type": "array", "items": { "type": "string" },
      "description": "AI's explicit assumptions about omitted information, so the user can correct them"
    },
    "warnings": {
      "type": "array", "items": { "type": "string" },
      "description": "Warnings that something cannot be finished within the deadline, e.g. 'capacity gap is about 12 hours at the current rate'"
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

**Three mandatory validation passes before landing (server-side, don't rely on model self-discipline)**

1. **Schema validation**: validate strictly with `zod` (4.6.5, MIT) or `ajv` (8.20.0, MIT); on failure → retry once and feed the error message back to the model (`[Fact]` the ts-fsrs official docs also recommend "runtime-validating externally-sourced parameters at the application boundary with something like zod"; same principle).
2. **Business-rule validation** (all hard constraints in Section 3.5 must be codified):
   - Each day `sum(estimated_minutes) ≤ daily_minutes_cap` (and deduct that day's reserved review time);
   - Dates must fall within the `goal.start ~ goal.deadline` interval;
   - **`chapter_id` must exist in the `chapters` table**, and within the same milestone `chapters.index` must be **monotonically non-decreasing** (to preserve textbook order);
   - Each `week` must have at least 1 `is_buffer` day (or the whole week `is_buffer=true`);
   - Unavailable weekdays must not have tasks scheduled.
3. **Failure degradation**: if validation fails and retry still fails → don't let the AI write directly to the DB; instead write it as a **"draft plan" for user confirmation** (`plans.status='pending'` + yellow highlight in the UI). Never silently write non-executable data.

### 3.3 Concrete decomposition example: "A Grade 11 student improves English grammar + math functions in 60 days"

**Input (illustrative)**
- Goal: improve English grammar and math functions within 60 days, `deadline = D+59`
- Capacity: weekdays 60 min, weekends 150 min; **Wednesday and Sunday evenings unavailable** (capacity halved)
- Diagnosis (Feynman scores): math "function monotonicity" 3/5, "parity" 2/5, "exponential/logarithmic functions" 1/5; English "tenses" 2/5, "non-finite verbs" 1/5, "relative clauses" 4/5 (can skim quickly)
- Textbook chapters: Math Compulsory 1 Chapter 3 Functions and their properties (index 3.1 monotonicity / 3.2 parity), Chapter 4 Exponential and logarithmic functions; English grammar topic 07 Tenses / 11 Non-finite verbs / 12 Relative clauses
- Review reservation: 15 min per day (FSRS due volume)

**Output (three-level decomposition sample, excerpt)**

| Level | Content |
|---|---|
| **L1 milestone M1** (D1–D24, about 3.5 weeks) | "Function foundation rebuild + tense systematization" `chapter_ids: [3.1, 3.2, 07]` |
| **L2 week plan W1** (D1–D7, planned 540 min) | Theme "Function monotonicity definition and determination"; `is_buffer=false` |
| **L3 daily tasks** (sample 1 day) | `D1`: ① Read 3.1 definitions and worked examples, 25 min (`read`, kp=monotonicity) ② 12 variation problems, 25 min (`practice`) ③ English tenses 08:00 simple present/past, 25 min ④ **FSRS due review 15 min (inserted automatically by the system, does not consume the AI quota)** |
| **L2 buffer week W4** (D22–D24 wrap-up + 1 flexible day) | `is_buffer=true`, only review and wrong-question rework scheduled — **deliberately left open** |
| **L1 milestone M2** (D25–D48) | "Exponential/logarithmic functions + non-finite verbs breakthrough" `chapter_ids:[4.x, 11]` |
| **L1 milestone M3** (D49–D58) | "Full-paper practice + wrong-question loop closure" — `task_type='paper'`, linked to `question_set_id` |
| **D59–D60** | Whole span `is_buffer=true`: only FSRS review and light review |

`[Inference]` This example embodies three design points: (1) **difficulty allocation follows the diagnosis** (relative clauses 4/5 → only a few verification problems, giving the time to the 1/5 non-finite verbs); (2) **reserve a buffer week each week**; (3) **review tasks are inserted by the system rather than generated by AI** (the AI is unaware of FSRS state; letting it schedule reviews will inevitably get them wrong).

### 3.4 Rolling replan

`[Inference]` Core principle: **replan in small steps at high frequency; don't do big replans.** Fact-based components: FSRS's `reschedule()` / `rollback()` allow rebuilding state from the review log ([ts-fsrs docs](https://open-spaced-repetition.github.io/ts-fsrs/)), so the "task layer" can be freely rearranged without damaging the memory model.

**Trigger conditions (any one hit triggers a replan)**

| Trigger | Threshold (suggested initial value, adjustable) | Action |
|---|---|---|
| Overdue task backlog | Sum of overdue unfinished `estimated_minutes` > the next 3 days' available capacity | Replan the next 7 days |
| Completion rate too low | Last 7 days `done_minutes/planned_minutes < 0.7` | Reduce daily quota by 20%, and downgrade "mastery-level" tasks to "understanding-level" |
| 3 consecutive idle days | 0 completed | Keep only the "minimum viable action" (1 task ≤15 min per day), rebuild the habit |
| New hard schedule added | New `events(is_blocking=1)` that conflicts with existing tasks | Locally replan the conflict day ±2 days |
| Diagnosis changed | Same knowledge point's Feynman score rose ≥2 points | Compress that knowledge point's task volume, advance into the next chapter early |
| Capacity changed | User modifies daily investable time | Full recomputation (but leave completed/started tasks untouched) |

**Replanning strategy (execute in priority order)**

1. **Completed/started tasks are never moved** (`done=1` or `actual_minutes>0`).
2. **Light tasks auto-"defer"**: `task_type IN ('read','recite')` and `estimated_minutes ≤ 30` → directly `due_date += 1` (these tasks have the lowest cost of deferral).
3. **Heavy tasks must be re-split**: `task_type IN ('paper','practice')` and `estimated_minutes ≥ 60` → split into 2–3 25-min subtasks spread across different days (avoid "one paper clogging up a whole day").
4. **Reserve buffer each day**: after replanning, each day's total tasks **must not exceed 80% of that day's capacity** (hard rule, see 3.5). The remaining 20% absorbs surprises.
5. **Review tasks take priority slots**: first pin the next N days' FSRS due volume (aggregated estimated minutes by `reviews.due`) into each day, then fill in new tasks; if review volume already exceeds 60% of capacity, **schedule no new tasks that day** and notify the user.
6. **Generate `source='reschedule'` + `origin_task_id`**, and show "deferred from 10-03" in the UI to avoid the user being confused by tasks appearing out of nowhere.
7. **Undoable**: each replan writes an audit record (which tasks moved from which day to which day), providing an "undo this replan".

**Automatic insertion of Ebbinghaus / FSRS review tasks (the key mechanism)**

`[Inference]` Don't use the "Ebbinghaus fixed-interval table" (1/2/4/7/15 days) — that's "sprinkling reviews by time", and it wastes time repeatedly reviewing the same knowledge point. **Use FSRS, and explicitly distinguish two kinds of review**:

- **Due review**: each day the scheduler queries `reviews WHERE due <= today AND suspended = 0`, and generates `tasks(source='review', task_type='review')` for each row; `estimated_minutes` is determined by that knowledge point's historical median time (default 3–5 min/entry).
- **First consolidation of newly-learned content**: a new knowledge point's `reviews` row starts `state=New`, `due=next day`, with FSRS's `learning_steps` (e.g. `['1m','10m']`, `[Fact]` ts-fsrs supports this parameter) doing short-term steps within the day, and **long intervals controlled by `request_retention`**.
- **Capacity protection (must do)**: set a `daily new-learning cap` (e.g. 15 knowledge points) and a `daily review cap` (e.g. 60 entries). Excess is **not deleted**, just marked "deferred to tomorrow", and `reviews.priority` makes the system sort by "due time + current mastery" (the lower `get_retrievability()`, the higher the priority).
- `[Fact]` `enable_fuzz: true` adds random jitter to long intervals; its official purpose is precisely "avoiding review tasks piling up on the same day", which fits this scenario perfectly. Source: [ts-fsrs docs](https://open-spaced-repetition.github.io/ts-fsrs/).

### 3.5 Prompt design points and the "prevent unrealistic plans" hard constraints

**Prompt structure (four segments)**

1. **Role and output format**: state clearly "you are a study-plan scheduler; only output structured results conforming to the given JSON Schema; no explanations, no Markdown".
2. **Fact list (give only facts, no room for improvisation)**: the user's capacity table (per-day available minutes, including "Wednesday = 0"), real `chapter_id`s and order, diagnosis scores, existing `events` occupied time slots, per-day reserved review minutes, the deadline.
3. **Hard constraints (using "must / must not" phrasing, each verifiable in code)**, see the table below.
4. **Self-check list**: require the model to explicitly report in `warnings` "which constraints cannot be satisfied". `[Inference]` **Allowing the model to say "can't be done" is the most important anti-hallucination measure** — otherwise it will fabricate an optimistic plan just to "complete the decomposition".

**Six hard constraints against "unrealistic" plans (all must be code-verified, not just written into the prompt)**

| # | Constraint | Verification method |
|---|---|---|
| C1 | **Daily total cap**: `sum(estimated_minutes) + that day's reserved review ≤ that day's available minutes × 0.8` | SQL aggregate validation; reject if exceeded |
| C2 | **Must reserve buffer days**: at least 1 `is_buffer=true` day per 7 days (only review/wrong questions); at least 1 flexible day between milestones | Iterative validation |
| C3 | **Must align with textbook chapter order**: tasks may only reference the `chapter_id`s given in the input; within the same milestone, chapter `index` is monotonically non-decreasing | Foreign-key existence + order-monotonicity validation |
| C4 | **A single task must not exceed 90 min** (must be split if exceeding), and `task_type='paper'` at most 2 times per week | Field-range validation |
| C5 | **Days with capacity 0 must not get new tasks** (`weekday∈unavailable set` or the day is already fully occupied by `events`) | Calendar-intersection validation |
| C6 | **Do not create "review" tasks** (the FSRS scheduler handles them); the AI must not fabricate `knowledge_point_id` / `question_set_id` | Whitelist validation |

`[Inference]` Three more engineering points:
- **Version the prompt**: `ai_plan_runs.prompt_version` must be recorded, otherwise you can't audit "why this plan got worse".
- **Lower the temperature** (0–0.3): scheduling is a deterministic problem and needs no creativity.
- **Give the model the "quota/capacity" as explicit numbers rather than letting it derive them** — `[Inference]` letting the model do date arithmetic is the most common failure source; `[Inference]` the more robust approach is **to have the model only output relative descriptions like "day N, do X, estimated M minutes", with local code responsible for mapping to real dates** — this way capacity constraints are entirely enforced by local algorithms (also the most recommended approach).

---

## 4. Due Reminders (Windows native notifications)

### 4.1 Fact comparison of three technical paths

| Capability | Electron | Tauri v2 | node-notifier |
|---|---|---|---|
| Current version | **44.5.1** (released 2026-09-30), MIT | `@tauri-apps/plugin-notification` **2.5.1**, MIT OR Apache-2.0 | **10.0.1**, last released **2022-02-01** |
| Windows notifications | `Notification` (main process); renderer goes through the Web Notifications API | Native toast | Wraps Windows toast underneath (`[Unverified]` which of SnoreToast/PowerToast it actually uses) |
| Custom toast | `toastXml` (Windows) fully customizable | `[Unverified]` whether it exposes the same freedom | ❌ |
| Buttons / dropdown selection | `actions` supports `button` (macOS+Windows) and `selection` (**Windows only**, a dropdown box, `items` specifies options, callback returns `selectedIndex`) | `Action` / `ActionType` exist (`[Unverified]` Windows coverage) | Limited |
| Inline reply | `hasReply` (macOS+Windows) | — | ❌ |
| **System-level scheduled delivery** | ❌ None built-in (need your own timer / Task Scheduler) | ✅ Has a `Schedule` class: `at()` / `every(ScheduleEvery.Day)` / `interval()`, plus `pending()` / `cancel()` / `cancelAll()` | ❌ |
| Auto-start on login | `app.setLoginItemSettings` (listed on the official API page) | `@tauri-apps/plugin-autostart` **2.7.0** | ❌ |
| Resident tray | `Tray` (listed on the official API page) | `TrayIcon`: `TrayIcon.new({icon, menu, menuOnLeftClick})`, needs the `tray-icon` feature enabled in `Cargo.toml` | ❌ |
| Maintenance status | Active (shipped in recent months) | Active (shipped 2026-10-01) | ⚠️ **No new release since 2022-02** |

`[Fact]` Sources:
- Electron Notification: [electronjs.org/docs/latest/api/notification](https://www.electronjs.org/docs/latest/api/notification) (it states explicitly: `id` maps to the toast's `Tag` on Windows; `groupId` maps to the toast's `Group`; `toastXml` can override all of the above attributes; `Notification.handleActivation()` uniformly handles click/reply/button activation, **supporting the "app cold-start" and "object already GC'd" scenarios**; on Windows `urgency: 'critical'` only raises the sort priority, and to prevent auto-dismiss you must also set `timeoutType: 'never'`)
- NotificationAction: [electronjs.org/docs/latest/api/structures/notification-action](https://www.electronjs.org/docs/latest/api/structures/notification-action)
- Electron app (`setLoginItemSettings` / `requestSingleInstanceLock` / `getPath('userData')`): [electronjs.org/docs/latest/api/app](https://www.electronjs.org/docs/latest/api/app)
- Tauri notification plugin: [v2.tauri.app/plugin/notification](https://v2.tauri.app/plugin/notification/) (`[Fact]` the Windows column notes "**only works for installed apps**; in dev mode it shows PowerShell's name and icon"); JS API: [v2.tauri.app/reference/javascript/notification/](https://v2.tauri.app/reference/javascript/notification/)
- Tauri autostart: [v2.tauri.app/plugin/autostart](https://v2.tauri.app/plugin/autostart/)
- Tauri tray: [v2.tauri.app/learn/system-tray](https://v2.tauri.app/learn/system-tray/)
- node-notifier version/release date: `https://registry.npmjs.org/node-notifier/latest`

### 4.2 Selection advice

`[Inference]`
- **If using Electron**: use the built-in `Notification` directly; don't introduce `node-notifier` (the latter hasn't been updated since 2022 and is a subset of the built-in API's capabilities). On Windows, Electron needs a correct **AppUserModelID + Start-menu shortcut** to display notifications properly — `[Unverified]` the complete description of this prerequisite in the official Electron docs was not confirmed page by page this time; before implementation, check Electron's "Notifications" tutorial page and hands-on test it.
- **If using Tauri**: the `plugin-notification` + `plugin-autostart` + `TrayIcon` trio, **and scheduled delivery can be handed directly to the system** (`Schedule.every(ScheduleEvery.Day).at(...)`) — this is Tauri's substantive advantage over Electron: **the system still delivers even when the app isn't running** (`[Inference]`, based on the plugin providing a `pending()` API for querying pending notifications). But note that on Windows it **must be an installed app** to display correctly.
- **Reliable implementation of the daily briefing (both paths are mandatory)**:
  1. **Primary path**: auto-start on login + resident tray + a main-process timer (Tauri uses `Schedule`, Electron uses `setTimeout` to the next 07:00 and re-arms). **Don't use the renderer process's `setInterval`** — window minimization/background throttling causes delays or missed sends.
  2. **Fallback path**: register a daily task with `schtasks`. `[Fact]` `schtasks /create` supports `/sc DAILY` (`/mo` specifies every N days), `/st <HH:mm>` specifies a 24-hour start time, `/tn` the task name, `/tr` the program to run, `/it` run only when the user is logged on, `/f` to overwrite a same-named task; and "a task running as the System account cannot be seen or interacted with by the user". Source: [schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create). `[Inference]` the fallback command is roughly `schtasks /create /tn "GeZhiDaily" /tr "<exe path>" /sc daily /st 07:00 /it /f`, and **you must use `/it`** (otherwise a notification popped in the System session is invisible to the user). Create/delete this task on install/uninstall.

### 4.3 Reminder dedup and the Windows-side mechanism

`[Fact]` Windows toast has two attributes: `Tag` (unique within a group) and `Group` (grouping); `Tag` **was capped at 16 characters before the Creators Update (15063) and relaxed to 64 characters after**; setting it to `null` or an empty string throws an exception. Source: [ToastNotification.Tag](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag). Electron's `Notification` options `id` / `groupId` map exactly to these two attributes (see the 4.1 sources).
`[Fact]` Electron additionally has `groupTitle` (Windows): when `groupId` and `groupTitle` are both specified, Windows shows a group title above the notification (mapped to the toast's `header` element). Source: [Notification API](https://www.electronjs.org/docs/latest/api/notification).

`[Inference]` **Dedup design (recommended for this project)**:
1. **Semantic dedup key**: `notifications.dedupe_key` uses `"{kind}:{task_id}:{yyyy-mm-dd}"` (e.g. `task_due:1024:2026-10-02`), with a **UNIQUE index**. The same kind of reminder for the same task on the same day **is only ever sent once** (enforced at the database layer, not via in-memory flags — it remains valid across app restarts).
2. **Windows-side secondary dedup**: truncate the hash of `dedupe_key` to ≤64 characters as the toast's `Tag`, and use `kind` as the `Group`. `[Inference]` a new toast with the same `Tag`+`Group` replaces the old entry in Action Center, so the user won't see duplicates pile up. **Note the 64-character cap must be actively truncated/hashed, otherwise an over-long key throws on some OS versions.**
3. **Time-window dedup**: for a review reminder of the same `knowledge_point_id`, skip it if one was already sent within 8 hours and hasn't been handled (to avoid spamming "you still have 37 reviews").
4. **Fail honestly**: if notification delivery fails (e.g. Windows not installed / no shortcut), write `notifications.state='failed'` and **degrade to an in-app banner**, so the user doesn't think "no tasks today".

### 4.4 Implementing snooze

`[Inference]` Native Windows toast snooze usually relies on the system notification's "snooze" button or a custom Action. The more robust engineering approach is **building your own snooze semantics** (platform-independent):
- Attach 2–3 buttons to the notification: `Done` / `+30 minutes` / `Tonight` (Electron uses `actions: [{type:'button', text:'Done'}, ...]`; Tauri uses `Action`).
- `notifications.snooze_until` + `snooze_count`. `[Inference]` **a snooze cap of 3 times is recommended**; after the 3rd time, escalate to an "escalated reminder" (`urgency:'critical'` + `timeoutType:'never'`, see the Windows behavior note in 4.1) or convert it directly to an in-app "overdue todo" red dot, to avoid unlimited snoozing rendering reminders meaningless.
- Clicking "Done" → directly `tasks.done=1` and record `done_at` (**close the loop to the data model**, don't just dismiss the notification).
- `[Fact]` Electron provides `Notification.handleActivation(callback)`, whose callback covers "click / reply / pressing an Action button", and **handles scenarios like cold start, post-GC, and persistent notifications in AC** — this is the correct integration point for "click the notification to check off a task directly". Source: same as 4.1.
- `[Fact]` Electron also provides `Notification.remove(id)` / `removeGroup(groupId)` / `removeAll()`, but **these are macOS-only** (see the platform annotations on the API page); on Windows use `notification.close()` or rely on `Tag` replacement semantics. `[Inference]` if you miss this point, you'll get the bizarre bug where "it deletes on Mac but not on Windows".

### 4.5 Daily briefing (a single line at 07:00)

`[Inference]` Content template (keep to 1–2 lines; Windows toast bodies that are too long get truncated):

```
Today 3 tasks · estimated 75 minutes | 12 reviews · 208 days to Gaokao
→ Click to start the first one: Function monotonicity · 12 variation problems (25 minutes)
```

Generation rules: `tasks WHERE due_date = today AND done = 0` for the count and `sum(estimated_minutes)`; `reviews WHERE due <= today` for the entry count; `countdowns` takes the minimum of `pinned=1` and `target_date >= today`. All are single-table aggregate queries; `[Inference]` under 100k tasks this is < 10ms (with the Section 2.3 partial indexes).

---

## 5. Countdown and "Important Days"

### 5.1 Multiple countdowns

`[Inference]` Carried by the `countdowns` table in the data layer (see 2.2), supporting:
- **Multiple parallel countdowns**: Zhongkao / Gaokao / Four-school joint exam / Recommended-admission interview, each independent;
- **Lunar birthdays**: `calendar_type='lunar'` + `lunar_month/lunar_day/lunar_is_leap`, each year use `lunar-javascript` (1.7.7, MIT, still updated as of 2025-11) to convert to that year's Gregorian date and write it into `target_date` (recommended as a scheduled "batch refresh every January 1" task);
- **One-time vs yearly recurring**: `is_recurring_yearly`;
- **Linked to goals/tasks**: `linked_goal_id`, `tasks.countdown_id` (sprint tasks).

`[Inference]` Reminder intensity tiers by `importance`: `importance=3` (Gaokao) → must appear in the daily briefing + resident in the top bar + milestone reminders (100/50/30/10/1 days); `importance=1` (custom days) → only a same-day reminder.

### 5.2 Progress percentage (two metrics, both must be given)

- **Task metric (execution progress)**: `done_minutes / (done_minutes + remaining_planned_minutes)`. `[Inference]` use **minutes** rather than "task count" — otherwise 5 small problems and 1 full paper weigh the same and the progress bar is distorted.
- **Mastery metric (learning progress)**: link knowledge points via `linked_goal_id` and weight by Feynman scores: `Σ(score_i × weight_i) / Σ(5 × weight_i)`, with `weight` suggested to be question count or class hours.
- `[Inference]` **Show both progress values**, because they often diverge — "tasks 100% done but mastery only 60%" is the most valuable warning signal (meaning insufficient plan volume or poor completion quality).

### 5.3 The "remaining learnable days" algorithm (key point)

`[Inference]` This is the most valuable and most easily-gotten-wrong metric in this module. **Don't simply use `deadline - today`**, because many of those days have no controllable time at all.

**Recommended algorithm (pseudocode flow, not implementation code)**:

1. Take `[today, deadline]` as the interval and enumerate day by day (a `julianday` difference loop).
2. For each day `d`:
   - If `d`'s weekday ∈ the user's "completely unavailable" set → capacity 0, **mark as a "non-learnable day"**;
   - Otherwise take that day's base capacity (weekday/weekend differ), **subtract** the actual occupied minutes of that day's `events(is_blocking=1)` (`RRULE` must first be expanded to concrete dates using rrule), then **subtract** the per-day FSRS review reservation (e.g. 15 min);
   - If remaining capacity < threshold (e.g. 20 min) → mark as a "non-learnable day".
3. `Remaining learnable days = qualifying days`; `remaining learnable capacity (minutes) = Σ per-day remaining capacity`.
4. **Compare against the plan**: compare `the sum of remaining unfinished tasks' estimated_minutes` with `remaining learnable capacity`:
   - capacity ≥ demand → green, show "41 learnable days left / about 62 hours";
   - shortfall 0–20% → yellow, "a bit tight; suggest removing 1 expansion task";
   - shortfall > 20% → red, and **trigger a replan prompt** (one of the 3.4 triggers).
5. Always use `julianday(A) - julianday(B)` for integer day-granularity differences, to avoid ±1-day errors from DST/timezone (per the "exact difference" note in the [SQLite date functions docs](https://www.sqlite.org/lang_datefunc.html)).

`[Inference]` Two more derived metrics, more tangible for the user:
- **"How much controllable time is left today"** = today's base capacity − today's already-scheduled `events` − today's already-completed minutes;
- **"Review pressure index"** = next 7 days' FSRS due total ÷ next 7 days' learnable capacity (> 0.6 means you should reduce new-learning volume).

### 5.4 UI presentation suggestions

`[Inference]` Three layers, with decreasing information density:

| Location | Content | Interaction |
|---|---|---|
| **Top bar (resident)** | 1–3 pinned countdowns, compact format: `Gaokao 208 days`; hovering expands "41 learnable days left · progress 63%" | Click to jump to the corresponding goal on the dashboard |
| **Dashboard (home first screen)** | Countdown card group (sortable/pinnable) + today's task list + review queue bar + 7-day capacity bar chart | Directly check off tasks, start pomodoro |
| **Desktop widget** | `[Inference]` two approaches: (a) Electron opens a `frameless + transparent + alwaysOnTop + skipTaskbar` small window and draws the countdown itself (fully controllable, works across Win10/11); (b) rely on the Windows 11 Widgets Board — `[Unverified]` the feasibility and API stability of third-party apps joining the Widgets Board was not verified this time; **not recommended for v1** | Double-click to bring up the main window |
| **Tray tooltip** | `Gaokao 208 days · 3 tasks today` | Right-click menu: today's task quick view, pause reminders, quit |

`[Inference]` Visual warning index: `>90 days` neutral color; `30–90 days` warning color; `7–30 days` emphasis color + bold in the top bar; `<7 days` pin in the daily briefing + a badge on the tray icon.

---

## 6. Habits and Statistics

### 6.1 Pomodoro / focus timer

`[Inference]`
- Data lands in `focus_sessions` + `time_logs` (see 2.5): one pomodoro = one session (`planned_minutes` / `actual_minutes` / `interruptions` / `completed`).
- **The timer must run in the main process** (or Node/Web Worker), not the renderer process's `setInterval` — window blur/minimization gets throttled by Chromium, making "25 minutes" actually take 27.
- **Ending early must distinguish "completed" from "abandoned"**: only `completed=1` counts toward `daily_stats.done_minutes`'s "effective focus"; abandoned time is counted separately (this is the key data for judging whether task time estimates are reasonable).
- Pomodoros are tightly bound to tasks: `tasks.actual_minutes` is written back by aggregating `time_logs` (`[Inference]` either an `AFTER INSERT/UPDATE` trigger or application-layer aggregation works; the application layer is easier to debug).
- Rest reminders use system notifications (Section 4 capabilities), **and rest time is not counted as study time**.

### 6.2 Daily study-time statistics

`[Inference]` The `daily_stats` materialized table (`day` primary key) suggested fields: `planned_minutes`, `done_minutes`, `focus_minutes` (pure pomodoro), `tasks_planned`, `tasks_done`, `review_count`, `review_minutes`, `streak`.
- **Write timing**: incremental update on each task completion/pomodoro end; at 00:05 each day a fallback full recomputation of that day (to prevent missed updates). `[Inference]` this is "the most common pitfall of materialized views in SQLite" — you must have a reconciliation mechanism.
- **Display**: today / this week / this month / cumulative; weekly comparison with "the same period last week".

### 6.3 Heatmap (GitHub-style contribution graph)

**Open-source implementation libraries (verified)**

| Library | Latest version | License | Last release | Notes |
|---|---|---|---|---|
| `react-activity-calendar` | 3.2.1 | MIT | 2026-07-07 | ⭐ Most actively maintained, React component, purpose-built activity heatmap |
| `cal-heatmap` | 4.2.4 | MIT | 2023-12-29 | Framework-agnostic, most feature-complete (3,137★) |
| `react-calendar-heatmap` | 1.10.0 | MIT | 2025-02-23 | Lightweight SVG (1,300★), "inspired by github's contribution graph" |
| `uiwjs/react-heat-map` | — | MIT | — | `[Unverified]` version not checked; GitHub API shows 286★, push 2026-05-28 |
| `gurbaaz27/shadcn-calendar-heatmap` | — | MIT | — | 185★, Tailwind/shadcn style |

`[Fact]` Versions/licenses/release dates: `https://registry.npmjs.org/react-activity-calendar/latest`, `https://registry.npmjs.org/cal-heatmap/latest`, `https://registry.npmjs.org/react-calendar-heatmap/latest`; stars and push times: GitHub API.

`[Inference]` **Recommendation: draw it yourself with ECharts' `calendar` coordinate system + `heatmap` series**, because:
1. You're **already going to introduce ECharts** for the radar chart / completion-rate curve (see 6.5), so don't add another chart library;
2. In the official chart configuration docs, `calendar` is a first-class coordinate system (`https://echarts.apache.org/en/option.html#calendar`), with many GitHub contribution-graph replications in the community;
3. The calendar coordinate system natively supports "monthly blocks + weekday alignment + value-range bucketing", and Chinese labels (Monday/Tuesday) need no extra handling.
If you want the more "authentic GitHub look" and don't want to write it yourself, use `react-activity-calendar` (best activity level).

`[Inference]` **Choose the right value range for the heatmap**: use **`focus_minutes` (effective focus minutes)** rather than "task completion count". Rationale: count can be inflated by "checking off 10 five-minute tasks", while duration is closer to real investment. Bucket with fixed thresholds (0 / 1–25 / 26–60 / 61–120 / >120 minutes), not automatic quantiles — otherwise "3 hours of study every day" and "5 minutes a day" look equally dark.

### 6.4 Completion-rate curve

`[Inference]`
- **7-day moving average completion rate**: `done_minutes / planned_minutes`, to avoid single-day fluctuation misleading you;
- **Plan-deviation curve**: rolling mean of `actual time / estimate` — **this is the key feedback loop for calibrating AI estimates**: if it's systematically > 1.2, the AI underestimates and you should raise the global coefficient on `estimated_minutes` (this coefficient can be fed back into the 3.5 prompt);
- **Overdue rate**: the share of `due_date < today AND done = 0` entries on a given day.
- Implement with ECharts `line` + `dataZoom`, querying `daily_stats` directly (don't scan `tasks` in real time).

### 6.5 The "knowledge mastery radar chart" linked to Feynman scoring

`[Inference]` Dimensions are "subject" or "chapter" (6–8 recommended; more is unreadable); each dimension's value = the **weighted mastery** of the knowledge points under it: prefer the latest Feynman score (1–5), and fall back to FSRS's `get_retrievability()` when there's no score (`[Fact]` ts-fsrs provides this function) — so knowledge points that "haven't done Feynman" still have a value and won't leave holes in the chart.

**Chart library comparison (all verified)**

| Library | Latest version | License | Repo star | Chinese friendliness | Single-chart size | Verdict |
|---|---|---|---|---|---|---|
| **Apache ECharts** | **6.1.0** (2026-05-19) | **Apache-2.0** | 67,423★ | ⭐⭐⭐ Most complete official Chinese docs / Chinese examples / Chinese community | Medium (supports on-demand import / custom build) | ✅ **Recommended** |
| Chart.js | 4.5.1 (2025-10-13) | MIT | 67,728★ | ⭐⭐ Docs mainly English, many community Chinese tutorials | Small | ⭕ Enough for simple charts; **heatmap needs the `chartjs-chart-matrix` plugin** `[Unverified]` |
| Recharts | 3.10.1 (2026-07-25) | MIT | 27,606★ | ⭐⭐ | Medium | ⭕ Great React-native experience, but heatmap/calendar coordinate system needs hand-drawing |
| visx (airbnb) | `@visx/visx` 4.0.0 (2026-06-11) | MIT | 21,071★ | ⭐ Low-level primitives, high learning cost | Tiny (tree-shakable) | ⭕ Only when you need full customization |
| Observable Plot | 0.6.17 (**2025-02-14**) | **ISC** | 5,396★ | ⭐ | Small | ❌ Oldest release date, fewest Chinese resources |

`[Fact]` Versions/licenses/release dates: `https://registry.npmjs.org/echarts`, `/chart.js`, `/recharts`, `/@visx/visx`, `/@observablehq/plot`; stars: GitHub API (`apache/echarts`, `chartjs/Chart.js`, `recharts/recharts`, `airbnb/visx`, `observablehq/plot`).
`[Fact]` ECharts' official chart configuration page provides the calendar coordinate system config docs under the `#calendar` anchor: `https://echarts.apache.org/en/option.html#calendar`; `echarts-for-react` 3.0.6 (MIT, 2026-01-21) is the React wrapper.

`[Inference]` **Recommend ECharts; the core reason is that "Chinese friendliness" is a hard requirement in this project** — you need correct rendering and typesetting of middle/high-school subject names, chapter names, Monday–Sunday, and lunar holidays, plus Chinese-community search efficiency when something goes wrong; ECharts clearly leads on all three. The cost is bundle size; using **on-demand imports** (`echarts/core` + only `CalendarChart`/`HeatmapChart`/`RadarChart`/`LineChart` + corresponding `components`) can compress it to an acceptable range.

---

## 7. Reference Open-Source Projects (What to Borrow)

> Compliance reminder: **borrowing the "data model + interaction pattern + algorithm" is safe; borrowing "code" depends on your final distribution license.** The table below marks licenses; **if AGPL-3.0 project code is linked into your app, it triggers AGPL's open-source obligations** (Vikunja, Logseq, AppFlowy are in this category) — recommended to only borrow their models and API design, not copy code.

### 7.1 The Obsidian ecosystem: task syntax and querying (the most worth-borrowing "interaction contract")

| Project | Repo | Star / License / Last push (API-verified) | What to borrow |
|---|---|---|---|
| **Obsidian Tasks** | `obsidian-tasks-group/obsidian-tasks` | 4,035★ / **MIT** / 2026-09-30 | **Inline task syntax**: the idea of expressing metadata in plain text with emoji — `📅` due date, `⏳` scheduled date, `🛫` start date, `➕` created date, `🔁` recurrence, and priority markers. `[Unverified]` the exact semantics of each emoji and the "when done" recurrence rule could not be confirmed by opening the README this time (GitHub domain unreachable); verify against the official docs before implementation. **The borrowable core is the design philosophy**: let users describe complex tasks with a single line of text, and AI-generated results should follow the same readable syntax, making export/import zero-cost |
| **Obsidian Dataview** | `blacksmithgu/obsidian-dataview` | 9,366★ / **MIT** / 2025-11-17 | **The query layer**: DQL-style queries + inline fields. `[Unverified]` specific syntax details not verified item by item. **Borrowable**: build a "Saved View" layer for "Gezhi" — the user doesn't write SQL; they express "this week's unfinished math tasks" with dropdowns/condition builders, and the backend translates it into a `WHERE` clause. This naturally fits your "what to review today" |
| **Obsidian Calendar plugin** | `liamcain/obsidian-calendar-plugin` | 2,278★ / **MIT** / 2024-06-22 | The calendar + daily-note linkage pattern (click a day → view/write that day's content). **Borrowable**: the bidirectional linkage between day view and task panel |
| **Heatmap Calendar** | `Richardsl/heatmap-calendar-obsidian` | 960★ / **Apache-2.0** / 2025-02-10 | Overlaying multiple types of markers on a calendar grid (habits/reviews/activities). **Borrowable**: a heatmap isn't a "single-metric intensity" but a "multi-event-type overlay" — your calendar needs to show "class/review/task" three types at once |
| **obsidian-tasks-calendar-wrapper** | `Leonezz/obsidian-tasks-calendar-wrapper` | 259★ / MIT / 2026-09-25 | A direct reference for **rendering task query results into a calendar** |

### 7.2 Tasks / timeboxing / project management

| Project | Repo | Star / License / Last push | What to borrow |
|---|---|---|---|
| **Super Productivity** | `super-productivity/super-productivity` | **22,418★** / **MIT** / 2026-10-01 | ⭐ Highest overlap with this module. **Borrow its complete "timebox + timer + pause/interruption recording" interaction model**, and its "task estimate vs actual time" comparison presentation. MIT license, safe to reference code |
| **Vikunja** | `go-vikunja/vikunja` | 5,565★ / **AGPL-3.0** / 2026-10-01 | Task hierarchy (`parent_id` nesting), list/board/calendar multi-view, layered REST API design. **Only borrow the model and API shape, not code** (AGPL) |
| **Tasks.org** | `tasks/tasks` | 5,618★ / **GPL-3.0** / 2026-09-30 | One of the most complete open-source todos for "recurring tasks + subtasks + reminders + location/time triggers". **Borrow**: the boundary handling of recurring tasks and reminders (GPL, don't copy code) |
| **Logseq** | `logseq/logseq` | 45,099★ / **AGPL-3.0** / 2026-10-01 | The outline-style task + daily journal organization |
| **Joplin** | `laurent22/joplin` | 56,547★ / NOASSERTION / 2026-10-01 | Local-first + multi-device sync conflict handling |
| **AppFlowy** | `AppFlowy-IO/AppFlowy` | 77,038★ / **AGPL-3.0** / 2026-10-01 | The productized approach to database/board/calendar multi-view switching |

### 7.3 Anki / FSRS (the algorithm source for the review queue)

| Project | Repo | Star / License / Last push | What to borrow |
|---|---|---|---|
| **Anki** | `ankitects/anki` | **31,680★** / NOASSERTION (repo has a `LICENSE` file, API didn't resolve an SPDX) / 2026-10-01 | ⭐ **Data model**: `notes` (note/knowledge point) → `cards` (cards) → `revlog` (review log), three layers. **Directly corresponds to yours**: `knowledge_points` → `reviews` (current state) → review log table (suggest adding `review_logs`). Storing `due` / `interval` / `ease`(SM-2) or FSRS's `stability`/`difficulty` / `reps` / `lapses` / `state` on `cards` can be copied directly. `[Unverified]` could not open Anki's database structure docs to check fields one by one this time; before implementation, check the official repo docs to confirm field names |
| **FSRS4Anki** | `open-spaced-repetition/fsrs4anki` | 4,085★ / **MIT** / 2026-08-14 | FSRS's Anki implementation and explanation ("modern Anki custom scheduling") |
| **TS-FSRS** | `open-spaced-repetition/ts-fsrs` | 801★ / **MIT** / 2026-09-29 (npm 5.4.2) | ⭐ **Directly usable in this project**: TypeScript implementation of FSRS v6, with `State`/`Rating`/`request_retention`/`maximum_interval`/`enable_fuzz`/`learning_steps` and `reschedule()`/`rollback()`/`get_retrievability()`. Docs: [open-spaced-repetition.github.io/ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/) (has a Simplified Chinese README) |
| **py-fsrs** | `open-spaced-repetition/py-fsrs` | 499★ / MIT / 2026-08-09 | Usable if doing Python-side batch processing (FSRS parameter optimization) |
| **srs-benchmark** | `open-spaced-repetition/srs-benchmark` | 272★ / no License file / 2026-09-18 | Algorithm comparison benchmark. `[Unverified]` the specific numbers for "FSRS beats SM-2" were not verified from this repo this time, so no specific numbers are cited in this report |
| **fsrs-optimizer** | `open-spaced-repetition/fsrs-optimizer` | 112★ / BSD-3-Clause / 2026-08-06 | **Personalized FSRS parameter optimization** (the `w` vector) from your own review log. `[Inference]` v2 feature: enable only after accumulating 1000+ review-log entries; noticeably more accurate than default parameters |

### 7.4 "AI plan decomposition" open-source projects: **this is an honest blank**

`[Fact]` This time the GitHub Search API was used with keywords `AI study planner LLM`, `task planner AI agent LLM`, `curriculum generator LLM education`, `goal decomposition`, etc. **The top-ranked projects all have single-digit to tens of stars** (e.g. `SAfsehEhsani/AI-AcademIQ-Planner` 1★, `NoNightWatch/agent-manager-for-ai-planner` 7★, `klausners/course-builder` 16★, `ICUnit/Tokai` 37★), and **none is a mature project that can serve as an engineering reference**. The `archiki/ADaPT` (As-Needed Decomposition and Planning) found in the search is `[Unverified]` (star/License not verified), and it's academic research code in a different domain from "study planning".

`[Inference]` Conclusion: **there is no ready-made open-source wheel for "AI decomposes a learning goal into a plan"; you must build it yourself.** This is precisely the differentiating value of this module. Only the upstream parts are reusable:
- **Structured output**: OpenAI Structured Outputs (`json_schema` strict mode, `https://platform.openai.com/docs/guides/structured-outputs`), Gemini's `responseSchema`, Claude's structured outputs (`https://platform.claude.com/docs/en/build-with-claude/structured-outputs`). ⚠️ `[Unverified]` these three pages **could not be opened and verified directly this time** (OpenAI blocked by Cloudflare 403, the Claude site's cross-domain redirect wasn't followed, Gemini only had a third-party mirror), so verify the details yourself before implementation.
- **JSON Schema spec**: `https://json-schema.org/` (not opened this time, `[Unverified]` the specific draft version number).
- **Runtime validation**: `zod` 4.6.5 (MIT) / `ajv` 8.20.0 (MIT) (versions verified).

### 7.5 One-line summary of "what to borrow / what not to borrow"

- **Directly usable libraries (MIT/Apache)**: `ts-fsrs` (FSRS algorithm), `rrule` (BSD-3), `lunar-javascript` (lunar calendar), `react-activity-calendar` or ECharts (charts).
- **Borrowable designs (don't copy code)**: Obsidian Tasks' **inline task metadata syntax**, Anki's **notes→cards→revlog** three-layer model, Super Productivity's **timebox interaction**, Vikunja's **multi-view + parent_id nesting**.
- **Cannot copy code**: AGPL/GPL projects (Vikunja, Logseq, AppFlowy, Tasks.org).
- **No wheel exists**: AI plan decomposition → build it yourself, with prompt versioning and schema validation.

---

## 8. Module Acceptance Criteria (one page)

> Tone convention: each item is **testable** (clear input, observable output, decidable threshold). `[default]` means the initial value is adjustable.

### A. Calendar view

- **A1** Open the calendar page and switch between the **month / week / day / agenda** four views; rendering completes within 300ms after switching (at a local scale of 1000 events).
- **A2** Given 3 types of calendar sources (course / exam / review / custom), any one type can be **shown or hidden independently**; after hiding, that type's event count in the month view updates accordingly.
- **A3** The week view defaults to a `[07:00–23:00]` slot grid; a class (e.g. "Math every Monday 08:00–09:40") is defined via **RRULE** and correctly expands into multiple-week instances in the week/month views.
- **A4** Drag an editable event to another day; **within ≤1 second after releasing the mouse** it persists to the database; position is unchanged after refresh/restart; dragging produces an undoable record.
- **A5** The UI language is Simplified Chinese (buttons, months, weekdays, agenda titles all Chinese); **lunar** dates are shown as a sub-label inside the date cell, and are **100% consistent** with authoritative lunar data on the test set (including leap months).
- **A6** When the calendar page opens, `is_blocking=1` events do not conflict with the "remaining learnable days" computed elsewhere: the same time span shows consistently in both places.

### B. Countdown and important days

- **B1** Given a final-exam date, **within 3 seconds of opening the app** the countdown appears in the top bar (the number is an integer day count).
- **B2** Configure **≥4 countdowns** simultaneously (Zhongkao / Gaokao / Four-school joint exam / Recommended-admission interview), all displayed correctly with no overlap/misalignment; up to 3 can be pinned to the top bar.
- **B3** Countdown days = **calendar date difference** (unaffected by timezone/DST): given `today=2026-10-01`, `target=2026-12-20`, show **80 days** (automated test covers this assertion).
- **B4** Lunar birthday: enter "the 15th day of the 7th lunar month"; the app gives **that year's** correct Gregorian date and automatically rolls to the next occurrence each year; there are test cases for crossing leap months.
- **B5** "Remaining learnable days" deducts already-scheduled classes: construct data where "4 of the next 10 days are fully occupied by `is_blocking=1` events"; the metric returns **6 days** (not 10).
- **B6** The progress percentage shows both the "task metric" and the "mastery metric" simultaneously, and both data sources are traceable (clicking shows the calculation detail).

### C. Planning and AI decomposition

- **C1** Given goal + deadline + daily investable time + unavailable weekdays + diagnosis result, clicking "generate plan" produces the three-level structure (milestone / week / daily task) in **≤30 seconds** (including the model call) and persists it as a draft.
- **C2** The generated result **must pass** JSON Schema validation and the 6 hard-constraint checks (daily total ≤ capacity×0.8, ≥1 buffer day per 7 days, chapter `index` monotonically non-decreasing, single task ≤90 min, no new tasks on capacity-0 days, no AI-generated review tasks); **on any failure it must not silently write to the DB**, but mark a draft and give a human-readable failure reason.
- **C3** Key-field non-null rate: `estimated_minutes` / `due_date` / `task_type` are **100% non-null** in generated tasks.
- **C4** Referential integrity: every `chapter_id` and `knowledge_point_id` in generated tasks **must exist in the database** (no AI-fabricated IDs); there are automated tests injecting fake IDs to verify rejection.
- **C5** A plan's `ai_run_id` is traceable: you can see the model used, the prompt version, and the raw output; "one-click undo this generation" restores the pre-generation state.
- **C6** Rescheduling: construct "last 5 days completion rate 40%" data; after triggering rescheduling, **each of the next 7 days' total tasks ≤ 80% of that day's capacity**, and **0** completed tasks are moved.
- **C7** Review insertion: given 40 FSRS due reviews, the scheduler inserts them into today's tasks, and today's new-learning task total does not exceed the `[daily new-learning cap]`; if review volume exceeds 60% of capacity, today's new-task count is **0** with a clear notice.
- **C8** Review state machine correctness: rating the same knowledge point `Again→Good→Good` consecutively produces `reviews`'s `state`/`stability`/`difficulty`/`due` **field-for-field consistent** with ts-fsrs's output under the same inputs (use ts-fsrs as the golden standard for differential testing).

### D. Reminders and briefing

- **D1** At **07:00** every day, push the daily briefing notification (actually pops up on Windows, not just logged); content includes: today's task count + estimated minutes + review count + nearest countdown days.
- **D2** **Dedup**: within the same day, the same `dedupe_key` (`kind:task_id:date`) **is delivered only once**; behavior is consistent across app restarts and day boundaries; a UNIQUE constraint at the database layer prevents races.
- **D3** **Snooze**: after clicking the "Done" button on a notification, the corresponding `tasks.done=1` and `done_at` is written; the "+30 minutes" button makes the notification reappear 30 minutes later; the same task has a **snooze cap of 3 times**, after which it no longer re-pops and converts to an in-app overdue notice.
- **D4** **Auto-start on login + resident tray**: after login the app silently starts to the tray (no main window pops up); the tray tooltip shows the countdown and today's task count; closing the main window doesn't exit the process.
- **D5** **Fallback delivery**: simulate the app not running (kill the process); the Windows scheduled task registered at install still wakes at 07:00 and delivers the briefing (and after being woken, exits itself to the tray).
- **D6** **Failure visibility**: when notification delivery fails, `notifications.state='failed'` is persisted and an in-app degraded banner appears; there is no "user sees nothing and the system has no record" case.

### E. Statistics and habits

- **E1** Pomodoro: start a 25-minute focus; after **minimizing the window for 25 minutes**, the recorded `actual_minutes` differs from the real wall-clock time by **≤2 seconds** (verifying no background throttling effect).
- **E2** After completing a task, `daily_stats.done_minutes` updates in **≤1 second**, and the same-day/current-month aggregates refresh accordingly.
- **E3** Heatmap: given 365 days of `focus_minutes` data, the heatmap renders in **≤1 second**; bucketing uses fixed thresholds, and "3 hours a day" vs "5 minutes a day" are visually distinguishable on the chart.
- **E4** The completion-rate curve shows the 7-day moving average; data points match `daily_stats` query results (automated differential testing).
- **E5** Mastery radar chart: 6–8 dimensions; for knowledge points **without a Feynman score**, fall back to FSRS retrievability, with **no empty dimensions** on the chart; redraws within 500ms after switching dimensions.

### F. Data and robustness

- **F1** `PRAGMA foreign_keys` is enabled on **every database connection**; there's a test deleting a referenced knowledge point and verifying the constraint takes effect (either cascade or reject, matching the design).
- **F2** The database is in WAL mode; the bundled SQLite version is **≥ 3.51.3** (avoiding the officially announced WAL-reset bug), and the version number is written to the log at startup.
- **F3** Offline availability: with the network disconnected, calendar, countdown, review queue, and statistics all work normally; only the "generate new plan" feature prompts that it needs network.
- **F4** Data-scale acceptance: under 100k `tasks` and 50k `reviews`, the "today's panel" query is **≤100ms** (P95), and "remaining learnable days" computes in **≤50ms**.
- **F5** Timezone/DST: after switching the system timezone to any other timezone and restarting, all `YYYY-MM-DD`-semantics fields (`due_date`/`target_date`) **do not shift** (there are test cases).

### G. Cross-module acceptance (the ones that best prove "this module is done")

- **G1** Getting a question wrong in the question bank and marking it → its linked knowledge point enters the `reviews` queue, and a review task appears in the **next day's** today-tasks.
- **G2** A knowledge point's Feynman score rises from 2 to 5 → that knowledge point's review interval lengthens significantly (`due` moves later), and its task volume in subsequent plans decreases.
- **G3** Given an exam date, the countdown, the sprint plan (`tasks.countdown_id` linkage), and review priority **all point to the same goal**, presenting as one coherent "exam-prep card" on the dashboard.

---

## 9. One-Line Recommendations

- **Calendar library**: use **FullCalendar 7.x's MIT standard packages** (`/interaction` + `/timegrid` + `/list` + `@fullcalendar/rrule`) — month/week/day/agenda and **drag-to-reschedule are all free**, configure the week view as the timetable; the "subject-per-row" resource view is Premium (from $480), so in v1 replace it with "left self-drawn subject column + right dayGrid", and don't pay for it.
- **Data model**: `goals → plans(parent_id self-nested) → tasks` three layers; `events` (fixed schedules, with RRULE) strictly separated from `tasks`; `reviews` stores one FSRS state per knowledge point and the scheduler **projects** them into the day's tasks (copy Anki's notes→cards→revlog structure); dates always use **ISO-8601 text + `julianday()` difference**, `PRAGMA foreign_keys=ON`, enable WAL and keep SQLite ≥ 3.51.3.
- **AI decomposition strategy**: let the model only output the **structured three-level JSON** (milestone→week→day); **capacity constraints and date mapping are left to local code**, with the AI only responsible for "content decomposition"; ship 6 hard constraints (80% capacity cap, mandatory buffer days, monotonic chapter order, single task ≤90min, no tasks on zero-capacity days, reviews not generated by AI) and **verify them in code**, writing a draft on failure — **allowing the AI to say "it doesn't fit" is the first gate against hallucination**, and remember: there's no mature open-source wheel for this part, so it must be built in-house.
- **Reminder implementation**: Electron uses the built-in `Notification` (`id`→Windows toast `Tag` as a ≤64-char semantic dedup key, `actions` for buttons, `handleActivation` for cold-start clicks); Tauri uses `plugin-notification` + `Schedule` + `plugin-autostart` + `TrayIcon`; **whichever path, use "auto-start on login + resident tray + main-process timer" as the primary path and `schtasks /sc daily /st 07:00 /it` as the fallback**, snooze cap 3 times, and delivery failures must be persisted and visibly degraded.
- **Chart library**: **ECharts 6.x (Apache-2.0)**, one library for the heatmap (`calendar` coordinate system + `heatmap` series to draw the GitHub contribution graph yourself), radar chart, and completion-rate curve, with the best Chinese docs / Chinese examples / Chinese search efficiency; don't introduce a second chart library.

---

## Appendix A: Link List Cited in This Report (grouped by accessibility)

**✅ Actually opened and verified this time (reproducible)**

- FullCalendar: [License](https://fullcalendar.io/license) ｜ [Pricing](https://fullcalendar.io/pricing) ｜ [Plugin Index](https://fullcalendar.io/docs/plugin-index) ｜ [Timeline View](https://fullcalendar.io/docs/timeline-view) ｜ [TimeGrid View](https://fullcalendar.io/docs/timegrid-view) ｜ [locale](https://fullcalendar.io/docs/locale)
- Schedule-X: [Views](https://schedule-x.dev/docs/calendar/views) ｜ [Premium](https://schedule-x.dev/premium) ｜ [Drag to create](https://schedule-x.dev/docs/calendar/plugins/drag-to-create)
- v-calendar: [vcalendar.io](https://vcalendar.io/)
- Electron: [Notification](https://www.electronjs.org/docs/latest/api/notification) ｜ [NotificationAction](https://www.electronjs.org/docs/latest/api/structures/notification-action) ｜ [app](https://www.electronjs.org/docs/latest/api/app)
- Tauri: [Notifications plugin](https://v2.tauri.app/plugin/notification/) ｜ [JS API](https://v2.tauri.app/reference/javascript/notification/) ｜ [Autostart](https://v2.tauri.app/plugin/autostart/) ｜ [System Tray](https://v2.tauri.app/learn/system-tray/)
- Microsoft Learn: [ToastNotification.Tag](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag) ｜ [schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create)
- SQLite: [Foreign Keys](https://www.sqlite.org/foreignkeys.html) ｜ [WAL](https://www.sqlite.org/wal.html) ｜ [Date & Time Functions](https://www.sqlite.org/lang_datefunc.html)
- Standard: [RFC 5545 iCalendar](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3)
- FSRS: [ts-fsrs docs site](https://open-spaced-repetition.github.io/ts-fsrs/)
- Charts: [ECharts option (with #calendar)](https://echarts.apache.org/en/option.html#calendar) ｜ [Day.js i18n](https://day.js.org/docs/en/i18n/loading-into-nodejs)
- Live npm registry queries (version/License/release date): `registry.npmjs.org/<pkg>` or `/latest`
- Live GitHub REST API queries (star/License/archived/push): `api.github.com/repos/<owner>/<repo>`

**⚠️ Given but not opened this time (verify yourself before implementation)**

- GitHub repo pages (`github.com/*`, unreachable through this machine's proxy): `fullcalendar/fullcalendar`, `bigcalendar/react-big-calendar`, `nhn/tui.calendar`, `nathanreyes/v-calendar`, `schedule-x/schedule-x`, `jkbrzt/rrule`, `6tail/lunar-javascript`, `obsidian-tasks-group/obsidian-tasks`, `blacksmithgu/obsidian-dataview`, `liamcain/obsidian-calendar-plugin`, `Richardsl/heatmap-calendar-obsidian`, `super-productivity/super-productivity`, `go-vikunja/vikunja`, `tasks/tasks`, `ankitects/anki`, `open-spaced-repetition/*`, `apache/echarts`, `chartjs/Chart.js`, `recharts/recharts`, `airbnb/visx`, `observablehq/plot`, `grubersjoe/react-activity-calendar`, `wa0x6e/cal-heatmap`, `kevinsqi/react-calendar-heatmap`
- Structured-output docs: OpenAI (blocked by Cloudflare 403), Claude (cross-domain redirect not followed), the JSON Schema spec homepage
- The Obsidian Tasks Emoji Format doc page (redirects to obsidian.md and was not followed)
- Others: `github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm`, `sqlite.org/lang_with.html`, the Microsoft "adaptive interactive toasts" page (the URL 404'd this time; the correct path is `https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts`, unverified)

## Appendix B: Summary of `[Unverified]` Items (must self-check before implementation)

1. Whether FullCalendar 7's `zh-cn` locale exists and its import path.
2. react-big-calendar 1.20.0's view list and built-in drag API details.
3. Whether Schedule-X's Event Recurrence plugin is Premium.
4. `lunar-javascript`'s specific API function names and leap-month handling.
5. The exact semantics of each Obsidian Tasks emoji and the "when done" recurrence rule.
6. Anki's field-level definitions of `notes`/`cards`/`revlog`.
7. Whether TS-FSRS provides a Windows-desktop-usable parameter-optimization entry point (the availability of `@open-spaced-repetition/binding`).
8. The complete requirements for the AppUserModelID / shortcut prerequisites Electron needs for Windows notifications.
9. node-notifier's underlying implementation on Windows (SnoreToast / PowerToast).
10. Tauri notification plugin's Windows support for `Action` buttons and `Attachment`; the `Schedule`'s actual delivery guarantee when the app isn't running.
11. How the Windows 11 Widgets Board is exposed to third-party desktop apps.
12. The current parameter details of OpenAI / Gemini / Claude structured output (`strict`, `responseSchema`, etc.).
13. The Temporal API's native support baseline.
14. The maturity of `chartjs-chart-matrix` for heatmaps.
