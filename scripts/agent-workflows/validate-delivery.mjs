import {validateContract,states} from './contracts.mjs';import {validateEvidence} from './evidence.mjs';import {sourceSnapshot} from './source.mjs';import {main,argumentsOf,readJson,hashFile,object,nonempty} from './common.mjs';
export function classifyChanges(paths){
 if(!Array.isArray(paths)||!paths.every(p=>typeof p==='string'&&!p.startsWith('/')&&!p.split(/[\\/]/).includes('..')))return {valid:false,visual:true,allScenarios:true};
 const product=paths.filter(p=>!/(?:\.test\.|\.spec\.|__tests__\/)/.test(p));
 return {valid:true,visual:product.some(p=>/^frontend\/(?:src\/|public\/|index\.html|package(?:-lock)?\.json|vite\.config)/.test(p)),allScenarios:product.some(p=>/^frontend\/src\/(?:design-system\/tokens\.css|styles\.css|appearance\/)/.test(p))};
}
export function validateDelivery({root=process.cwd(),contract,evidence,qa,changedPaths,contractDigest,expectedRevision,expectedPatchDigest}){
 const c=validateContract(contract,{root}),missing=[...c.errors],blocked=[];
 const change=classifyChanges(changedPaths);if(!change.valid)missing.push('invalid changed paths');
 if(states.indexOf(contract?.state)<states.indexOf('approved'))missing.push('contract approval required before readiness');
 const result=validateEvidence(evidence,{root,contract,contractDigest,expectedRevision,requireVisual:change.visual});missing.push(...result.errors);
 if(evidence?.dirty && (!expectedPatchDigest || evidence.patchDigest!==expectedPatchDigest))missing.push('dirty evidence does not match actual working contents');
 if(!object(qa)||qa.schemaVersion!==1||qa.taskId!==contract?.taskId||qa.sourceRevision!==expectedRevision||qa.contractDigest!==contractDigest||qa.status!=='passed'||qa.reviewer?.independent!==true||!nonempty(qa.reviewer?.source)||!Array.isArray(qa.findings))missing.push('independent QA is missing or stale');
 if(qa?.findings?.some?.(f=>!f?.resolved&&['critical','important','P0','P1','P2'].includes(f?.severity)))blocked.push('unresolved important QA finding');
 if(change.allScenarios)for(let i=1;i<=12;i++){const id='V-'+String(i).padStart(2,'0');if(!evidence?.screenshots?.some?.(s=>s?.side==='after'&&s.scenarioId===id))missing.push('shared UI change requires '+id);}
 return {ok:missing.length===0&&blocked.length===0,visualRequired:change.visual,missing,blocked,warnings:c.warnings};
}
main(import.meta.url,args=>{const o=argumentsOf(args);for(const key of ['contract','evidence','qa','changed-paths'])if(!o[key])throw Error('Missing --'+key);const root=o.root??process.cwd(),source=sourceSnapshot(root);return validateDelivery({root,contract:readJson(o.contract),evidence:readJson(o.evidence),qa:readJson(o.qa),changedPaths:readJson(o['changed-paths']),contractDigest:hashFile(o.contract),expectedRevision:source.sourceRevision,expectedPatchDigest:source.patchDigest});});
