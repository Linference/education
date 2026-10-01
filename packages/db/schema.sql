-- 格致 · SQLite 库结构（gezhi.db）
-- 设计要点：
--   1. 时间一律 ISO-8601 TEXT，用 julianday() 求差（SQLite 无 date/time 类型）
--   2. 每个连接都要 PRAGMA foreign_keys=ON（默认是关的）
--   3. 中文检索必须双索引：trigram 负责"找得到"，jieba 预分词 + unicode61 负责"排得准"
--      原因：unicode61 把汉字视为 token 字符（Lo 属 L*），中文无空格 → 整句变一个 token
--   4. events 与 tasks 严格分离：固定日程不可被 AI 重排

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ---------------------------------------------------------------- 库与文件

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vaults (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  root_path   TEXT NOT NULL UNIQUE,
  subject     TEXT,
  grade       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY,
  vault_id    TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,                 -- 相对库根，统一用 /
  ext         TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- md/pdf/docx/xlsx/ipynb/img/other
  size        INTEGER NOT NULL DEFAULT 0,
  mtime       TEXT,
  hash        TEXT,
  title       TEXT,
  page_count  INTEGER,
  status      TEXT NOT NULL DEFAULT 'new',   -- new/indexed/failed/skipped
  indexed_at  TEXT,
  UNIQUE (vault_id, path)
);
CREATE INDEX IF NOT EXISTS idx_files_kind   ON files(vault_id, kind);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(vault_id, status);

CREATE TABLE IF NOT EXISTS links (
  id           INTEGER PRIMARY KEY,
  vault_id     TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  src_file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  dst_path     TEXT NOT NULL,                -- wikilink 里的原始文本
  dst_file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,  -- 解析不到就 NULL（禁止幽灵边）
  kind         TEXT NOT NULL,                -- wikilink/embed/heading/block
  line         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_file_id);
CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_file_id);
CREATE INDEX IF NOT EXISTS idx_links_dstpath ON links(vault_id, dst_path);

