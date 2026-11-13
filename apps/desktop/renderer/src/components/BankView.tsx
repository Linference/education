// Question bank and paper assembly
//
// Three panes: filters on the left · question list in the middle · paper basket on the right
//
// ★ Paper output must be a **print-ready PDF**, and product rules are strict:
//   the generated paper carries **no product branding** (the word "Gezhi" must not appear).
//   So we reuse the existing Typst export pipeline (templates/typst/handout.typ)
//   instead of assembling HTML ourselves and converting it.
//
// ★ Why a "paper basket" instead of exporting straight from checkboxes:
//   assembling a paper is iterative (drop this one, add a harder one),
//   and the basket shows the count, total score and lets you remove a question —
//   exporting immediately would make people afraid to click.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BankQuestion, BankStats } from "../types";

interface Props {
  vaultPath: string | null;
  onOpen?: (path: string) => void;
  onPractice?: (id: number, previewedAnswer?: boolean) => void;
}

const DIFF_LABEL = ["", "Very easy", "Easy", "Medium", "Hard", "Very hard"];

/** Rough number of questions per page (used to warn whether the paper will be too long) */
const PER_PAGE_GUESS = 6;

export default function BankView({ vaultPath, onPractice }: Props) {
  const viewedAnswers = useRef(new Set<number>());
  const [stats, setStats] = useState<BankStats | null>(null);
  const [list, setList] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter conditions
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [kp, setKp] = useState("");
  const [diffMin, setDiffMin] = useState("");
  const [keyword, setKeyword] = useState("");

  // Paper basket
  const [basket, setBasket] = useState<BankQuestion[]>([]);
  const [paperTitle, setPaperTitle] = useState("");
  const [withAnswers, setWithAnswers] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Question whose solution is expanded */
  const [openId, setOpenId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview,setImportPreview] = useState<{ name: string; questions: Array<Record<string,unknown>>; warnings: string[] } | null>(null);
  const [importBusy,setImportBusy] = useState(false);
  const [skipDuplicates,setSkipDuplicates] = useState(true);
  const importAlive = useRef(true);
  useEffect(() => { importAlive.current = true; return () => { importAlive.current = false; }; }, []);
  const refreshSequence = useRef(0);
  useEffect(() => () => { refreshSequence.current++; }, []);

  const refresh = useCallback(async () => {
    const seq = ++refreshSequence.current;
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
      if (seq !== refreshSequence.current) return;
      if (!s.ok || !l.ok) throw new Error(s.error || l.error || 'Failed to load the question bank');
      setStats(s);
      setList(l.questions ?? []);
      setTotal(l.total ?? 0);
    } catch (e: any) {
      if (seq !== refreshSequence.current) return;
      setErr(e?.message ?? String(e));
    } finally {
      if (seq === refreshSequence.current) setLoading(false);
    }
  }, [vaultPath, type, source, kp, diffMin, keyword]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Basket totals: average difficulty and question count */
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

  /** Import: pick a Markdown file → parse → confirm → add to the bank */
  const importFile = async (file: File) => {
    if (!vaultPath) { setErr("Open a library first"); return; }
    setNotice(null);
    setErr(null);
    setImportBusy(true);
    try {
      if (file.size > 32 * 1024 * 1024) { setErr('The file exceeds 32 MB; split it and import the parts separately'); return; }
      const r = await window.gezhi.bank.parseDocument({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      if (!importAlive.current) return;
      if (!r.ok) { setErr(r.error ?? "Parsing failed"); return; }
      if (!r.count) {
        setNotice("No questions could be parsed from this file. Separate blocks with ### and write the fields as in \"题型：选择题\" (field names must stay in Chinese).");
        return;
      }
      setImportPreview({ name:file.name,questions:r.questions || [],warnings:r.warnings || [] });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { if (importAlive.current) setImportBusy(false); }
  };
  const confirmImport = async () => {
    if (!vaultPath || !importPreview || importBusy) return;
    setImportBusy(true); setErr(null);
    try {
      const add = await window.gezhi.bank.addMany({ vault:vaultPath,questions:importPreview.questions,skipDuplicates });
      if (!importAlive.current) return;
      if (!add.ok) throw new Error(add.error || 'Import failed');
      setNotice(`Imported ${add.added} questions${add.skipped ? `, skipped ${add.skipped} duplicates` : ''}${add.failed?.length ? `, ${add.failed.length} failed` : ''}.`);
      setImportPreview(null); await refresh();
    } catch (e) { if (importAlive.current) setErr((e as Error).message); }
    finally { if (importAlive.current) setImportBusy(false); }
  };

  /**
   * Export the assembled paper as PDF.
   *
   * ★ Build Markdown and reuse the existing export pipeline (Typst) rather than writing PDF ourselves:
   *   that pipeline already handles CJK typesetting, formulas, page numbers and tables of contents,
   *   and it adds **no product branding** (a hard product rule).
   */
  const exportPaper = async () => {
    if (!basket.length) return;
    if (!vaultPath) { setErr("Open a library first"); return; }
    setExporting(true);
    setErr(null);
    setNotice(null);
    try {
      const title = paperTitle.trim() || "Exam Paper";
      const md = buildPaperMarkdown(title, basket, { withAnswers });

      /*
       * The paper is exported to the **system Downloads folder**, not the library folder.
       *
       * The user just wants "a paper" (to print or hand out),
       * which is **file delivery**, not adding something to the knowledge base.
       * Mixing it into the library would get it indexed and shown in the file tree, cluttering the library.
       *
       * The path is resolved by the main process via app.getPath("downloads") —
       * we do not build "C:\Users\x\Downloads" here, because the user may have moved Downloads
       * or group policy may redirect it (this machine's Documents folder is redirected).
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
        setErr(`Export failed: ${r.error ?? "Unknown reason"}`);
        return;
      }
      // Remember this paper so the user can create a matching one later
      await window.gezhi.bank.savePaper({
        vault: vaultPath,
        title,
        qids: basket.map((q) => q.id),
        config: { type, source, kp, diffMin },
      }).catch(() => null);

      setNotice(`Exported to the Downloads folder: ${r.path ?? "(path unknown)"} (${basket.length} questions)`);
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

  if (!vaultPath) return <div className="tree-empty">Open a library to use the question bank</div>;

  return (
    <div className="bank-view" data-testid="bank-view" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {importPreview && <div className="bank-import-backdrop"><section className="bank-import-preview" role="dialog" aria-modal="true" aria-labelledby="bank-import-title"><header><div><span className="learning-eyebrow">REVIEW BEFORE IMPORT</span><h2 id="bank-import-title">Check the questions before importing</h2><p>{importPreview.name} · {importPreview.questions.length} questions found</p></div><button disabled={importBusy} onClick={() => setImportPreview(null)}>Cancel import</button></header>{importPreview.warnings.map((w,i) => <p className="learning-callout" key={i}>{w}</p>)}<p className="learning-muted">Check the order, formulas, and options from the PDF / Word file. Scanned PDFs need OCR first; the app will not invent an answer that is missing.</p><div className="bank-import-list">{importPreview.questions.map((q,i) => <article key={i}><h3>Question {i+1} <button onClick={() => setImportPreview(p => p && {...p,questions:p.questions.filter((_,index) => index!==i)})}>Remove</button></h3>{[['stem','Question stem'],['answer','Answer'],['solution','Explanation']].map(([field,label]) => <label key={field}>{label}<textarea aria-label={`Import question ${i+1} ${label}`} value={String(q[field] || '')} rows={field==='stem'?3:2} onChange={e => setImportPreview(p => p && {...p,questions:p.questions.map((item,index) => index===i ? {...item,[field]:e.target.value} : item)})} /></label>)}{Array.isArray(q.options) && q.options.length>0 && <div className="import-options">{(q.options as Array<{label:string;text:string}>).map((o,j) => <label key={j}>{o.label}<input aria-label={`Import question ${i+1} option ${o.label}`} value={o.text} onChange={e => setImportPreview(p => p && {...p,questions:p.questions.map((item,index) => index===i ? {...item,options:(item.options as typeof q.options).map((option: typeof o, oi: number) => oi===j ? {...option,text:e.target.value} : option)} : item)})} /></label>)}</div>}<small>{String(q.subject || 'Subject not marked')} · {Array.isArray(q.kps) ? q.kps.join(', ') : 'Knowledge point not marked'} · {String(q.source || 'Source not marked')}</small></article>)}</div><footer><label><input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} /> Skip duplicates already in the bank with the same stem, options, and answer</label><button className="learning-primary" disabled={importBusy || !importPreview.questions.length} onClick={() => void confirmImport()}>{importBusy ? 'Importing…' : `Import ${importPreview.questions.length} questions`}</button></footer></section></div>}
      {/* 顶栏 */}
      <div className="bank-toolbar" style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderBottom: "1px solid var(--bd)",
        background: "var(--bg-secondary)", fontSize: 12,
      }}>
        <span style={{ fontWeight: 600 }}>Question Bank</span>
        <span style={{ color: "var(--text-muted)" }}>
          {stats?.total ? `${stats.total} questions` : "No questions yet"}
          {total !== stats?.total ? ` · ${total} in the current filter` : ""}
        </span>
        <div style={{ flex: "1 1 auto" }} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,.docx,.pdf,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />
        <button
          disabled={importBusy}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "4px 10px", borderRadius: 5, fontSize: 12,
            background: "var(--accent)", color: "var(--on-accent)",
          }}
        >
          {importBusy ? 'Reading…' : 'Import questions'}
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

      <div className="bank-layout" style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        {/* ---- 左：筛选 ---- */}
        <div className="bank-filters" style={{ width: 200, flex: "0 0 auto", borderRight: "1px solid var(--bd)", overflow: "auto", padding: "8px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5 }}>Filters</div>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Question type</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputSt, marginBottom: 8 }}>
            <option value="">All</option>
            {(stats?.byType ?? []).map((t) => (
              <option key={t.type} value={t.type}>{t.type}（{t.n}）</option>
            ))}
          </select>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Source</div>
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ ...inputSt, marginBottom: 8 }}>
            <option value="">All</option>
            {(stats?.bySource ?? []).map((s) => (
              <option key={s.source} value={s.source}>{s.source}（{s.n}）</option>
            ))}
          </select>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Minimum difficulty</div>
          <select value={diffMin} onChange={(e) => setDiffMin(e.target.value)} style={{ ...inputSt, marginBottom: 8 }}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} · {DIFF_LABEL[d]}</option>)}
          </select>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Search (question / answer / explanation)</div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Keywords…"
            style={{ ...inputSt, marginBottom: 8 }}
          />

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Knowledge point</div>
          <input
            value={kp}
            onChange={(e) => setKp(e.target.value)}
            placeholder="e.g. quadratic functions"
            style={{ ...inputSt, marginBottom: 6 }}
          />
          {(stats?.byKp ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
              {stats!.byKp!.slice(0, 14).map((k) => (
                <button
                  key={k.kp}
                  onClick={() => setKp(kp === k.kp ? "" : k.kp)}
                  title={`${k.n} questions`}
                  style={{
                    fontSize: 10.5, padding: "1px 6px", borderRadius: 9,
                    background: kp === k.kp ? "var(--accent)" : "var(--bg-secondary)",
                    color: kp === k.kp ? "var(--on-accent)" : "var(--text-muted)",
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
              Clear filters
            </button>
          )}
        </div>

        {/* ---- 中：题目列表 ---- */}
        <div className="bank-list" style={{ flex: "1 1 auto", overflow: "auto", minWidth: 0, padding: "8px 12px" }}>
          {loading && <div className="tree-empty">Loading…</div>}
          {!loading && !list.length && (
            <div style={{ fontSize: 12.5, color: "var(--text-faint)", lineHeight: 2 }}>
              {stats?.total ? "No questions match the current filters." : (
                <>
                  The question bank is still empty. Click "Import questions" at the top right to start; Markdown, Word, text PDF, TXT and JSON are supported.
                  <div style={{ marginTop: 8, fontSize: 11.5 }}>
                    Question format (blocks separated by ###, one field per line — field names must stay in Chinese):
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
                className="bank-question"
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
                  <span>Difficulty {q.difficulty} · {DIFF_LABEL[q.difficulty]}</span>
                  {q.source && <span>{q.source}{q.year ? ` ${q.year}` : ""}</span>}
                  {q.kps.length > 0 && <span>{q.kps.join("、")}</span>}
                  <div style={{ flex: "1 1 auto" }} />
                  <button
                    onClick={() => toggleBasket(q)}
                    style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 9,
                      background: inBasket ? "var(--accent)" : "var(--bg-primary)",
                      color: inBasket ? "var(--on-accent)" : "var(--accent)",
                      border: "1px solid var(--accent)",
                    }}
                  >
                    {inBasket ? "Added" : "Add to paper"}
                  </button>
                  {onPractice && <button className="bank-practice-button" onClick={() => onPractice(q.id, viewedAnswers.current.has(q.id))}>Record confidence practice</button>}
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
                  onClick={() => { if (!open) viewedAnswers.current.add(q.id); setOpenId(open ? null : q.id); }}
                  style={{ marginTop: 5, fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
                >
                  {open ? "Hide the answer" : "Show answer and explanation"}
                </button>
                {open && (
                  <div style={{
                    marginTop: 5, padding: "6px 8px", borderRadius: 5, fontSize: 12,
                    background: "var(--bg-primary)", lineHeight: 1.8, whiteSpace: "pre-wrap",
                  }}>
                    <div><b>Answer:</b> {q.answer || "(not filled in)"}</div>
                    {q.solution && <div style={{ marginTop: 3 }}><b>Explanation:</b> {q.solution}</div>}
                    <button
                      onClick={async () => {
                        if (!window.confirm("Delete this question?")) return;
                        await window.gezhi.bank.delete({ vault: vaultPath, id: q.id });
                        setBasket((b) => b.filter((x) => x.id !== q.id));
                        await refresh();
                      }}
                      style={{ marginTop: 5, fontSize: 11, color: "var(--red, #dc2626)", textDecoration: "underline" }}
                    >
                      Delete this question
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- 右：组卷篮 ---- */}
        <div className="bank-basket" style={{ width: 232, flex: "0 0 auto", borderLeft: "1px solid var(--bd)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>Paper basket</div>
            <input
              value={paperTitle}
              onChange={(e) => setPaperTitle(e.target.value)}
              placeholder="Paper title (e.g. Quadratic functions)"
              style={{ ...inputSt, marginBottom: 6 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, cursor: "pointer" }}>
              <input type="checkbox" checked={withAnswers} onChange={(e) => setWithAnswers(e.target.checked)} />
              Append answers and explanations at the end
            </label>
          </div>

          <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "6px 10px" }}>
            {!basket.length && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.8 }}>
                Nothing selected yet. Click "Add to paper" on a question on the left.
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
                  title="Remove"
                >✕</button>
              </div>
            ))}
          </div>

          <div style={{ flex: "0 0 auto", padding: "8px 10px", borderTop: "1px solid var(--bd)" }}>
            {summary ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 6 }}>
                {summary.count} questions · average difficulty {summary.avgDiff} · about {summary.pages} pages
                <br />
                {summary.byType.map(([k, n]) => `${k} ${n}`).join(" · ")}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>No questions selected</div>
            )}
            <button
              onClick={() => void exportPaper()}
              disabled={!basket.length || exporting}
              style={{
                width: "100%", padding: "7px 0", borderRadius: 6, fontSize: 12.5,
                background: !basket.length || exporting ? "var(--bg-secondary)" : "var(--accent)",
                color: !basket.length || exporting ? "var(--text-faint)" : "var(--on-accent)",
                cursor: !basket.length || exporting ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {exporting ? "Generating…" : "Export paper PDF"}
            </button>
            {basket.length > 0 && (
              <button
                onClick={() => setBasket([])}
                style={{ width: "100%", marginTop: 5, fontSize: 11, color: "var(--text-faint)" }}
              >
                Clear basket
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
  out.push(`${questions.length} questions · average difficulty ${totalDiff} · out of 100 · suggested time ${Math.max(30, questions.length * 6)} minutes`);
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
    out.push("# Answers and explanations");
    out.push("");
    sorted.forEach((q, i) => {
      out.push(`**${i + 1}.** ${q.answer || "(not filled in)"}`);
      if (q.solution) {
        out.push("");
        out.push(q.solution);
      }
      out.push("");
    });
  }

  return out.join("\n");
}
