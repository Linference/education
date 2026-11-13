# Gezhi competition introduction video: requirements and production plan

Status: the final cut is complete and has passed the final media check. AI-generated Markdown and MD/PDF/DOCX reading have all been included in the demonstration. Actual duration 4 minutes 39.63 seconds.
Date: 2026-10-02 (Asia/Shanghai).
Basis: the "Global Youth AI Innovation Competition (2).pdf" provided by the user; all six scanned pages of the original have been reviewed page by page; the project's old storyboard serves only as background, and the new features follow Gezhi 0.0.2's actual implementation.
Production method: per the user's request, the motion-video skill and its templates were not used. Real application operation footage and independently arranged animation, compositing, voiceover, subtitles, and sound design were used.

## 1. Charter requirements and production recommendations

| Item | Original requirement / verified fact | This plan |
| --- | --- | --- |
| Video duration | PDF page 4: English demonstration video no more than 5 minutes | Target 4 minutes 30 seconds; end card and all subtitles count toward the total |
| Video language | Page 4: English video, must have clear English narration or English description; video subtitles and other submitted content accepted in English only | English narration, English hard subtitles, English titles and demo questions; Chinese is used only for internal planning and narration comparison drafts |
| Demonstration content | Page 3: the work must have actually functioning AI features, an operable prototype, and basic educational-context testing | Record real clicks, input, AI follow-up questions and feedback; distinguish model verification, AI feedback, and self-assessment |
| Work photos | Page 4: demonstration materials include photos of the work and a video | Separately export work screenshots from the real demonstration flow; 6 suggested, the charter does not specify the number |
| Submission method | Page 4: upload in the format specified by the registration system, or provide a publicly accessible link | Deliver the MP4 locally; uploading or public linking is handled separately after production |
| Filename | Page 4: DemoVideo_ProjectName.mp4 or a video link file | DemoVideo_Gezhi.mp4 |
| File size | Page 4's "each file no more than 50 MB" applies to text documents and poster PDFs; there is no explicit video size limit | Produce an HD version and prepare a compressed backup of about 45 MB; whether it meets the system limit is subject to the actual upload requirements |
| Date | Page 4: submission deadline 2026-10-09; the schedule may be adjusted according to the latest announcement | Prepare according to the October 9 arrangement given in the attachment; no claim is made that subsequent announcements have been checked |
| AI use and evidence | Page 6: generative AI / API assistance is allowed, but the name, applicable version, purpose, and the parts completed by students must be disclosed; data must not be fabricated | Accompanying AI production disclosure; test data is labeled by nature, and software testing is not packaged as student learning effects |
| Participating student involvement | Page 5: all three students should participate in the final demonstration or defense | This is not a rule that the video must have all three voice actors or on-camera appearances |

Resolution, frame rate, video codec, and background music are not hard specifications in this charter. This plan recommends 1920×1080, 30 fps, H.264 video, and AAC audio, balancing software text clarity and playback compatibility.

The charter contains "work content accepted in English only", but does not separately define whether the software interface must be entirely in English. To make it easier for English-speaking judges to read, it is recommended to make the actual recorded path an operable English demo mode while keeping the everyday Chinese interface. Questions, materials, follow-up questions, and AI answers are also in English; English annotations cannot replace the readability of the core content.

## 2. Film positioning and visual direction

Title: **Gezhi — Make Understanding Visible**.
Chinese working title: **Gezhi: Making Understanding Visible**.
Core narrative: starting from a wrong answer where "I thought I understood it", demonstrate how Gezhi helps students state their reasoning, discover misconceptions, apply it in new contexts, and leave a reviewable learning record.

The visuals use Gezhi's existing dark, purple theme. The software occupies most of the frame, and the little Gezhi companion becomes the visual focus at key feedback moments. Abstract animation is used mainly for the opening, flow connections, and brief technical explanations.

Motion design:

1. **Continuous camera movement**: smoothly move, push in, and pull out between the full software view, a question detail, the digital avatar, and evidence nodes, keeping interface text sharp.
2. **Shape continuity**: a submitted answer card contracts into an evidence node; the node expands into the corresponding record; the curve of a function graph extends into a graph connection line. Continuity animation is used to explain the flow, while actual operation footage proves the feature works.
3. **Action continuity**: clicks, answer appearances, and the entry direction of the next shot are consistent, using the same action to lead into the next segment.
4. **Weighted easing**: main transitions about 0.6–1.0 seconds, text entering in about 0.25–0.4 seconds, with a small amount of depth of field and motion blur for transitions. The image stays stable while reading, avoiding constant floating or excessive tilting.
5. **Sound continuity**: narration can enter the next shot early; light sound effects are used for clicks, submissions, record formation, and node connections. Background music automatically ducks during explanation.

## 3. 4-minute 30-second storyboard

