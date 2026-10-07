export function measurementText(m) {
  if (!m) return '尚未保存实验运行数据';
  const number = value => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(4)).toString() : '未记录';
  if (m.kind === 'quadratic') return `函数值 y = ${number(m.y)}`;
  if (m.kind === 'force') return `运行 ${number(m.time)} s；加速度 ${number(m.acceleration)} m/s²；速度 ${number(m.velocity)} m/s；位移 ${number(m.displacement)} m`;
  if (m.kind === 'probability') return `${m.count} 组；成功 ${m.success} 组；频率 ${number(m.frequency * 100)}%；理论 ${number(m.theoretical * 100)}%；抽样种子 ${m.seedStart}`;
  return '未记录';
}
export function sourceLocation(source) {
  if (!source) return '';
  return `${source.name} · ${source.section} · ${source.page ? 'PDF 第 ' + source.page + ' 页' : '提取文字第 ' + source.startLine + '–' + source.endLine + ' 行'}${source.origin === 'draft' ? ' · 未保存草稿快照' : ''}`;
}
