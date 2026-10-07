export interface CompanionRole { id: string; name: string; title: string; color: string; description: string; instruction: string }
export interface AssessmentDimension { id: string; label: string; criterion: string; score: number | null; evidence: string; reason: string; nextStep: string;referenceEvidence?:string;referenceVerified?:boolean }
export type DialogueIntent='clarify'|'counterexample'|'transfer'|'test';
export interface DialogueTurn {id:string;role:'learner'|'assistant';text:string;question?:string;at:string;referenceEvidence?:string;referenceVerified?:boolean;requestId?:string}
export interface RoomSession {id:string;locale?:'zh'|'en';roleId:string;topic:string;sourceRef:import('./learning-types').StudySource|null;referenceName:string;referenceText:string;at:string;turns:DialogueTurn[];request?:{id:string;state:'pending'|'failed'|'completed';answer:string;intent:DialogueIntent}|null;reportId?:string|null}
export interface RoomDraft {topic:string;transcript:string;replyDraft:string;focus:string;previousId:string;useReference:boolean;sourceId?:string|null;sessionId?:string|null;sourceRef?:import('./learning-types').StudySource|null;session?:RoomSession;at?:string}
export interface RoomSessionSummary {id:string;topic:string;at:string;turnCount:number;referenceName:string;reportId?:string|null}
export interface CompanionReport { id: string; locale?:'zh'|'en'; roleId: string; topic: string; transcript: string; referenceName: string; at: string; summary: string; dimensions: AssessmentDimension[]; questions: string[]; referenceLimit: string; sourceRef?: import('./learning-types').StudySource | null; previousId?: string | null; comparison?: { id: string; before: number; after: number; delta: number }[];sessionId?:string;dialogue?:DialogueTurn[] }
export interface CompanionApi {
  review(p:{vault:string;id:string;reportId:string;reviewerType:'teacher'|'peer'|'self';alias:string;dimensions:{id:string;score:number|null;reason:string}[]}):Promise<{ok:boolean;review?:HumanReview;error?:string}>;
  reviews(p:{vault:string;reportId?:string}):Promise<{ok:boolean;reviews?:HumanReview[];summary?:ReviewSummary;error?:string}>;
  disclosure(p:{vault:string}):Promise<{ok:boolean;tools:DisclosureTool[];at?:string|null;error?:string}>;
  saveDisclosure(p:{vault:string;tools:DisclosureTool[]}):Promise<{ok:boolean;tools?:DisclosureTool[];error?:string}>;
  startSession(p:{locale?:'zh'|'en';vault:string;id:string;roleId:string;topic:string;transcript:string;sourceId?:string;context?:string;referenceName?:string}):Promise<{ok:boolean;session?:RoomSession;error?:string}>;
  reply(p:{vault:string;sessionId:string;requestId:string;answer?:string;intent?:DialogueIntent}):Promise<{ok:boolean;session?:RoomSession;error?:string;duplicate?:boolean}>;
  session(p:{vault:string;sessionId:string}):Promise<{ok:boolean;session?:RoomSession;error?:string}>;
  sessions(p:{vault:string;roleId:string}):Promise<{ok:boolean;sessions?:RoomSessionSummary[];error?:string}>;
  saveDraft(p:{vault:string;roleId:string;topic:string;transcript:string;replyDraft?:string;focus?:string;previousId?:string;useReference?:boolean;sourceId?:string;sessionId?:string}):Promise<{ok:boolean;draft?:RoomDraft;error?:string}>;
  loadDraft(p:{vault:string;roleId:string;sourceId?:string}):Promise<{ok:boolean;draft?:RoomDraft|null;error?:string}>;
  roles(): Promise<{ ok: boolean; roles: CompanionRole[]; dimensions: AssessmentDimension[] }>;
  evaluate(p: { locale?:'zh'|'en';vault: string; roleId: string; topic: string; transcript: string; context?: string; referenceName?: string; sourceId?: string; previousId?: string; focus?: string;sessionId?:string }): Promise<{ ok: boolean; report?: CompanionReport; error?: string }>;
  history(p: { vault: string; roleId?: string }): Promise<{ ok: boolean; reports?: CompanionReport[]; error?: string }>;
  stop(): Promise<{ ok: boolean }>;
}
export interface HumanReview {id:string;reportId:string;at:string;reviewerType:'teacher'|'peer'|'self';alias:string;dimensions:{id:string;score:number|null;reason:string;aiScore:number|null;difference:number|null}[]}
export interface ReviewSummary {reviewCount:number;reportCount:number;comparable:number;exact:number;agreement:number|null;meanAbsoluteDifference:number|null;teacherLabelled:number}
export interface DisclosureTool {name:string;version:string;purpose:string;studentWork:string}
