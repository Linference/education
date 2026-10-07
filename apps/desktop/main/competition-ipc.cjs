const fs=require('node:fs');
const path=require('node:path');
const content=require('../shared/competition-content.json');
function registerCompetition(ipcMain,app){
  ipcMain.handle('competition:workspace',()=>{
    try{
      const parent=app.getPath('userData'),dir=path.join(parent,'presentation-v1');
      fs.mkdirSync(parent,{recursive:true});
      if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('The demo directory is a link. Choose another app profile.');
      fs.mkdirSync(dir,{recursive:true});
      const real=fs.realpathSync(dir),rel=path.relative(fs.realpathSync(parent),real);
      if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('The demo directory is outside app storage.');
      const file=path.join(real,'Force-and-acceleration.md');
      // A repeat visit must preserve user edits to the isolated demonstration file.
      try{fs.writeFileSync(file,content.source,{flag:'wx',encoding:'utf8'});}catch(e){if(e.code!=='EEXIST')throw e;}
      if(fs.lstatSync(file).isSymbolicLink())throw Error('The demonstration file is a link.');
      return{ok:true,path:real,file};
    }catch(e){return{ok:false,error:e.message};}
  });
}
module.exports={registerCompetition};
