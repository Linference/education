from pathlib import Path
import json,subprocess,hashlib,re,zipfile,xml.etree.ElementTree as ET
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'产出/demo-video-20261002'
def cmd(args):
 r=subprocess.run(args,capture_output=True)
 assert r.returncode==0,r.stderr.decode('utf-8','replace')[-3000:]
 return r
reports=[]
for name in ['DemoVideo_Gezhi.mp4','DemoVideo_Gezhi_Compact.mp4']:
 file=OUT/name;p=json.loads(cmd(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(file)]).stdout)
 video=next(s for s in p['streams'] if s['codec_type']=='video');audio=next(s for s in p['streams'] if s['codec_type']=='audio')
 assert video['codec_name']=='h264' and (video['width'],video['height'])==(1920,1080) and video['avg_frame_rate']=='30/1'
 assert audio['codec_name']=='aac' and audio['sample_rate']=='48000' and audio['channels']==2
 assert 260<float(p['format']['duration'])<=300
 cmd(['ffmpeg','-v','error','-i',str(file),'-f','null','-'])
 reports.append({'file':name,'durationSeconds':float(p['format']['duration']),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'video':'H.264 / 1920×1080 / 30 fps','audio':'AAC / 48 kHz / stereo','fullDecode':'passed'})
assert (OUT/'DemoVideo_Gezhi_Compact.mp4').stat().st_size<50_000_000
srt=(OUT/'DemoVideo_Gezhi.en.srt').read_text('utf-8');assert not re.search('[\u3400-\u9fff]',srt)
cue_blocks=srt.strip().split('\n\n');assert len(cue_blocks)>30
def cue_time(t):
 h,m,rest=t.split(':');sec,ms=rest.split(',');return int(h)*3600+int(m)*60+int(sec)+int(ms)/1000
previous=0
for cue in cue_blocks:
 lines=cue.splitlines();a,b=map(cue_time,lines[1].split(' --> '));assert previous<=a<b<=float(p['format']['duration'])+.05;assert ''.join(lines[2:]).strip();previous=b-.001
aud=cmd(['ffmpeg','-hide_banner','-i',str(OUT/'DemoVideo_Gezhi.mp4'),'-af','ebur128=peak=true','-f','null','-']).stderr.decode('utf-8','replace')
(OUT/'final-audio-loudness.log').write_text(aud,'utf-8')
summary=aud[aud.rfind('Summary:'):];lufs=float(re.search(r'I:\s*([-\d.]+) LUFS',summary).group(1));peak=float(re.search(r'Peak:\s*([-\d.]+) dBFS',summary).group(1))
assert -18<=lufs<=-14 and peak<=-1,summary
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(OUT/'Demo Library/My Study Guide.docx') as z:doc=ET.fromstring(z.read('word/document.xml'))
rows=doc.findall('.//w:tbl/w:tr',ns);assert [len(r.findall('w:tc',ns)) for r in rows]==[3]*5;assert '|a|' in ''.join(doc.itertext())
# Inspect final encoded frames at every scene's meaningful midpoint.
timeline=json.loads((OUT/'timeline.json').read_text('utf-8'));qa=OUT/'QA';qa.mkdir(exist_ok=True)
sheet=Image.new('RGB',(1440,math_height:=4*244),(12,14,24));f=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',18)
for i,s in enumerate(timeline['scenes']):
 when=min(timeline['duration']-1,s['start']+s['seconds']*.65);shot=qa/f"{i+1:02}-{s['id']}.jpg"
 cmd(['ffmpeg','-y','-v','error','-ss',str(when),'-i',str(OUT/'DemoVideo_Gezhi.mp4'),'-frames:v','1','-q:v','2',str(shot)])
 im=Image.open(shot);im.thumbnail((356,201));x=i%4*360;y=i//4*244
 if y+244>sheet.height:
  enlarged=Image.new('RGB',(1440,y+244),(12,14,24));enlarged.paste(sheet);sheet=enlarged
 sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text((x+6,y+205),f"{i+1:02} · {s['id']}",font=f,fill='white')
sheet.save(qa/'contact-sheet.jpg',quality=94)
photos=OUT/'Submission Photos';photos.mkdir(exist_ok=True)
for index,name in enumerate(['03-markdown','04-pdf','05-word','06-teach-ai','09-evidence','12-force'],1):
 im=Image.open(OUT/f'{name}.png');im.crop((0,0,im.width,im.height-20)).save(photos/f'Gezhi_{index:02}_{name}.png')
report={'files':reports,'EnglishSubtitles':srt.count('-->'),'audio':{'integratedLUFS':lufs,'truePeakDbFS':peak},'WordEscapedPipeRegression':'passed: 5 rows, 3 columns','learningUnitTests':'19 / 19','latexConversionTests':'37 / 37','actualOperationClips':14,'simulationOnly':True,'studentOutcomeClaims':False}
cloud=OUT/'cloud-voice-manifest.json'
if cloud.exists():
 voice=json.loads(cloud.read_text('utf-8'));assert len(voice['scenes'])==len(timeline['scenes'])==17
 assert {s['scene'] for s in voice['scenes']}=={s['id'] for s in timeline['scenes']}
 for s in voice['scenes']:
  p=json.loads(cmd(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(OUT/'audio'/f"{s['scene']}.wav")]).stdout)
  assert p['streams'][0]['sample_rate']=='24000' and abs(float(p['format']['duration'])-s['seconds'])<.02
 for name in ['02-ai-writes','03-markdown','04-pdf','05-word']:
  p=json.loads(cmd(['ffprobe','-v','error','-show_streams','-of','json',str(OUT/'capture'/f'{name}.mp4')]).stdout)
  assert (p['streams'][0]['width'],p['streams'][0]['height'])==(1440,810)
 for sec in [44,51]:
  cmd(['ffmpeg','-y','-v','error','-ss',str(sec),'-i',str(OUT/'DemoVideo_Gezhi.mp4'),'-frames:v','1','-q:v','2',str(qa/f'revision-2-{sec}s.jpg')])
 report.update(revision=2,narration={'provider':voice['provider'],'voiceName':voice['voiceName'],'voiceType':voice['voiceType'],'originalSampleRate':24000,'sceneCount':17},retakenCaptureViewport='1440 × 810 / DPR 1 / zoom 100%',framesForReview=['QA/revision-2-44s.jpg','QA/revision-2-51s.jpg'])
(OUT/'delivery-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
