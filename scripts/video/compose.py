"""Independent motion compositor: actual application capture + original vector motion.
No slide or motion-video templates. Run with the bundled Python/Pillow/NumPy runtime.
"""
from pathlib import Path
from collections import deque
import json, math, subprocess, wave, textwrap, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'产出/demo-video-20261002'
FPS=30; W,H=1920,1080; CROSS=21
FONT=Path('C:/Windows/Fonts')
fonts={}
def font(n,bold=False):
    key=(n,bold)
    if key not in fonts: fonts[key]=ImageFont.truetype(str(FONT/('segoeuib.ttf' if bold else 'segoeui.ttf')),n)
    return fonts[key]
def ease(x):
    x=max(0,min(1,x));return x*x*(3-2*x)
def run(args):
    r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if r.returncode: raise RuntimeError(r.stderr.decode('utf-8',errors='replace')[-3000:])
    return r.stdout
def duration(file):
    return float(run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(file)]).decode().strip())
def writewav(file,a,sr=48000):
    with wave.open(str(file),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((np.clip(a,-.98,.98)*32767).astype('<i2').tobytes())

items=json.loads((ROOT/'scripts/video/narration.json').read_text('utf-8'))
timeline=[];cursor=0
for s in items:
    v=OUT/'audio'/f"{s['id']}.wav"
    vd=duration(v)
    length=math.ceil(max(s['seconds'],vd+1.7)*FPS)/FPS
    s.update(start=cursor,seconds=length,voiceSeconds=vd,voiceStart=.65)
    timeline.append(s);cursor+=length-CROSS/FPS
TOTAL=cursor+CROSS/FPS
assert TOTAL<300, ('Competition limit',TOTAL)
(OUT/'timeline.json').write_text(json.dumps({'fps':FPS,'duration':TOTAL,'scenes':timeline},indent=2),'utf-8')

# Captions use short, punctuation-aware phrases, paced against the actual utterance.
captions=[]
for s in timeline:
    words=s['text'].split();groups=[];group=[]
    for word in words:
        group.append(word)
        if len(' '.join(group))>66 or (len(group)>=5 and re.search(r'[.!?;]$',word)):
            groups.append(' '.join(group));group=[]
    if group:groups.append(' '.join(group))
    weights=[len(g.split())+1.1*len(re.findall(r'[.!?;]',g)) for g in groups]
    t=s['start']+s['voiceStart'];unit=s['voiceSeconds']/sum(weights)
    for g,weight in zip(groups,weights):
        captions.append((t,t+weight*unit,g));t+=weight*unit
def stamp(t):
    ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(OUT/'DemoVideo_Gezhi.en.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(a)} --> {stamp(b)}\n{txt}' for i,(a,b,txt) in enumerate(captions))+'\n','utf-8')
(OUT/'English Narration.md').write_text('# Gezhi — Make Understanding Visible\n\n'+'\n\n'.join(f"## {s['start']:.2f}s · {s['title']}\n\n{s['text']}" for s in timeline),'utf-8')

# Original ambient music: quiet warm chords, soft harmonic pulses, no sampled music.
sr=48000;N=round(TOTAL*sr);mix=np.zeros((N,2),dtype=np.float32)
speech=np.zeros(N,dtype=np.float32)
for s in timeline:
    raw=run(['ffmpeg','-v','error','-i',str(OUT/'audio'/f"{s['id']}.wav"),'-af','highpass=f=85,lowpass=f=11500,acompressor=threshold=0.15:ratio=2:attack=15:release=120','-f','f32le','-ar',str(sr),'-ac','2','pipe:1'])
    voice=np.frombuffer(raw,dtype='<f4').reshape(-1,2).copy()
    active=np.abs(voice[:,0])>.012
    rms=np.sqrt(np.mean(voice[active]**2)) if active.any() else .1
    voice*=min(2.5,.11/max(.001,rms))
    at=round((s['start']+s['voiceStart'])*sr);end=min(N,at+len(voice))
    mix[at:end]+=voice[:end-at];speech[at:end]=1
