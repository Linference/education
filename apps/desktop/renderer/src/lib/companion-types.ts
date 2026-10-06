export interface CompanionRole { id: string; name: string; title: string; color: string; description: string; instruction: string }
export interface AssessmentDimension { id: string; label: string; criterion: string; score: number | null; evidence: string; reason: string; nextStep: string }
export interface CompanionReport { id: string; roleId: string; topic: string; transcript: string; referenceName: string; at: string; summary: string; dimensions: AssessmentDimension[]; questions: string[]; referenceLimit: string }
export interface CompanionApi {
  roles(): Promise<{ ok: boolean; roles: CompanionRole[]; dimensions: AssessmentDimension[] }>;
  evaluate(p: { vault: string; roleId: string; topic: string; transcript: string; context?: string; referenceName?: string }): Promise<{ ok: boolean; report?: CompanionReport; error?: string }>;
  history(p: { vault: string; roleId: string }): Promise<{ ok: boolean; reports?: CompanionReport[]; error?: string }>;
  stop(): Promise<{ ok: boolean }>;
}
