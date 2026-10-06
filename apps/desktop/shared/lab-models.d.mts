export type LabKind = 'quadratic' | 'force' | 'probability';
export interface LabParams { a?: number; h?: number; k?: number; x?: number; force?: number; mass?: number; friction?: number; p?: number; n?: number }
export function parameters(kind: LabKind, p?: LabParams): LabParams;
export function quadratic(x: number, p: LabParams): number;
export function motion(p: LabParams, t?: number): { friction: number; netForce: number; acceleration: number; velocity: number; displacement: number };
export function probability(p: LabParams): number;
export function sampleTrials(p: LabParams, count: number, seed?: number): { success: number; count: number; seed: number; frequency: number };
