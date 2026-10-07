const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const rubric = require('../shared/companion-rubric.cjs');
const { assertInsideVault } = require('./vault-fs.cjs');
const { loadBridge } = require('./ai.cjs');
const learning = require('./lib/learning.cjs');
const dialogue = require('./lib/companion-dialogue.cjs');
function registerCompanions(ipcMain, app, { getBridge = loadBridge } = {}) {
  let db, sourceDb, active = null;
  const open = () => {
    if (!db) {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      db = new (require('node:sqlite').DatabaseSync)(path.join(app.getPath('userData'), 'companions.db'));
      db.exec('CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,vault TEXT NOT NULL,role TEXT NOT NULL,at TEXT NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS reports_vault ON reports(vault,at);');
      dialogue.initialize(db);
    }
    return db;
  };
  const vault = p => { const real = assertInsideVault(p.vault, { mustExist: true }); if (!fs.statSync(real).isDirectory()) throw new Error('资料库无效'); return real; };
  const sourceFor = (current,id) => {
    if(!id)return null;
    const file=path.join(app.getPath('userData'),'learning.db');
    if(!fs.existsSync(file))throw Error('请先选择学习资料。');
    sourceDb ||= learning.openLearningDb(file);
    return learning.sourceById(sourceDb,current,id);
  };
  const friendly = e => {
    const message=String(e.message||e);
    return /Insufficient Balance|QUOTA/i.test(message)?'当前 AI 服务余额或额度不足，请检查 DeepSeek Harness 账号。输入和对话已保留。':/unauthorized|not authenticated|login required/i.test(message)?'AI 登录已过期，请打开 DeepSeek Harness 登录后重试。':message;
  };
  const local = fn => (_e,p={})=>{try{return fn(vault(p),p);}catch(e){return{ok:false,error:friendly(e)};}};
  ipcMain.handle('companions:startSession',local((current,p)=>({ok:true,session:dialogue.startSession(open(),current,p,sourceFor(current,p.sourceId))})));
  ipcMain.handle('companions:session',local((current,p)=>{
    const session=dialogue.getSession(open(),current,p.sessionId);
    if(!active&&session.request?.state==='pending'){session.request.state='failed';dialogue.saveSession(open(),current,session);}
    return{ok:true,session};
  }));
  ipcMain.handle('companions:sessions',local((current,p)=>{
    if(!rubric.ROLES.some(r=>r.id===p.roleId))throw Error('角色不存在。');
    const rows=open().prepare('SELECT data FROM room_sessions WHERE vault=? AND role=? ORDER BY at DESC LIMIT 20').all(current,p.roleId);
    return{ok:true,sessions:rows.map(row=>{const s=JSON.parse(row.data);return{id:s.id,topic:s.topic,at:s.turns.at(-1)?.at||s.at,turnCount:s.turns.length,referenceName:s.referenceName,reportId:s.reportId};})};
  }));
  ipcMain.handle('companions:saveDraft',local((current,p)=>{
    const session=p.sessionId?dialogue.getSession(open(),current,p.sessionId):null;
    if(p.previousId&&!open().prepare('SELECT 1 FROM reports WHERE vault=? AND role=? AND id=?').get(current,p.roleId,p.previousId))throw Error('再次讲解记录不存在。');
    return{ok:true,draft:dialogue.draft(open(),current,p,session?session.sourceRef:sourceFor(current,p.sourceId),session)};
  }));
  ipcMain.handle('companions:loadDraft',local((current,p)=>{
    const draft=dialogue.loadDraft(open(),current,p,!active);
    return{ok:true,draft:draft?{...draft,sourceRef:sourceFor(current,draft.sourceId)}:null};
  }));
  ipcMain.handle('companions:reply',async(_e,p={})=>{
    if(active)return{ok:false,error:'角色正在处理上一项请求，请等待或停止。'};
    const controller=new AbortController();active=controller;let current,timer,reserved;
    try{
      current=vault(p);reserved=dialogue.reserveReply(open(),current,p);
      if(reserved.completed)return{ok:true,session:reserved.session,duplicate:true};
      const bridge=await getBridge();if(controller.signal.aborted)throw Error('追问已停止，回答已保留。');
      timer=setTimeout(()=>controller.abort(),120000);let final='',text='';
      for await(const ev of bridge.runHeadless({task:dialogue.replyPrompt(reserved.session,reserved.session.request.intent),cwd:current,signal:controller.signal})){
        if(ev.type==='tool_call'){controller.abort();throw Error('角色请求了工具操作，已停止；回答已保留。');}
        if(ev.type==='text')text+=ev.text||'';if(ev.type==='final')final=ev.text||'';
        if(text.length>100000||final.length>100000){controller.abort();throw Error('角色回复过长，回答已保留。');}
      }
      if(controller.signal.aborted)throw Error('追问已停止或超时，回答已保留。');
      if(vault(p)!==current)throw Error('资料库已切换，本次追问未写入新资料库。');
      const reply=dialogue.normalizeReply(final||text,reserved.session.referenceText);
      return{ok:true,session:dialogue.finishReply(open(),current,p.sessionId,p.requestId,reply)};
    }catch(e){let session;try{if(current&&reserved&&!reserved.completed)session=dialogue.failReply(open(),current,p.sessionId,p.requestId);}catch{}
      return{ok:false,error:friendly(e),session};
    }finally{clearTimeout(timer);if(active===controller)active=null;}
  });
  ipcMain.handle('companions:roles', () => ({ ok: true, roles: rubric.ROLES, dimensions: rubric.DIMENSIONS }));
  ipcMain.handle('companions:history', (_e, p = {}) => {
    try { const current = vault(p); const rows = p.roleId ? open().prepare('SELECT data FROM reports WHERE vault=? AND role=? ORDER BY at DESC LIMIT 20').all(current,p.roleId) : open().prepare('SELECT data FROM reports WHERE vault=? ORDER BY at DESC LIMIT 100').all(current); return { ok: true, reports: rows.map(r => JSON.parse(r.data)) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('companions:evaluate', async (_e, p = {}) => {
    if (active) return { ok: false, error: '正在评估，请等待或停止当前评估。' };
    const controller = new AbortController(); active = controller;
    let timer;
    try {
      const currentVault = vault(p);
      const session=p.sessionId?dialogue.getSession(open(),currentVault,p.sessionId):null;
      if(session){if(session.request?.state==='pending')throw Error('请先完成或停止当前追问。');p={...p,roleId:session.roleId,topic:session.topic,transcript:dialogue.learnerText(session),sourceId:session.sourceRef?.id,context:session.referenceText,referenceName:session.referenceName};}
      if (typeof p.topic !== 'string' || !p.topic.trim() || p.topic.length > 200) throw new Error('请填写讲解主题（不超过 200 字）');
      if (typeof p.transcript !== 'string' || p.transcript.trim().length < 10 || p.transcript.length > 12000) throw new Error('请提供 10 至 12000 字的讲解');
      let sourceRef = null, previous = null;
      if (p.sourceId) {
        const file = path.join(app.getPath('userData'), 'learning.db');
        if (!fs.existsSync(file)) throw new Error('请先选择学习资料。');
        sourceDb ||= learning.openLearningDb(file);
        sourceRef = learning.sourceById(sourceDb, currentVault, p.sourceId);
      }
      if (p.previousId) {
        const row = open().prepare('SELECT data FROM reports WHERE vault=? AND role=? AND id=?').get(currentVault, p.roleId, p.previousId);
        previous = row ? JSON.parse(row.data) : null;
        if (!previous || previous.topic !== p.topic || (previous.sourceRef?.id || null) !== (sourceRef?.id || null)) throw new Error('再次讲解需要使用原来的主题、角色和资料章节。');
      }
      const task = rubric.prompt({ ...p, context: sourceRef?.text ?? p.context, sourceLocation: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : '', previous, focus: String(p.focus || '').slice(0,1800), dialogue:session?.turns||[] }), bridge = await getBridge();
      if (controller.signal.aborted) throw new Error('评估已停止');
      timer = setTimeout(() => controller.abort(), 120000);
      let final = '', text = '';
      for await (const ev of bridge.runHeadless({ task, cwd: currentVault, signal: controller.signal })) {
        if (ev.type === 'tool_call') { controller.abort(); throw new Error('本次评估请求了工具操作，已停止；请重新讲解。'); }
        if (ev.type === 'text') text += ev.text || '';
        if (ev.type === 'final') final = ev.text || '';
        if(text.length>100000||final.length>100000){controller.abort();throw Error('评估回复过长，未保存评分。');}
      }
      if (controller.signal.aborted) throw new Error('评估已停止或超时，未保存评分。');
      // Switching libraries while awaiting a response must never write to the new library.
      if (vault(p) !== currentVault) throw new Error('资料库已切换，本次评估未保存。');
      const assessment = rubric.normalize(final || text, p.transcript,sourceRef?.text||p.context||'');
      const report = { id: randomUUID(), roleId: p.roleId, topic: p.topic, transcript: p.transcript, referenceName: String(p.referenceName || '').slice(0,200), at: new Date().toISOString(), ...assessment };
      Object.assign(report, { sourceRef, referenceName: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : report.referenceName, previousId: previous?.id || null,
        comparison: previous ? assessment.dimensions.flatMap(d => { const before = previous.dimensions.find(x => x.id === d.id)?.score; return typeof before === 'number' && typeof d.score === 'number' ? [{ id: d.id, before, after: d.score, delta: d.score-before }] : []; }) : [] });
      open().prepare('INSERT INTO reports VALUES(?,?,?,?,?)').run(report.id,currentVault,p.roleId,report.at,JSON.stringify(report));
      if(session){Object.assign(report,{sessionId:session.id,dialogue:session.turns});open().prepare('UPDATE reports SET data=? WHERE id=?').run(JSON.stringify(report),report.id);session.reportId=report.id;dialogue.saveSession(open(),currentVault,session);}
      return { ok: true, report };
    } catch (e) {
      const message=String(e.message || e);
      return { ok:false,error:/Insufficient Balance|QUOTA/i.test(message) ? '当前 AI 服务余额或额度不足。请在 DeepSeek Harness 中检查账号额度，或切换已配置的模型后重试；本次未生成或保存评分。' : /unauthorized|not authenticated|login required/i.test(message) ? 'AI 账号尚未登录或登录已过期，请打开 DeepSeek Harness 完成登录后重试。' : message };
    }
    finally { clearTimeout(timer); if (active === controller) active = null; }
  });
  ipcMain.handle('companions:stop', () => { active?.abort(); return { ok: true }; });
  app.once('before-quit', () => { active?.abort(); db?.close(); sourceDb?.close(); });
}
module.exports = { registerCompanions };
