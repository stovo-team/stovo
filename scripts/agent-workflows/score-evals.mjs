import {writeFileSync,readdirSync} from 'node:fs';import path from 'node:path';import {main,argumentsOf,readJson,object,nonempty,digest} from './common.mjs';
export function compareEvals({baseline,candidate,expectedIds}){
 const errors=[],hardFailures=[];
 if(!Array.isArray(baseline)||!Array.isArray(candidate))return {ok:false,errors:['result arrays required'],hardFailures,cost:'unavailable'};
 const ids=x=>x.map(r=>r?.id).sort();if(expectedIds&&JSON.stringify([...expectedIds].sort())!==JSON.stringify(ids(candidate)))errors.push('fixed expected case registry incomplete');if(!baseline.length||JSON.stringify(ids(baseline))!==JSON.stringify(ids(candidate))||new Set(ids(baseline)).size!==baseline.length||new Set(ids(candidate)).size!==candidate.length)errors.push('identical complete case sets required');
 const failures=rows=>rows.flatMap(r=>(r.checks??[]).filter(c=>c.mandatory&&c.passed!==true).map(c=>({case:r.id,check:c.id})));
 for(const result of [...baseline,...candidate]){
  if(!digest(result.caseDigest)||!digest(result.graderDigest)||!nonempty(result.runtime)||!nonempty(result.model)||!nonempty(result.receipt?.agentId)||!nonempty(result.receipt?.source)||!Array.isArray(result.checks)||!result.checks.some(c=>c.mandatory)||result.checks.some(c=>!nonempty(c.id)||typeof c.mandatory!=='boolean'||typeof c.passed!=='boolean'||!nonempty(c.evidence)))errors.push('incomplete checks or trusted-source receipt: '+result.id);
 }
 for(const r of candidate){const b=baseline.find(x=>x.id===r.id);if(!b)continue;if(b.caseDigest!==r.caseDigest||b.graderDigest!==r.graderDigest||b.runtime!==r.runtime||b.model!==r.model||JSON.stringify(b.checks.map(c=>[c.id,c.mandatory]).sort())!==JSON.stringify(r.checks.map(c=>[c.id,c.mandatory]).sort()))errors.push('case/grader/runtime mismatch: '+r.id);}
 hardFailures.push(...failures(candidate));const before=failures(baseline);
 return {ok:errors.length===0&&hardFailures.length===0,errors,hardFailures,baselineHardFailures:before,improved:errors.length===0&&hardFailures.length<before.length,cases:candidate.length,cost:'unavailable',tokens:'unavailable',limitations:['Native workflow-decision evals measure decisions, not an end-to-end coding benchmark.','Local receipts document the actual Desktop run; they do not authenticate themselves.']};
}
export function readResults(directory){return readdirSync(directory).filter(n=>/^EV-|^H-/.test(n)&&n.endsWith('.json')).sort().map(n=>readJson(path.join(directory,n)));}
main(import.meta.url,args=>{const o=argumentsOf(args);const result=compareEvals({baseline:readResults(o.baseline),candidate:readResults(o.candidate),expectedIds:readdirSync(o.cases??'agent-evals/cases').filter(n=>n.endsWith('.json')).map(n=>readJson(path.join(o.cases??'agent-evals/cases',n)).id)});if(o.report)writeFileSync(o.report,JSON.stringify(result,null,2)+'\n');return result;});
