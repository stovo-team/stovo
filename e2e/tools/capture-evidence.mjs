import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {main,argumentsOf,sha256,hashFile} from '../../scripts/agent-workflows/common.mjs';
const e2e=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function sourceSnapshot(root){
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout;};
 const revision=git('rev-parse','HEAD').trim(),diff=git('diff','HEAD','--binary');
 const other=git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean).sort().map(p=>[p,hashFile(path.join(root,p))]);
 const dirty=!!diff||other.length>0;return {sourceRevision:revision,dirty,...dirty?{patchDigest:sha256(JSON.stringify({diff,other}))}:{}};
}
export function captureEvidence({taskId,output,config='playwright.visual.config.ts',run=spawnSync}){
 if(!/^[a-z0-9][a-z0-9-]*$/.test(taskId??''))throw Error('invalid task identity');if(!output)throw Error('output directory is required');
 output=path.resolve(output);mkdirSync(output,{recursive:true});const start=Date.now(),source=sourceSnapshot(path.resolve(e2e,'..'));
 const result=run(process.execPath,[path.join(e2e,'node_modules/playwright/cli.js'),'test','--config',config],{cwd:e2e,encoding:'utf8',timeout:180000,env:{...process.env,STOVO_VISUAL_OUTPUT:output}});
 writeFileSync(path.join(output,'runner.stdout.log'),result.stdout??'');writeFileSync(path.join(output,'runner.stderr.log'),result.stderr??'');
 let report;try{report=JSON.parse(readFileSync(path.join(output,'report.json'),'utf8'));}catch{}
 const ok=result.status===0 && !!report && report.stats.unexpected===0 && report.stats.expected>0 && report.stats.skipped===0;
 const record={schemaVersion:1,taskId,...source,ok,environment:{node:process.version,platform:process.platform},checks:[{id:'mock-visual',result:ok?'passed':'failed',command:['npm','run','test:visual'],durationMs:Date.now()-start}],limitations:ok?[]:[result.error?.message||'Playwright failed or did not produce a complete successful report.']};
 writeFileSync(path.join(output,'capture.json'),JSON.stringify(record,null,2)+'\n');return record;
}
main(import.meta.url,args=>{const o=argumentsOf(args);return captureEvidence({taskId:o.task,output:o.output,config:o.config});});
