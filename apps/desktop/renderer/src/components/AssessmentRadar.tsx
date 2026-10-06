import type { CSSProperties } from 'react';
import type { AssessmentDimension } from '../lib/companion-types';
export default function AssessmentRadar({ dimensions }: { dimensions: AssessmentDimension[] }) {
  const point = (i: number, r: number) => { const a = i * Math.PI / 3 - Math.PI / 2; return [200 + Math.cos(a) * r, 166 + Math.sin(a) * r]; };
  const polygon = (r: number) => Array.from({ length: 6 }, (_, i) => point(i,r).join(',')).join(' ');
  const complete = dimensions.every(d => d.score !== null);
  return <div className="assessment-radar" data-testid="assessment-radar"><svg viewBox="0 0 400 340" role="img" aria-label="讲解六维反馈雷达图，缺少证据的维度不显示分数">
    {[1,2,3,4].map(level => <g key={level}><polygon points={polygon(level * 25)} className="radar-grid" /><text x="205" y={166-level*25+11} className="radar-tick">{level}</text></g>)}
    {dimensions.map((d,i) => { const [x,y] = point(i,100), [lx,ly] = point(i,132); return <g key={d.id}><line x1="200" y1="166" x2={x} y2={y} className="radar-grid" /><text x={lx} y={ly} textAnchor="middle" className="radar-label">{d.label}<tspan x={lx} dy="16" className="radar-value">{d.score === null ? '未展示' : d.score + ' / 4'}</tspan></text></g>; })}
    {complete && <polygon points={dimensions.map((d,i) => point(i,d.score! * 25).join(',')).join(' ')} className="radar-area" />}
    {dimensions.map((d,i) => d.score === null ? null : <circle key={d.id} cx={point(i,d.score*25)[0]} cy={point(i,d.score*25)[1]} r="4" className="radar-dot" style={{'--motion-order':i} as CSSProperties}><title>{d.label + '：' + d.score + ' / 4'}</title></circle>)}
  </svg><p>0–4 分 · 未展示 ≠ 零分 · AI 形成性反馈</p></div>;
}
