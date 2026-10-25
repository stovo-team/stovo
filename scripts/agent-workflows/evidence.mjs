import {object,nonempty,digest,localFile,hashFile,readJson} from './common.mjs';
const revision=x=>typeof x==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(x);
export function validateEvidence(m,{root=process.cwd(),contract,contractDigest,expectedRevision,requireVisual=false,requireBackend=false}={}){
 const errors=[],need=(ok,message)=>{if(!ok)errors.push(message);};
 if(!object(m))return {ok:false,errors:['evidence must be an object']};
 need(m.schemaVersion===1,'unsupported evidence version');need(m.taskId===contract?.taskId,'task identity mismatch');
 need(revision(m.sourceRevision)&&m.sourceRevision===expectedRevision,'stale or invalid source revision');need(revision(m.baseRevision),'invalid base revision');
 need(digest(contractDigest)&&m.contractDigest===contractDigest,'stale contract digest');need(typeof m.dirty==='boolean','dirty flag required');if(m.dirty)need(digest(m.patchDigest),'dirty source requires patch digest');
 need(object(m.environment)&&nonempty(m.environment.platform)&&nonempty(m.environment.timezone),'complete runtime environment required');if(requireVisual)need(nonempty(m.environment?.browserVersion),'browser version required for visual evidence');
 need(Array.isArray(m.limitations),'limitations must be an array');
 if(!Array.isArray(contract?.checks)||contract.checks.some(c=>!object(c)||!Array.isArray(c.acceptanceIds))||!Array.isArray(m.checks)||m.checks.some(c=>object(c)&&c.artifacts!==undefined&&!Array.isArray(c.artifacts)))return {ok:false,errors:[...errors,'malformed check or artifact collection']};
 const checks=Array.isArray(m.checks)?m.checks:[];need(Array.isArray(m.checks),'checks must be an array');const checkIds=new Set();
 for(const c of checks){if(!object(c)){errors.push('invalid check');continue;}need(nonempty(c.id)&&!checkIds.has(c.id),'invalid/duplicate evidence check');checkIds.add(c.id);need(['passed','failed','blocked','not-applicable'].includes(c.result),'invalid check result');need(Number.isFinite(c.durationMs)&&c.durationMs>=0,'check duration required');need(Array.isArray(c.command)&&c.command.length>0&&c.command.every(nonempty),'check argument array required');need(Array.isArray(c.acceptanceIds)&&c.acceptanceIds.length>0,'check acceptance coverage required');if(c.result==='not-applicable')need(nonempty(c.reason),'not-applicable reason required');for(const a of c.artifacts??[]){try{const file=localFile(root,a.path);need(digest(a.sha256)&&hashFile(file)===a.sha256,'check artifact hash mismatch');}catch(e){errors.push(e.message);}}}
 for(const c of contract?.checks??[]){const actual=checks.find(x=>x?.id===c.id);if(c.required)need(actual?.result==='passed',`required check not passed: ${c.id}`);if(actual){need(c.acceptanceIds.every(id=>actual.acceptanceIds?.includes(id)),`check coverage mismatch: ${c.id}`);if(c.command)need(JSON.stringify(actual.command)===JSON.stringify(c.command),`check command mismatch: ${c.id}`);}}
 const shots=Array.isArray(m.screenshots)?m.screenshots:[];need(Array.isArray(m.screenshots),'screenshots must be an array');if(requireVisual)need(shots.length>0,'visual evidence required');const pairs=new Map(),seen=new Set();
 for(const s of shots){
  if(!object(s)){errors.push('invalid screenshot');continue;}
  need(nonempty(s.scenarioId)&&['before','after'].includes(s.side),'invalid screenshot identity/side');
  const key=s.scenarioId+':'+s.side;need(!seen.has(key),'duplicate screenshot');seen.add(key);
  need(s.sourceRevision===(s.side==='before'?m.baseRevision:m.sourceRevision),'screenshot source revision mismatch');
  need(object(s.viewport)&&Number.isInteger(s.viewport.width)&&s.viewport.width>0&&Number.isInteger(s.viewport.height)&&s.viewport.height>0,'invalid screenshot viewport');need(['light','dark'].includes(s.theme)&&nonempty(s.locale),'screenshot theme/locale required');
  try{const file=localFile(root,s.path);need(digest(s.sha256)&&hashFile(file)===s.sha256,`screenshot digest mismatch: ${s.path}`);}catch(e){errors.push(e.message);}
  const pair=pairs.get(s.scenarioId)??{};pair[s.side]=s;pairs.set(s.scenarioId,pair);
 }
 for(const [id,pair] of pairs){
  need(!!pair.after,`missing after screenshot: ${id}`);
  if(!pair.before){need(Array.isArray(m.afterOnly)&&m.afterOnly.some(x=>x?.scenarioId===id&&nonempty(x.reason)&&nonempty(x.source)),`missing before screenshot/reviewed after-only reason: ${id}`);continue;}
  if(pair.after)need(JSON.stringify(pair.before.viewport)===JSON.stringify(pair.after.viewport)&&pair.before.theme===pair.after.theme&&pair.before.locale===pair.after.locale,`screenshot metadata mismatch: ${id}`);
 }
 const impact=Array.isArray(m.backendImpact)?m.backendImpact:[];
 need(m.backendImpact===undefined||Array.isArray(m.backendImpact),'backendImpact must be an array');
 if(requireBackend||contract?.backendImpactRequired)need(impact.length>0,'backend impact evidence required');
 const impactIds=new Set();
 const artifact=a=>{try{need(object(a)&&digest(a.sha256)&&hashFile(localFile(root,a.path))===a.sha256,'backend artifact missing or hash mismatch');}catch(e){errors.push(e.message);}};
 for(const b of impact){
  if(!object(b)){errors.push('invalid backend observation');continue;}
  need(nonempty(b.id)&&!impactIds.has(b.id),'invalid/duplicate backend impact id');impactIds.add(b.id);
  const acceptance=Array.isArray(contract?.acceptance)?contract.acceptance.find(a=>a?.id===b.acceptanceId):undefined;
  need(!!acceptance&&b.expected===acceptance.expected,'backend expected result differs from acceptance');
  const check=checks.find(c=>c?.id===b.checkId);
  need(check?.result==='passed'&&Array.isArray(check.acceptanceIds)&&check.acceptanceIds.includes(b.acceptanceId),'backend observation lacks passing acceptance check');
  artifact(b.input);
  for(const side of ['before','after']){
   const o=b[side];if(!object(o)){errors.push('backend before/after execution required');continue;}
   need(o.sourceRevision===(side==='before'?m.baseRevision:m.sourceRevision),'backend observation source mismatch');
   if(side==='after')need(o.patchDigest===(m.dirty?m.patchDigest:undefined),'backend observation patch mismatch');
   need(['local','stage'].includes(o.environment)&&nonempty(o.target)&&nonempty(o.runtime),'backend isolated environment required');
   need(Array.isArray(o.command)&&o.command.length>0&&o.command.every(nonempty)&&nonempty(o.executionSource)&&Number.isFinite(Date.parse(o.startedAt)),'backend execution provenance required');
   need(['api','persistence','trace','measurement'].includes(o.kind)&&nonempty(o.actual),'observable backend result required');artifact(o.artifact);
   need(digest(o.inputDigest)&&o.inputDigest===b.input?.sha256,'backend execution input mismatch');
   need(Number.isInteger(o.exitCode)&&(side==='before'||o.exitCode===0),'backend after execution did not pass');
   need(JSON.stringify(o.command)===JSON.stringify(check?.command),'backend execution command differs from check');
   try{
    const receipt=readJson(localFile(root,o.artifact.path));
    need(object(receipt)&&receipt.schemaVersion===1&&['sourceRevision','patchDigest','inputDigest','startedAt','command','environment','target','runtime','kind','exitCode','actual'].every(k=>JSON.stringify(receipt[k])===JSON.stringify(o[k])),'backend execution receipt mismatch');
    need(typeof receipt.stdout==='string'&&typeof receipt.stderr==='string'&&o.actual===((receipt.stdout||receipt.stderr).trim()||`exit code ${receipt.exitCode}`),'backend result differs from captured output');
   }catch(e){errors.push('invalid backend execution receipt: '+e.message);}
  }
  if(object(b.before)&&object(b.after))need(['environment','target','runtime','kind','command'].every(k=>JSON.stringify(b.before[k])===JSON.stringify(b.after[k])),'backend before/after conditions differ');
 }
 for(const a of Array.isArray(contract?.acceptance)?contract.acceptance:[])if(a?.backend===true)need(impact.some(b=>b?.acceptanceId===a.id),'missing backend acceptance: '+a.id);
 return {ok:errors.length===0,errors};
}
