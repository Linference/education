export interface CompanionRole { id: string; name: string; title: string; color: string; description: string; instruction: string }
export interface AssessmentDimension { id: string; label: string; criterion: string; score: number | null; evidence: string; reason: string; nextStep: string }
export interface CompanionReport { id: string; roleId: string; topic: string; transcript: string; referenceName: string; at: string; summary: string; dimensions: AssessmentDimension[]; questions: string[]; referenceLimit: string; sourceRef?: import('./learning-types').StudySource | null; previousId?: string | null; comparison?: { id: string; before: number; after: number; delta: number }[] }
export interface CompanionApi {
  roles(): Promise<{ ok: boolean; roles: CompanionRole[]; dimensions: AssessmentDimension[] }>;
  evaluate(p: { vault: string; roleId: string; topic: string; transcript: string; context?: string; referenceName?: string; sourceId?: string; previousId?: string; focus?: string }): Promise<{ ok: boolean; report?: CompanionReport; error?: string }>;
  history(p: { vault: string; roleId?: string }): Promise<{ ok: boolean; reports?: CompanionReport[]; error?: string }>;
  stop(): Promise<{ ok: boolean }>;
}
