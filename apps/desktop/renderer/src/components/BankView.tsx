// 题库与组卷
//
// 三块：左筛选题库 · 中间题目列表 · 右组卷篮
//
// ★ 组卷的输出必须是**能直接打印的 PDF**，而且按产品硬规矩：
//   生成的试卷**不带任何产品署名**（不能出现"格致"）。
//   所以走的是已有的 Typst 导出链路（templates/typst/handout.typ），
//   而不是自己拼 HTML 再转。
//
// ★ 为什么要有"组卷篮"而不是直接勾选就导出：
//   组卷是反复调整的过程（这道不要、再加一道难的），
//   篮子里能看总题数、总分、删掉某道题 —— 直接导出会让人不敢点。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BankQuestion, BankStats } from "../types";

interface Props {
  vaultPath: string | null;
  onOpen?: (path: string) => void;
}

const DIFF_LABEL = ["", "很简单", "简单", "中等", "较难", "很难"];

/** 一页试卷能放多少题（粗略，用于提示用户卷子会不会太长） */
const PER_PAGE_GUESS = 6;

export default function BankView({ vaultPath }: Props) {
  const [stats, setStats] = useState<BankStats | null>(null);
  const [list, setList] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 筛选条件
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [kp, setKp] = useState("");
  const [diffMin, setDiffMin] = useState("");
  const [keyword, setKeyword] = useState("");

  // 组卷篮
  const [basket, setBasket] = useState<BankQuestion[]>([]);
  const [paperTitle, setPaperTitle] = useState("");
  const [withAnswers, setWithAnswers] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** 展开看解析的那道题 */
  const [openId, setOpenId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!vaultPath) { setList([]); setStats(null); return; }
    setLoading(true);
    setErr(null);
    try {
      const [s, l] = await Promise.all([
        window.gezhi.bank.stats({ vault: vaultPath }),
        window.gezhi.bank.list({
          vault: vaultPath,
          ...(type ? { type } : {}),
          ...(source ? { source } : {}),
          ...(kp ? { kp } : {}),
          ...(diffMin ? { difficultyMin: Number(diffMin) } : {}),
          ...(keyword ? { keyword } : {}),
          limit: 200,
        }),
      ]);
      setStats(s);
      setList(l.questions ?? []);
      setTotal(l.total ?? 0);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [vaultPath, type, source, kp, diffMin, keyword]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** 组卷篮总难度/题数统计 */
  const summary = useMemo(() => {
    if (!basket.length) return null;
    const byType = new Map<string, number>();
    let diffSum = 0;
    for (const q of basket) {
      byType.set(q.typeLabel, (byType.get(q.typeLabel) ?? 0) + 1);
      diffSum += q.difficulty;
    }
    return {
      count: basket.length,
      avgDiff: (diffSum / basket.length).toFixed(1),
      byType: [...byType.entries()],
      pages: Math.max(1, Math.ceil(basket.length / PER_PAGE_GUESS)),
    };
  }, [basket]);

  const toggleBasket = (q: BankQuestion) => {
    setBasket((b) => (b.some((x) => x.id === q.id) ? b.filter((x) => x.id !== q.id) : [...b, q]));
  };

  /** 导入：选 Markdown 文件 → 解析 → 让用户确认 → 入库 */
  const importFile = async (file: File) => {
    if (!vaultPath) { setErr("请先打开一个库"); return; }
    setNotice(null);
    setErr(null);
    try {
      const p = (file as any).path as string | undefined;
      if (!p) { setErr("拿不到文件路径（浏览器环境不支持）"); return; }
      const r = await window.gezhi.bank.parseFile({ filePath: p });
      if (!r.ok) { setErr(r.error ?? "解析失败"); return; }
      if (!r.count) {
        setNotice("这个文件里没解析出题目。格式要求：用 ### 分块，字段写成「题型：选择题」这种形式。");
        return;
      }
      const warn = r.warnings?.length ? `\n\n注意：\n· ${r.warnings.slice(0, 5).join("\n· ")}` : "";
      const okToAdd = window.confirm(
        `从「${file.name}」解析出 ${r.count} 道题。${warn}\n\n确认导入吗？`,
      );
      if (!okToAdd) { setNotice("已取消导入。"); return; }
      const add = await window.gezhi.bank.addMany({ vault: vaultPath, questions: r.questions ?? [] });
      if (!add.ok) { setErr(add.error ?? "导入失败"); return; }
      setNotice(`已导入 ${add.added} 道题${add.failed?.length ? `，${add.failed.length} 道被跳过` : ""}。`);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  /**
   * 组卷导出 PDF。
   *
   * ★ 拼成 Markdown 再走既有导出链路（Typst），不自己写 PDF：
   *   那条链路已经解决好了中文排版、公式、页码、目录，
   *   而且**不带产品署名**（产品硬规矩）。
   */
  const exportPaper = async () => {
    if (!basket.length) return;
    if (!vaultPath) { setErr("请先打开一个库"); return; }
    setExporting(true);
    setErr(null);
    setNotice(null);
    try {
      const title = paperTitle.trim() || "试卷";
      const md = buildPaperMarkdown(title, basket, { withAnswers });

      /*
       * 试卷导出到**系统"下载"文件夹**，不是库目录。
       *
       * 用户的诉求就是"拿到一份卷子"（要打印/发给学生），
       * 那是**文件交付**，不是往知识库里加东西。
       * 而且混进库里会被索引、出现在文件树里，反而把库弄乱。
       *
       * 路径由主进程用 app.getPath("downloads") 解析 ——
       * 不在这里拼 "C:\Users\x\Downloads"，因为用户可能改过下载位置，
       * 也可能被组策略重定向（本机的"文档"目录就是重定向过的）。
       */
      const r = await window.gezhi.exporter.run({
        format: "pdf",
        markdown: md,
        sourcePath: `${vaultPath}\\${title}.md`,
        defaultName: title,
        title,
        toDownloads: true,
      });
      if (!r.ok) {
        setErr(`导出失败：${r.error ?? "未知原因"}`);
        return;
      }
      // 记住这份卷子，方便"再来一份同规格的"
      await window.gezhi.bank.savePaper({
        vault: vaultPath,
        title,
        qids: basket.map((q) => q.id),
        config: { type, source, kp, diffMin },
      }).catch(() => null);

      setNotice(`已导出到下载文件夹：${r.path ?? "（路径未知）"}（${basket.length} 题）`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setExporting(false);
    }
  };

  const inputSt: React.CSSProperties = {
    fontSize: 11.5, padding: "3px 6px", borderRadius: 4,
    border: "1px solid var(--bd-strong)", background: "var(--bg-primary)",
    color: "var(--text-normal)", outline: "none", width: "100%",
  };

  if (!vaultPath) return <div className="tree-empty">打开一个库后可以使用题库</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 顶栏 */}
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderBottom: "1px solid var(--bd)",
        background: "var(--bg-secondary)", fontSize: 12,
      }}>
        <span style={{ fontWeight: 600 }}>题库组卷</span>
        <span style={{ color: "var(--text-muted)" }}>
          {stats?.total ? `共 ${stats.total} 道` : "还没有题目"}
          {total !== stats?.total ? ` · 当前筛选 ${total} 道` : ""}
        </span>
        <div style={{ flex: "1 1 auto" }} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "4px 10px", borderRadius: 5, fontSize: 12,
            background: "var(--accent)", color: "#fff",
          }}
        >
          导入 Markdown 题目
        </button>
      </div>

      {(err || notice) && (
        <div style={{
          flex: "0 0 auto", padding: "5px 12px", fontSize: 11.5,
          background: err ? "#fdecec" : "#e9f7ee",
          color: err ? "#8a1f1f" : "#14532d", lineHeight: 1.7, whiteSpace: "pre-wrap",
        }}>
          {err ?? notice}
        </div>
      )}

      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        {/* ---- 左：筛选 ---- */}
        <div style={{ width: 200, flex: "0 0 auto", borderRight: "1px solid var(--bd)", overflow: "auto", padding: "8px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5 }}>筛选</div>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>题型</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputSt, marginBottom: 8 }}>
            <option value="">全部</option>
            {(stats?.byType ?? []).map((t) => (
              <option key={t.type} value={t.type}>{t.type}（{t.n}）</option>
            ))}
          </select>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>来源</div>
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ ...inputSt, marginBottom: 8 }}>
            <option value="">全部</option>
            {(stats?.bySource ?? []).map((s) => (
              <option key={s.source} value={s.source}>{s.source}（{s.n}）</option>
            ))}
          </select>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>最低难度</div>
          <select value={diffMin} onChange={(e) => setDiffMin(e.target.value)} style={{ ...inputSt, marginBottom: 8 }}>
            <option value="">不限</option>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} · {DIFF_LABEL[d]}</option>)}
          </select>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>搜索（题干/答案/解析）</div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="关键词…"
            style={{ ...inputSt, marginBottom: 8 }}
          />

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>知识点</div>
          <input
            value={kp}
            onChange={(e) => setKp(e.target.value)}
            placeholder="如：二次函数"
            style={{ ...inputSt, marginBottom: 6 }}
          />
          {(stats?.byKp ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
              {stats!.byKp!.slice(0, 14).map((k) => (
                <button
                  key={k.kp}
                  onClick={() => setKp(kp === k.kp ? "" : k.kp)}
                  title={`${k.n} 道题`}
                  style={{
                    fontSize: 10.5, padding: "1px 6px", borderRadius: 9,
                    background: kp === k.kp ? "var(--accent)" : "var(--bg-secondary)",
                    color: kp === k.kp ? "#fff" : "var(--text-muted)",
                    border: "1px solid var(--bd)",
                  }}
                >
                  {k.kp}
                </button>
              ))}
            </div>
          )}

          {(type || source || kp || diffMin || keyword) && (
            <button
              onClick={() => { setType(""); setSource(""); setKp(""); setDiffMin(""); setKeyword(""); }}
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
            >
              清空筛选
            </button>
          )}
        </div>

        {/* ---- 中：题目列表 ---- */}
        <div style={{ flex: "1 1 auto", overflow: "auto", minWidth: 0, padding: "8px 12px" }}>
          {loading && <div className="tree-empty">载入中…</div>}
          {!loading && !list.length && (
            <div style={{ fontSize: 12.5, color: "var(--text-faint)", lineHeight: 2 }}>
              {stats?.total ? "当前筛选条件下没有题目。" : (
                <>
                  题库还是空的。点右上角「导入 Markdown 题目」开始。
                  <div style={{ marginTop: 8, fontSize: 11.5 }}>
                    题目格式（用 ### 分块，字段一行一个）：
                    <pre style={{
                      marginTop: 6, padding: "8px 10px", borderRadius: 5, fontSize: 11,
                      background: "var(--bg-secondary)", color: "var(--text-muted)",
                      whiteSpace: "pre-wrap", lineHeight: 1.7,
                    }}>{`### 第 1 题
题型：选择题
难度：3
知识点：二次函数, 顶点式
来源：广东中考
题干：
已知二次函数 y = a(x-h)² + k，顶点坐标是（  ）
A. (h, k)
B. (-h, k)
答案：A
解析：顶点式 y = a(x-h)² + k 的顶点就是 (h, k)。`}</pre>
                  </div>
                </>
              )}
            </div>
          )}

          {list.map((q) => {
            const inBasket = basket.some((x) => x.id === q.id);
            const open = openId === q.id;
            return (
              <div
                key={q.id}
                style={{
                  marginBottom: 8, padding: "8px 10px", borderRadius: 6,
                  background: inBasket ? "var(--accent-soft)" : "var(--bg-secondary)",
                  border: `1px solid ${inBasket ? "var(--accent)" : "var(--bd)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 10.5, color: "var(--text-faint)" }}>
                  <span>#{q.id}</span>
                  <span>{q.typeLabel}</span>
                  <span>难度 {q.difficulty} · {DIFF_LABEL[q.difficulty]}</span>
                  {q.source && <span>{q.source}{q.year ? ` ${q.year}` : ""}</span>}
                  {q.kps.length > 0 && <span>{q.kps.join("、")}</span>}
                  <div style={{ flex: "1 1 auto" }} />
                  <button
                    onClick={() => toggleBasket(q)}
                    style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 9,
                      background: inBasket ? "var(--accent)" : "var(--bg-primary)",
                      color: inBasket ? "#fff" : "var(--accent)",
                      border: "1px solid var(--accent)",
                    }}
                  >
                    {inBasket ? "已加入" : "加入组卷"}
                  </button>
                </div>

                <div style={{ fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{q.stem}</div>

                {q.options.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.9 }}>
                    {q.options.map((o) => (
                      <div key={o.label}>{o.label}. {o.text}</div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setOpenId(open ? null : q.id)}
                  style={{ marginTop: 5, fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
                >
                  {open ? "收起答案" : "看答案与解析"}
                </button>
                {open && (
                  <div style={{
                    marginTop: 5, padding: "6px 8px", borderRadius: 5, fontSize: 12,
                    background: "var(--bg-primary)", lineHeight: 1.8, whiteSpace: "pre-wrap",
                  }}>
                    <div><b>答案：</b>{q.answer || "（未填）"}</div>
                    {q.solution && <div style={{ marginTop: 3 }}><b>解析：</b>{q.solution}</div>}
                    <button
                      onClick={async () => {
                        if (!window.confirm("删除这道题？")) return;
                        await window.gezhi.bank.delete({ vault: vaultPath, id: q.id });
                        setBasket((b) => b.filter((x) => x.id !== q.id));
                        await refresh();
                      }}
                      style={{ marginTop: 5, fontSize: 11, color: "var(--red, #dc2626)", textDecoration: "underline" }}
                    >
                      删除这道题
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- 右：组卷篮 ---- */}
        <div style={{ width: 232, flex: "0 0 auto", borderLeft: "1px solid var(--bd)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>组卷篮</div>
            <input
              value={paperTitle}
              onChange={(e) => setPaperTitle(e.target.value)}
              placeholder="试卷标题（如：二次函数专项）"
              style={{ ...inputSt, marginBottom: 6 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, cursor: "pointer" }}>
              <input type="checkbox" checked={withAnswers} onChange={(e) => setWithAnswers(e.target.checked)} />
              卷末附答案与解析
            </label>
          </div>

          <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "6px 10px" }}>
            {!basket.length && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.8 }}>
                还没有选题。在左边的题上点「加入组卷」。
              </div>
            )}
            {basket.map((q, i) => (
              <div key={q.id} style={{
                display: "flex", alignItems: "flex-start", gap: 5,
                padding: "5px 0", borderBottom: "1px solid var(--bd)", fontSize: 11.5,
              }}>
                <span style={{ color: "var(--text-faint)", flex: "0 0 auto" }}>{i + 1}.</span>
                <span style={{ flex: "1 1 auto", minWidth: 0, lineHeight: 1.6 }}>
                  {q.stem.slice(0, 34)}{q.stem.length > 34 ? "…" : ""}
                </span>
                <button
                  onClick={() => toggleBasket(q)}
                  style={{ color: "var(--text-faint)", flex: "0 0 auto" }}
                  title="移出"
                >✕</button>
              </div>
            ))}
          </div>

          <div style={{ flex: "0 0 auto", padding: "8px 10px", borderTop: "1px solid var(--bd)" }}>
            {summary ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 6 }}>
                {summary.count} 题 · 平均难度 {summary.avgDiff} · 约 {summary.pages} 页
                <br />
                {summary.byType.map(([k, n]) => `${k} ${n}`).join(" · ")}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>还没选题</div>
            )}
            <button
              onClick={() => void exportPaper()}
              disabled={!basket.length || exporting}
              style={{
                width: "100%", padding: "7px 0", borderRadius: 6, fontSize: 12.5,
                background: !basket.length || exporting ? "var(--bg-secondary)" : "var(--accent)",
                color: !basket.length || exporting ? "var(--text-faint)" : "#fff",
                cursor: !basket.length || exporting ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {exporting ? "正在生成…" : "导出试卷 PDF"}
            </button>
            {basket.length > 0 && (
              <button
                onClick={() => setBasket([])}
                style={{ width: "100%", marginTop: 5, fontSize: 11, color: "var(--text-faint)" }}
              >
                清空组卷篮
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 把题目拼成试卷 Markdown。
 *
 * ★ 两个格式决定：
 *   1. **题干与选项之间空一行**：Typst 那边按段落排版，不空行会被拼成一坨
 *   2. 答案单独一节放在最后（可选）：老师印给学生时不能把答案夹在题目中间
 *
 * ★ 绝不出现"格致"字样 —— 这是产品硬规矩：
 *   学生拿到的是试卷，不是格致的广告。
 */
function buildPaperMarkdown(title: string, questions: BankQuestion[], { withAnswers }: { withAnswers: boolean }): string {
  const out: string[] = [];
  out.push(`# ${title}`);
  out.push("");
  const totalDiff = (questions.reduce((s, q) => s + q.difficulty, 0) / questions.length).toFixed(1);
  out.push(`共 ${questions.length} 题　平均难度 ${totalDiff}　满分 100 分　建议用时 ${Math.max(30, questions.length * 6)} 分钟`);
  out.push("");
  out.push("---");
  out.push("");

  // 题目按题型分组（选择题在前、解答题在后，这是卷子的常规顺序）
  const ORDER = ["choice", "fill", "calc", "answer", "proof"];
  const sorted = [...questions].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

  sorted.forEach((q, i) => {
    out.push(`**${i + 1}.** ${q.stem}`);
    out.push("");
    if (q.options.length) {
      for (const o of q.options) out.push(`${o.label}. ${o.text}`);
      out.push("");
    }
    // 留出作答空间（填空与解答题需要）
    if (q.type !== "choice") {
      out.push("");
      out.push("");
    }
  });

  if (withAnswers) {
    out.push("");
    out.push("---");
    out.push("");
    out.push("# 参考答案与解析");
    out.push("");
    sorted.forEach((q, i) => {
      out.push(`**${i + 1}.** ${q.answer || "（未填）"}`);
      if (q.solution) {
        out.push("");
        out.push(q.solution);
      }
      out.push("");
    });
  }

  return out.join("\n");
}
