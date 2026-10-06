// Credentials arrive through stdin and remain in memory. No credential files or environment variables.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sdk from '../../packages/voice/node_modules/tencentcloud-sdk-nodejs-tts/tencentcloud/index.js';
const OUT=path.resolve('产出/demo-video-20261002');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
const input=rl[Symbol.asyncIterator]();
console.log('Credential input ready (terminal echo disabled)');
const settings=JSON.parse((await input.next()).value);
const Client=sdk.tts.v20190823.Client;
const client=new Client({credential:{secretId:settings.secretId,secretKey:settings.secretKey},region:'',profile:{httpProfile:{endpoint:'tts.tencentcloudapi.com',reqTimeout:90}}});
settings.secretId=undefined;settings.secretKey=undefined;
const dir=path.join(OUT,'voice-audition');fs.mkdirSync(dir,{recursive:true});
function duration(file){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8',windowsHide:true});if(r.status)throw Error('Audio inspection failed');return Number(r.stdout.trim());}
async function synth(text,voice,file){
 const r=await client.TextToVoice({Text:text,SessionId:crypto.randomUUID(),VoiceType:voice,PrimaryLanguage:2,SampleRate:24000,Codec:'wav',Speed:0,Volume:0,EnableSubtitle:false});
 if(!r.Audio)throw Error('Empty speech response');
 fs.writeFileSync(file,Buffer.from(r.Audio,'base64'));
 return {voiceType:voice,requestId:r.RequestId,characters:text.length,seconds:duration(file),file:path.basename(file)};
}
try{
 const sample='A confident answer can still be wrong. How can a learner see the difference between remembering a result and understanding an idea? Make understanding visible, one piece of evidence at a time.';
 const available=[];
 for(const [id,name] of [[403007,'YunLeo'],[403006,'YunMia']]){
  try{const meta=await synth(sample,id,path.join(dir,name+'.wav'));available.push(id);console.log(JSON.stringify({sample:name,...meta}));}
  catch(e){console.log(JSON.stringify({sample:name,errorCode:e.code||'SynthesisError',message:String(e.message).replace(/AKID\w+/g,'[redacted]').slice(0,250)}));}
 }
 console.log(JSON.stringify({ready:available}));
 const selection=JSON.parse((await input.next()).value);
 if(!available.includes(selection.voiceType))throw Error('Selected voice did not pass audition');
 const audio=path.join(OUT,'audio');fs.mkdirSync(audio,{recursive:true});
 const items=JSON.parse(fs.readFileSync('scripts/video/narration.json','utf8'));const manifest=[];
 for(const s of items){
  // English TextToVoice accepts 500 half-width characters. Preserve whole sentences.
  const sentences=s.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[s.text];let chunks=[],chunk='';
  for(const sentence of sentences){const next=(chunk+' '+sentence.trim()).trim();if(next.length>480&&chunk){chunks.push(chunk);chunk=sentence.trim();}else chunk=next;}
  if(chunk)chunks.push(chunk);if(chunks.some(t=>t.length>500))throw Error('Narration sentence exceeds service limit');
  const target=path.join(audio,s.id+'.wav');const parts=[];
  for(let i=0;i<chunks.length;i++){const file=chunks.length===1?target:path.join(dir,s.id+'-'+i+'.wav');parts.push(await synth(chunks[i],selection.voiceType,file));}
  if(parts.length>1){const list=path.join(dir,s.id+'-concat.txt');fs.writeFileSync(list,parts.map(p=>"file '"+path.join(dir,p.file).replaceAll('\\','/')+"'").join('\n'));const r=spawnSync('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-ar','24000','-ac','1',target],{windowsHide:true});if(r.status)throw Error('Audio assembly failed');}
  manifest.push({scene:s.id,voiceType:selection.voiceType,seconds:duration(target),parts});
  console.log('Synthesized '+s.id+' '+duration(target).toFixed(2)+'s');
  fs.writeFileSync(path.join(OUT,'cloud-voice-manifest.json'),JSON.stringify({provider:'Tencent Cloud TextToVoice',voiceType:selection.voiceType,voiceName:selection.voiceType===403007?'YunLeo':'YunMia',sampleRate:24000,speed:0,generatedAt:new Date().toISOString(),scenes:manifest},null,2));
 }
 console.log('All 17 cloud narration scenes completed');
}catch(e){console.error(JSON.stringify({errorCode:e.code||'ProductionError',message:String(e.message).replace(/AKID\w+/g,'[redacted]').slice(0,300)}));process.exitCode=1;}
finally{rl.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();}
