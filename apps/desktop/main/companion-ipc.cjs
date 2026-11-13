const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const rubric = require('../shared/companion-rubric.cjs');
const { assertInsideVault } = require('./vault-fs.cjs');
const { loadBridge } = require('./ai.cjs');
const learning = require('./lib/learning.cjs');
const dialogue = require('./lib/companion-dialogue.cjs');
const review = require('./lib/assessment-review.cjs');
function registerCompanions(ipcMain, app, { getBridge = loadBridge } = {}) {
  let db, sourceDb, active = null;
  const open = () => {
    if (!db) {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      db = new (require('node:sqlite').DatabaseSync)(path.join(app.getPath('userData'), 'companions.db'));
      db.exec('CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,vault TEXT NOT NULL,role TEXT NOT NULL,at TEXT NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS reports_vault ON reports(vault,at);');
      dialogue.initialize(db);
      review.initialize(db);
    }
    return db;
  };
  const vault = p => { const real = assertInsideVault(p.vault, { mustExist: true }); if (!fs.statSync(real).isDirectory()) throw new Error('Invalid library'); return real; };
  const sourceFor = (current,id) => {
    if(!id)return null;
    const file=path.join(app.getPath('userData'),'learning.db');
    if(!fs.existsSync(file))throw Error('Please choose study material first.');
    sourceDb ||= learning.openLearningDb(file);
    return learning.sourceById(sourceDb,current,id);
  };
  const friendly = e => {
    const message=String(e.message||e);
    return /Insufficient Balance|QUOTA/i.test(message)?'The current AI service has insufficient balance or quota; check your DeepSeek Harness account. Your input and conversation have been preserved.':/unauthorized|not authenticated|login required/i.test(message)?'Your AI login has expired; open DeepSeek Harness, sign in, and try again.':message;
  };
  const local = fn => (_e,p={})=>{try{return fn(vault(p),p);}catch(e){return{ok:false,error:friendly(e)};}};
  ipcMain.handle('companions:review',local((current,p)=>{
    const row=open().prepare('SELECT data FROM reports WHERE vault=? AND id=?').get(current,p.reportId);
    if(!row)throw Error('The report is not in this library.');
    return{ok:true,review:review.save(open(),current,p,JSON.parse(row.data))};
  }));
  ipcMain.handle('companions:reviews',local((current,p)=>{
    const reviews=review.list(open(),current,p.reportId);
    return{ok:true,reviews,summary:review.summary(reviews)};
  }));
  ipcMain.handle('companions:disclosure',local((current)=>({ok:true,...review.disclosure(open(),current)})));
  ipcMain.handle('companions:saveDisclosure',local((current,p)=>({ok:true,...review.saveDisclosure(open(),current,p)})));
  ipcMain.handle('companions:startSession',local((current,p)=>({ok:true,session:dialogue.startSession(open(),current,p,sourceFor(current,p.sourceId))})));
  ipcMain.handle('companions:session',local((current,p)=>{
    const session=dialogue.getSession(open(),current,p.sessionId);
    if(!active&&session.request?.state==='pending'){session.request.state='failed';dialogue.saveSession(open(),current,session);}
    return{ok:true,session};
  }));
  ipcMain.handle('companions:sessions',local((current,p)=>{
    if(!rubric.ROLES.some(r=>r.id===p.roleId))throw Error('Role not found.');
    const rows=open().prepare('SELECT data FROM room_sessions WHERE vault=? AND role=? ORDER BY at DESC LIMIT 20').all(current,p.roleId);
    return{ok:true,sessions:rows.map(row=>{const s=JSON.parse(row.data);return{id:s.id,topic:s.topic,at:s.turns.at(-1)?.at||s.at,turnCount:s.turns.length,referenceName:s.referenceName,reportId:s.reportId};})};
  }));
  ipcMain.handle('companions:saveDraft',local((current,p)=>{
    const session=p.sessionId?dialogue.getSession(open(),current,p.sessionId):null;
    if(p.previousId&&!open().prepare('SELECT 1 FROM reports WHERE vault=? AND role=? AND id=?').get(current,p.roleId,p.previousId))throw Error('The re-explanation record does not exist.');
    return{ok:true,draft:dialogue.draft(open(),current,p,session?session.sourceRef:sourceFor(current,p.sourceId),session)};
  }));
  ipcMain.handle('companions:loadDraft',local((current,p)=>{
    const draft=dialogue.loadDraft(open(),current,p,!active);
    return{ok:true,draft:draft?{...draft,sourceRef:sourceFor(current,draft.sourceId)}:null};
  }));
  ipcMain.handle('companions:reply',async(_e,p={})=>{
    if(active)return{ok:false,error:'The role is still handling the previous request; please wait or stop it.'};
    const controller=new AbortController();active=controller;let current,timer,reserved;
    try{
      current=vault(p);reserved=dialogue.reserveReply(open(),current,p);
      if(reserved.completed)return{ok:true,session:reserved.session,duplicate:true};
      const bridge=await getBridge();if(controller.signal.aborted)throw Error('The follow-up was stopped; the answer has been preserved.');
      timer=setTimeout(()=>controller.abort(),120000);let final='',text='';
      for await(const ev of bridge.runHeadless({task:dialogue.replyPrompt(reserved.session,reserved.session.request.intent),cwd:current,signal:controller.signal})){
        if(ev.type==='tool_call'){controller.abort();throw Error('The role requested a tool operation; it was stopped and the answer has been preserved.');}
        if(ev.type==='text')text+=ev.text||'';if(ev.type==='final')final=ev.text||'';
        if(text.length>100000||final.length>100000){controller.abort();throw Error('The role reply was too long; the answer has been preserved.');}
      }
      if(controller.signal.aborted)throw Error('The follow-up was stopped or timed out; the answer has been preserved.');
      if(vault(p)!==current)throw Error('The library was switched; this follow-up was not written to the new library.');
      const reply=dialogue.normalizeReply(final||text,reserved.session.referenceText,reserved.session.locale);
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
    if (active) return { ok: false, error: 'Evaluation in progress; please wait or stop the current evaluation.' };
    const controller = new AbortController(); active = controller;
    let timer;
    try {
      const currentVault = vault(p);
      const session=p.sessionId?dialogue.getSession(open(),currentVault,p.sessionId):null;
      if(session){if(session.request?.state==='pending')throw Error('Please finish or stop the current follow-up first.');p={...p,roleId:session.roleId,locale:session.locale||'zh',topic:session.topic,transcript:dialogue.learnerText(session),sourceId:session.sourceRef?.id,context:session.referenceText,referenceName:session.referenceName};}
      if (typeof p.topic !== 'string' || !p.topic.trim() || p.topic.length > 200) throw new Error('Please enter an explanation topic (at most 200 characters)');
      if (typeof p.transcript !== 'string' || p.transcript.trim().length < 10 || p.transcript.length > 12000) throw new Error('Please provide an explanation of 10 to 12000 characters');
      let sourceRef = null, previous = null;
      if (p.sourceId) {
        const file = path.join(app.getPath('userData'), 'learning.db');
        if (!fs.existsSync(file)) throw new Error('Please choose study material first.');
        sourceDb ||= learning.openLearningDb(file);
        sourceRef = learning.sourceById(sourceDb, currentVault, p.sourceId);
      }
      if (p.previousId) {
        const row = open().prepare('SELECT data FROM reports WHERE vault=? AND role=? AND id=?').get(currentVault, p.roleId, p.previousId);
        previous = row ? JSON.parse(row.data) : null;
        if (!previous || previous.topic !== p.topic || (previous.sourceRef?.id || null) !== (sourceRef?.id || null)) throw new Error('Re-explanation must use the original topic, role, and source section.');
      }
      const task = rubric.prompt({ ...p, context: sourceRef?.text ?? p.context, sourceLocation: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : '', previous, focus: String(p.focus || '').slice(0,1800), dialogue:session?.turns||[] }), bridge = await getBridge();
      if (controller.signal.aborted) throw new Error('Evaluation stopped');
      timer = setTimeout(() => controller.abort(), 120000);
      let final = '', text = '';
      for await (const ev of bridge.runHeadless({ task, cwd: currentVault, signal: controller.signal })) {
        if (ev.type === 'tool_call') { controller.abort(); throw new Error('This evaluation requested a tool operation; it was stopped. Please explain again.'); }
        if (ev.type === 'text') text += ev.text || '';
        if (ev.type === 'final') final = ev.text || '';
        if(text.length>100000||final.length>100000){controller.abort();throw Error('The evaluation reply was too long; no score was saved.');}
      }
      if (controller.signal.aborted) throw new Error('The evaluation was stopped or timed out; no score was saved.');
      // Switching libraries while awaiting a response must never write to the new library.
      if (vault(p) !== currentVault) throw new Error('The library was switched; this evaluation was not saved.');
      const assessment = rubric.normalize(final || text, p.transcript,sourceRef?.text||p.context||'',p.locale);
      const report = { id: randomUUID(), roleId: p.roleId,locale:p.locale==='en'?'en':'zh', topic: p.topic, transcript: p.transcript, referenceName: String(p.referenceName || '').slice(0,200), at: new Date().toISOString(), ...assessment };
      Object.assign(report, { sourceRef, referenceName: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : report.referenceName, previousId: previous?.id || null,
        comparison: previous ? assessment.dimensions.flatMap(d => { const before = previous.dimensions.find(x => x.id === d.id)?.score; return typeof before === 'number' && typeof d.score === 'number' ? [{ id: d.id, before, after: d.score, delta: d.score-before }] : []; }) : [] });
      open().prepare('INSERT INTO reports VALUES(?,?,?,?,?)').run(report.id,currentVault,p.roleId,report.at,JSON.stringify(report));
      if(session){Object.assign(report,{sessionId:session.id,dialogue:session.turns});open().prepare('UPDATE reports SET data=? WHERE id=?').run(JSON.stringify(report),report.id);session.reportId=report.id;dialogue.saveSession(open(),currentVault,session);}
      return { ok: true, report };
    } catch (e) {
      const message=String(e.message || e);
      return { ok:false,error:/Insufficient Balance|QUOTA/i.test(message) ? 'The current AI service has insufficient balance or quota. Check your account quota in DeepSeek Harness, or switch to a configured model and try again; no score was generated or saved.' : /unauthorized|not authenticated|login required/i.test(message) ? 'The AI account is not signed in or the login has expired; open DeepSeek Harness, complete sign-in, and try again.' : message };
    }
    finally { clearTimeout(timer); if (active === controller) active = null; }
  });
  ipcMain.handle('companions:stop', () => { active?.abort(); return { ok: true }; });
  app.once('before-quit', () => { active?.abort(); db?.close(); sourceDb?.close(); });
}
module.exports = { registerCompanions };
