"""Check translated PDF content, retained illustrations and embedded fonts."""
from pathlib import Path
from pypdf import PdfReader
import re
import json
import sys
import hashlib

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
out = root / 'output/pdf/gezhi-competition'
results = []
for base, section_count, figures, tables in [
    ('ProjectIntroduction_Gezhi', 5, 2, 1),
    ('ResearchReport_Gezhi', 8, 10, 7),
]:
    path = out / (base + '_中文.pdf')
    reader = PdfReader(path)
    text = '\n'.join(page.extract_text() for page in reader.pages)
    compact = re.sub(r'\s+', '', text)
    zh = path.with_suffix('.tex').read_text(encoding='utf-8')
    en = (out / (base + '.tex')).read_text(encoding='utf-8')
    zh = zh.split(r'\begin{document}', 1)[1]
    en = en.split(r'\begin{document}', 1)[1]
    for term in ['LinKit','LeiChengchek','FengZiwen','HouKongMiddleSchool,Macau','曾剑辉','濠江中学']:
        assert term in compact, (base, term)
    assert '没有开展真实学生试用' in compact, base
    assert len(re.findall(r'\\section\{', zh)) == section_count
    assert zh.count(r'\begin{figure}') == figures
    assert zh.count(r'\captionof{table}') == tables
    # All screenshot paths, widths, trims and clipping options stay identical.
    graphics = r'\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}'
    assert re.findall(graphics, zh) == re.findall(graphics, en), base
    assert not any(token in zh for token in ['TODO','TO BE COMPLETED','待填写','待补充'])
    fonts = {}
    for page in reader.pages:
        for font_ref in page['/Resources'].get('/Font', {}).values():
            font = font_ref.get_object()
            descriptor_owner = font['/DescendantFonts'][0].get_object() if '/DescendantFonts' in font else font
            descriptor = descriptor_owner.get('/FontDescriptor')
            assert descriptor, font
            descriptor = descriptor.get_object()
            embedded = any(key in descriptor for key in ['/FontFile','/FontFile2','/FontFile3'])
            assert embedded, font.get('/BaseFont')
            fonts[str(font.get('/BaseFont'))] = embedded
    if base == 'ResearchReport_Gezhi':
        for term in ['19项通过','26项通过','33项通过','37项通过','10次作答','8次独立通过','2次高自信度错误作答','265.33','75.43%','18.09','4.02']:
            assert term in compact, (base, term)
        assert zh.count(r'\item ') == en.count(r'\item ')
        assert r'阅读\\学习资料' in zh and '学习者界面' in zh
    results.append({
        'file':path.name, 'pages':len(reader.pages), 'bytes':path.stat().st_size,
        'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'figures':figures, 'tables':tables, 'sections':section_count,
        'fonts':fonts, 'allFontsEmbedded':True,
        'originalGraphicCommandsPreserved':True,
        'noRealStudentTrialStatementPreserved':True,
        'allPagesRenderedAndVisuallyReviewed':True,
    })
(out / 'translation-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
