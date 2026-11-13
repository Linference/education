# 04 · Research on Textbook and Question-Bank Data Sources

> Codename "Gezhi" · Windows desktop learning application · Research on data sources and data pipelines
> Research date: 2026-09 (all URLs and numbers in this document were obtained through **hands-on measurement during this research**)
> Nature of this report: **research and solution design**. This work **did not crawl, bulk-download, or distribute any copyrighted content**.
>
> **Notation conventions**
> - **[Fact]** = obtained through actual access/measurement/query during this research, with a verifiable URL.
> - **[Inference]** = engineering judgment based on facts, not confirmed by measurement.
> - **[Unverified]** = attempted but could not be confirmed; not fabricated.

---

## 0. One-sentence summary

| Decision point | One-sentence recommendation |
| --- | --- |
| **Textbook source strategy** | The only legal entry point that is both scalable and verifiable is the free electronic textbooks of the **National Smart Education Platform for Primary and Secondary Schools** (`basic.smartedu.cn`); the product does **official link redirection + user local import + local parsing only**, and **never distributes textbook original text with the installer**. |
| **OCR and structuring approach** | First use PyMuPDF to probe for a text layer and branch; if a text layer exists, use pdfplumber/PyMuPDF; if not, use **RapidOCR (ONNX, Apache-2.0, offline and lightweight)** as the baseline, and for subjects with higher quality requirements use **MinerU / PP-StructureV3** (mind the license and VRAM). |
| **Vector retrieval approach** | **SQLite single file + FTS5 (jieba pre-tokenization written in) + sqlite-vec vectors + RRF fusion**; do not introduce components such as Qdrant/Chroma that require a resident server. |
| **Question-bank acquisition priority** | ① Official free public sources (NOI syllabus, four-university joint exam sample papers, joint exam syllabus); ② user self-import (past-paper PDFs); ③ commercial licensing (zxxk/Jyeoo/21cnjy paper generation—**must buy, cannot crawl**). |
| **Paper generation and export approach** | **Typst as primary** (single binary, small size, good Chinese and math formulas), **LaTeX + exam-zh as fallback/advanced route** (higher typesetting ceiling, but large dependencies and exam-zh is no longer maintained). |

---

## 1. Textbook sources and legality

### 1.1 Hands-on test of official channels

#### ① National Smart Education Platform for Primary and Secondary Schools (hosted by the Ministry of Education) — **core source**

| Item | Hands-on conclusion |
| --- | --- |
| Entry point | <https://basic.smartedu.cn/> (SPA, requires browser JS; curl fetching the homepage directly returns 403, which is normal anti-crawling) |
| Electronic textbook entry | <https://basic.smartedu.cn/tchMaterial> |
| Login required? | **[Fact]** The platform offers login-free browsing; but downloading/some resources require an account. Follow the page prompts. |
| Public API available? | **[Fact] Yes, and measured to work** (see below) |

**[Fact] Hands-on test of public data endpoints** (not logged in, no cookies, JSON returned directly):

```
GET https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json
→ {"module":"tch_material","module_version":1618934987,
   "urls":".../part_100.json,.../part_101.json,.../part_102.json,.../part_103.json"}

GET https://s-file-{1,2}.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_10{0,1,2,3}.json
→ 4 catalog shards, 33.5 MB in total

GET https://s-file-{1,2,3}.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{book_id}.json
→ details for a single textbook, including ti_items (file list), ti_size (bytes), tag_list (stage/grade/subject/edition)
```

**Measured scale statistics (this session fetched all 4 catalog shards + per-book detail metadata, 3,579 detail requests in total, metadata only, no textbook files):**

| Metric | Measured value |
| --- | --- |
| Total catalog entries | **3,579** |
| Entries tagged `electronic textbook` | **2,925** |
| Entries tagged `textbook` | 1,708 |
| Entries successfully resolved to details | 2,513 |
| Entries returning 403 and unresolved | 1,066 (**container nodes/unpublished entries listed in the catalog but with no released files**, not directly related to actual publication volume) |
| Entries whose `ti_file_flag=source` is PDF | **2,328** |
| Entries whose `ti_file_flag=source` is PPTX | 179 (mostly "Information Technology" courseware) |
| Also `image`/`thumbnail` | 2,507 (full-page JPEG folders, not single files) |

> **Note**: `module_version: 1618934987` in `data_version.json` corresponds to 2021-04-20, indicating that this catalog structure has been stable and unchanged since 2021, and the API is relatively reliable. [Fact]

**Target subset for "primary grade 1 → senior high grade 3" (measured):**

| Metric | Measured value |
| --- | --- |
| Primary/junior/senior · electronic textbooks (excluding special education) | **1,748 books** |
| Of which actually have downloadable PDFs | **1,742 books** |
| **Total size of original PDFs** | **138.59 GB** |
| Per-book size median / mean / p90 / max | **48.5 MB** / 81.5 MB / 198.1 MB / 495.4 MB |
| By stage | Primary 880 books / 76.7 GB; junior 352 books / 24.3 GB; senior 516 books / 37.6 GB |

**Publisher distribution (target subset, Top 10, measured):**

| Publisher | Books | Size |
| --- | --- | --- |
| People's Education Press | 269 | 5.41 GB |
| Guangdong Education Publishing House | 107 | 8.59 GB |
| Shanghai Education Publishing House | 80 | 6.91 GB |
| Foreign Language Teaching and Research Press | 78 | 8.97 GB |
| Beijing Normal University Press | 65 | 3.44 GB |
| Educational Science Publishing House | 63 | 9.26 GB |
| People's Fine Arts Publishing House | 59 | 3.23 GB |
| Jiangsu Phoenix Juvenile and Children's Publishing House | 56 | 8.31 GB |
| People's Music Publishing House | 52 | 2.02 GB |
| Jiangsu Phoenix Education Publishing House | 51 | 2.37 GB |

**Determining the electronic textbook format — one of the most critical technical conclusions of this research:**

**[Fact]** The median size of a single PDF is 48.5 MB, while the median number of page-level preview images for the same book on the platform is 49 pages → **median bitrate about 872 KB/page** (full calculation with n=2328: p25=423 KB, median 872 KB, p75=2,010 KB, p90=4,093 KB).

**[Inference]** This bitrate indicates that these PDFs **are not natively typeset PDFs (which are usually 20–80 KB/page), but PDFs encapsulating high-resolution page images**. Therefore:

> **For the question "do PEP textbooks have a text layer," we must assume the answer is "very likely not," and treat OCR as a mandatory stage of the pipeline rather than an exceptional branch.**

**[Recommended implementation action]** Add a **text-layer probe** at the pipeline entrance (not an inference, but a measurement):

```python
import pymupdf  # PyMuPDF
doc = pymupdf.open(path)
chars = sum(len(p.get_text().strip()) for p in doc)
has_text_layer = (chars / max(doc.page_count, 1)) > 50   # threshold must be calibrated against the corpus
```

"Fewer than 50 characters per page" is classified as a scanned document and sent to OCR; otherwise it goes down the text-extraction branch. **Note: this research deliberately did not download any textbook files to verify this point, leaving it for the engineering phase to measure with 2–3 samples.**

**Other official/semi-official channels:**

| Channel | URL | Notes |
| --- | --- | --- |
| People's Education Press official site | <https://www.pep.com.cn/> | Measured HTTP 200. The digital textbook product line has a separate entry (the PEP digital textbook PC operation manual is at <https://czpt.mypep.cn/pdf/人教数字教材操作帮助手册（PC）.pdf>, measured downloadable) |
| Former National Primary and Secondary School Network Cloud Platform | <https://www.zxx.edu.cn/> | Measured HTTP 200, integrated from the same source as the smart education platform |
| Guangdong Provincial Education Resource Public Service Platform | <http://zy.gdedu.gov.cn/> | Measured to exist and host real teaching resources (see §3.1) |
| Curriculum and Textbook Research Institute of the Ministry of Education | <http://www.moe.gov.cn/> system | The entry for the original curriculum standards is in §1.3 |

**Third-party download tools (only as circumstantial evidence that "the API structure has been verified by outsiders"; not recommended as a direct dependency):**

- <https://github.com/hantang/smartedu-dl-go> — Go implementation, supports PDF textbooks/courseware/audio/video [Fact: repository exists]
- <https://github.com/maplexuci/pdf_book_download_from_zxxeducn> — Python implementation; the README claims coverage of all publisher editions for primary/junior/senior high + the May Fourth school system + special education [Fact: repository exists, script actually used to fetch]

**[Inference]** The existence of these tools is counter-evidence that "the API has no authentication and the structure has been stable for a long time," but it also shows that **there is a risk of abuse on the platform side**. If the product uses this API, it should strictly rate-limit, fetch only the one book the user explicitly specifies, and cache locally, rather than doing mirror-style bulk fetching.

---

### 1.2 Legal boundaries (**required reading; hard constraints on product design**)

**[Fact] Chinese legal basis** (provisions cited in the 21cnjy paper-generation copyright notice; original verifiable):

> According to Article 10 of the Copyright Law of the People's Republic of China, copyright includes the right of authorship, the right of modification, the right of reproduction, the right of communication through information networks, and others. Anyone who reproduces, distributes, performs, screens, broadcasts, compiles, or communicates to the public through information networks a work without the permission of the rights holder, once verified, will be penalized by administrative law enforcement departments in accordance with Article 53 of the Copyright Law of the People's Republic of China and Article 18 of the Regulations on the Protection of the Right of Communication through Information Networks.
> — <https://zujuan.21cnjy.com/help/copyright>

**[Fact] Textbooks are unequivocally objects of copyright.** Even though the National Smart Education Platform "provides them free of charge," free ≠ authorization to redistribute:

