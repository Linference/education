# Gezhi Future Optimization: GitHub Project Research

The following suggestions are based on Gezhi's existing Electron / React / SQLite / Typst architecture; open-source project capabilities come from their official repositories. No performance or recognition-accuracy tests have yet been run on these candidates within this project, and the current version does not integrate these new dependencies.

| Priority | Direction | Reference project | Landing point in Gezhi |
| --- | --- | --- | --- |
| First batch | Scanned question-bank recognition | [RapidOCR](https://github.com/RapidAI/RapidOCR), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | Try offline OCR for ordinary scanned questions first; test PP-StructureV3 separately for complex formulas, tables and layouts. Keep the existing per-question preview, show the corresponding region of the original image, and retain manual corrections. |
| First batch | Repeatable verification of six-dimensional feedback | [Promptfoo](https://github.com/promptfoo/promptfoo) | Build teacher-annotated samples and check citation, missing-condition, no-evidence-dimension, and repeated-scoring stability, as well as latency and call cost. Engineering test doubles cannot replace scoring calibration. |
| First batch | Page-number evidence in answers | [LanceDB](https://github.com/lancedb/lancedb) | First add document segmentation, page numbers and source jump links to the existing SQLite retrieval; test a local vector index only when semantic recall is needed. |
| Second batch | Forgetting-aware review scheduling | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | Schedule delayed retests based on recall performance after real review, and connect them to the Evidence Map. AI six-dimensional scores cannot directly serve as memory scores. |
| Second batch | Draw while explaining | [Excalidraw](https://github.com/excalidraw/excalidraw) | Add whiteboards, function sketches and force analysis in the role space; save the canvas and explanation records. Handwritten math recognition requires separate verification. |
| Second batch | Offline voice fallback | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Add an optional downloadable multilingual speech model as a fallback for the existing cloud transcription. Do not use the `.en` model for Chinese. |
| Later | Character performance in the space | [TalkingHead](https://github.com/met4citizen/TalkingHead), [three-vrm](https://github.com/pixiv/three-vrm) | The current two-dimensional characters can first gain states and expressions. Real-time three-dimensional lip-sync requires a suitable model and Chinese adaptation; generated PNGs cannot automatically become a drivable three-dimensional character. |
| Later | Update experience | [electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater) | Test NSIS differential updates and signature checks, while still providing a complete installer that includes DSH; rollback and data backup need additional implementation. |

TalkingHead's built-in lip-sync language list does not include Chinese, and its demo character assets cannot all be copied under the MIT license. When adopting the code, also verify the model and asset licenses.

The existing D3 layout worker can complete a regression check with 1,500 nodes / 3,000 links; there is no rush to replace the graph engine. If a larger-scale measured performance bottleneck appears later, [Sigma.js](https://github.com/jacomyal/sigma.js)'s WebGL rendering can be compared.

Once the software is more polished, what is most worth adding is real student trials and teacher-score comparison: use actual tasks, delayed retests and transfer questions to test learning value, and avoid evaluating results solely by interface completeness.
