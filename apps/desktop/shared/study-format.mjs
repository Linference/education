export function measurementText(m) {
  if (!m) return 'No saved lab run data yet';
  const number = value => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(4)).toString() : 'Not recorded';
  if (m.kind === 'quadratic') return `Function value y = ${number(m.y)}`;
  if (m.kind === 'force') return `Run ${number(m.time)} s; acceleration ${number(m.acceleration)} m/s²; velocity ${number(m.velocity)} m/s; displacement ${number(m.displacement)} m`;
  if (m.kind === 'probability') return `${m.count} groups; successful ${m.success} groups; frequency ${number(m.frequency * 100)}%; theoretical ${number(m.theoretical * 100)}%; sampling seed ${m.seedStart}`;
  return 'Not recorded';
}
export function sourceLocation(source) {
  if (!source) return '';
  return `${source.name} · ${source.section} · ${source.page ? 'PDF page ' + source.page + '' : 'Extracted text line ' + source.startLine + '–' + source.endLine + ''}${source.origin === 'draft' ? ' · unsaved draft snapshot' : ''}`;
}