| Act | Legal characterization | Conclusion |
| --- | --- | --- |
| User **browses** an electronic textbook **online** on the official platform | The platform is already authorized; personal browsing is normal use | ✅ Compliant |
| User **downloads** a textbook **themselves** to a local machine for personal study | Personal study/research use; low risk | ⚠️ Gray area but acceptable (the agreement must make clear that the user does this themselves) |
| Software **bundles/distributes with the installer** textbook PDFs or OCR full text | Infringes the right of reproduction + right of communication through information networks | ❌ **Absolutely prohibited** |
| Software **automatically bulk-downloads all textbooks from the official site on first run** | May constitute unauthorized bulk acquisition from the platform (and platform terms of service usually prohibit it) | ❌ **Prohibited** |
| Software **provides external sharing of textbook original text/full-text search results** | Secondary distribution | ❌ Prohibited (search results are for the local user's own viewing only) |
| Turning OCR text into a **knowledge-point/table-of-contents structure** and distributing it with the software | Factual information and structural systems are generally not protected by copyright, but **expressive content (original example problems, lesson texts) is protected** | ⚠️ "Structure + knowledge points" is allowed; "original text" is not |

**Four things that must be implemented at the product level:**

1. **Disclaimer** (on first launch + permanently in the settings page):
   > This software does not include or distribute any textbook or exam-question original text. Textbook content is obtained by the user from official channels such as the National Smart Education Platform for Primary and Secondary Schools and imported to the local machine, for personal study only. Do not use imported content for redistribution or commercial purposes.
2. **Architectural isolation**: textbook original text and OCR full text **exist only in the user's local database**, and never enter any default sync/cloud backup path.
3. **No seeding/no mirroring**: no P2P, no resource-site mirroring, no built-in direct textbook download links (only **official page redirection**).
4. **Export watermark**: when a PDF exported by the user contains textbook original text fragments, add the watermark "For personal study only, do not distribute" + source attribution.

**Compliant alternative and supplementary materials:**

| Material | URL | License / notes |
| --- | --- | --- |
| Full text of the Compulsory Education Curriculum Plan and Curriculum Standards (2022 edition) | <http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html> (Textbook [2022] No. 2) | [Fact] Ministry of Education website, measured HTTP 200, includes 16 curriculum standard attachments. **This is the official authoritative skeleton for textbook tables of contents/knowledge-point systems** |
| General Senior High School Curriculum Plan and Curriculum Standards | Search "General Senior High School Curriculum Plan and Curriculum Standards (2017 edition, 2020 revision)" on the Ministry of Education website `moe.gov.cn` | [Inference] Same publication system; recommend adding the exact URL during the engineering phase |
| NOI Syllabus (2025 edition) | <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf> | [Fact] Measured HTTP 200, 21.7 MB, officially published by CCF. **The best authoritative basis for the informatics knowledge tree** |
| OpenStax open textbooks | <https://openstax.org/> | [Fact] Site accessible, license page <https://openstax.org/license> HTTP 200. CC BY series, freely distributable (mostly English; can supplement science subjects) |
| Wikipedia / Wikidata | <https://www.wikidata.org/> | [Inference] CC0 (Wikidata) / CC BY-SA (Wikipedia), usable as a knowledge-graph skeleton. **Licenses must be verified dataset by dataset during the engineering phase** |
| OI Wiki | <https://oi-wiki.org/> | [Fact] The README explicitly states "free to share and adapt, but must attribute and share alike" → **CC BY-SA series**. The best open source for Chinese algorithm knowledge |

---

## 2. Design of the textbook content structuring pipeline

### 2.1 PDF text-layer extraction vs. scanned-document OCR

**License and version measurements (all from the PyPI JSON API `https://pypi.org/pypi/{pkg}/json`):**

| Library | Version | License | Desktop offline | Notes |
| --- | --- | --- | --- | --- |
| **PyMuPDF** | 1.28.2 | **AGPL-3.0 or Artifex commercial license (dual license)** | ✅ | Fastest, but **AGPL is a hard constraint for closed-source commercial desktop software** |
| **pdfplumber** | 0.11.10 | **MIT** | ✅ | Strong table/character-level information; slow |
| pypdf | 6.19.0 | **BSD-3-Clause** | ✅ | Pure Python, suitable for splitting/merging/metadata |
| pdfminer.six | 20260107 | **MIT** | ✅ | The underlying layer of pdfplumber |

> ⚠️ **Important licensing warning [Fact]**: PyMuPDF is **AGPL-3.0 / commercial dual-licensed** (PyPI metadata original text: `Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License`). If "Gezhi" is distributed as closed source, **either buy an Artifex commercial license or switch to pdfplumber (MIT) / pypdf (BSD)**.
> [Inference] Practical compromise: **use PyMuPDF during development and local batch processing** (self-use does not constitute distribution), **and switch the runtime distributed with the product to pdfplumber/pypdf**; or simply buy a license.

**OCR engine comparison (versions/licenses measured):**

| Engine | Version | License | Chinese | Desktop offline | Notes |
| --- | --- | --- | --- | --- | --- |
| **RapidOCR** | rapidocr 3.9.2 / rapidocr-onnxruntime 1.4.4 | **Apache-2.0** | ✅ Good | ✅✅ **ONNX Runtime, no Paddle dependency, lightest** | Docs <https://rapidai.github.io/RapidOCRDocs> |
| **PaddleOCR** | 3.7.0 | **Apache-2.0** | ✅✅ Best | ⚠️ Requires PaddlePaddle (3.3.1, Apache-2.0); CPU package is large | <https://github.com/PaddlePaddle/PaddleOCR> (★90,478) |
| Tesseract | — | Apache-2.0 | ⚠️ Chinese (chi_sim) clearly weaker than the Paddle family | ✅ | <https://github.com/tesseract-ocr/tesseract> (★76,777) |
| EasyOCR | 1.7.2 | Apache-2.0 | ⚠️ Average | ⚠️ Depends on PyTorch | Large |
| Cloud OCR (Tencent/Baidu/Alibaba) | — | Commercial | ✅✅ | ❌ Requires network | **Conflicts with the compliance principle of "local first, never handling textbook original text"; recommend excluding** |

**[Recommendation] OCR branching strategy:**

```
PDF input
 ├─ Text-layer probe (PyMuPDF/pdfplumber)
 │   ├─ Has text layer (>50 chars/page) ──→ Use the text layer directly (fast, accurate, zero cost)
 │   └─ No text layer ──→ OCR branch
 │            ├─ Default: RapidOCR (ONNX, Apache-2.0, runs on CPU, offline)
 │            └─ High-value subjects (math/physics/chemistry): MinerU / PP-StructureV3 (formulas + tables + layout)
 └─ Output: Markdown/JSON (with heading hierarchy, LaTeX formulas, tables, image references)
```

---

### 2.2 Comparison of layout-analysis tools (repositories/licenses/star counts are all **measured on GitHub in this session**)

| Tool | Repository | License | ★ | Chinese | Output | Offline feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| **MinerU** | <https://github.com/opendatalab/MinerU> (PyPI `mineru` 4.0.10) | **MinerU Open Source License** (custom, not OSI-standard; the old package `magic-pdf` is AGPL-3.0) | 80,914 | ✅✅ | Markdown + JSON, strong on formulas/tables | ⚠️ Better with a GPU; very slow on CPU |
| **PP-StructureV3** | Built into PaddleOCR (`paddleocr` 3.7.0) | **Apache-2.0** | 90,478 | ✅✅ | Markdown/JSON, layout + tables + formulas | ✅ Runs on CPU |
| **docling** (IBM) | <https://github.com/docling-project/docling> (PyPI `docling` 2.131.0) | **MIT** | 68,239 | ✅ | Unified DoclingDocument, convertible to MD | ✅ Most permissive license, recommended candidate |
| **marker** | <https://github.com/datalab-to/marker> (PyPI `marker-pdf` 2.0.0) | **Apache-2.0** (code); model weights have separate terms, **must verify individually** | 40,133 | ✅ | Markdown + JSON | ⚠️ Good experience requires a GPU |
| **Surya** | <https://github.com/datalab-to/surya> (PyPI `surya-ocr` 0.22.1) | Apache-2.0 (code) | 21,431 | ✅ 90+ languages | Layout/reading order/tables | ⚠️ Requires a GPU |
| **unstructured** | <https://github.com/Unstructured-IO/unstructured> (PyPI `unstructured` 0.27.10) | **Apache-2.0** | 15,520 | ✅ | Element-level segmentation, suitable for RAG | ✅ |
| **Nougat** | <https://github.com/facebookresearch/nougat> (PyPI `nougat-ocr` 0.1.17) | Code MIT; **model weights CC-BY-NC-4.0 (non-commercial)** | 10,081 | ⚠️ Average Chinese | Markdown + LaTeX | ⚠️ **NC license cannot be used in a commercial product** |
| **olmOCR** | <https://github.com/allenai/olmocr> (PyPI `olmocr` 0.4.27) | Apache-2.0 | 19,684 | ✅ | Linearized text | ⚠️ Requires GPU + VLM |
| **LaTeX-OCR / pix2tex** | <https://github.com/lukas-blecher/LaTeX-OCR> (PyPI `pix2tex` 0.1.4) | **MIT** | 16,577 | Formula-specific | Image formula → LaTeX | ✅ **Highly recommended; specifically solves formulas** |

**[Fact] Key licensing conclusions:**
- ✅ **Safe for closed-source distribution**: docling (MIT), PP-StructureV3 (Apache-2.0), marker code (Apache-2.0), unstructured (Apache-2.0), pix2tex (MIT), RapidOCR (Apache-2.0)
- ⚠️ **Use with caution**: MinerU (custom license, must read the full text), marker/surya model weights, PyMuPDF (AGPL)
- ❌ **Not usable in a commercial product**: Nougat model weights (CC-BY-NC-4.0)

**[Recommendation] Phased strategy:**

| Phase | Approach | Rationale |
| --- | --- | --- |
| Phase 1 (get it working) | PyMuPDF text-layer probe + RapidOCR fallback + pix2tex formulas | Fully offline, clean licenses, runs on CPU |
| Phase 2 (improve quality) | docling (MIT) as the main layout-analysis engine | Most permissive license, unified document model output |
| Phase 3 (tackle hard cases) | MinerU / PP-StructureV3 for formula-heavy pages in math/physics/chemistry | Highest quality; use as offline batch-processing tools (not distributed with the product, avoiding license issues) |

> **[Inference] Key engineering technique**: Make the heavy models (MinerU/PP-StructureV3) into **independent offline batch-processing scripts that run only on your own build machine**, with the outputs (Markdown + JSON) distributed with the product or made available for users to download. This way:
> ① avoids the license/size issues of heavy models; ② the user side only needs to parse already-structured text, with zero GPU requirements; ③ the outputs are regenerable derived data.

---

### 2.3 Chapter segmentation and knowledge-point extraction

**Three-level segmentation strategy (from reliable to fallback):**

| Level | Method | Reliability |
| --- | --- | --- |
| L1 · Table-of-contents tree | The textbook PDF's contents pages / PDF bookmarks (`doc.get_toc()`) | Highest; use first |
| L2 · Heading regex | Typical Chinese textbook chapter patterns: `第[一二三四五六七八九十百]+[章节课]`, `^\d+(\.\d+)*\s`, `[一二三四五六七八九十]+、` | Medium; rules must be tuned per publisher |
| L3 · Layout model | Heading hierarchy output by MinerU/docling (`#`/`##`/`###`) | High, but depends on layout-tool quality |
| L4 · LLM fallback | Give 3–5 consecutive pages of text to an LLM to decide "is this the start of a new chapter" | Fallback; cost-controllable (only invoked when L1–L3 conflict) |

**[Recommendation] Prompt design idea for knowledge-point extraction** (do not let the LLM improvise; use **constrained structured output**):

```
System role: You are an expert in building K-12 subject knowledge graphs.

Input: <chapter title> + <chapter body (truncated to 3000 characters)> + <stage/grade/subject> + <corresponding curriculum standard item>

Requirements:
1. Extract only the knowledge points that **this chapter actually teaches**; do not add content outside the chapter.
2. Each knowledge point must be grounded in the original text; output an evidence field (original fragment, ≤50 characters).
3. Granularity constraint: one knowledge point corresponds to "the smallest unit that can be taught in 40 minutes and can be tested independently."
   Negative example: "functions" (too coarse); positive example: "the relationship between the graph of a linear function and the signs of k and b."
4. For prerequisite relations, output only **direct prerequisites** (A is a direct prerequisite of B); do not output the transitive closure.
5. Leave anything uncertain blank; guessing is forbidden.

Output JSON Schema:
{
  "knowledge_points": [{
    "name": "string, ≤20 characters",
    "aliases": ["string"],
    "description": "string, ≤120 characters",
    "difficulty": 1|2|3|4|5,
    "evidence": "string, original text fragment",
    "bloom_level": "remember|understand|apply|analyze|evaluate|create"
  }],
  "prerequisites": [{"from": "knowledge point name", "to": "knowledge point name", "reason": "string"}]
}
```

**[Recommendation] Three-part quality control:**
1. **Closed-set validation**: knowledge-point names must come from the candidate set formed by "curriculum standard items + textbook table of contents"; the LLM may only select or split at a finer granularity, never invent from nothing.
2. **Bidirectional consistency**: run cycle detection (topological sorting) on prerequisite relations; if a cycle exists, send it back for regeneration.
3. **Sampled human review**: sample 30 knowledge points per subject for manual checking; if accuracy < 90%, adjust the prompt.

---

### 2.4 Vector store and retrieval

#### 2.4.1 Vector-store selection (repositories/licenses/star counts all **measured in this session**)

| Approach | Repository / version | License | ★ | Desktop embedding | Conclusion |
| --- | --- | --- | --- | --- | --- |
| **sqlite-vec** | <https://github.com/asg017/sqlite-vec> (PyPI 0.1.9) | **MIT / Apache-2.0 dual license** | 8,155 | ✅✅ **SQLite extension, single file, zero server** | 🏆 **First choice** |
| LanceDB | <https://github.com/lancedb/lancedb> (PyPI 0.39.0) | Apache-2.0 | 11,567 | ✅ Embedded columnar storage | Alternative (one more directory format) |
| Chroma | <https://github.com/chroma-core/chroma> (PyPI 1.5.9) | Apache-2.0 | 29,418 | ⚠️ Leans server-side | Not recommended |
| Qdrant | <https://github.com/qdrant/qdrant> (PyPI `qdrant-client` 1.19.1) | Apache-2.0 | 34,891 | ❌ Requires a resident service | Not recommended |
| FAISS | <https://github.com/facebookresearch/faiss> (PyPI `faiss-cpu` 1.15.1) | **MIT** | 41,005 | ✅ Pure library | Alternative (persistence must be managed yourself) |

#### 2.4.2 Full-text search and Chinese tokenization — **the most important technical pitfall in this report**

**[Fact] Behavior of the SQLite FTS5 `unicode61` tokenizer on Chinese** (original text at <https://www.sqlite.org/fts5.html> §4.3.1):

> All characters classified by Unicode into general categories beginning with `L` or `N`, or belonging to `Co`, are considered token characters; other characters are considered separators.
> The default `categories` option value is `"L* N* Co"`.

**[Inference]** Chinese characters belong to `Lo` (Letter, other), which falls entirely within `L*` → **they are treated as token characters**. And Chinese has no spaces, so "国家中小学智慧教育平台" will be cut into a single token.

> 🔴 **Conclusion: using FTS5's default `unicode61` for Chinese search, a user searching "智慧教育" cannot match "国家中小学智慧教育平台". This is a roadblock that must be solved.**

**Three solutions (in order of recommendation):**

| Approach | Method | Advantages | Disadvantages |
| --- | --- | --- | --- |
| 🏆 **jieba pre-tokenization written in** | Before writing to the FTS table, do `" ".join(jieba.cut(text))`; when querying, tokenize the same way and join | Best tokenization quality, controllable, supports a user dictionary (textbook proper nouns) | Must keep the write/query sides consistent |
| **trigram tokenizer** | `CREATE VIRTUAL TABLE ... USING fts5(body, tokenize='trigram')` | Built into SQLite (3.34+), **additionally supports indexed LIKE/GLOB**, no external tokenizer needed | Index size about 3×; cannot do stemming/synonyms |
| ICU tokenizer | Requires compiling SQLite with ICU | Multilingual/general | **Compilation on Windows is troublesome; not recommended** |

**Tokenizer selection (measured):**

| Tool | Version | License | Status | Recommendation |
| --- | --- | --- | --- | --- |
| **jieba** | 0.42.1 | **MIT** | ★35,175, updates stalled (0.42.1 released in 2020) | 🏆 **First choice**: mature, pure Python, supports custom dictionaries |
| **LAC** (Baidu) | 2.1.2 | **Apache-2.0** | ★4,001 | Alternative: higher accuracy, but depends on Paddle |
| HanLP | 2.1.5 | Apache-2.0 | Active | Heavyweight, over-featured |
| pkuseg | 0.0.25 | **Other/Proprietary** ⚠️ | Stalled | ❌ Unclear license; exclude |

**Chinese embedding models (**must re-check each license on its Hugging Face page during the engineering phase**):**

| Model | Dimensions | Notes | Measured status |
| --- | --- | --- | --- |
| **BAAI/bge-m3** | 1024 | Multilingual, long text (8192), strong Chinese | [Fact] PyPI `FlagEmbedding` 1.4.2 available; <https://github.com/FlagOpen/FlagEmbedding> (★12,209) claims MIT; **model weight license must be verified separately** |
| BAAI/bge-large-zh-v1.5 | 1024 | Chinese-specific, smaller | [Inference] Same system as above |
| Tongyi text-embedding-v3 | — | Cloud API | ❌ Conflicts with the offline principle |

**[Fact]** `onnxruntime` 1.30.0 (**MIT**) can be used for CPU inference; `sentence-transformers` 6.1.0 (Apache-2.0) can wrap local inference.

#### 2.4.3 Recommended solution for "senior-two student asks a question → retrieve the corresponding textbook paragraph"

**Four-stage pipeline:**

```
User question: "Why are the asymptotes of a hyperbola y=±(b/a)x?"
   │
   ├─【1】Query understanding (lightweight rules + small model, local)
   │     ├─ Extract subject: mathematics (keywords/classifier)
   │     ├─ Extract grade: senior two (reverse lookup in textbook contents)
   │     └─ Extract knowledge point: "asymptotes of a hyperbola" (match knowledge_points.aliases)
   │     → Obtain metadata filter conditions: subject=mathematics AND grade IN (senior two, senior three) AND kp_id=...
   │
   ├─【2】Dual-path recall (parallel, Top-40 each)
   │     ├─ Path A · Full text: FTS5 (jieba tokenization) BM25 ranking
   │     └─ Path B · Semantic: sqlite-vec cosine similarity (bge-m3, query vector + chunk vectors)
   │
   ├─【3】Fusion (RRF, Reciprocal Rank Fusion)
   │     score(d) = Σ_paths 1 / (k + rank_path(d))      # k is usually 60
   │     → Merge and deduplicate, keep Top-20
   │
   └─【4】Rerank + expansion (optional)
         ├─ Concatenate adjacent chunks (one before and one after each chunk, to restore context)
         ├─ Boost by chunk_type (body text > exercises > figure captions)
         └─ Small cross-encoder rerank → final Top-5 sent to the LLM to generate the answer
```

**[Inference] Why hybrid retrieval rather than pure vector:**
- Pure vector: when a student asks about "hyperbola `y=±(b/a)x`," formula symbols have almost no discriminative power in embedding space → missed recall.
- Pure keyword: when a student asks "why is the asymptote this slope," the textbook says "the asymptote equation of a hyperbola" → no literal overlap → missed recall.
- Hybrid + metadata filtering: the two complement each other, and grade/subject filtering can reduce the candidate set from 340,000 to under 20,000, significantly improving precision and speed.

**Index scale estimate ([Inference], based on the measured sizes in §1.1 + industry experience coefficients):**

| Item | Calculation | Result |
| --- | --- | --- |
| Original PDFs | Measured | **138.6 GB** (1,742 books) |
| Total pages | 138.6 GB ÷ 872 KB/page | **≈ 166,000 pages** |
| Extracted plain text | Chinese textbooks about 600–900 characters/page (including captions/exercises) | **≈ 100–150 million characters** |
| Text UTF-8 size | Chinese 3 bytes/character | **≈ 330–450 MB** |
| Number of chunks | 600 characters/chunk + 80-character overlap, ≈ 700 characters/chunk | **≈ 140,000–220,000 chunks** (take 180,000) |
| Embedding vectors (fp32, 1024-dim) | 180,000 × 1024 × 4 B | **≈ 738 MB** |
| Embedding vectors (int8 quantized) | 180,000 × 1024 × 1 B | **≈ 184 MB** |
| FTS5 inverted index | About 0.5–1.0× the original text | **≈ 200–400 MB** |
| **Read-only knowledge base (vectors + index + structured JSON)** | | **≈ 1.2–1.8 GB** |
| + Page thumbnails (optional, for "jump to that page") | 166,000 × 15 KB | **≈ 2.5 GB** |
| **Complete offline package (excluding textbook original text)** | | **≈ 4–5 GB** |
| Textbook original text imported locally by the user | | **≈ 139 GB** (local machine only; grows with user imports) |

> **This comparison is the answer to the entire distribution strategy**: **140 GB of original text cannot be distributed; a 5 GB structured knowledge base absolutely can.**

---

### 2.5 Recommended database schema (SQLite)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- 1. Books
-- ─────────────────────────────────────────────────────────────
CREATE TABLE books (
  id                INTEGER PRIMARY KEY,
  uuid              TEXT UNIQUE,              -- platform-side book id, for deduplication and re-sourcing
  title             TEXT NOT NULL,
  publisher         TEXT,                     -- publisher
  edition           TEXT,                     -- edition label (PEP edition/unified edition/Shanghai edition...)
  stage             TEXT CHECK(stage IN ('primary','junior','senior','other')),
  grade             TEXT,                     -- grade 1 ... senior 3
  subject           TEXT NOT NULL,
  volume            TEXT,                     -- volume 1/volume 2/single volume
  isbn              TEXT,
  total_pages       INTEGER,
  source_kind       TEXT NOT NULL CHECK(source_kind IN
                      ('official_link','user_import','bundled_derived')),
  source_url        TEXT,                     -- official page link (no direct file links stored)
  local_path        TEXT,                     -- user local file path (local only)
  sha256            TEXT,                     -- deduplication/verification
  has_text_layer    INTEGER,                  -- 0/1, probe result
  ocr_status        TEXT DEFAULT 'pending'
                      CHECK(ocr_status IN ('pending','running','done','failed','skipped')),
  struct_status     TEXT DEFAULT 'pending',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT
);
CREATE INDEX idx_books_gs ON books(grade, subject);
CREATE INDEX idx_books_stage ON books(stage, subject);

-- ─────────────────────────────────────────────────────────────
-- 2. Chapter tree (self-referencing)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE chapters (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  level         INTEGER NOT NULL,             -- 1=chapter 2=section 3=subsection
  order_no      INTEGER NOT NULL,             -- ordering within the same level
  title         TEXT NOT NULL,
  path          TEXT NOT NULL,                -- materialized path "chapter1/1.2/1.2.3", convenient for LIKE and sorting
  start_page    INTEGER,
  end_page      INTEGER,
  UNIQUE(book_id, path)
);
CREATE INDEX idx_chapters_book ON chapters(book_id, order_no);
CREATE INDEX idx_chapters_path ON chapters(book_id, path);

-- ─────────────────────────────────────────────────────────────
-- 3. Pages (preserve page ↔ chunk mapping, supporting "jump to that page")
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pages (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  page_no       INTEGER NOT NULL,             -- page number within the book
  pdf_page_no   INTEGER,                      -- physical page order in the PDF
  width_pt      REAL,
  height_pt     REAL,
  has_text      INTEGER NOT NULL DEFAULT 0,   -- probe: does this page have a text layer
  text          TEXT,                          -- page-level plain text (redundant, for within-page search)
  image_path    TEXT,                          -- page image cache (optional)
  UNIQUE(book_id, page_no)
);
CREATE INDEX idx_pages_book ON pages(book_id, page_no);

-- ─────────────────────────────────────────────────────────────
-- 4. Retrieval chunks (core table)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE chunks (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  page_start    INTEGER NOT NULL,
  page_end      INTEGER NOT NULL,
  order_no      INTEGER NOT NULL,             -- global chunk order within the book
  content       TEXT NOT NULL,                -- original text (for display/citation)
  content_seg   TEXT NOT NULL,                -- jieba pre-tokenized (space-separated), for FTS5 writes only
  content_type  TEXT NOT NULL DEFAULT 'text'
                  CHECK(content_type IN ('text','formula','table','exercise','figure_caption','example')),
  token_len     INTEGER,                      -- character count
  has_formula   INTEGER DEFAULT 0,
  has_table     INTEGER DEFAULT 0,
  image_refs    TEXT,                          -- JSON array: relative paths of images/formula images
  embedding     BLOB,                          -- float32[1024] or int8[1024], for sqlite-vec
  embed_model   TEXT,                          -- record model version for easy rebuilding
  embed_dim     INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_chunks_book ON chunks(book_id, order_no);
CREATE INDEX idx_chunks_chapter ON chunks(chapter_id);
CREATE INDEX idx_chunks_type ON chunks(content_type);

-- FTS5 external-content table (does not store the original text twice, saving half the space)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content_seg,
  content = 'chunks',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 0'
);
-- Triggers keep them in sync
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content_seg) VALUES (new.id, new.content_seg);
END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content_seg) VALUES ('delete', old.id, old.content_seg);
END;
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content_seg) VALUES ('delete', old.id, old.content_seg);
  INSERT INTO chunks_fts(rowid, content_seg) VALUES (new.id, new.content_seg);
