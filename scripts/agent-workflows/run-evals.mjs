import {mkdirSync,readdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {main,argumentsOf,readJson,hashFile,sha256,object,nonempty} from './common.mjs';
export async function runEvals({casesDir,expectations,adapter,output,context={}}){
 const gold=readJson(expectations),graderDigest=sha256(hashFile(expectations)+hashFile(fileURLToPath(new URL('./score-evals.mjs',import.meta.url)))+hashFile(fileURLToPath(import.meta.url)));mkdirSync(output,{recursive:true});const results=[];
 for(const name of readdirSync(casesDir).filter(n=>n.endsWith('.json')).sort()){
  const file=path.join(casesDir,name),input=readJson(file),started=Date.now();let observed;
  try{observed=await adapter(input,{...context,caseDigest:hashFile(file)});}catch(e){observed={output:{},receipt:null,error:e.message,runtime:'blocked',model:'unavailable'};}
  const expected=gold[input.id];if(!object(expected))throw Error('missing fixed expectations: '+input.id);
  const outputValue=observed.output??{},checks=Object.entries(expected).map(([field,value])=>({id:field,mandatory:true,passed:outputValue[field]===value,evidence:`Observed ${JSON.stringify(outputValue[field])}; fixed expected ${JSON.stringify(value)}; ${observed.receipt?.source??'run receipt unavailable'}`}));
  if(!nonempty(outputValue.reason)||!Array.isArray(outputValue.evidence)||!outputValue.evidence.length)checks.push({id:'explanation',mandatory:true,passed:false,evidence:'Missing grounded explanation'});
  const r={schemaVersion:1,id:input.id,kind:input.kind,caseDigest:hashFile(file),graderDigest,runtime:observed.runtime??'blocked',model:observed.model??'unavailable',receipt:observed.receipt,durationMs:Date.now()-started,durationMeaning:'artifact import and deterministic grading; model latency unavailable',checks,output:outputValue,error:observed.error??null};
  writeFileSync(path.join(output,input.id+'.json'),JSON.stringify(r,null,2)+'\n');results.push(r);
 }
 return {ok:results.every(r=>r.receipt&&r.checks.every(c=>!c.mandatory||c.passed)),cases:results.length,modelCallsPerformedByRunner:false,output};
}
main(import.meta.url,async args=>{const o=argumentsOf(args);if(!o.adapter||!o.cases||!o.output)throw Error('Usage: run-evals --cases dir --adapter trusted-local-module --output dir --input actual-desktop-run-dir');const module=await import(pathToFileURL(path.resolve(o.adapter)));return runEvals({casesDir:o.cases,expectations:o.expectations??'agent-evals/expectations.json',adapter:module.runCase,output:o.output,context:{input:o.input}});});