| Time | Real content / picture | Motion and expression focus |
| --- | --- | --- |
| 00:00–00:15 | The same question: "very confident" and "answered wrong" appear at the same time; the problem is how to discover the understanding gap | Push in from a question detail, stop on the confidence and error feedback; establish the theme with one English question |
| 00:15–00:30 | Logo, little Gezhi, real software workbench; introduce the audience and the educational problem | The Logo line connects to the edge of the software window, and the camera enters the workbench smoothly |
| 00:30–01:25 | Core AI demonstration: the student explains a concept to little Gezhi, shows real feedback, then follows up or revises in response to the feedback | Key text is partially enlarged; the camera connects the explanation content and the digital avatar. Only follow-up questions or feedback actually obtained during the run enter the film |
| 01:25–01:50 | Confidence record: choose confidence before submitting, showing "confident but not passed" | Confidence and result are juxtaposed, and the answer card gradually contracts into the next segment |
| 01:50–02:20 | Error Detective: identify the earliest erroneous step, choose a correction plan, write down the reason | The camera moves along the derivation steps, pauses at the error location, and the correction appears in place |
| 02:20–02:50 | Learning Evidence Map: locate the knowledge point, unfold the answer record, hint usage, and recommended practice | The answer card connects to the graph node; push in on the node and expand the real evidence panel |
| 02:50–03:15 | Transfer challenge: three stages — basic application, changed conditions, real-life context | Move forward along the same visual path, highlighting context changes and level-by-level unlocking |
| 03:15–03:55 | Concept Lab: function prediction as the main complete demonstration, force animation and probability sampling as short shots | Show the prediction first and then verify it; parameter changes connect with curve changes; retain real model readings |
| 03:55–04:15 | Implementation, testing, and responsible AI use: on-device learning records, boundaries of cloud AI, actual test evidence, and limitations | Explain with real software footage, real exports, and brief diagrams; make clear that automated checks are engineering evidence, not learning-effect research |
| 04:15–04:30 | Product positioning, SDG 4 connection, Logo, and end-card disclosure | The camera slowly pulls back, graph lines converge into the brand symbol; narration and music end naturally |

This timeline prioritizes the core AI role and the new learning loop. The question bank, notes, calendar, and export appear briefly through actual operations in the screen recording, avoiding crowding out the main learning process.

## 4. Boundaries of real content

- Experimental value verification and multiple-choice scoring are performed by deterministic models; they are not called large-model reasoning scoring.
- The current subjective text-reasoning records and self-assessment do not have automatic semantic verification; the film states this truthfully.
- AI's role in Feynman feedback and open-ended follow-up questioning must be demonstrated with real run results; the AI reply test doubles used in earlier integration checks cannot be used to prove real AI capability.
- The existing 16 built-in exercises are original exercises, not called past exam questions, and no claim is made that e-books are built in.
- The 19 unit checks, 26 post-packaging interaction checks, and 33 existing interface regressions can serve as engineering check evidence; they cannot be restated as student counts, learning-improvement rates, or measured teaching effects.
- There is currently no verified student trial effectiveness data. Simulated educational-context testing may be recorded and labeled; if real trial data is obtained later, replace the test segment. The educational effect of the work still requires further evaluation.
- Ordinary learning records and experimental models can run on-device; open-ended AI follow-up depends on the existing AI service configuration, and no claim is made that all AI reasoning is offline or that student data never leaves the device.
- Demonstration materials use anonymous demo accounts and questions; the end card and accompanying files disclose AI-assisted video production, and material sources and authorizations are recorded.

## 5. Production process and delivery

After the plan is reviewed, production proceeds in the following order: verify the real AI demonstration path → organize English demo content and voiceover script → record real operations → independently produce continuous motion and compositing → voiceover, subtitles, and sound mixing → check each segment's picture and final parameters.

Expected deliverables:

- `DemoVideo_Gezhi.mp4`: competition HD version, target about 4:30, all English.
- `DemoVideo_Gezhi_Compressed.mp4`: compressed backup version, target about 45 MB, still subject to the system's actual limit.
- English verbatim narration script, Chinese subtitle comparison draft (for internal review), English SRT subtitle source file.
- 6 real work screenshots: overall interface, AI explanation, Confidence / Error Detective, Evidence Map, transfer challenge, Concept Lab.
- AI production and material-source statement, final-cut inspection record, and reproducible production source files.

The above is the pre-production plan. The user subsequently authorized production and revision; the actual film and production files are saved in `产出/demo-video-20261002/` and have not been uploaded or submitted to the competition.

## 2026-10-02 second revision

The second version is about 4 minutes 25 seconds long and retains the original continuous motion, transitions, and live-software recording style. All 17 English narration segments were changed to Tencent Cloud YunLeo (403007), 24 kHz, normal speaking rate, synthesized by complete sentences. Credentials entered process memory only through standard input with echo disabled; they were not written into the project or deliverable files.

The first version's window-scaling problems at about 44 seconds and 51 seconds were resolved by genuine re-recording. The four segments — AI writing Markdown, Markdown reading, PDF reading, and Word reading — were all locked to a 1440 × 810 content window, DPR 1, and 100% application zoom; the recording script verified the dimensions at the start and end of each segment. The new Markdown file was generated by real AI, then actually exported to PDF and DOCX through the software and opened for viewing.

The old version is saved in `revision-v1/`; the public parameters and request IDs of the new narration are recorded in `cloud-voice-manifest.json`. English subtitles and sound mixing were regenerated to match the new version's duration; final encoding, full decoding, loudness, and frame-extraction checks were completed by `scripts/video/verify-video.py`.
