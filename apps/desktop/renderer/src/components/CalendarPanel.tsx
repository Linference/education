// 日历 / 计划 / 倒计时
//
// 三块内容合在一个面板里，用页签切换：
//   · 月历  —— 固定日程（上课、考试），点日期看当天
//   · 待办  —— 可调整的学习任务（AI 可以参与安排）
//   · 倒计时 —— 考试、生日、假期
//
// ★ 为什么日程和待办要分开（这是 schema 设计的硬规矩）：
//   固定日程**不可被 AI 重排**。如果把"周一 8 点数学课"和
//   "复习函数"混在一起，AI 排计划时会顺手把你的课也挪走。
//   所以界面上也是两个页签、两种颜色，语义不混。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface CalEvent {
  id: string; title: string; kind: string;
  start_at: string; end_at?: string | null; all_day?: number;
  location?: string | null; repeat?: string | null; note?: string | null;
}
interface CalTask {
  id: string; title: string; kind: string;
  due_at?: string | null; est_minutes?: number | null;
  done_at?: string | null; source?: string; goal?: string | null;
}
interface Countdown {
  id: string; title: string; date?: string | null;
  lunar_month?: number | null; lunar_day?: number | null; color?: string | null;
}

interface Props {
  vaultPath: string | null;
}

/** 事件类型 → 颜色与名称 */
const EVENT_STYLE: Record<string, { color: string; label: string }> = {
  class: { color: "#6366f1", label: "上课" },
  exam: { color: "#dc2626", label: "考试" },
  activity: { color: "#16a34a", label: "活动" },
  other: { color: "#8b8b8b", label: "其他" },
};
const TASK_STYLE: Record<string, { color: string; label: string }> = {
  study: { color: "#6366f1", label: "学习" },
  review: { color: "#f59e0b", label: "复习" },
  exam: { color: "#dc2626", label: "考试" },
  rest: { color: "#16a34a", label: "休息" },
};

/** 本地日期 → YYYY-MM-DD（不用 toISOString，那会按 UTC 偏移出错） */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/** 取某个时间字符串的日期部分 */
const datePart = (s?: string | null) => (s ? String(s).slice(0, 10) : "");

