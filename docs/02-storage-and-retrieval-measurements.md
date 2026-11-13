# Gezhi · Storage and Retrieval Kernel Measurements (SQLite / FTS5 Chinese Tokenization)

> All results are **measured on this machine**; the probe scripts are kept in `docs\templates\` and can be rerun.

## 1. Conclusions at a Glance

| Question | Measured conclusion |
| --- | --- |
| Can Node use SQLite directly without installing a native module? | **Yes**. Node v24.18.1's `node:sqlite` includes `DatabaseSync`; measured: can create tables, UPSERT and use `json_extract` directly |
| SQLite version | **3.53.1** (bundled with Node) |
| Is FTS5 available? | **Yes**. `create virtual table ... using fts5(...)` succeeds |
| Is JSON1 available? | **Yes** (`json_extract` returns correct values) |
| **Is Chinese full-text search available by default?** | **No (major pitfall)**. The default `unicode61` tokenizer treats a whole run of Chinese as one token; `match '全文检索'` **returns 0 rows** |
| Solution | **`tokenize='trigram'`**: Chinese and English substring searches all match |

## 2. Key Measured Output

### Probe 1: `docs\templates\_probe_node_sqlite.cjs`

```
node:sqlite OK; FTS5 OK; matched rows = []      ← Chinese search fails (see probe 2)
sqlite version = 3.53.1
json1 = F5
unicode61 / Chinese tokenization = []
```

### Probe 2: `docs\templates\_probe_fts_cjk.cjs`

```
[unicode61] match 全文检索 -> []                                   ← Chinese search finds nothing
[trigram]   match 全文检索 -> [{"body":"格致知识库中文全文检索测试"}]   ← match
[trigram]   match 情态动词 -> [{"body":"情态动词表示推测与义务的用法"}]  ← match
[trigram]   match verbs    -> [{"body":"modal verbs grammar exercise"}] ← English also matches
[after tokenization] match 全文    -> [{"body":"格致 知识库 中文 全文 检索 测试"}] ← pre-tokenization also works

Insert 200 rows x 14,400 chars: unicode61 61ms / trigram 73ms      ← write cost +20%
Chinese query: unicode61 -> 0 hits (0ms) / trigram -> 200 hits (1ms)  ← trigram query 1ms
```

## 3. Three Design Decisions Derived from the Measurements

1. **The storage layer does not introduce native modules.** Use `node:sqlite` (built in) to avoid the trouble with `better-sqlite3`-style modules where "prebuilt binaries do not match after a Node version upgrade, forcing on-site compilation" — [Tinacms hit this pitfall on Node 24](https://github.com/tinacms/tinacms/issues/6686), and [someone even submitted a dedicated PR to upgrade better-sqlite3 to obtain Node 24 Windows prebuilds](https://github.com/nexu-io/open-design/pull/357). The fallback (in case extensions or higher performance are needed) is `better-sqlite3` (currently 13.0.3).
2. **All full-text indexes use `tokenize='trigram'`.** This is not an optimization but a **necessity**: under the default tokenizer, Chinese search effectively does not exist. The cost is only about 20% slower writes and a slightly larger index, in exchange for Chinese substring searches matching at the 1 ms level.
   - If higher-quality Chinese tokenization is needed later, add a second index of "jieba pre-segmentation + unicode61" for **word-level** recall, and fuse and rank the results of the two indexes (trigram is responsible for "can find it", the tokenized index for "ranks accurately").
3. **Vector search is a second-class citizen; do not make it a precondition.** First get textbook retrieval working with trigram + keywords + LLM reranking; introduce `sqlite-vec` only when measurements show "keyword recall is clearly insufficient" (note the community-maintained fork and prebuild situation: [photostructure/sqlite-vec](https://github.com/photostructure/sqlite-vec)), or fall back to LanceDB. Rationale: Gezhi must be installable on an ordinary student computer, so the fewer dependencies the better.

## 4. Knock-On Effects on Other Document Chapters

- The knowledge base's `chunks` table must have a separate FTS table for trigram (`chunks_fts`), retaining a `rowid` mapping; the tokenize parameter of `create virtual table` **cannot be changed after table creation**, so it must be fixed once in the P7 database-creation script, with a migration script to guard against early versions mistakenly using unicode61.
- Textbook scale estimate (for capacity planning): if there are 12 grades × about 10 subjects, about 200 pages per subject and about 600 characters per page, the total is about **14.4 million characters**. Estimating trigram index inflation, plain text + index should be roughly in the **hundreds of MB** range (not measured; marked as an estimate), which can be stored locally without a server.
