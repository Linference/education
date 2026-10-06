from pathlib import Path
import json, hashlib, re, sys
from pypdf import PdfReader
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
out = root / 'output/pdf/gezhi-competition'
names = ['ProjectIntroduction_Gezhi', 'ResearchReport_Gezhi', 'Poster_Gezhi']
result = {'status': 'passed', 'documents': {}, 'realStudentTrial': False}
for name in names:
    path = out / (name + '.pdf')
    reader = PdfReader(path)
    size = path.stat().st_size
    assert size <= 50 * 1024 * 1024, (name, size)
    text = '\n'.join(p.extract_text() or '' for p in reader.pages)
    if name != 'Poster_Gezhi':
        assert not re.search(r'[\u4e00-\u9fff]', text), name
        for required in ['Lin Kit', 'Lei Chengchek', 'Feng Ziwen', 'Hou Kong Middle School, Macau', 'Chang Kim Fai']:
            assert required in text, (name, required)
        assert not re.search(r'\b(?:TODO|PLACEHOLDER|TBD)\b', text)
    if name == 'ProjectIntroduction_Gezhi':
        assert len(reader.pages) == 2
    elif name == 'ResearchReport_Gezhi':
        assert 6 <= len(reader.pages) <= 12
    else:
        assert len(reader.pages) == 1
        page = reader.pages[0]
        width_mm = float(page.mediabox.width) * 25.4 / 72
        height_mm = float(page.mediabox.height) * 25.4 / 72
        assert abs(width_mm - 800) < 0.1 and abs(height_mm - 1100) < 0.1
        result['posterPhysicalSizeMm'] = [round(width_mm, 3), round(height_mm, 3)]
    result['documents'][name] = {'pages': len(reader.pages), 'bytes': size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

image_dir = root / 'output/imagegen/gezhi-competition'
native = Image.open(image_dir / 'Poster_Gezhi_Generated.png')
export = Image.open(image_dir / 'Poster_Gezhi_8K.png')
assert max(export.size) == 8192
result['posterImage'] = {'nativePixels': list(native.size), 'exportPixels': list(export.size), 'native8KGeneration': max(native.size) >= 8192, 'exportMethod': 'LaTeX poster PDF rendered with Poppler; enlargement from generated source', 'bytes': (image_dir / 'Poster_Gezhi_8K.png').stat().st_size}
result['teacherOfficialEnglishNameVerified'] = False
(out / 'delivery-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
manifest = json.loads((out / 'delivery-manifest.json').read_text(encoding='utf-8'))
manifest['generatedDocuments'] = result['documents']
manifest['posterImage'] = result['posterImage']
manifest['estimatedScore'] = {'total': 77, 'plausibleRange': [72, 82], 'official': False}
(out / 'delivery-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