/** 距离目标日期还有几天（按本地日期算整天，不按小时） */
function daysUntil(target: string): number | null {
  if (!target) return null;
  const t = new Date(`${target}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

export default function CalendarPanel({ vaultPath }: Props) {
  const [tab, setTab] = useState<"month" | "tasks" | "countdown">("month");
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** 当前显示的月份（只用年月） */
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(() => ymd(today));

  /** 新建输入 */
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<string>("class");
  const [newTime, setNewTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- 载入数据 ----
  const load = useCallback(async () => {
    if (!vaultPath) { setEvents([]); setTasks([]); setCountdowns([]); return; }
    setLoading(true);
    setErr(null);
    try {
      // 取当前月份前后各一个月，够翻页用
      const from = ymd(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
      const to = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1));
      const r = await window.gezhi.cal.load({ vault: vaultPath, from, to });
      if (r?.ok === false) { setErr(String(r.error)); return; }
      setEvents(r.events ?? []);
      setTasks(r.tasks ?? []);
      setCountdowns(r.countdowns ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [vaultPath, cursor]);

  useEffect(() => { void load(); }, [load]);

  // ---- 月历格子 ----
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // 周一为一周开始（中文习惯）
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);
    const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({ date: d, key: ymd(d), inMonth: d.getMonth() === cursor.getMonth() });
    }
    return cells;
  }, [cursor]);

  /** 每天有哪些事件（用于格子里画点） */
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      const d = datePart(e.start_at);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return m;
  }, [events]);

  /** 当天的事件 + 待办 */
  const dayEvents = byDay.get(selected) ?? [];
  const dayTasks = tasks.filter((t) => datePart(t.due_at) === selected);

  // ---- 操作 ----
  const addEvent = async () => {
    const title = newTitle.trim();
    if (!title || !vaultPath) return;
    const startAt = newTime ? `${selected}T${newTime}` : `${selected}T09:00`;
    const r = await window.gezhi.cal.addEvent({
      vault: vaultPath, title, kind: newKind, startAt,
    });
    if (r?.ok === false) { setErr(String(r.error)); return; }
    setNewTitle(""); setNewTime("");
    await load();
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title || !vaultPath) return;
    const r = await window.gezhi.cal.addTask({
      vault: vaultPath, title, dueAt: selected, source: "manual",
    });
    if (r?.ok === false) { setErr(String(r.error)); return; }
    setNewTitle("");
    await load();
  };

  const addCountdown = async () => {
    const title = newTitle.trim();
    if (!title || !vaultPath) return;
    // 倒计时用"选中的日期"作为目标日
    const r = await window.gezhi.cal.addCountdown({ vault: vaultPath, title, date: selected });
    if (r?.ok === false) { setErr(String(r.error)); return; }
    setNewTitle("");
    await load();
  };

  if (!vaultPath) {
    return <div className="tree-empty">打开一个库后可以使用日历与计划</div>;
  }

  const monthLabel = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 页签 */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--bd)", flex: "0 0 auto" }}>
        {([["month", "月历"], ["tasks", "待办"], ["countdown", "倒计时"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: "1 1 auto", padding: "6px 0", fontSize: 12,
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
              fontWeight: tab === k ? 600 : 400,
            }}
          >
            {label}
            {k === "tasks" && tasks.length > 0 && (
              <span style={{ fontSize: 10, marginLeft: 4, color: "var(--text-faint)" }}>{tasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ padding: "4px 10px", fontSize: 11.5, color: "var(--red)", background: "#fdecec" }}>
          {err}
        </div>
      )}

      {/* ---------------- 月历 ---------------- */}
      {tab === "month" && (
        <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "8px 10px" }}>
          {/* 月份切换 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              style={{ fontSize: 13, color: "var(--text-muted)", padding: "0 6px" }} title="上个月">‹</button>
            <span style={{ flex: "1 1 auto", textAlign: "center", fontSize: 13, fontWeight: 600 }}>{monthLabel}</span>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              style={{ fontSize: 13, color: "var(--text-muted)", padding: "0 6px" }} title="下个月">›</button>
            <button onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(ymd(today)); }}
              style={{ fontSize: 11, color: "var(--accent)" }} title="回到今天">今天</button>
          </div>

          {/* 星期表头（周一开头） */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {["一", "二", "三", "四", "五", "六", "日"].map((w, i) => (
              <div key={w} style={{
                textAlign: "center", fontSize: 11, padding: "2px 0",
                color: i >= 5 ? "var(--accent)" : "var(--text-faint)",
              }}>{w}</div>
            ))}
          </div>

          {/* 日期格子 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {grid.map((c) => {
              const evs = byDay.get(c.key) ?? [];
              const isToday = c.key === ymd(today);
              const isSel = c.key === selected;
              const isWeekend = c.date.getDay() === 0 || c.date.getDay() === 6;
              return (
                <button
                  key={c.key}
                  onClick={() => { setSelected(c.key); setNewTitle(""); }}
                  title={evs.map((e) => e.title).join("\n") || c.key}
                  style={{
                    aspectRatio: "1 / 1",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                    padding: "2px 0 0", borderRadius: 4, position: "relative",
                    background: isSel ? "var(--accent-soft)" : "transparent",
                    border: isToday ? "1px solid var(--accent)" : "1px solid transparent",
                    color: c.inMonth
                      ? (isWeekend ? "var(--accent)" : "var(--text-normal)")
                      : "var(--text-faint)",
                    opacity: c.inMonth ? 1 : 0.45,
                    fontWeight: isToday || isSel ? 600 : 400,
                    fontSize: 12,
                  }}
                >
                  {c.date.getDate()}
                  {/* 事件圆点：最多画 3 个，多的用 +N */}
                  {evs.length > 0 && (
                    <div style={{ display: "flex", gap: 2, marginTop: 2, flexWrap: "wrap", justifyContent: "center" }}>
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.id} style={{
                          width: 4, height: 4, borderRadius: "50%",
                          background: EVENT_STYLE[e.kind]?.color ?? "#888",
                        }} />
                      ))}
                      {evs.length > 3 && (
                        <span style={{ fontSize: 8, color: "var(--text-faint)", lineHeight: "4px" }}>+</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 选中日期：新增 + 列表 */}
          <div style={{ marginTop: 10, borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              {selected}
              {selected === ymd(today) && <span style={{ color: "var(--accent)", marginLeft: 6, fontWeight: 400 }}>今天</span>}
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <input
                ref={inputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addEvent(); }}
                placeholder="新增日程…"
                style={{
                  flex: "1 1 auto", minWidth: 0, fontSize: 12, padding: "4px 7px",
                  border: "1px solid var(--bd-strong)", borderRadius: 4,
                  background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
                }}
              />
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
                style={{
                  fontSize: 11, padding: "2px 4px", borderRadius: 4,
                  border: "1px solid var(--bd-strong)", background: "var(--bg-primary)",
                  color: "var(--text-normal)",
                }}
              >
                {Object.entries(EVENT_STYLE).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                title="不填默认 09:00"
                style={{
                  width: 74, fontSize: 11, padding: "2px 4px", borderRadius: 4,
                  border: "1px solid var(--bd-strong)", background: "var(--bg-primary)",
                  color: "var(--text-normal)",
                }}
              />
              <button
                onClick={() => void addEvent()}
                style={{
                  padding: "4px 8px", borderRadius: 4, fontSize: 12,
                  background: "var(--accent)", color: "#fff",
                }}
              >加</button>
            </div>

            {dayEvents.length === 0 && dayTasks.length === 0 && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>这天还没有安排</div>
            )}
            {dayEvents.map((e) => (
              <div key={e.id} style={{
                display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 6px",
                marginBottom: 3, borderRadius: 4, background: "var(--bg-secondary)",
                borderLeft: `3px solid ${EVENT_STYLE[e.kind]?.color ?? "#888"}`,
              }}>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{e.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                    {String(e.start_at).slice(11, 16) || "全天"}
                    {e.end_at ? ` – ${String(e.end_at).slice(11, 16)}` : ""}
                    {" · "}{EVENT_STYLE[e.kind]?.label ?? e.kind}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await window.gezhi.cal.deleteEvent({ id: e.id, vault: vaultPath });
                    await load();
                  }}
                  title="删除"
                  style={{ color: "var(--text-faint)", fontSize: 11 }}
                >✕</button>
              </div>
            ))}
            {dayTasks.map((t) => (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 6px",
                marginBottom: 3, borderRadius: 4, background: "var(--bg-secondary)",
                borderLeft: `3px solid ${TASK_STYLE[t.kind]?.color ?? "#888"}`,
              }}>
                <span style={{ fontSize: 12.5, flex: "1 1 auto" }}>{t.title}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>待办</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- 待办 ---------------- */}
      {tab === "tasks" && (
        <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "8px 10px" }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8, lineHeight: 1.7 }}>
            学习任务允许 AI 参与安排；固定日程请放在「月历」里（那里 AI 不会动）。
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addTask(); }}
              placeholder="新增待办…"
              style={{
                flex: "1 1 auto", minWidth: 0, fontSize: 12, padding: "4px 7px",
                border: "1px solid var(--bd-strong)", borderRadius: 4,
                background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
              }}
            />
            <button
              onClick={() => void addTask()}
              style={{ padding: "4px 8px", borderRadius: 4, fontSize: 12, background: "var(--accent)", color: "#fff" }}
            >加</button>
          </div>

          {loading && <div className="tree-empty">载入中…</div>}
          {!loading && tasks.length === 0 && <div className="tree-empty">还没有待办</div>}

          {tasks.map((t) => (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "5px 6px",
              borderBottom: "1px solid var(--bd)",
            }}>
              <input
                type="checkbox"
                checked={Boolean(t.done_at)}
                onChange={async () => {
                  await window.gezhi.cal.toggleTask({ id: t.id, vault: vaultPath });
                  await load();
                }}
                style={{ flex: "0 0 auto" }}
              />
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>{t.title}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                  {datePart(t.due_at) || "无期限"}
                  {t.est_minutes ? ` · 预计 ${t.est_minutes} 分钟` : ""}
                  {t.source === "ai" ? " · AI 安排" : ""}
                </div>
              </div>
              <button
                onClick={async () => {
                  await window.gezhi.cal.deleteTask({ id: t.id, vault: vaultPath });
                  await load();
                }}
                style={{ color: "var(--text-faint)", fontSize: 11 }}
                title="删除"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- 倒计时 ---------------- */}
      {tab === "countdown" && (
        <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "8px 10px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addCountdown(); }}
              placeholder={`倒计时名称（目标日 ${selected}）`}
              style={{
                flex: "1 1 auto", minWidth: 0, fontSize: 12, padding: "4px 7px",
                border: "1px solid var(--bd-strong)", borderRadius: 4,
                background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
              }}
            />
            <button
              onClick={() => void addCountdown()}
              style={{ padding: "4px 8px", borderRadius: 4, fontSize: 12, background: "var(--accent)", color: "#fff" }}
            >加</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
            目标日取「月历」里选中的那天（当前：{selected}）
          </div>

          {countdowns.length === 0 && <div className="tree-empty">还没有倒计时</div>}
          {countdowns.map((c) => {
            const d = daysUntil(c.date);
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 6px",
                borderBottom: "1px solid var(--bd)",
              }}>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{c.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{c.date ?? "（农历）"}</div>
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 700,
                  color: d === null ? "var(--text-faint)"
                    : d < 0 ? "var(--text-faint)"
                    : d <= 7 ? "var(--red)"
                    : d <= 30 ? "var(--orange, #f59e0b)"
                    : "var(--accent)",
                }}>
                  {d === null ? "—" : d < 0 ? "已过" : d === 0 ? "今天" : `${d} 天`}
                </div>
                <button
                  onClick={async () => {
                    await window.gezhi.cal.deleteCountdown({ id: c.id, vault: vaultPath });
                    await load();
                  }}
                  style={{ color: "var(--text-faint)", fontSize: 11 }}
                  title="删除"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
