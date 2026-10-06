// Opt-in competition locale. It changes displayed labels, never event handlers,
// answers, grading, file content or the ordinary Chinese product experience.
import labels from '../../shared/demo-en.json';
export const demoEnglish = new URLSearchParams(location.search).get('demo') === 'en';
const pairs = Object.entries(labels).sort((a,b) => b[0].length-a[0].length);
export function demoTranslate(text: string): string {
  if (!demoEnglish || !/[\u3400-\u9fff]/.test(text)) return text;
  let result = text;
  const normal = text.replace(/\s+/g, ' ').trim();
  if ((labels as Record<string, string>)[normal]) return (labels as Record<string, string>)[normal];
  result = result.replace(/第 (\d+) 关/g, 'Stage $1').replace(/已记录 (\d+) 字 · .*/g, 'Recorded $1 characters').replace(/讲完了 → 帮我查缺补漏（还要再讲 (\d+) 字）/g, 'Check my explanation (add $1 characters)');
  for (const [zh,en] of pairs) result = result.split(zh).join(en);
  return result.replace(/第 (\d+) 关/g,'Stage $1').replace(/显示 (\d+) 个节点（最多 80 个，可搜索定位）；关系来自原创教学设计和当前题库标签。/g,'Showing $1 nodes. Relationships come from teaching design and question tags.');
}
if (demoEnglish) {
  document.documentElement.lang = 'en';
  const scan = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE && node.parentElement && !node.parentElement.closest('script,style,textarea,.cm-content')) {
      const next = demoTranslate(node.textContent || ''); if (next !== node.textContent) node.textContent = next;
    } else if (node instanceof Element) {
      for (const attr of ['title','placeholder','aria-label']) { const value=node.getAttribute(attr); if (value) { const next=demoTranslate(value); if(next!==value) node.setAttribute(attr,next); } }
      node.childNodes.forEach(scan);
    }
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' || record.type === 'attributes') scan(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
}