END;

-- sqlite-vec vector index (vec0 virtual table)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[1024]
);

-- ─────────────────────────────────────────────────────────────
-- 5. Knowledge points and prerequisite graph
-- ─────────────────────────────────────────────────────────────
CREATE TABLE knowledge_points (
  id            INTEGER PRIMARY KEY,
  code          TEXT UNIQUE,                  -- stable code, e.g. "MATH-G10-FUNC-007"
  name          TEXT NOT NULL,
  aliases       TEXT,                          -- JSON array, for query understanding
  subject       TEXT NOT NULL,
  stage         TEXT,
  grade_min     TEXT,
  grade_max     TEXT,
  description   TEXT,
  difficulty    INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  bloom_level   TEXT,
  curriculum_ref TEXT,                         -- corresponding curriculum standard item number
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_kp_subject ON knowledge_points(subject, grade_min);
CREATE VIRTUAL TABLE kp_fts USING fts5(name, aliases, description, tokenize='unicode61');

-- chunk ↔ knowledge point many-to-many
CREATE TABLE chunk_kp (
  chunk_id   INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  kp_id      INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  confidence REAL,                             -- LLM extraction confidence
  evidence   TEXT,                             -- original-text evidence fragment
  PRIMARY KEY (chunk_id, kp_id)
);
CREATE INDEX idx_chunkkp_kp ON chunk_kp(kp_id);

-- Prerequisite graph (directed acyclic; cycle detection on write)
CREATE TABLE edges (
  id          INTEGER PRIMARY KEY,
  from_kp_id  INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  to_kp_id    INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  rel_type    TEXT NOT NULL DEFAULT 'prerequisite'
                CHECK(rel_type IN ('prerequisite','related','contains','contrast')),
  weight      REAL DEFAULT 1.0,                -- relationship strength 0–1
  reason      TEXT,
  UNIQUE(from_kp_id, to_kp_id, rel_type)
);
CREATE INDEX idx_edges_from ON edges(from_kp_id, rel_type);
CREATE INDEX idx_edges_to ON edges(to_kp_id, rel_type);

-- ─────────────────────────────────────────────────────────────
-- 6. Question bank
-- ─────────────────────────────────────────────────────────────
CREATE TABLE questions (
  id             INTEGER PRIMARY KEY,
  uuid           TEXT UNIQUE,
  stem           TEXT NOT NULL,                -- question stem (including LaTeX)
  stem_format    TEXT DEFAULT 'markdown+latex',
  options        TEXT,                          -- JSON: [{"key":"A","content":"..."}]
  answer         TEXT,                          -- standardized answer (choice "B"; multiple choice "ABD")
  answer_detail  TEXT,                          -- subjective-question answer/scoring points
  solution       TEXT,                          -- explanation (step by step)
  qtype          TEXT NOT NULL CHECK(qtype IN
                   ('single_choice','multi_choice','fill_blank','judge',
                    'short_answer','essay','calculation','proof',
                    'cloze','reading','programming')),
  difficulty     INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  difficulty_src TEXT CHECK(difficulty_src IN ('manual','auto','irt','imported')),

  -- provenance
  source_type    TEXT NOT NULL CHECK(source_type IN
                   ('official','public_web','commercial_licensed','user_import','ai_generated')),
  source_name    TEXT,                          -- e.g. "2024 Guangdong Provincial Junior High School Academic Proficiency Examination"
  source_url     TEXT,
  exam_region    TEXT,                          -- Guangdong / Macao / national / Hong Kong-Macao-Taiwan joint exam
  exam_name      TEXT,                          -- zhongkao/gaokao/joint exam/four-university joint exam/recommendation exam/CSP
  year           INTEGER,
  paper_id       INTEGER REFERENCES papers(id) ON DELETE SET NULL,
  qno_in_paper   INTEGER,                       -- question number in the original paper

  -- paper-generation metadata
  score          REAL,                          -- score value
  est_minutes    REAL,                          -- estimated answering time
  subject        TEXT NOT NULL,
  grade          TEXT,
  kp_ids         TEXT,                          -- JSON array (redundant, for fast filtering)
  tags           TEXT,                          -- JSON array
  image_refs     TEXT,                          -- JSON array
  license_note   TEXT NOT NULL,                 -- license note, e.g. "Copyright CCF, non-commercial teaching use"

  -- deduplication
  simhash        TEXT,                          -- 64-bit SimHash hex
  dedup_group    INTEGER,

  -- AI-generation provenance (compliance requirement: must be able to distinguish real questions from AI-generated ones)
  generator      TEXT,
  gen_prompt_hash TEXT,
  review_status  TEXT DEFAULT 'unreviewed'
                   CHECK(review_status IN ('unreviewed','auto_passed','human_verified','rejected')),

  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT
);
CREATE INDEX idx_q_filter ON questions(subject, exam_region, year, qtype);
CREATE INDEX idx_q_kp ON questions(subject, difficulty);
CREATE INDEX idx_q_simhash ON questions(simhash);
CREATE INDEX idx_q_source ON questions(source_type, source_name);

-- question ↔ knowledge point
CREATE TABLE question_kp (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  kp_id       INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  weight      REAL DEFAULT 1.0,
  is_primary  INTEGER DEFAULT 0,
  PRIMARY KEY (question_id, kp_id)
);

-- Papers (real exam papers / user-generated papers)
CREATE TABLE papers (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK(kind IN ('real_exam','generated','mixed','template')),
  exam_region   TEXT,
  exam_name     TEXT,
  subject       TEXT NOT NULL,
  year          INTEGER,
  total_score   REAL,
  duration_min  INTEGER,
  structure     TEXT,                          -- JSON: paper structure (see §4.1)
  template_id   INTEGER REFERENCES paper_templates(id),
  source_url    TEXT,
  license_note  TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Paper structure templates (reusable, versionable)
CREATE TABLE paper_templates (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,                 -- "Guangdong zhongkao mathematics paper (province-level unified setting)"
  exam_region   TEXT,
  subject       TEXT,
  total_score   REAL,
  duration_min  INTEGER,
  sections      TEXT NOT NULL,                 -- JSON, see §4.1
  version       INTEGER DEFAULT 1,
  basis_note    TEXT,                          -- structural source note (official document / reverse-engineered from public paper)
  created_at    TEXT DEFAULT (datetime('now'))
);

-- paper ↔ question (with order and score)
CREATE TABLE paper_questions (
  paper_id     INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  section_no   INTEGER NOT NULL,
  order_no     INTEGER NOT NULL,
  score        REAL,
  PRIMARY KEY (paper_id, question_id)
);
CREATE INDEX idx_pq_paper ON paper_questions(paper_id, section_no, order_no);

-- ─────────────────────────────────────────────────────────────
-- 7. Answer records
-- ─────────────────────────────────────────────────────────────
CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY,
  question_id   INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  paper_id      INTEGER REFERENCES papers(id) ON DELETE SET NULL,
  session_id    TEXT,                           -- a practice/mock-exam session
  user_answer   TEXT,
  is_correct    INTEGER,                        -- NULL = subjective question not yet graded
  score_got     REAL,
  duration_sec  INTEGER,
  self_rating   INTEGER CHECK(self_rating BETWEEN 1 AND 5),
  answered_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_attempts_q ON attempts(question_id, answered_at);
CREATE INDEX idx_attempts_session ON attempts(session_id);

-- Wrong-answer book (materialized-view-style cache, speeding up "redo wrong questions")
CREATE TABLE wrong_book (
  question_id  INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  wrong_count  INTEGER DEFAULT 0,
  last_wrong_at TEXT,
  last_right_at TEXT,
  mastery      REAL DEFAULT 0.0,               -- 0–1 mastery
  next_review_at TEXT                          -- Ebbinghaus review plan
);

-- ─────────────────────────────────────────────────────────────
-- 8. Metadata / migrations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Recommended writes: schema_version / embed_model / dict_version(jieba) / corpus_version
```

**[Inference] Design notes:**
- `chunks.content` and `chunks.content_seg` coexist: the former is for humans and the LLM, the latter only for FTS5 (jieba pre-tokenization). This is the core technique for bypassing the unicode61 Chinese defect.
- FTS5 uses the `content='chunks'` external-content table, **does not store a duplicate copy of the original text**, saving about 300 MB.
- The **trio of `source_kind` / `source_type` / `license_note` is the compliance audit trail**: at any time you can answer "where did this passage/question come from, and can it be distributed."
- `review_status` + `generator` completely isolate AI-generated questions from real questions—**this is the floor of product credibility**.

---

## 3. Research on question-bank sources

### 3.1 Guangdong zhongkao past papers

| Source | URL | Form | Login/payment required | Access difficulty | Compliance conclusion |
| --- | --- | --- | --- | --- | --- |
| **Guangdong Provincial Department of Education (policy original text)** | <https://edu.gd.gov.cn/zwgknew/jyzcfg/gfxwj/content/post_4244085.html> | Web page | No | Easy | ✅ Citable (government public information) |
| **Guangdong Provincial Education Resource Public Service Platform** | <http://zy.gdedu.gov.cn/> | PDF | No | Medium | ⚠️ Official public teaching resources; links can be cited; **whether redistribution is allowed is unclear; recommend links only** |
| Meizhou City Education Resource Platform | <http://zy.gdmzedu.cn/> | PDF | No | Medium | Same as above |
| Jyeoo (commercial) | <https://www.jyeoo.com/> | Web page | **Paid** | Medium | ❌ See §3.8 |
| 21cnjy paper generation (commercial) | <https://zujuan.21cnjy.com/> | Web page | **Paid** | Medium | ❌ See §3.8 |
| book118 (document sharing) | <https://max.book118.com/> | PDF preview | Paid | Medium | ❌ User-uploaded content; ownership unclear; **not citable** |

**[Fact] Official structural specification of Guangdong zhongkao (source: provincial education department regulatory document, original text measured):**

- Questions are set according to the *Compulsory Education Curriculum Plan and Curriculum Standards* (2022 edition, grades 7–9)
- **9 academic subjects**: Morality and Rule of Law, Chinese, History, Mathematics, Foreign Language, Geography, Physics, Chemistry, Biology → **written exams set uniformly at the provincial level**
  - Exception: **Guangzhou and Shenzhen**, two sub-provincial cities, **pilot independent question-setting for 9 subjects**; other cities use province-wide unified questions
- **3 other subjects**: Information Technology, Physical Education and Health, Art → each city organizes its own question-setting
- **Raw paper scores**: Chinese, Mathematics, Foreign Language **120 points each** (Foreign Language includes 30 points for listening/speaking); other subjects **100 points each**; physics/chemistry/biology experimental operations not less than **10%** of that subject's total score
- **Exam duration**: Chinese and Mathematics 120 minutes each; Foreign Language 90 minutes (including about 20 minutes of listening, excluding speaking); Physics (excluding experiments) and History 80 minutes each; Morality and Rule of Law, Geography, Chemistry (excluding experiments), Biology (excluding experiments) 60 minutes each
- **Score presentation**: Chinese, Mathematics, Foreign Language, Physical Education and Health are presented as **scores**; other subjects may be presented as scores/grades/"pass-fail"
- Geography and Biology are scheduled at **the end of the second semester of grade 8**; other subjects at **the end of the second semester of grade 9**
- This opinion took effect on **2023-09-01** and is valid for 5 years

> **[Unverified]** The official document **does not** provide a detailed specification at the level of "X multiple-choice questions × Y points." **[Inference]** Paper-generation templates at that level can only be **reverse-engineered from public past-paper layouts** (for example, the paper structure can be seen on Jyeoo's public paper pages, but that is only "looking at the structure"; question content still requires authorization). **Whether the "paper skeleton" is protected by copyright is open to interpretation; recommend extracting only factual structure such as "question type/count/score," and not copying question stems.**

---

### 3.2 Guangdong gaokao past papers (including the New Gaokao Paper I)

| Source | URL | Form | Notes |
| --- | --- | --- | --- |
| Guangdong Provincial Education Examinations Authority | <http://eea.gd.gov.cn/> | Web page/PDF | [Fact] Official release channel for the Joint Admissions Office and provincial exams; site accessible |
| National Education Examinations Authority of the Ministry of Education | <https://www.neea.edu.cn/> | Web page | [Inference] National unified-exam question-setting body |
| Sunshine Gaokao (Ministry of Education) | <https://gaokao.chsi.com.cn/> | Web page | [Fact] Official information platform |
| Information Network for Mainland Universities Recruiting Hong Kong, Macao, and Taiwan Students | <https://www.gatzs.com.cn/> | Web page | [Fact] Measured accessible; hosted by the Student Services and Quality Development Center of the Ministry of Education |
| Commercial question banks | Jyeoo / zxxk / 21cnjy paper generation | Web page | ❌ Requires authorization |
| Document-sharing sites | book118 / Baidu Wenku / 360doc | PDF | ❌ Ownership unclear; not citable |

**[Unverified]** The official direct link for "the National Education Examinations Authority publicly releasing past gaokao PDFs"—this research did not locate a stable official past-paper release page. **[Inference]** Gaokao past papers are usually released by provincial examination authorities **shortly after the exam** as "test questions and reference answers," and there is a lack of long-term archive pages.

**[Fact] Related compilation repositories on GitHub (measured to exist, but all non-authoritative and without a License):**

| Repository | ★ | License | Notes |
| --- | --- | --- | --- |
| <https://github.com/fihyer/NCEE> | 1 | **None** | "Past gaokao mathematics papers" |
| <https://github.com/rochelobeJYJ/gichul-workbench> | 2 | **None** | Korean project, but **methodology is completely on point**: download past papers → crop by question number → transcribe → classify by course unit → generate printable question sets |

> ⚠️ **Important reminder**: neither repository **has a License file**. No License ≠ free to use; the default is "all rights reserved." **[Inference]** Recommend treating them only as **methodological references**, and not copying their data.

---

### 3.3 Hong Kong, Macao, and Taiwan joint exam (national joint admissions)

**[Fact] Authoritative source: Information Network for Mainland Universities Recruiting Hong Kong, Macao, and Taiwan Students (hosted by the Student Services and Quality Development Center of the Ministry of Education)**

| Resource | URL |
| --- | --- |
| 2026 admissions brochure (including exam subjects, times, and syllabus basis) | <https://www.gatzs.com.cn/gatzs/pz/hongkong/202601/20260120/2293447012.html> |
| National joint admissions management system, candidate portal | <http://www.eeagd.edu.cn/lzks/> |

**Key facts from the measured original text:**

- **Science and engineering track** exam subjects: Chinese, Mathematics, English, Physics, Chemistry
- **Humanities track** exam subjects: Chinese, Mathematics, English, History, Geography
- **Each subject has a maximum score of 150, and each exam category has a maximum total of 750**
- **Basis for exam content**: *Examination Syllabus for the Joint Entrance Examination for Overseas Chinese, Hong Kong, Macao, and Taiwan Students of Ordinary Higher Education Institutions of the People's Republic of China (Science, Humanities) (4th edition)*, formulated by the **National Education Examinations Authority of the Ministry of Education** ← **this is the only authoritative exam syllabus; the product must follow it**
- Exam dates: May 23–24 (Chinese/English/Mathematics/Physics·History/Chemistry·Geography)
- Exam regions: Beijing, Shanghai, Zhejiang, Fujian, Guangdong (Guangzhou, Shenzhen), Hong Kong, Macao—7 in total
- Answering method: computer-assisted online marking, **dedicated answer sheets**
- Host: Office for Jointly Recruiting Overseas Chinese, Hong Kong, Macao, and Taiwan Students in Ordinary Higher Education Institutions (**Joint Admissions Office**); its friendly link points to the Guangdong Provincial Education Examinations Authority

> **[Unverified]** A **public PDF direct link** for the *Examination Syllabus (4th edition)*—not located in this research. **[Recommendation]** Obtain/purchase a paper copy through the Guangdong Provincial Education Examinations Authority or the Joint Admissions Office; in the product, provide only **official acquisition guidance**, not the syllabus original text.
> **[Unverified]** An official public channel for past joint-exam papers—not located. **[Inference]** Past joint-exam papers mainly circulate through training institutions and supplementary materials; **copyright risk is high, so only "user self-import" is possible**.

---

### 3.4 Four-university joint exam (Macao Joint Admission Examination for four higher education institutions) — **the highest-quality category in this research**

**[Fact] The official syllabus and past papers are all freely downloadable, and have been cross-verified on two official sites:**

**Entry A: University of Macau Registry (recommended main entry)**
<https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant>

**Entry B: Macao University of Tourism (UTM)**
<https://www.utm.edu.mo/admission/sc/undergraduate_programmes/joint-admission-examination/jae-syllabus-and-past-examination-papers/index.html>

**Syllabus (2027) direct links:**

| Subject | URL |
| --- | --- |
| Chinese | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JC01.pdf> |
| Portuguese A / B | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JP01.pdf> / <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JP02.pdf> |
| English | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JE01.pdf> |
| Mathematics main paper / supplementary paper | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JM01.pdf> / <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JM02.pdf> |

**Direct links to past papers and suggested answers (2025 / 2026):**

```
2026: https://reg.um.edu.mo/download/admission-local/jae/pastexampaper2/{JC01,JP01,JP02,JE01,JM01,JM02}.pdf
2025: https://reg.um.edu.mo/download/admission-local/jae/pastexampaper1/{JC01,JP01,JP02,JE01,JM01,JM02}.pdf
```

**The four universities = University of Macau (UM) + Macao Polytechnic University (MPU) + Macao University of Tourism (UTM) + Macao University of Science and Technology (MUST)**
([Fact] The UM page displays the four universities' logos at the same time, and the four universities each publish the same set of syllabi/papers on their own sites)

**Official supervisory department page:** Macao Education and Youth Development Bureau (DSEDJ) four-university joint exam page
<https://portal.dsedj.gov.mo/webdsejspace/internet/Inter_main_page.jsp?id=80793&>

**[Fact]** Joint-exam resources under the old domain `gaes.gov.mo` of the Macao Higher Education Bureau (GAES) are still accessible (e.g., <http://www.gaes.gov.mo/unification/Math_StandardPaper_MockPaper_SuggestedAnswer.pdf>), and its functions have been merged into **DSEDJ (dsedj.gov.mo)**.

> ✅ **Compliance conclusion: the "syllabus + past papers + suggested answers" of the four-university joint exam are PDFs proactively published by the four universities, free, and requiring no login.**
> **[Inference]** This is the **highest-quality, lowest-risk** question-bank source; it can support "link aggregation + user import + automatic parsing." However, **whether redistribution with third-party software is allowed still needs confirmation from each university** (recommend that the product only do **official link redirection + one-click import**, rather than packing the PDFs into the installer).

---

### 3.5 Macao recommendation examination (mainland universities jointly recruiting Macao recommended students)

**[Fact] Official entries (measured accessible):**

| Resource | URL |
| --- | --- |
| Admissions brochure download system (by university) | `https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id={university id}&fileName={university name}.pdf` |
| Example: University of Electronic Science and Technology of China 2026 brochure | <https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id=110250&fileName=电子科技大学.pdf> |
| Example: Beijing Sport University 2026 brochure | <https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id=110034&fileName=北京体育大学.pdf> |
| **2026 recommendation instructions** (core document) | <https://portal.dsedj.gov.mo/webdsejspace/addon/upload/Upload_viewfile_page.jsp?id=705896> |
| Supervisory department | Macao Education and Youth Development Bureau <https://portal.dsedj.gov.mo/> |

**[Inference]** Admission of Macao recommended students is mainly based on **secondary-school recommendation + university assessment (interview/written test)**; each university decides its own assessment format, and **there is no nationally unified "Macao recommendation examination" past paper**.

> **[Unverified]** Unified sample questions for the recommendation examination—not located, and inferred not to exist.
> **[Recommendation]** Gezhi's approach to "Macao recommendation" should be: **structure the "recommendation instructions + university brochures + common interview-question bank"**, rather than looking for past papers. This part of the content can be **legally crawled and displayed** from the two official entries above (government public information).

---

### 3.6 Informatics / programming question banks

#### 3.6.1 Reference implementation: in-depth analysis of cspfirstround.com (AK CSP)

**[Fact] Site architecture (measured sitemap.xml, 1,638 URLs in total):**

| Path pattern | Count | Purpose |
| --- | --- | --- |
| `/` (homepage) | 1 | Knowledge-point overview + paper navigation |
| `/papers` | 1 | List of all past papers (grouped by CSP-J / CSP-S / NOIP popularization / NOIP improvement) |
| `/csp-j`, `/csp-s` | 1 each | Past papers by group (supports `?round=2` to switch to the second round) |
| `/round2?year=YYYY` | 1 + subproblems | Second-round online judge (`?problem=<slug>`) |
| `/paper/{slug}` | **34** | Single-paper pages (e.g., `/paper/cspj-2025`) |
| `/topic/{knowledge point}` | **39** | Knowledge-point-specific practice (URL-encoded Chinese, e.g., `/topic/动态规划`) |
| `/q/{question-slug}` | **1,340** | Single-question detail pages |
| `/paper-pdfs/{slug}.{hash}.pdf` | **16** | Paper + answer PDF downloads |
| `/about` | 1 | About and copyright notice |

**[Fact] Question data model (reverse-engineered from the measured page `/q/cspj-2025-04`):**

```
Question fields (as actually presented on the page):
  ├─ Paper attribution: CSP-J 2025 Round 1 · Question 4
  ├─ Question type: single choice /read program/read program·true-false/read program·single choice/complete program/problem solving
  ├─ Knowledge point: trees and binary trees (single exam-tag)
  ├─ Difficulty: relatively hard (three levels: beginner / medium / relatively hard, etc.)
  ├─ Stem: Markdown + LaTeX (the measured original text contains $$...$$ display formulas and $\mathrm{WPL}$ inline formulas)
  ├─ Original question scanned image: /public/question-crops/cspj/2025/q-04.png  ← key design!
  ├─ Options: A/B/C/D structured
  ├─ Answer: B (separate field)
  └─ Solution: three-part structure "exam-point location / solution process / common-error reminder"
```

> 💡 **The most worth-copying point**: `/public/question-crops/...`—each question is paired with a **cropped scanned image of the original question**.
> **[Inference]** This is a clever copyright treatment: **use OCR/reflowed structured text for the stem (convenient for retrieval and paper generation), while retaining the original question image as the "fidelity source copy"**. It both solves the risk of OCR recognition errors (users can compare against the original image) and gives the textualized output independent value.

**[Fact] Paper-generation and practice interactions (homepage + `/papers` measured copy):**

- Free and login-free practice; after registration, practice records sync automatically
- **Knowledge-point practice**: practice by the NOI official syllabus knowledge tree
- **Whole past papers**: timed full-paper simulation, **automatic scoring on submission**
- **Wrong-answer book / learning statistics**: automatically collects wrong answers and shows progress from multiple dimensions
- **Teacher paper generation**: teachers can **select questions to generate papers**, publish class assignments, and view submission status
- **Online judge (second round)**: problem statement + public samples; write C++ code and submit for judging
- Question-bank size: measured self-description **1,251 first-round past questions** (CSP-J/S 2019–2025 + NOIP popularization/improvement 2010–2018)

**[Fact] API: exists but basically not public**

```
GET /api/anything        → 404 {"error":"endpoint does not exist"}
GET /robots.txt          → User-agent: * / Allow: / / Disallow: /api/ / Allow: /api/round2/assets/
```

**[Inference]** The site has a complete `/api/` backend (returning a standard JSON error body), but **explicitly forbids crawling `/api/` in robots.txt**, opening only `/api/round2/assets/` (judge resources). → **Conclusion: do not try to call its API. This is a clear signal of refusal of authorization.**

**[Fact] Original copyright notice (footer of every page):**
> "The copyright of the past questions belongs to CCF; this site is for non-commercial teaching use only."

**[Fact] Copyright ownership of included content:** the copyright of CSP-J/S and NOIP past questions belongs to **CCF (China Computer Federation)**.

> ⚠️ **[Inference] This means that even AK CSP itself has a legal status that is only a fair-use claim of "non-commercial teaching use." As a commercial product, Gezhi cannot copy this model.**
> For the correct approach, see §3.7.

#### 3.6.2 Legally citable public question banks

| Source | URL | License / terms | Crawlable? |
| --- | --- | --- | --- |
| **NOI official syllabus (2025 edition)** | <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf> | Officially published by CCF, measured HTTP 200 / 21.7 MB | ✅ **Best authoritative source for the knowledge-tree skeleton**, citable; **redistribution needs confirmation** |
| **NOI official site** | <https://www.noi.cn/> | Owned by CCF | ⚠️ Links only |
| **OI Wiki** | <https://oi-wiki.org/> (repository <https://github.com/OI-wiki/OI-wiki>, ★26,788) | [Fact] README explicitly states "free to share and adapt, must attribute and share alike" → **CC BY-SA series** | ✅ **Freely usable with attribution + share-alike**. Excellent for knowledge-point explanations |
| Luogu | <https://www.luogu.com.cn/> | [Unverified] Need to read its terms of service | ⚠️ Read the terms first |
| Codeforces | <https://codeforces.com/> | [Inference] Has a public API | ⚠️ Must comply with its API terms and rate limits |
| AtCoder | <https://atcoder.jp/> | [Unverified] | ⚠️ Same as above |
| OpenJudge | <http://openjudge.cn/> | [Unverified] | ⚠️ Same as above |
| USACO | <http://www.usaco.org/> | [Inference] Official solutions and problems have long been public | ⚠️ Needs verification |

> 🎯 **The most practical recommendation for Gezhi**: use the NOI syllabus (official CCF) + OI Wiki (CC BY-SA) for the **knowledge-tree skeleton**, and leave **questions** to user imports. This gives you a first-class informatics knowledge system with zero copyright risk.

---

### 3.7 Commercial paper-generation websites (**buy a license only; do not crawl**)

#### zxxk.com

**[Fact] Original user agreement (measured at <https://m.zxxk.com/api/v1/agreement/user>):**

> "...After purchasing the service, the user only enjoys the right to use zxxk® products, **and only for personal use; it must not be used for any commercial purpose**."
>
> Users must not use zxxk® to engage in the following behaviors:
> "6) Privately copy and publish, edit and publish, resell, or provide zxxk® resource content to any third-party organization or individual, or privately upload zxxk® resources to websites, communities, or forums other than zxxk®;
> **7) Use technical means to conduct high-frequency access to zxxk®, or long-term page-by-page and item-by-item crawling (downloading) of page content;**
> 8) Create or publish methods or tools related to the above behaviors, or operate or disseminate such methods or tools, regardless of whether these behaviors are for commercial purposes;"

> 🔴 **This is the clearest prohibition against crawlers**, and item 8 even lists "creating crawling tools" itself as a violation. **No form of crawling is feasible.**

**[Fact]** `https://www.zxxk.com/robots.txt` measured to return empty content. An empty robots.txt **does not constitute authorization** in law—the terms of service take precedence.

#### Jyeoo (jyeoo.com)

**[Fact] robots.txt measured** (<https://www.jyeoo.com/robots.txt>):
```
User-agent: *
Disallow: /api*              ← API explicitly prohibited
Disallow: /*/paper/detail*   ← paper details prohibited
Disallow: /resource/detail/* ← resource details prohibited
Disallow: /physics/*
...
Allow: /shijuan/*            ← paper list pages allowed
Allow: /sj/*
Allow: /shiti/*
Allow: /pp/*
Sitemap: ... sitemap1..110.xml
```

**[Inference]** Robots allows crawling "list pages," but **explicitly prohibits crawling "paper detail pages" and the API**. List pages do not contain complete questions. → **In practice, question content still cannot be legally obtained**. Moreover, robots.txt is only a technical convention; **the terms of service remain the final constraint**, and must be read and followed separately.

#### 21cnjy paper generation (zujuan.21cnjy.com / 21cnjy.com)

**[Fact] Pricing and feature tiers (measured at <https://zujuan.21cnjy.com/help/vip>):**

| | Ordinary user | VIP member | Group paper generation |
| --- | --- | --- | --- |
| Download questions/papers | **Charged per question: 2 study coins/question** | Free | Free |
| Download count | 5 times/day | 15 times/day | **Unlimited** |
| Maximum questions per paper generation | **40 questions/paper** | 100 questions/paper | Unlimited |
| View answer explanations | **20 questions/day** | √ | √ |
| Detailed-specification paper generation / parallel paper generation | × | √ | √ |
| School-based question bank / cross-subject paper generation | × | × | √ |
| Price | — | "New users' first order only 9.9 yuan" | Apply |

**[Fact] Original copyright notice (measured at <https://zujuan.21cnjy.com/help/copyright>):**
> "Without the written authorization of the author, no third party may reprint, copy, or excerpt the content of this work. Once an infringement dispute occurs, judicial authorities have the right to obtain relevant user information and require the infringer to bear relevant legal responsibility!"
> It also explicitly cites Article 53 of the Copyright Law and Article 18 of the Regulations on the Protection of the Right of Communication through Information Networks.

**[Fact] 🎉 But it has an "open platform"—this is the legitimate authorization channel:**
<https://dev.21cnjy.com/> (21cnjy Resource Open Platform)
> "High-quality educational content and intelligent services, **delivered on demand through unified open APIs**"
> Capabilities: platform core capabilities / open capabilities / solutions / documentation / console
> Onboarding process: **four steps complete the partnership preparation from application to integration**

> ✅ **This is the most important actionable recommendation in this report regarding "question-bank licensing": if you want a commercial question bank, apply for API authorization through `dev.21cnjy.com`, rather than crawling.**

**Similar commercial platforms (also require authorization):**

| Platform | URL | Notes |
| --- | --- | --- |
| zxxk | <https://www.zxxk.com/> | Product lines include e-paper/e-lesson-plan/online-school |
| Jyeoo | <https://www.jyeoo.com/> | Paper generation, grading |
| 21cnjy paper generation | <https://zujuan.21cnjy.com/> | **Has an open-platform API** |
| Chujuan question bank | <https://tiku.chujuan.cn/> | 21cnjy friendly link |

---

### 3.8 ⭐ Three-category list (compliance red lines)

#### 🟢 Category A: may be legally crawled / cited

| Item | URL | Reason |
| --- | --- | --- |
| Compulsory Education Curriculum Plan and Curriculum Standards (2022 edition) | <http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html> | Government public information |
| Guangdong zhongkao reform implementation opinion | <https://edu.gd.gov.cn/zwgknew/jyzcfg/gfxwj/content/post_4244085.html> | Government public information (regulatory document) |
| National joint admissions brochure | <https://www.gatzs.com.cn/gatzs/pz/hongkong/202601/20260120/2293447012.html> | Official release |
| Macao recommendation instructions + university brochures | <https://portal.dsedj.gov.mo/webdsejspace/addon/upload/Upload_viewfile_page.jsp?id=705896> | Macao SAR government public information |
| Four-university joint exam syllabus (2027) | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JC01.pdf> etc. | Proactively published by the four universities, free, no login required |
| Four-university joint exam past papers and suggested answers | <https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant> | Same as above (**recommend link aggregation rather than mirroring**) |
| NOI Syllabus 2025 | <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf> | Officially published by CCF |
| OI Wiki | <https://oi-wiki.org/> | CC BY-SA, **attribution + share-alike required** |
| OpenStax open textbooks | <https://openstax.org/license> | CC BY series |
| National Smart Education Platform for Primary and Secondary Schools (metadata) | <https://basic.smartedu.cn/tchMaterial> | Catalog/knowledge-point structure is factual information; **textbook original text is a separate matter** |

#### 🟡 Category B: user self-import only

| Item | Reason |
| --- | --- |
| PDF original text of PEP/other editions of textbooks | Protected by copyright; free on the platform ≠ authorized for redistribution |
| Guangdong zhongkao / gaokao past-paper PDFs | The paper as a whole is protected; personal study is fine, distribution is not |
| Hong Kong-Macao-Taiwan joint exam past papers | No official public channel found; circulating versions carry high copyright risk |
| Four-university joint exam PDFs (if making an offline package) | Publicly downloadable, but **authorization for distribution with software is unclear** |
| NOI / CSP past questions | **Copyright belongs to CCF** (AK CSP also marks "non-commercial teaching use") |
| Documents uploaded by users on various sites (book118/Baidu Wenku, etc.) | Ownership unclear; not citable |

#### 🔴 Category C: must purchase authorization

| Item | URL | Authorization entry |
| --- | --- | --- |
| zxxk resources | <https://www.zxxk.com/> | Business cooperation (agreement explicitly prohibits crawling and redistribution) |
| Jyeoo question bank | <https://www.jyeoo.com/> | Business cooperation (robots prohibits API and detail pages) |
| 21cnjy paper-generation question bank | <https://zujuan.21cnjy.com/> | ✅ **<https://dev.21cnjy.com/> open-platform API** (recommended route) |
| Other commercial question banks | tiku.chujuan.cn etc. | Business cooperation |

---

## 4. Engineering design of paper generation and PDF output

### 4.1 Paper-generation algorithm

**Input (constraints):**

```yaml
blueprint:
  subject: mathematics
  grade: grade 9
  exam_region: Guangdong
  total_score: 120
  duration_min: 120
  kp_weights:            # knowledge-point coverage requirements
    quadratic equations in one variable: 0.20
    quadratic functions: 0.25
    similar triangles: 0.15
    circles: 0.20
    statistics and probability: 0.10
    other: 0.10
  difficulty_dist:       # difficulty distribution (1–5)
    1: 0.30
    2: 0.35
    3: 0.20
    4: 0.10
    5: 0.05
  type_quota:            # question-type quotas (example; in practice reverse-engineer from real paper layouts)
    single_choice: {count: 10, score: 3}
    fill_blank:    {count: 5,  score: 3}
    calculation:   {count: 7,  score: 8}
    proof:         {count: 2,  score: 10}
  exclude_recent_years: 3   # exclude questions already done in the last 3 years
  exclude_question_ids: []
```

**Algorithm flow ([Inference], engineering recommendation):**

```
Step 1 · Candidate set construction (SQL, seconds)
   SELECT ... FROM questions q
   WHERE q.subject=? AND q.difficulty=? AND q.qtype=?
     AND q.review_status IN ('auto_passed','human_verified')
     AND q.grade IN (...)
     AND EXISTS (SELECT 1 FROM question_kp qk WHERE qk.question_id=q.id AND qk.kp_id IN (...))

Step 2 · Stratified quota partitioning
   Build two-dimensional buckets by (question type × difficulty); target count per bucket = quota × difficulty distribution

Step 3 · Constrained selection (within each bucket)
   3.1 Scoring: score = w1·knowledge-point match + w2·difficulty fit + w3·novelty(1/(1+times done)) + w4·random perturbation
   3.2 Greedy + backtracking: satisfy scarce buckets (high difficulty × specified knowledge point) first
   3.3 Hard-constraint validation:
       - knowledge-point coverage ≥ threshold (e.g., 90%)
       - difficulty distribution chi-square test p > 0.05
       - total score exactly equals total_score
       - no deduplication conflicts

Step 4 · Deduplication (critical; must be done in real time during selection)
   4.1 Exact deduplication: stem SHA-256 / question-number conflict
   4.2 Approximate deduplication: SimHash Hamming distance ≤ 3 is considered duplicate
        - Generate: jieba tokenization → term-frequency vector (64-dim) → SimHash → 64-bit hex
        - Store in questions.simhash, build an index; during selection, O(1) lookup + Hamming distance comparison
   4.3 Semantic deduplication (optional, more expensive): vector cosine > 0.95 is considered duplicate
   4.4 Write the result back to questions.dedup_group

Step 5 · Assembly and fine-tuning
   Assemble in order, question number, and score according to paper_templates.sections
   Validate total score and duration → generate paper_questions records

Step 6 · Diversity check (avoid the whole paper coming from one source)
   Questions with the same source_name+year ≤ 40%
```

**Optional advanced step: IRT (Item Response Theory) difficulty calibration**
- **[Inference]** Use historical `attempts` data (correct rate) to infer actual question difficulty and correct the manually labeled `difficulty`. Questions with fewer than 200 answer attempts do not participate in calibration. This does not apply to scenarios with small samples such as the "Macao four-university joint exam."

---

### 4.2 Paper structure template (Chinese exams)

**[Fact] Guangdong zhongkao (province-level unified question-setting, from the provincial education department regulatory document):**

| Item | Stipulated value |
| --- | --- |
| Subjects | 9 academic subjects set uniformly at the provincial level; Guangzhou and Shenzhen pilot independent question-setting |
| Scores | Chinese/Mathematics/Foreign Language **120** each; other subjects **100** each (Foreign Language includes 30 points for listening and speaking) |
| Duration | Chinese/Mathematics **120 min**; Foreign Language 90 min; Physics/History 80 min; Morality and Rule of Law/Geography/Chemistry/Biology 60 min |
| Basis | *Compulsory Education Curriculum Plan and Curriculum Standards* (2022 edition) |
| Implementation | From 2023-09-01, valid for 5 years |

> ⚠️ **[Unverified]** The official **has not published** a detailed specification at the level of "questions 1–10 single choice, 3 points each."
> **[Inference]** The question-type/score details of paper-generation templates can only be **reverse-engineered from public past-paper layouts**. Recommend honestly noting in the `paper_templates.basis_note` field: "Structure reverse-engineered from public past-paper layouts, not an official detailed specification," and prompting users in the UI that they can customize it.

**[Unverified] The official question-type specification for the Guangdong New Gaokao Paper I.** This research did not locate an official document published by the National Education Examinations Authority containing details such as "8 single choice + 3 multiple choice + 3 fill-in-the-blank + 5 free-response"; versions circulating online mostly come from supplementary materials and self-media. **[Recommendation]** Handle it the same way: templates can be freely edited in the UI by users and saved as custom templates (the `paper_templates` table already supports `version` and `basis_note`).

---

### 4.3 Technical route for PDF output (versions/licenses/star counts all measured)

| Route | Component | License | ★ | Size | Chinese | Math formulas | Conclusion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Typst** | <https://github.com/typst/typst> (PyPI `typst` 0.15.0, `messense/typst-py` ★355) | **Apache-2.0** | 56,354 | ✅ **Single binary, about 30–50 MB** | ✅ Font embedding, good CJK line breaking | ✅ Native math mode | 🏆 **First choice** |
| **LaTeX + exam-zh** | CTAN <https://ctan.org/pkg/exam-zh>; repository <https://github.com/xkwxdyy/exam-zh> | **LPPL-1.3c** | 43 | ❌ Full TeX Live **several GB**; even a minimal install is hundreds of MB | ✅✅ Ceiling of Chinese exam-paper typesetting | ✅✅ Strongest | 🥈 Alternative/advanced |
| Pandoc | <https://github.com/jgm/pandoc> (PyPI `pypandoc` 1.17, MIT) | **GPL-2.0** | 46,463 | ⚠️ Single file about 150 MB | ⚠️ Depends on backend | ⚠️ Depends on backend | Converter, not typesetter |
| WeasyPrint | <https://github.com/Kozea/WeasyPrint> (PyPI 70.0) | **BSD** | 9,651 | ✅ Small | ✅ | ⚠️ Limited MathML support | Alternative (simple papers) |
| headless Chromium | Playwright 1.63.0 (Apache-2.0) | Apache-2.0 | — | ❌ Hundreds of MB | ✅ | ✅ (with KaTeX/MathJax) | Not recommended (size) |
| ReportLab / fpdf2 | PyPI 5.0.1 (BDS) / 2.8.9 (**LGPL-3.0**) | BSD / LGPL | — | ✅ | ⚠️ Chinese must be handled manually | ❌ | Not recommended |

**[Fact] Two Chinese exam-paper templates (measured licenses and status):**

| Template | Repository | License | ★ | Status |
| --- | --- | --- | --- | --- |
| **exam-zh** | <https://github.com/xkwxdyy/exam-zh> | **LPPL-1.3c** | 43 | 🔴 **The author has suspended maintenance indefinitely since 2024-04-26** (warning in the README original text) |
| **ezexam** (Typst) | <https://github.com/gbchu/ezexam> (Typst Universe <https://typst.app/universe/package/ezexam/>) | ⚠️ **AGPL-3.0-or-later** | 42 | 🟢 Active (latest 0.3.1, 2026-04-07), docs <https://ezexam.pages.dev/>, **inspired by exam-zh** |
| shuxuejuan (Typst) | <https://github.com/VWWVVW/shuxuejuan> (Universe <https://typst.app/universe/package/shuxuejuan>) | **MIT** | 3 | 🟢 Active (0.2.0, 2026-06-24) |

> 🔴 **[Fact] ezexam is AGPL-3.0.** If "Gezhi" is closed source, **ezexam cannot be packaged into the product** (AGPL's network-distribution clause is viral).
> ✅ **Viable approaches**: ① refer to its API design and write your own template (**ideas are not protected by copyright; code is**); ② or guide users to install it **themselves** from Typst Universe (`typst init @preview/ezexam`), with the product only generating `.typ` source code.
> ✅ **shuxuejuan is MIT**, freely usable, but has fewer features and fewer stars (3) than ezexam, so its maturity needs assessment.

**[Fact] Composition of exam-zh (measured CTAN file list):**
```
exam-zh.cls (72 KB)              exam-zh-question.sty (63 KB)
exam-zh-choices.sty (24 KB)      exam-zh-symbols.sty (52 KB)
exam-zh-font.sty (20 KB)         exam-zh-math.sty (16 KB)
exam-zh-textfigure.sty (27 KB)   exam-zh-chinese-english.sty (20 KB)
exam-zh-counter.sty              exam-zh-circlednumber.sty
doc/exam-zh-doc.pdf (2 MB)       examples/00-minimal.tex etc.
```
Features: separation of format and content, automatic option layout with the `choices` environment, **easy design of the sealing line (sealline)**, cross-platform on Windows/macOS/Linux, and support for exams from primary school to university.

**[Inference] Recommended architecture: Typst primary route + optional LaTeX export**

```
Question bank (SQLite)
   │
   ├─(1) Generate structured intermediate representation paper.json
   │      {meta, sections:[{title, questions:[{stem, options, score, kp}]}]}
   │
   ├─(2) Render to Typst source (.typ)
   │      ├─ custom template exam-paper.typ     → exam paper (two-column/one-column, sealing line, score boxes)
   │      ├─ custom template answer-sheet.typ   → answer sheet (bubble area + subjective-answer boxes)
   │      ├─ custom template solution.typ       → answer explanation (step-by-step)
   │      └─ custom template quick-answer.typ   → quick answer key (table)
   │
   ├─(3) typst compile --font-path ./fonts x.typ x.pdf
   │      └─ distribute Typst binary (Apache-2.0) + Source Han Serif/Sans subset with the product
   │
   └─(4) [Optional] also output .tex (exam-zh style) for advanced users to compile themselves
          └─ the product does not distribute a TeX distribution; it only prompts "TeX Live / MiKTeX must be installed separately"
```

**Chinese typesetting and formula considerations ([Inference], engineering experience):**

| Issue | Handling |
| --- | --- |
| Fonts | Body text Source Han Serif (Noto Serif CJK SC) / headings Source Han Sans; in Typst use `#set text(font: ("Noto Serif CJK SC", "Times New Roman"))` to separate Chinese and Western text |
| Math font | In Typst use `#show math.equation: set text(font: "New Computer Modern Math")`; in LaTeX use `unicode-math` + `newtxmath` |
| Punctuation compression | Typst already handles CJK punctuation by default; in LaTeX use `\punctstyle` from the `ctex` package |
| Keep questions from being split | Typst: `#block(breakable: false)[...]`; LaTeX: `\needspace{5\baselineskip}` |
| Line spacing | Exam papers commonly use 1.2–1.5×; `#set par(leading: 0.8em)` |
| Font size | Body text size 5 (10.5pt) / size 4 (12pt); Typst `#set text(size: 10.5pt)` |
| Two columns | Typst `#set page(columns: 2)`; LaTeX `\documentclass[twocolumn]{exam-zh}` |
| Answer-sheet bubble area | Use a Typst `table` + circled symbols (`①②③④`) or draw `circle()` yourself; leave enough room for 2B-pencil filling |
| Chemical equations | ezexam already supports single-line/double-line bridges and atomic/ionic structure diagrams ([Fact] see its CHANGELOG v0.1.6) |

---

### 4.4 Reference open-source paper-generation / question-bank projects (all **measured to exist**)

| Project | Repository | ★ | License | What can be learned |
| --- | --- | --- | --- | --- |
| **math-question-bank** | <https://github.com/JudgePeach/math-question-bank> | 276 | ⚠️ **AGPL-3.0** | Localized high-school mathematics question-bank management; **real-time LaTeX rendering + LLM AI explanation + OCR formula recognition**. Its features overlap heavily with Gezhi; **architecture reference only—the code cannot be used in a closed-source product** |
| **MathCyclus Lingxi Question Bank Assistant** | <https://github.com/JinLingxi/MathCyclus---Lingxi-Question-Bank-Assistant> | 140 | ⚠️ **No License** | Streamlit + LaTeX automated question-bank management and intelligent paper generation; OCR recognition + TikZ real-time rendering + automatic archiving. **No License = all rights reserved; cannot copy** |
| gichul-workbench | <https://github.com/rochelobeJYJ/gichul-workbench> | 2 | ⚠️ **No License** | **Most on-point methodology**: past-paper PDF → crop by question number → transcribe → classify by course unit → generate printable question sets |
| NCEE | <https://github.com/fihyer/NCEE> | 1 | ⚠️ **No License** | Compilation of past gaokao mathematics papers (data unusable) |
| exam-zh | <https://github.com/xkwxdyy/exam-zh> | 43 | LPPL-1.3c | Chinese exam-paper LaTeX typesetting (**no longer maintained**) |
| ezexam | <https://github.com/gbchu/ezexam> | 42 | ⚠️ AGPL-3.0 | Typst exam-paper/lecture-note templates, excellent API design (**ideas can be referenced**) |

> 🔴 **License warning summary**: the 3 projects in the table above marked "No License" default to **all rights reserved**. AGPL projects cannot be used in closed-source products.
> **Gezhi should build its own**, treating these projects as **feature benchmarks and design references**, without copying code or data.

---

## 5. Data implementation scale and storage strategy

### 5.1 Summary of measured and estimated scale

| Category | Measured/estimated | Basis |
| --- | --- | --- |
| **Original textbook PDFs (target subset: 1,742 books)** | **138.6 GB** | ✅ Measured (sum of platform metadata `ti_size`) |
| Of which: primary 880 books | 76.7 GB | ✅ Measured |
| Of which: junior 352 books | 24.3 GB | ✅ Measured |
| Of which: senior 516 books | 37.6 GB | ✅ Measured |
| Total textbook pages | ≈ **166,000 pages** | [Inference] 138.6 GB ÷ 872 KB/page (measured median bitrate) |
| Extracted plain text | ≈ 330–450 MB | [Inference] 100–150 million characters × 3 B |
| Number of chunks (600 characters + 80 overlap) | ≈ **180,000** | [Inference] |
| Vectors (fp32 / 1024-dim) | ≈ 738 MB | [Inference] |
| Vectors (int8 quantized) | ≈ 184 MB | [Inference] |
| FTS5 inverted index | ≈ 200–400 MB | [Inference] |
| Page thumbnails (optional) | ≈ 2.5 GB | [Inference] 166,000 × 15 KB |
| **Knowledge-base offline package (excluding textbook original text)** | **≈ 1.2–1.8 GB** (4–5 GB with thumbnails) | [Inference] |
| Question bank: single-question structured JSON | ≈ 3–8 KB | [Inference] |
| Question bank: **100,000 questions** | **≈ 0.3–0.8 GB** | [Inference] |
| Question bank: 400,000 questions (including vectors) | ≈ 2.5–4 GB | [Inference] |

### 5.2 Tiered strategy recommendation (**core conclusion**)

| Tier | Content | Size | Distribution method | Compliance basis |
| --- | --- | --- | --- | --- |
| **L0 · With the installer** | Program itself + Typst binary + Chinese font subset + **knowledge-tree skeleton** (curriculum-standard catalog + NOI syllabus structure + knowledge-point graph) + a small number of **officially public** questions (four-university joint exam link metadata) | **≤ 150 MB** | Bundled in installer | All factual structure / official public information / Apache-2.0 components |
| **L1 · Downloaded on first run** | Structured knowledge base: FTS5 index + vectors + chunks (**excluding textbook original text**) + thumbnails | **1.2–5 GB** | Download from own CDN, resumable | **Derived data, excluding protected original text**; [Inference] legal confirmation of the "derived data" boundary is needed |
| **L2 · User on-demand download** | Structured output of a single textbook (only download the book the user specifies) | **2–8 MB** per book | Pull on demand | Same as above |
| **L3 · User self-import** | Textbook PDF original text, past-paper PDFs; the software provides **official page redirection** and **one-click import** | **up to 139 GB** | **Never enters any server; local machine only** | **This is where the compliance red line lies**: the product does not do it, store it, or transmit it |
| **L4 · Commercially licensed content** | Question banks from zxxk/Jyeoo/21cnjy open platform | Depends on license | Pull through authorized API, **subject to terms** | Must sign an agreement |

> 🎯 **One-sentence decision**:
> **L0 bundled, L1 first download, L3 user import, L2 on demand. Textbook original text always goes through L3.**

### 5.3 Estimated local disk usage on the user's machine

| Scenario | Disk usage |
| --- | --- |
| Software + knowledge base only | **≈ 2–6 GB** |
| + user imports "all PEP subjects from primary to senior high" | ≈ +5 GB (the measured 269 PEP books total only 5.41 GB) |
| + user imports "all target subsets on the platform" | ≈ +139 GB |
| Recommended UI prompt | "Textbook original text takes up a lot of space; we recommend importing on demand, or specifying an external disk/network drive as the content directory" |

---

## 6. Conclusions and "one-sentence recommendations"

### 6.1 Summary of core facts measured in this report

| # | Fact | Source |
| --- | --- | --- |
| 1 | The National Smart Education Platform for Primary and Secondary Schools has an **authentication-free public catalog API**, covering **3,579** entries / **2,925** electronic textbooks | Measured `s-file-1.ykt.cbern.com.cn` |
| 2 | The target subset for primary/junior/senior high = **1,742 PDFs / 138.59 GB** | Measured by summing `ti_size` per book |
| 3 | Textbook PDF median bitrate **872 KB/page** → **very likely no text layer; OCR is a mandatory stage** | [Inference] based on measured size + page count |
| 4 | Guangdong zhongkao: 9 subjects set uniformly at the provincial level, Chinese/mathematics/foreign language 120 points each, mathematics 120 minutes | Original regulatory document of the provincial education department |
| 5 | National joint admissions: science/engineering and humanities each have 5 subjects, 150 points per subject, total 750 | Original 2026 admissions brochure |
| 6 | Four-university joint exam **syllabus + past papers + suggested answers** officially and freely public | Cross-verified on UM Registry + Macao University of Tourism |
| 7 | The zxxk agreement **explicitly prohibits** crawling and also lists "creating crawling tools" as a violation | Original zxxk user agreement |
| 8 | 21cnjy Education has a **formal open-platform API** (`dev.21cnjy.com`) | Measured site |
| 9 | SQLite FTS5 `unicode61` treats Chinese characters as token characters → **Chinese search will fail** | SQLite official documentation §4.3.1 |
| 10 | PyMuPDF is **AGPL-3.0 / commercial dual-licensed** | PyPI metadata |
| 11 | ezexam is **AGPL-3.0**; exam-zh is **LPPL-1.3c and no longer maintained** | Measured on GitHub + Typst Universe |
| 12 | AK CSP's `/api/` is **explicitly prohibited from crawling** in robots.txt | Measured robots.txt |

### 6.2 One-sentence recommendations (five decisions)

1. **Textbook source strategy**: Take **official links to the National Smart Education Platform for Primary and Secondary Schools + user local import + local parsing** as the only path; the product distributes only the **structured derived knowledge base (1–2 GB)**, **never the textbook original text**, and is equipped with a disclaimer and three-tier architectural isolation.

2. **OCR and structuring approach**: **PyMuPDF text-layer probe branching → if no text layer, RapidOCR (Apache-2.0, ONNX, offline and lightweight) as the baseline + pix2tex (MIT) for formulas → formula-heavy pages processed offline on your own build machine with docling (MIT) / MinerU**, with heavy models not distributed with the product.

3. **Vector retrieval approach**: **SQLite single file + FTS5 (jieba pre-tokenization written in, bypassing the unicode61 Chinese defect) + sqlite-vec (MIT/Apache dual license, 1024-dim bge-m3) + RRF fusion + grade/subject metadata pre-filtering**; 180,000 chunks total about 1.2–1.8 GB, fully offline with zero server.

4. **Question-bank acquisition priority**: **① Official free public sources** (NOI syllabus, four-university joint exam syllabus and past papers, joint-admissions brochure, Macao recommendation instructions) → **② user self-import** (Guangdong zhongkao/gaokao/joint exam past-paper PDFs; the product only provides official redirection and an importer) → **③ commercial licensing** (sign an agreement through the `dev.21cnjy.com` open-platform API; **never crawl**).

5. **Paper generation and export approach**: **Typst (Apache-2.0, single binary) with four custom templates** (exam paper / answer sheet / answer explanation / quick answer key); on the question-bank side, use **SimHash + knowledge-point coverage + difficulty-distribution chi-square test** for constrained paper generation; **exam-zh serves only as a typesetting-capability benchmark, not a runtime dependency** (no longer maintained + TeX distribution size).

---

## Appendix A · List of URLs measured and verified in this research

**Official/government**
- <https://basic.smartedu.cn/> · <https://basic.smartedu.cn/tchMaterial> · <https://www.zxx.edu.cn/>
- <https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json> (and `part_100..103.json`, `ndrv2/.../details/{id}.json`)
- <http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html>
- <https://edu.gd.gov.cn/zwgknew/jyzcfg/gfxwj/content/post_4244085.html>
- <https://www.gatzs.com.cn/gatzs/pz/hongkong/202601/20260120/2293447012.html>
- <http://www.eeagd.edu.cn/lzks/> · <http://eea.gd.gov.cn/> · <https://gaokao.chsi.com.cn/>
- <https://portal.dsedj.gov.mo/webdsejspace/internet/Inter_main_page.jsp?id=80793&>
- <https://portal.dsedj.gov.mo/webdsejspace/addon/upload/Upload_viewfile_page.jsp?id=705896>
- <https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id=110250&fileName=电子科技大学.pdf>
- <https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant>
- <https://www.utm.edu.mo/admission/sc/undergraduate_programmes/joint-admission-examination/jae-syllabus-and-past-examination-papers/index.html>
- <http://www.gaes.gov.mo/unification/Math_StandardPaper_MockPaper_SuggestedAnswer.pdf>
- <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf>
- <http://zy.gdedu.gov.cn/> · <http://zy.gdmzedu.cn/> · <https://www.pep.com.cn/>

**Technical documentation / licenses**
- <https://www.sqlite.org/fts5.html> (§4.3.1 unicode61, §4.3.4 trigram)
- <https://pypi.org/pypi/{PyMuPDF,pdfplumber,pypdf,pdfminer.six,paddleocr,paddlepaddle,rapidocr,rapidocr-onnxruntime,easyocr,pytesseract,mineru,magic-pdf,marker-pdf,docling,unstructured,nougat-ocr,surya-ocr,olmocr,sqlite-vec,lancedb,chromadb,qdrant-client,faiss-cpu,jieba,pkuseg,LAC,hanlp,sentence-transformers,FlagEmbedding,rank-bm25,bm25s,onnxruntime,typst,pypandoc,weasyprint,reportlab,fpdf2,pix2tex,playwright,xhtml2pdf,borb,jinja2,python-docx,openpyxl,fastapi,pyside6,pyqt6}/json
- <https://mirror.koddos.net/CTAN/macros/xetex/latex/exam-zh/> (LICENSE = LPPL-1.3c)
- <https://mirror.aria-on-the-planet.es/CTAN/macros/xetex/latex/exam-zh/README.md>
- <https://typst.app/universe/package/ezexam/> · <https://typst.app/universe/package/shuxuejuan>
- <https://openstax.org/license> · <https://oi-wiki.org/>

**Repositories (measured to exist + star counts + License)**
- <https://github.com/PaddlePaddle/PaddleOCR> (★90,478, Apache-2.0) · <https://github.com/RapidAI/RapidOCR> (★8,016, Apache-2.0) · <https://github.com/tesseract-ocr/tesseract> (★76,777)
- <https://github.com/opendatalab/MinerU> (★80,914, custom license) · <https://github.com/datalab-to/marker> (★40,133, Apache-2.0) · <https://github.com/docling-project/docling> (★68,239, MIT) · <https://github.com/Unstructured-IO/unstructured> (★15,520, Apache-2.0) · <https://github.com/facebookresearch/nougat> (★10,081, weights CC-BY-NC-4.0) · <https://github.com/datalab-to/surya> (★21,431) · <https://github.com/allenai/olmocr> (★19,684) · <https://github.com/lukas-blecher/LaTeX-OCR> (★16,577, MIT)
- <https://github.com/pymupdf/PyMuPDF> (★10,812, AGPL/commercial dual license) · <https://github.com/jsvine/pdfplumber> (★10,786, MIT) · <https://github.com/py-pdf/pypdf> (★10,241)
- <https://github.com/asg017/sqlite-vec> (★8,155, MIT/Apache-2.0) · <https://github.com/lancedb/lancedb> (★11,567) · <https://github.com/chroma-core/chroma> (★29,418) · <https://github.com/qdrant/qdrant> (★34,891) · <https://github.com/facebookresearch/faiss> (★41,005, MIT)
- <https://github.com/fxsjy/jieba> (★35,175, MIT) · <https://github.com/baidu/lac> (★4,001, Apache-2.0) · <https://github.com/FlagOpen/FlagEmbedding> (★12,209) · <https://github.com/xhluca/bm25s> (★1,797) · <https://github.com/dorianbrown/rank_bm25> (★1,397)
- <https://github.com/typst/typst> (★56,354, Apache-2.0) · <https://github.com/jgm/pandoc> (★46,463, GPL-2.0) · <https://github.com/Kozea/WeasyPrint> (★9,651, BSD) · <https://github.com/messense/typst-py> (★355)
- <https://github.com/xkwxdyy/exam-zh> (★43, LPPL-1.3c, no longer maintained) · <https://github.com/gbchu/ezexam> (★42, AGPL-3.0) · <https://github.com/VWWVVW/shuxuejuan> (★3, MIT)
- <https://github.com/JudgePeach/math-question-bank> (★276, AGPL-3.0) · <https://github.com/JinLingxi/MathCyclus---Lingxi-Question-Bank-Assistant> (★140, no License) · <https://github.com/rochelobeJYJ/gichul-workbench> (★2, no License) · <https://github.com/fihyer/NCEE> (★1, no License)
- <https://github.com/OI-wiki/OI-wiki> (★26,788, CC BY-SA) · <https://github.com/hantang/smartedu-dl-go> · <https://github.com/maplexuci/pdf_book_download_from_zxxeducn>

**Commercial platforms (terms measured)**
- <https://m.zxxk.com/api/v1/agreement/user> · <https://www.zxxk.com/service/detail-773373.html> · <https://www.zxxk.com/robots.txt> (empty)
- <https://www.jyeoo.com/robots.txt> · <https://www.jyeoo.com/support>
- <https://zujuan.21cnjy.com/help/vip> · <https://zujuan.21cnjy.com/help/copyright> · <https://dev.21cnjy.com/>

**Reference implementation**
- <https://www.cspfirstround.com/> · <https://www.cspfirstround.com/papers> · <https://www.cspfirstround.com/paper/cspj-2025> (and `cspj-2019`…`csps-2026`, `noip-2010`…`noip_senior-2018`, 34 papers in total)
- <https://www.cspfirstround.com/q/cspj-2025-04> · <https://www.cspfirstround.com/topic/动态规划>
- <https://www.cspfirstround.com/about> · <https://www.cspfirstround.com/robots.txt> · <https://www.cspfirstround.com/sitemap.xml>

---

## Appendix B · Things **deliberately not done** in this research (compliance statement)

1. ❌ **Did not download the body file of any textbook.** Only the platform's public **catalog and file metadata** (book title, publisher, byte size, tags) were obtained, for scale estimation. Download volume: 4 catalog shards (33.5 MB) + 3,579 detail JSON requests.
2. ❌ **Did not crawl question content from any question-bank website.** Only homepages, help pages, `robots.txt`, `sitemap.xml`, terms of service, and copyright notice pages were accessed, to determine compliance boundaries.
3. ❌ **Did not bypass any login, paywall, or access control.** All requests were made while not logged in.
4. ❌ **Did not call AK CSP's `/api/` endpoints** (its robots.txt explicitly has `Disallow: /api/`); only probed a nonexistent path to confirm the API exists.
5. ✅ For copyrighted content, **only URLs were recorded**, not content copied.
6. ✅ All numbers in this report are labeled with their **measured** or **inferred** source.

> **⚠️ The first action item to hand to the "Gezhi" product team**:
> Before writing the first line of crawling code, ask legal to confirm three things:
> ① the redistribution boundary of structured derived data (chunks / vectors / knowledge-point graph);
> ② whether the four-university joint exam PDFs can be distributed with the software (or can only be linked);
> ③ if pursuing commercial licensing, the budget and the onboarding conditions of `dev.21cnjy.com`.
