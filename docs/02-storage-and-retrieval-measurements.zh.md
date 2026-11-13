# 格致 · 存储与检索内核实测（SQLite / FTS5 中文分词）

> 全部为**本机实测**，探针脚本保留在 `docs\templates\`，可复跑。

## 一、结论速览

| 问题 | 实测结论 |
| --- | --- |
| Node 能否直接用 SQLite，不装原生模块？ | **能**。Node v24.18.1 的 `node:sqlite` 内置 `DatabaseSync`，实测可直接建表、UPSERT、`json_extract` |
| SQLite 版本 | **3.53.1**（随 Node 内置） |
| FTS5 是否可用？ | **可用**。`create virtual table ... using fts5(...)` 成功 |
| JSON1 是否可用？ | **可用**（`json_extract` 返回正确值） |
| **中文全文检索默认可用吗？** | **不可用（重大坑）**。默认 `unicode61` 分词器把整段中文当一个 token，`match '全文检索'` **返回 0 条** |
| 解决方案 | **`tokenize='trigram'`**：中文、英文子串检索全部命中 |

## 二、关键实测输出

### 探针 1：`docs\templates\_probe_node_sqlite.cjs`

```
node:sqlite OK; FTS5 OK; matched rows = []      ← 中文检索失败（见探针 2）
sqlite version = 3.53.1
json1 = F5
unicode61 / 中文分词 = []
```

### 探针 2：`docs\templates\_probe_fts_cjk.cjs`

```
[unicode61] match 全文检索 -> []                                   ← 中文检索不到
[trigram]   match 全文检索 -> [{"body":"格致知识库中文全文检索测试"}]   ← 命中
[trigram]   match 情态动词 -> [{"body":"情态动词表示推测与义务的用法"}]  ← 命中
[trigram]   match verbs    -> [{"body":"modal verbs grammar exercise"}] ← 英文也命中
[分词后]     match 全文    -> [{"body":"格致 知识库 中文 全文 检索 测试"}] ← 预分词也有效

200 条 x 14400 字插入：unicode61 61ms / trigram 73ms      ← 写入代价 +20%
中文查询：unicode61 -> 0 命中 (0ms) / trigram -> 200 命中 (1ms)  ← trigram 查询 1ms
```

## 三、由实测倒推的三条设计决定

1. **存储层不引入原生模块**。用 `node:sqlite`（内置），避免 `better-sqlite3` 那类「Node 版本升级后预编译二进制对不上、被迫现场编译」的麻烦——[Tinacms 在 Node 24 上就踩过这个坑](https://github.com/tinacms/tinacms/issues/6686)、[也有人专门发 PR 升级 better-sqlite3 以获得 Node 24 Windows 预编译](https://github.com/nexu-io/open-design/pull/357)。备选（万一需要扩展或更高性能）才是 `better-sqlite3`（当前 13.0.3）。
2. **全文索引一律用 `tokenize='trigram'`**。这条不是优化，是**必需**：默认分词器下中文检索等于没有。代价只有写入慢约 20%、索引体积略增，换来中文子串检索 1ms 级命中。
   - 若后续要更高质量的中文分词，再叠加「jieba 预切分 + unicode61」的第二个索引做**词级**召回，两个索引结果融合排序（trigram 负责「找得到」，分词索引负责「排得准」）。
3. **向量检索是二等公民，别把它设成前置条件**。先用 trigram + 关键词 + LLM 重排把教材检索跑通；只有实测「关键词召回明显不够」时才引入 `sqlite-vec`（注意社区维护分支与预编译情况：[photostructure/sqlite-vec](https://github.com/photostructure/sqlite-vec)），或退到 LanceDB。理由：格致要能在一台普通学生电脑上装起来，依赖越少越好。

## 四、对文档其他章节的连带影响

- 知识库的 `chunks` 表必须为 trigram 建独立 FTS 表（`chunks_fts`），并保留 `rowid` 映射；`create virtual table` 时 tokenize 参数**建表后不可改**，因此要在 P7 建库脚本里一次定死，并写迁移脚本以防早期版本误用 unicode61。
- 教材规模预估（供容量规划）：若 12 个年级 × 约 10 科、每科约 200 页、每页约 600 字，合计约 **1,440 万字**。按 trigram 索引膨胀估算，纯文本 + 索引大致在 **数百 MB** 量级（未实测，标注为估算），可本地存放，无需服务端。
