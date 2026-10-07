import type { LabKind, LabParams } from '../../../shared/lab-models.mjs';
export type LearningMode = 'practice' | 'detective' | 'transfer' | 'lab';
export type StudioView = LearningMode | 'evidence' | 'teach';
export interface StudySource {
  id: string; path: string; name: string; section: string; text: string; concept: string;
  origin: 'file' | 'draft'; startLine: number; endLine: number; page?: number; parentId?: string;
  labs: { kind: LabKind; concept: string; parameters: LabParams }[];
}
export interface LabMeasurement { kind?: LabKind; revealed?: boolean; time?: number; count?: number; success?: number; frequency?: number; theoretical?: number; seedStart?: number; y?: number; acceleration?: number; displacement?: number; velocity?: number }
export interface LearningActivity {
  id: string; mode: LearningMode; concept: string; title: string; prompt: string;
  options: { label: string; text: string }[]; source: string; grading: 'choice' | 'numeric' | 'self';
  hint: string; correctionOptions?: string[]; level?: number; levelLabel?: string;
  chain?: string; requires?: string; unlocked?: boolean; completed?: boolean;
  labKind?: LabKind; params?: LabParams;
  sourceRef?: StudySource | null; focus?: string; sampleSeed?: number; previousLabId?: string | null;
}
export interface LearningAttempt {
  id: string; activityId: string; concept: string; mode: LearningMode; at: string;
  correct: boolean | null; confidence: number; hints: number; grading: string;
  title: string; prompt: string; response: string; reflection: string;
  correction: string | null; answer: string; explanation: string; source: string;
  level: number | null; chain: string | null; params: LabParams | null; labKind: LabKind | null;
  selfVerdict: 'correct' | 'partial' | 'incorrect' | null; observation: string | null;
  usedHint?: boolean; previewedAnswer?: boolean;
  sourceRef?: StudySource | null; focus?: string; sampleSeed?: number; previousLabId?: string | null;
  measurement?: LabMeasurement | null; labVerified?: boolean;
}
export type EvidenceStatus = 'untested' | 'unverified' | 'misconception' | 'needsPractice' | 'needsRetest' | 'supported';
export interface EvidenceNode {
  id: string; subject: string; status: EvidenceStatus; reason: string; total: number;
  verified: number; independent: number; delayed: boolean; transferLevel: number;
  latestAt: string | null; evidence: LearningAttempt[];
  aiReports?: import('./companion-types').CompanionReport[]; reportCount?: number; sources?: StudySource[];
}
export interface LearningSummary {
  ok: boolean; error?: string; total: number; independent: number; highConfidenceWrong: number;
  evidence: EvidenceNode[]; edges: { from: string; to: string; kind: string; source: string }[];
  recommendations: { concept: string; reason: string; mode: LearningMode; dueAt: string }[];
  history: LearningAttempt[]; historyShown: number;
  aiReportCount?: number;
}
export interface LearningApi {
  catalog(p: { vault: string; includeActivityId?: string; includeExamples?: boolean }): Promise<{ ok: boolean; error?: string; activities?: LearningActivity[]; bankTotal?: number; bankShown?: number }>;
  summary(p: { vault: string; includeExamples?: boolean }): Promise<LearningSummary>;
  submit(p: { vault: string; activityId: string; submissionId: string; response: string; confidence: number; usedHint: boolean; previewedAnswer?: boolean; reflection?: string; correction?: string }): Promise<{ ok: boolean; error?: string; attempt?: LearningAttempt; duplicate?: boolean }>;
  annotate(p: { vault: string; id: string; selfVerdict?: string; observation?: string; measurement?: LabMeasurement }): Promise<{ ok: boolean; error?: string; attempt?: LearningAttempt }>;
  lab(p: { vault: string; kind: LabKind; params: LabParams; sourceId?: string; example?: boolean; previousLabId?: string }): Promise<{ ok: boolean; error?: string; activity?: LearningActivity }>;
  material(p: { vault: string; path: string; draftText?: string; pageStart?: number; pageEnd?: number }): Promise<{ ok: boolean; error?: string; sources?: StudySource[]; totalPages?: number; warning?: string }>;
  source(p: { vault: string; sourceId: string }): Promise<{ ok: boolean; error?: string; source?: StudySource }>;
  excerpt(p: { vault: string; sourceId: string; text: string }): Promise<{ ok: boolean; error?: string; source?: StudySource }>;
  createTask(p: { vault: string; sourceId: string; mode: LearningMode; focus?: string }): Promise<{ ok: boolean; error?: string; activity?: LearningActivity }>;
  schedule(p: { vault: string; concept: string }): Promise<{ ok: boolean; error?: string; id?: string; dueAt?: string; duplicate?: boolean }>;
}
export const STATUS: Record<EvidenceStatus, { label: string; color: string }> = {
  untested: { label: '待验证', color: '#8c91a6' }, unverified: { label: '待核验', color: '#b38a55' },
  misconception: { label: '疑似误区', color: '#db718b' }, needsPractice: { label: '需要练习', color: '#d7a35d' },
  needsRetest: { label: '等待复测', color: '#9982dd' }, supported: { label: '近期独立通过', color: '#51b4a4' },
};
export const CONFIDENCE = ['', '猜测', '大概', '确定'];
export const MODE_LABEL: Record<LearningMode, string> = { practice: '自信度练习', detective: '错误侦探', transfer: '迁移挑战', lab: '概念实验' };
export function supportLabel(a: LearningAttempt): string { return a.previewedAnswer ? a.usedHint ? '看过参考答案并使用提示' : '看过参考答案' : a.hints ? '使用提示' : '无提示或参考帮助'; }