CREATE TABLE IF NOT EXISTS tags (
  id       INTEGER PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,                    -- 不含 #，保留层级如 语法/情态动词
  color    TEXT,
  UNIQUE (vault_id, name)
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (file_id, tag_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id        INTEGER PRIMARY KEY,
  file_id   INTEGER REFERENCES files(id) ON DELETE CASCADE,
  mime      TEXT,
  bytes_path TEXT NOT NULL,
  sha256    TEXT
);

-- 属性类型是"库级全局"的（照 Obsidian 语义：同一 key 全库共用一个类型）
CREATE TABLE IF NOT EXISTS vault_properties (
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  type     TEXT NOT NULL,                    -- text/number/date/checkbox/list
  default_value TEXT,
  note     TEXT,
  PRIMARY KEY (vault_id, key)
);

CREATE TABLE IF NOT EXISTS file_properties (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT,
  PRIMARY KEY (file_id, key)
);

-- ---------------------------------------------------------------- 知识库（教材）

CREATE TABLE IF NOT EXISTS books (
  id           INTEGER PRIMARY KEY,
  vault_id     TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  publisher    TEXT,                          -- 人教/…
  subject      TEXT,
  grade        TEXT,
  volume       TEXT,
  isbn         TEXT,
  source       TEXT NOT NULL,                 -- official_api/imported/self_made
  license_note TEXT,
  file_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
  page_count   INTEGER,
  has_text_layer INTEGER,                     -- 文本层探针结果：1 有 / 0 无（需 OCR）/ NULL 未测
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_books_subject ON books(subject, grade);

CREATE TABLE IF NOT EXISTS chapters (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  level      INTEGER NOT NULL DEFAULT 1,
  no         TEXT,
  title      TEXT NOT NULL,
  start_page INTEGER,
  end_page   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, level);
CREATE INDEX IF NOT EXISTS idx_chapters_parent ON chapters(parent_id);

CREATE TABLE IF NOT EXISTS pages (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  page_no    INTEGER NOT NULL,
  text       TEXT,
  ocr_used   INTEGER NOT NULL DEFAULT 0,
  ocr_conf   REAL,
  image_path TEXT,
  UNIQUE (book_id, page_no)
);
CREATE INDEX IF NOT EXISTS idx_pages_chapter ON pages(chapter_id);

CREATE TABLE IF NOT EXISTS chunks (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  page_from  INTEGER NOT NULL,
  page_to    INTEGER NOT NULL,
  text       TEXT NOT NULL,                   -- 原文
  text_seg   TEXT,                            -- jieba 预分词后以空格连接
  tokens     INTEGER,
  kp_ids     TEXT                             -- JSON 数组
);
CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(book_id, page_from);

-- 双索引。注意：tokenize 参数建表后不可改，改动需重建表。
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts_trigram USING fts5(
  text,
  content='chunks',
  content_rowid='id',
  tokenize='trigram'
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts_word USING fts5(
  text_seg,
  content='chunks',
  content_rowid='id',
  tokenize='unicode61'
);

-- 触发器：让两张 FTS 表跟随 chunks 自动同步
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts_trigram(rowid, text)     VALUES (new.id, new.text);
  INSERT INTO chunks_fts_word(rowid, text_seg)    VALUES (new.id, coalesce(new.text_seg, ''));
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts_trigram(chunks_fts_trigram, rowid, text)  VALUES ('delete', old.id, old.text);
  INSERT INTO chunks_fts_word(chunks_fts_word, rowid, text_seg)    VALUES ('delete', old.id, coalesce(old.text_seg, ''));
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts_trigram(chunks_fts_trigram, rowid, text)  VALUES ('delete', old.id, old.text);
  INSERT INTO chunks_fts_word(chunks_fts_word, rowid, text_seg)    VALUES ('delete', old.id, coalesce(old.text_seg, ''));
  INSERT INTO chunks_fts_trigram(rowid, text)     VALUES (new.id, new.text);
  INSERT INTO chunks_fts_word(rowid, text_seg)    VALUES (new.id, coalesce(new.text_seg, ''));
END;

CREATE TABLE IF NOT EXISTS knowledge_points (
  id         TEXT PRIMARY KEY,                -- 如 kp:eng:modal-verbs
  subject    TEXT NOT NULL,
  grade      TEXT,
  name       TEXT NOT NULL,
  description TEXT,
  difficulty INTEGER,                         -- 1..5
  source     TEXT,                            -- curriculum/outline/llm/manual
  key_points TEXT,                            -- JSON 数组：费曼评分要用的"该讲的得分点"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_subject ON knowledge_points(subject, grade);

CREATE TABLE IF NOT EXISTS kp_edges (
  from_kp TEXT NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  to_kp   TEXT NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,                      -- prereq/contains/related
  weight  REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (from_kp, to_kp, kind)
);
CREATE INDEX IF NOT EXISTS idx_kp_edges_to ON kp_edges(to_kp);

-- ---------------------------------------------------------------- 题库

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY,
  vault_id    TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  type        TEXT NOT NULL,                  -- choice/fill/judge/calc/proof/code
  stem_md     TEXT NOT NULL,
  options     TEXT,                           -- JSON 数组
  answer      TEXT,
  explanation TEXT,                           -- 可含三段式题解
  difficulty  INTEGER,                        -- 1..5
  year        INTEGER,
  source      TEXT NOT NULL,                  -- 广东中考/广东高考/港澳台联考/四校联考/澳门保送/CSP/AI生成/自建
  region      TEXT,
  license_note TEXT,
  crop_image  TEXT,                           -- 原题扫描图（"结构化文本保检索 + 原图保真"双轨）
  hash        TEXT UNIQUE,                    -- 去重
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_q_subject ON questions(subject, type, difficulty);
CREATE INDEX IF NOT EXISTS idx_q_source  ON questions(source, year);

CREATE TABLE IF NOT EXISTS question_kps (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  kp_id       TEXT NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  weight      REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (question_id, kp_id)
);

CREATE TABLE IF NOT EXISTS papers (
  id          INTEGER PRIMARY KEY,
  vault_id    TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,                  -- exam/quiz/homework
  subject     TEXT,
  blueprint   TEXT,                           -- JSON：知识点覆盖 + 难度分布 + 题型配比
  duration_min INTEGER,
  total_score INTEGER,
  created_by  TEXT NOT NULL DEFAULT 'user',   -- user/ai
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_items (
  paper_id    INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  section     TEXT,
  no          INTEGER NOT NULL,
  score       INTEGER,
  snapshot_md TEXT,                           -- 组卷时的题干快照（题库改了也不影响已出卷）
  PRIMARY KEY (paper_id, no)
);

CREATE TABLE IF NOT EXISTS paper_exports (
  id              INTEGER PRIMARY KEY,
  paper_id        INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  md_path         TEXT,
  pdf_path        TEXT,
  answer_pdf_path TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- 费曼评分

CREATE TABLE IF NOT EXISTS feynman_sessions (
  id              TEXT PRIMARY KEY,
  vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  kp_id           TEXT REFERENCES knowledge_points(id) ON DELETE SET NULL,
  mode            TEXT NOT NULL,              -- voice/text
  state           TEXT NOT NULL DEFAULT 'idle',
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  dsh_session_id  TEXT                        -- 关联 DSH 的会话
);

CREATE TABLE IF NOT EXISTS feynman_attempts (
  id             INTEGER PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES feynman_sessions(id) ON DELETE CASCADE,
  transcript     TEXT NOT NULL,
  transcript_words TEXT,                      -- JSON：词级时间戳（TTS EnableSubtitle 也给字级）
  audio_path     TEXT,
  rubric_json    TEXT,                        -- JSON：6 维分数 + evidence_quote + evidence_start_ms
  total_score    REAL,
  level          TEXT,                        -- 未掌握/初步/熟练/可教别人
  gaps_json      TEXT,                        -- JSON：missing/wrong/vague 三类
  followups_json TEXT,
  improved_from  REAL,                        -- 多轮取最优前的分数
  model          TEXT,
  latency_ms     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON feynman_attempts(session_id);

CREATE TABLE IF NOT EXISTS mastery (
  kp_id          TEXT PRIMARY KEY REFERENCES knowledge_points(id) ON DELETE CASCADE,
  score          REAL NOT NULL DEFAULT 0,     -- 0..100
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_at        TEXT,
  trend          REAL,
  next_review_at TEXT,
  fsrs_state     TEXT                         -- JSON
);

-- ---------------------------------------------------------------- 计划与日历

CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY,
  vault_id      TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  subject       TEXT,
  target_kp_ids TEXT,                         -- JSON
  deadline      TEXT,
  daily_minutes INTEGER,
  status        TEXT NOT NULL DEFAULT 'active',
  priority      INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,
  goal_id       TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES plans(id) ON DELETE CASCADE,
  level         TEXT NOT NULL,                -- milestone/week/day
  title         TEXT NOT NULL,
  planned_start TEXT,
  planned_end   TEXT,
  est_minutes   INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_plans_goal   ON plans(goal_id, level);
CREATE INDEX IF NOT EXISTS idx_plans_parent ON plans(parent_id);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT REFERENCES plans(id) ON DELETE SET NULL,
  vault_id       TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'study', -- study/review/exam/rest
  est_minutes    INTEGER,
  due_at         TEXT,
  done_at        TEXT,
  source         TEXT NOT NULL DEFAULT 'manual', -- manual/ai/fsrs
  ref_kp_id      TEXT REFERENCES knowledge_points(id) ON DELETE SET NULL,
  ref_question_ids TEXT                       -- JSON
);
CREATE INDEX IF NOT EXISTS idx_tasks_due  ON tasks(vault_id, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(vault_id, done_at);

-- events 与 tasks 严格分离：固定日程不可被 AI 重排
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL,              -- class/exam/activity
  start_at        TEXT NOT NULL,
  end_at          TEXT,
  rrule           TEXT,                       -- RFC 5545
  location        TEXT,
  remind_before_min INTEGER,
  is_blocking     INTEGER NOT NULL DEFAULT 1  -- 是否占用可学习时间
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(vault_id, start_at);

CREATE TABLE IF NOT EXISTS countdowns (
  id          TEXT PRIMARY KEY,
  vault_id    TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  date        TEXT,                           -- 公历日期
  lunar_month INTEGER,                        -- 农历生日用
  lunar_day   INTEGER,
  is_leap     INTEGER DEFAULT 0,
  color       TEXT,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY,
  vault_id      TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  kp_id         TEXT REFERENCES knowledge_points(id) ON DELETE CASCADE,
  question_id   INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  due_at        TEXT NOT NULL,
  interval_days REAL,
  ease          REAL,
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0,
  fsrs_card     TEXT                          -- JSON
);
CREATE INDEX IF NOT EXISTS idx_reviews_due ON reviews(vault_id, due_at);

-- AI 拆解可回滚与 A/B 对比
CREATE TABLE IF NOT EXISTS ai_plan_runs (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT REFERENCES goals(id) ON DELETE CASCADE,
  prompt      TEXT,
  model       TEXT,
  output_json TEXT,
  applied     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions_stat (
  day          TEXT PRIMARY KEY,              -- YYYY-MM-DD
  vault_id     TEXT REFERENCES vaults(id) ON DELETE SET NULL,
  minutes      INTEGER NOT NULL DEFAULT 0,
  tasks_done   INTEGER NOT NULL DEFAULT 0,
  feynman_avg  REAL,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  cost_cny     REAL NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- 对话索引
-- 正文由 DSH 的 JSONL 会话保存，本表只做列表与检索

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  vault_id        TEXT REFERENCES vaults(id) ON DELETE SET NULL,
  title           TEXT,
  module          TEXT,                       -- vault/feynman/exam/plan
  dsh_session_id  TEXT UNIQUE,
  cwd_vault_id    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_at         TEXT,
  tokens_total    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conv_last ON conversations(last_at);

CREATE TABLE IF NOT EXISTS messages_index (
  id              INTEGER PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  text_preview    TEXT,
  tool_calls      TEXT,                       -- JSON
  tokens          INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msgs_conv ON messages_index(conversation_id, id);

-- 记录本库由哪个版本的结构创建，便于日后迁移
INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('schema_version', '1');
INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('built_with_sqlite', (SELECT sqlite_version()));
