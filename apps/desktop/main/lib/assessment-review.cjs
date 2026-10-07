const {randomUUID}=require('node:crypto');
const {DIMENSIONS}=require('../../shared/companion-rubric.cjs');
const TYPES=['teacher','peer','self'];
function initialize(db){
  db.exec('CREATE TABLE IF NOT EXISTS assessment_reviews(id TEXT PRIMARY KEY,vault TEXT NOT NULL,report TEXT NOT NULL,at TEXT NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS assessment_reviews_vault ON assessment_reviews(vault,report,at); CREATE TABLE IF NOT EXISTS competition_meta(vault TEXT PRIMARY KEY,at TEXT NOT NULL,data TEXT NOT NULL);');
}
function clean(value,max,label){if(typeof value!=='string'||value.length>max)throw Error(label+' is invalid.');return value.trim();}
function normalize(p,report){
  if(!TYPES.includes(p.reviewerType))throw Error('Choose a reviewer role.');
  if(!Array.isArray(p.dimensions)||p.dimensions.length!==6||new Set(p.dimensions.map(d=>d?.id)).size!==6)throw Error('Provide exactly six review dimensions.');
  const dimensions=DIMENSIONS.map(def=>{
    const input=p.dimensions.find(d=>d?.id===def.id);
    if(!input||!(input.score===null||Number.isInteger(input.score)&&input.score>=0&&input.score<=4))throw Error('Review scores must be 0–4 or unobserved.');
    const reason=clean(input.reason||'',1000,'Review reason');
    if(input.score!==null&&!reason)throw Error('Explain each score before saving.');
    const ai=report.dimensions.find(d=>d.id===def.id)?.score;
    return{id:def.id,score:input.score,reason,aiScore:typeof ai==='number'?ai:null,difference:typeof ai==='number'&&input.score!==null?input.score-ai:null};
  });
  return{reportId:report.id,reviewerType:p.reviewerType,alias:clean(p.alias||'',60,'Reviewer alias'),dimensions};
}
function save(db,vault,p,report){
  const input=normalize(p,report),id=clean(p.id||randomUUID(),100,'Submission ID');
  if(id.length<8)throw Error('Submission ID is invalid.');
  const found=db.prepare('SELECT vault,data FROM assessment_reviews WHERE id=?').get(id);
  if(found){const old=JSON.parse(found.data),{id:oldId,at,...rest}=old;
    if(found.vault!==vault||JSON.stringify(input)!==JSON.stringify(rest))throw Error('This submission ID already belongs to another review.');
    return old;
  }
  const review={...input,id,at:new Date().toISOString()};
  db.prepare('INSERT INTO assessment_reviews VALUES(?,?,?,?,?)').run(id,vault,report.id,review.at,JSON.stringify(review));return review;
}
function list(db,vault,reportId){
  const rows=reportId?db.prepare('SELECT data FROM assessment_reviews WHERE vault=? AND report=? ORDER BY at DESC,rowid DESC LIMIT 200').all(vault,reportId):db.prepare('SELECT data FROM assessment_reviews WHERE vault=? ORDER BY at DESC,rowid DESC LIMIT 200').all(vault);
  return rows.map(row=>JSON.parse(row.data));
}
function summary(reviews){
  const latest=new Map();for(const review of reviews){if(!latest.has(review.reportId))latest.set(review.reportId,review);}
  const comparable=[...latest.values()].flatMap(r=>r.dimensions).filter(d=>typeof d.difference==='number');
  const exact=comparable.filter(d=>d.difference===0).length;
  return{reviewCount:reviews.length,reportCount:latest.size,comparable:comparable.length,exact,agreement:comparable.length?exact/comparable.length:null,meanAbsoluteDifference:comparable.length?comparable.reduce((sum,d)=>sum+Math.abs(d.difference),0)/comparable.length:null,teacherLabelled:[...latest.values()].filter(r=>r.reviewerType==='teacher').length};
}
function saveDisclosure(db,vault,p){
  if(!Array.isArray(p.tools)||p.tools.length>12)throw Error('At most 12 tools can be recorded.');
  const tools=p.tools.map(t=>({name:clean(t.name,100,'Tool name'),version:clean(t.version||'',120,'Version'),purpose:clean(t.purpose||'',800,'Purpose'),studentWork:clean(t.studentWork||'',1200,'Student contribution')}));
  const data={tools,at:new Date().toISOString()};
  db.prepare('INSERT OR REPLACE INTO competition_meta VALUES(?,?,?)').run(vault,data.at,JSON.stringify(data));return data;
}
function disclosure(db,vault){const row=db.prepare('SELECT data FROM competition_meta WHERE vault=?').get(vault);return row?JSON.parse(row.data):{tools:[],at:null};}
module.exports={initialize,normalize,save,list,summary,saveDisclosure,disclosure};
