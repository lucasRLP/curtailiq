// A no-new-lint gate, not a claim that the raw frontend lint is green.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const BASE='f6972e0a5f6e59d433928e7c60ccfc7faa734306';
const fingerprint=m=>JSON.stringify([m.file,m.ruleId,m.message,m.line,m.column,m.severity]);
function compare(baseline,current){
 const known=new Set(baseline.filter(m=>!m.fatal).map(fingerprint));
 return current.filter(m=>m.fatal || !known.has(fingerprint(m)));
}
module.exports={compare};
async function main(){
 const root=path.resolve(__dirname,'../..');
 const front=path.join(root,'front');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
 // Same pinned dependencies and unchanged lint config, so legacy comparison cannot bless a disabled rule.
 if(git('diff',BASE,'--','front/eslint.config.js','front/package-lock.json','front/package.json').trim()){
   throw new Error('Lint configuration/dependencies changed: independent baseline review required');
 }
 const {ESLint}=createRequire(path.join(front,'package.json'))('eslint');
 const eslint=new ESLint({cwd:front});
 const raw=await eslint.lintFiles(['.']);
 const current=[],baseline=[];
 for(const result of raw){
   const relative=path.relative(front,result.filePath).split(path.sep).join('/');
   for(const m of result.messages)current.push({...m,file:relative});
   if(!result.messages.length)continue;
   let text;
   try{text=git('show',`${BASE}:front/${relative}`);}catch{continue;}
   for(const r of await eslint.lintText(text,{filePath:result.filePath})){
     for(const m of r.messages)baseline.push({...m,file:relative});
   }
 }
 const unexpected=compare(baseline,current);
 const evidence=path.join(root,'docs/fusion/evidence',`ci-frontend-lint-${process.env.GITHUB_RUN_ID||'local'}-${Date.now()}`);
 fs.mkdirSync(evidence,{recursive:true});
 fs.writeFileSync(path.join(evidence,'current.json'),JSON.stringify(raw,null,2));
 fs.writeFileSync(path.join(evidence,'comparison.json'),JSON.stringify({base:BASE,rawLintExit:current.some(m=>m.severity===2)?1:0,currentCount:current.length,baselineFindingsForCandidateFiles:baseline,unexpected},null,2));
 console.log(`Raw lint: ${current.length} findings; unexpected: ${unexpected.length}; evidence: ${evidence}`);
 if(unexpected.length){console.error(unexpected);process.exitCode=1;}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
