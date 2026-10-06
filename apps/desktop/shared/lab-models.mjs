// Deterministic, bounded teaching models shared by the UI and main process.
export function parameters(kind, p = {}) {
  const bound = (name, fallback, min, max, integer = false) => {
    const n = p[name] === undefined ? fallback : Number(p[name]);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error('实验参数超出范围：' + name);
    return n;
  };
  if (kind === 'quadratic') return { a: bound('a', 1, -3, 3), h: bound('h', 0, -4, 4), k: bound('k', 0, -4, 4), x: bound('x', 2, -4, 4) };
  if (kind === 'force') return { force: bound('force', 20, 0, 80), mass: bound('mass', 4, 1, 10), friction: bound('friction', 0.1, 0, 0.6) };
  if (kind === 'probability') return { p: bound('p', 0.5, 0.1, 0.9), n: bound('n', 2, 1, 5, true) };
  throw new Error('未知实验');
}
export function quadratic(x, p) { return p.a * (x - p.h) ** 2 + p.k; }
export function motion(p, t = 0) {
  // Starts from rest. In this simplified horizontal model static and kinetic
  // coefficients are equal; gravity is 9.8 m/s² and air drag is ignored.
  const frictionLimit = p.friction * p.mass * 9.8;
  const friction = Math.min(p.force, frictionLimit);
  const netForce = p.force - friction;
  const acceleration = netForce / p.mass;
  return { friction, netForce, acceleration, velocity: acceleration * t, displacement: 0.5 * acceleration * t * t };
}
export function probability(p) { return 1 - (1 - p.p) ** p.n; }
export function sampleTrials(p, count, seed = 1) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('抽样次数应为 1–10000');
  let state = seed >>> 0, success = 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = 0; i < count; i++) { let hit = false; for (let j = 0; j < p.n; j++) if (random() < p.p) hit = true; if (hit) success++; }
  return { success, count, seed: state, frequency: success / count };
}
