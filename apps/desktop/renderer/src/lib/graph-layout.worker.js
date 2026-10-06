// d3-force uses Barnes-Hut many-body forces; simulation stays off the UI thread.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from "d3-force";
let simulation = null;
let nodes = [];
let revision = 0;
let timer = null;
let paused = false;
let reducedMotion = false;
let ticks = 0;
function publish(done = false) {
  const positions = new Float32Array(nodes.length * 2);
  nodes.forEach((n, i) => { positions[i * 2] = n.x; positions[i * 2 + 1] = n.y; });
  self.postMessage({ type: "positions", revision, positions, done }, [positions.buffer]);
}
function schedule() {
  if (timer !== null || paused || !simulation) return;
  timer = setTimeout(() => {
    timer = null;
    if (paused || !simulation) return;
    const start = performance.now();
    do { simulation.tick(); ticks++; } while (performance.now() - start < 7 && simulation.alpha() > 0.012);
    const done = simulation.alpha() <= 0.012 || ticks >= 800;
    if (!reducedMotion || done) publish(done);
    if (!done) schedule();
  }, 24);
}
self.onmessage = ({ data }) => {
  if (data.type === "reduced-motion") { reducedMotion = data.value; return; }
  if (data.type === "pause") { paused = data.value; if (!paused) schedule(); return; }
  if (data.type === "pin") {
    if (data.revision !== revision || !simulation) return;
    const n = nodes.find(n => n.id === data.id);
    if (!n) return;
    n.fx = data.release ? null : data.x; n.fy = data.release ? null : data.y;
    if (!data.release) { n.x = data.x; n.y = data.y; }
    ticks = 0; simulation.alpha(Math.max(0.16, simulation.alpha())); schedule(); return;
  }
  if (data.type !== "layout") return;
  if (timer !== null) clearTimeout(timer);
  timer = null; simulation?.stop();
  const previous = new Map(nodes.map(n => [n.id, n]));
  revision = data.revision; ticks = 0;
  const groups = [...new Set(data.nodes.map(n => n.group))].sort();
  nodes = data.nodes.map((n, i) => {
    const old = previous.get(n.id);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const radius = 25 * Math.sqrt(i + 1);
    return { ...n, x: old?.x ?? Math.cos(angle) * radius, y: old?.y ?? Math.sin(angle) * radius };
  });
  const options = data.options;
  const clusterRadius = groups.length > 1 ? Math.min(200, 65 * Math.sqrt(groups.length)) : 0;
  const target = (n, axis) => {
    const a = groups.indexOf(n.group) / groups.length * Math.PI * 2;
    return (axis === "x" ? Math.cos(a) : Math.sin(a)) * clusterRadius;
  };
  simulation = forceSimulation(nodes).stop().alpha(0.8).alphaDecay(nodes.length > 700 ? 0.035 : 0.025).velocityDecay(0.32)
    .force("links", forceLink(data.edges.map(e => ({ ...e }))).id(n => n.id).distance(options.distance).strength(options.linkForce))
    .force("charge", forceManyBody().strength(-options.repel).theta(0.9).distanceMax(1400))
    .force("collision", forceCollide(n => 7 + Math.sqrt(n.degree) * 1.8).iterations(nodes.length > 700 ? 1 : 2))
    .force("x", forceX(n => target(n, "x")).strength(options.center))
    .force("y", forceY(n => target(n, "y")).strength(options.center));
  publish(nodes.length === 0);
  if (nodes.length) schedule();
};