time=np.arange(N,dtype=np.float32)/sr
music=np.zeros((N,2),dtype=np.float32)
chords=[[146.832,174.614,220],[116.541,146.832,174.614],[130.813,164.814,196],[110,146.832,174.614]]
for start in np.arange(0,TOTAL,12):
    stop=min(TOTAL,start+14);lo=int(start*sr);hi=int(stop*sr);tt=time[lo:hi]-start
    env=np.minimum(1,tt/2)*np.minimum(1,(stop-start-tt)/2)
    frequencies=chords[int(start//12)%4]
    for j,freq in enumerate(frequencies):
        tone=np.sin(2*np.pi*freq*tt)+.17*np.sin(2*np.pi*freq*2*tt)
        music[lo:hi,0]+=tone*env*.0035*(1+.05*np.sin(tt*.5+j))
        music[lo:hi,1]+=tone*env*.0035*(1-.05*np.sin(tt*.5+j))
    pluck=np.sin(2*np.pi*(frequencies[1]*2)*tt)*np.exp(-(tt%1.5)*5)*.004
    music[lo:hi]+=pluck[:,None]*env[:,None]
# Speech-first mix: music 18–25 dB below narration, with gentle ducking.
block=480
duck=np.ones(N,dtype=np.float32)
for i in range(0,N,block):
    duck[i:i+block]=.62 if np.any(speech[max(0,i-12000):min(N,i+block+12000)]) else 1.25
music*=duck[:,None]
fade=np.minimum(1,time/2)*np.minimum(1,(TOTAL-time)/3)
mix+=music*fade[:,None]
rng=np.random.default_rng(20261002)
for s in timeline[1:]:
    at=max(0,round((s['start']-.10)*sr));n=min(int(.4*sr),N-at);tt=np.arange(n)/sr
    # Soft transition air only; no explosive impacts or loud button sounds.
    air=rng.normal(0,1,n).astype(np.float32)
    air=np.convolve(air,np.ones(16)/16,mode='same')
    env=np.sin(np.pi*np.arange(n)/max(1,n))**2
    mix[at:at+n]+=((air*.010+np.sin(2*np.pi*300*tt)*.001)*env)[:,None]
writewav(OUT/'audio/mix-pre-master.wav',mix)
run(['ffmpeg','-y','-v','error','-i',str(OUT/'audio/mix-pre-master.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000',str(OUT/'audio/final-mix.wav')])
del mix,music,time,speech,duck

# Procedural graphite/lavender field, drawn as part of the video, not an image template.
yy,xx=np.mgrid[0:H,0:W];g=np.exp(-(((xx-1260)/850)**2+((yy-380)/670)**2))
g2=np.exp(-(((xx-250)/850)**2+((yy-900)/600)**2))
bg=np.stack([10+14*g+3*g2,13+9*g+8*g2,23+30*g+13*g2],axis=-1).astype('uint8')
BACKGROUND=Image.fromarray(bg)
bd=ImageDraw.Draw(BACKGROUND)
for x in range(0,W,80):bd.line([(x,0),(x,H)],fill=(22,24,38),width=1)
for y in range(0,H,80):bd.line([(0,y),(W,y)],fill=(22,24,38),width=1)
logo=Image.open(ROOT/'apps/desktop/renderer/src/assets/gezhi-mark-v2.png').convert('RGBA')
logo.thumbnail((210,210),Image.Resampling.LANCZOS)
WHITE=(241,242,252);MUTED=(155,164,190);ACCENT=(178,161,255)
def text(im,xy,value,size=28,color=WHITE,bold=False):
    ImageDraw.Draw(im).text(xy,value,font=font(size,bold),fill=color)
def center(im,y,value,size,color=WHITE,bold=False):
    d=ImageDraw.Draw(im);box=d.textbbox((0,0),value,font=font(size,bold));text(im,((W-(box[2]-box[0]))/2,y),value,size,color,bold)
def orb(im,t):
    d=ImageDraw.Draw(im)
    for i in range(8):
        a=t*.07+i*math.tau/8;r=420+30*math.sin(t*.17+i)
        x=960+math.cos(a)*r*1.45;y=480+math.sin(a)*r*.63
        d.ellipse((x-3,y-3,x+3,y+3),fill=(72,68,109))
def header(im,s,t):
    lift=14*(1-ease(t/.9));text(im,(110,26+lift),s['kicker'],20,ACCENT,True)
    text(im,(110,54+lift),s['title'],37,WHITE,True)
    text(im,(1590,39),'GEZHI / PROTOTYPE',17,MUTED)
def rounded(im,shot,box,radius=20):
    x,y,w,h=map(int,box); resized=shot.resize((w,h),Image.Resampling.BILINEAR)
    mask=Image.new('L',(w,h),0);ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),radius,fill=255)
    d=ImageDraw.Draw(im);d.rounded_rectangle((x-2,y-2,x+w+2,y+h+2),radius+2,fill=(69,62,95))
    im.paste(resized,(x,y),mask)
def caption(im,s,t):
    absolute=s['start']+t
    line=next((z for a,b,z in captions if a<=absolute<b),None)
    if not line:return
    d=ImageDraw.Draw(im);f=font(30);lines=textwrap.wrap(line,width=88)
    widths=[d.textbbox((0,0),l,font=f)[2] for l in lines]
    width=max(widths)+50;top=1001-(len(lines)-1)*36
    d.rounded_rectangle((960-width/2,top-7,960+width/2,top+len(lines)*37),16,fill=(7,9,17))
    for j,l in enumerate(lines):text(im,(960-widths[j]/2,top+j*36),l,30)

def scene_frame(s,t,shot=None):
    im=BACKGROUND.copy();orb(im,t+s['start']);d=ImageDraw.Draw(im);kind=s['id'];p=t/s['seconds']
    if kind=='intro':
        text(im,(165,160),'THE LEARNING GAP',22,ACCENT,True)
        text(im,(165,240),'Confidence',80,WHITE,True);text(im,(165,330),'is not evidence.',80,WHITE,True)
        text(im,(170,450),'Remembering a result is only the beginning.',31,MUTED)
        cx,cy=1390,425;r=155;d.arc((cx-r,cy-r,cx+r,cy+r),-90,270,fill=(43,44,70),width=14)
        d.arc((cx-r,cy-r,cx+r,cy+r),-90,-90+320*ease(t/2),fill=ACCENT,width=14)
        text(im,(cx-89,cy-43),'SURE?',53,WHITE,True)
        rise=30*(1-ease((t-1)/1.2));d.rounded_rectangle((180,625+rise,1740,805+rise),24,fill=(23,25,43),outline=(75,66,112),width=2)
        text(im,(230,654+rise),'ANSWER: Δ = 4',35,WHITE,True)
        text(im,(230,714+rise),'Quadratic: x² − 2x + 1 = 0',28,MUTED)
        text(im,(1180,665+rise),'CONFIDENT',24,ACCENT,True)
        if t>2.8:text(im,(1180,712+rise),'CHECK FAILED',29,(255,132,156),True)
    elif kind in ('brand','outro'):
        enter=ease(t/1.5);r=int(150+30*enter);cx,cy=960,350
        for i in range(3):
            rr=r+35*i;d.arc((cx-rr,cy-rr,cx+rr,cy+rr),t*8+i*65,t*8+i*65+210,fill=(55+15*i,47+10*i,87+15*i),width=2)
        d.ellipse((855,245,1065,455),fill=(246,243,255));im.paste(logo,(960-logo.width//2,350-logo.height//2),logo)
        center(im,555,'GEZHI',92,WHITE,True)
        center(im,682,'Make understanding visible.',43,ACCENT)
        labels=['Read','Explain','Test','Transfer']
        for i,label in enumerate(labels):
            x=430+i*353;y=836+14*(1-ease((t-i*.18)/1.2))
            if i<3:d.line((x+65,y+28,x+290,y+28),fill=(73,65,113),width=2)
            d.ellipse((x-8,y+20,x+8,y+36),fill=ACCENT)
            text(im,(x+25,y),label,28,WHITE)
        if kind=='outro':center(im,930,'WORKING PROTOTYPE · ORIGINAL DEMONSTRATION MATERIALS',18,MUTED)
    elif kind=='validation':
        header(im,s,t)
        rows=['Real AI file creation','PDF / DOCX / MD readers','Recorded learning attempts','Simulated learning session']
        for i,row in enumerate(rows):
            y=255+i*126;slide=30*(1-ease((t-i*.35)/1.1))
            d.ellipse((112, y+15,148,y+51),outline=ACCENT,width=2)
            d.line([(123,y+34),(132,y+41),(142,y+26)],fill=ACCENT,width=3)
            text(im,(175+slide,y+15),row,30,WHITE,True)
        if shot:rounded(im,shot,(815,195,1010,554))
        text(im,(820,802),'Engineering checks ≠ measured learning outcomes',24,MUTED)
        text(im,(115,862),'Local notes and records · Selected content sent to configured AI',25,ACCENT)
        text(im,(115,905),'AI feedback requires review.',25,MUTED)
    else:
        header(im,s,t)
        if shot:
            # The same framed workspace persists between shots; slow camera drift,
            # actual UI movement and 700 ms overlapping cuts keep the sequence continuous.
            scale=1+.015*ease(p);w=int(1588*scale);h=int(w*790/1440)
            x=(W-w)//2+int(5*math.sin(p*math.pi));y=126+int(12*(1-ease(t/1.2)))
            rounded(im,shot,(x,y,w,h))
        text(im,(168,968),'ACTUAL APPLICATION CAPTURE  /  SEQUENCES CONDENSED',15,MUTED)
    caption(im,s,t)
    return im

def decoder(s):
    filename='14-note-graph' if s['id']=='validation' else s['id']
    file=OUT/'capture'/f'{filename}.mp4'
    if not file.exists():return None
    factor=min(1,(s['seconds']-.4)/duration(file))
    filters=f'crop=1440:790:0:0,setpts={factor}*PTS,fps=30,tpad=start_mode=clone:start_duration=0.4:stop_mode=clone:stop_duration={s["seconds"]},trim=duration={s["seconds"]}'
    return subprocess.Popen(['ffmpeg','-v','error','-i',str(file),'-vf',filters,'-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)

if '--audio-only' in sys.argv:
    print(f'Audio and timeline ready: {TOTAL:.2f}s');sys.exit(0)
preview='--preview' in sys.argv
repair='--repair-pdf' in sys.argv
scenes=timeline[4:7] if repair else timeline[:3] if preview else timeline
output=OUT/('pdf-repair-scope.mp4' if repair else 'Preview_Gezhi.mp4' if preview else 'picture-master.mp4')
encoder=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','h264_nvenc','-preset','p5','-cq','19','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],stdin=subprocess.PIPE)
pending=deque();written=0
try:
    for idx,s in enumerate(scenes):
        print(f"Rendering {idx+1}/{len(scenes)}: {s['id']} ({s['seconds']:.1f}s)",flush=True)
        dec=decoder(s);previous=list(pending);pending.clear();lastshot=None
        for f in range(round(s['seconds']*FPS)):
            if dec:
                raw=dec.stdout.read(1440*790*3)
                if len(raw)==1440*790*3:lastshot=Image.frombytes('RGB',(1440,790),raw)
            im=scene_frame(s,f/FPS,lastshot)
            if f==min(90,round(s['seconds']*FPS)-1):im.save(OUT/f"frame-{s['id']}.jpg",quality=94)
            if previous and f<CROSS:
                im=Image.blend(previous[f],im,ease((f+1)/CROSS));encoder.stdin.write(im.tobytes());written+=1
            else:
                pending.append(im)
                if len(pending)>CROSS:encoder.stdin.write(pending.popleft().tobytes());written+=1
        if dec:dec.stdout.close();dec.terminate();dec.wait()
    for im in pending:encoder.stdin.write(im.tobytes());written+=1
    encoder.stdin.close();code=encoder.wait()
    if code:raise RuntimeError(f'Encoder exit {code}')
except Exception:
    encoder.kill();raise
print(f'Picture finished: {written/FPS:.2f}s',flush=True)
if repair:
    # Replace the three-scene scope including its internal overlaps. Outer
    # 700 ms overlaps stay byte-for-byte in the surrounding picture master.
    a=timeline[4]['start']+.7;b=timeline[6]['start']+timeline[6]['seconds']-.7
    base=OUT/'picture-master.mp4';parts=[]
    for name,src,ss,length in [('before',base,0,a),('center',output,.7,written/FPS-1.4),('after',base,b,TOTAL-b)]:
        part=OUT/f'repair-{name}.mp4';parts.append(part)
        run(['ffmpeg','-y','-v','error','-ss',str(ss),'-i',str(src),'-t',str(length),'-an','-vf','setpts=PTS-STARTPTS','-c:v','h264_nvenc','-preset','p5','-cq','19','-pix_fmt','yuv420p',str(part)])
    listing=OUT/'repair-concat.txt'
    listing.write_text('\n'.join("file '"+p.as_posix()+"'" for p in parts),'utf-8')
    output=OUT/'picture-master-repaired.mp4'
    run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(output)])
    print('PDF scope repaired with frame-aligned cuts.',flush=True)
if not preview:
    final=OUT/'DemoVideo_Gezhi.mp4'
    run(['ffmpeg','-y','-v','error','-i',str(output),'-i',str(OUT/'audio/final-mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-shortest','-movflags','+faststart',str(final)])
    run(['ffmpeg','-y','-v','error','-i',str(final),'-c:v','h264_nvenc','-preset','p5','-b:v','1050k','-maxrate','1250k','-bufsize','2500k','-c:a','aac','-b:a','112k','-movflags','+faststart',str(OUT/'DemoVideo_Gezhi_Compact.mp4')])
    print('Final and compact MP4 ready.',flush=True)
