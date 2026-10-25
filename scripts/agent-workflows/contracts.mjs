import { hashFile, localFile, nonempty, digest, object, sha256 } from './common.mjs';
export { hashFile } from './common.mjs';
export const states = ['draft','awaiting-approval','approved','implementing','verified','ready-for-review','accepted'];
export const scopes = ['local-implementation','local-tests','independent-qa','publication','issues','projects','administration','merge','deployment'];
export function validateContract(record, { root=process.cwd(), expectedState, readFile } = {}) {
  const errors=[], warnings=['Local approval records do not authenticate human identity; verify the cited trusted source before acting.'];
  const require=(condition,message)=>{if(!condition)errors.push(message);};
  if (!object(record)) return {ok:false,errors:['contract must be an object'],warnings};
  require(record.schemaVersion===1,'unsupported schemaVersion');
  require(nonempty(record.taskId) && /^[a-z0-9][a-z0-9-]*$/.test(record.taskId),'invalid taskId');
  require(states.includes(record.state),'invalid state');
  if(expectedState)require(record.state===expectedState,`state must be ${expectedState}`);
  const artifacts=Array.isArray(record.artifacts)?record.artifacts:[];
  require(artifacts.some(a=>a?.role==='spec') && artifacts.some(a=>a?.role==='test-plan'),'spec and test-plan artifacts are required');
  const seen=new Set();
  for(const a of artifacts) {
    if(!object(a)){errors.push('invalid artifact');continue;}
    require(!seen.has(a.path),'duplicate artifact path');seen.add(a.path);
    require(['spec','test-plan','implementation-plan'].includes(a.role),'invalid artifact role');
    require(digest(a.sha256),`invalid artifact digest: ${a.path}`);
    try{const file=localFile(root,a.path);require((readFile ? sha256(readFile(file)) : hashFile(file))===a.sha256,`stale artifact digest: ${a.path}`);}catch(e){errors.push(`${a.path}: ${e.message}`);}
  }
  const acceptance=Array.isArray(record.acceptance)?record.acceptance:[];
  require(acceptance.length>0,'acceptance is required');const ids=new Set();
  for(const a of acceptance){require(object(a)&&nonempty(a?.id)&&nonempty(a?.expected),'invalid acceptance');require(!ids.has(a?.id),'duplicate acceptance id');ids.add(a?.id);}
  const checks=Array.isArray(record.checks)?record.checks:[];require(checks.length>0,'checks are required');const checkIds=new Set();
  for(const c of checks){
    if(!object(c)){errors.push('invalid check');continue;}
    require(nonempty(c.id)&&!checkIds.has(c.id),'invalid/duplicate check id');checkIds.add(c.id);
    require(['unit','component','integration','e2e','visual','docs','eval','manual'].includes(c.layer),'invalid check layer');
    require(Array.isArray(c.command)&&c.command.length>0&&c.command.every(nonempty),'check command must be a nonempty argument array');
    require(typeof c.required==='boolean','required must be boolean');
    require(Array.isArray(c.acceptanceIds)&&c.acceptanceIds.length>0&&c.acceptanceIds.every(id=>ids.has(id)),'unknown/missing check acceptance coverage');
  }
  for(const id of ids)require(checks.some(c=>Array.isArray(c?.acceptanceIds)&&c.acceptanceIds.includes(id)),`uncovered acceptance: ${id}`);
  require(Array.isArray(record.approvals),'approvals must be an array');
  const approvals=Array.isArray(record.approvals)?record.approvals:[];
  for(const a of approvals)require(object(a)&&nonempty(a.actor)&&nonempty(a.source)&&['approved','accepted'].includes(a.decision)&&object(a.artifacts),'approval needs actor, human source, decision and artifact digests');
  if(states.indexOf(record.state)>=states.indexOf('approved')) {
    require(approvals.some(a=>nonempty(a?.actor)&&nonempty(a?.source)&&a.decision==='approved'&&artifacts.every(f=>object(f)&&a.artifacts?.[f.path]===f.sha256)),'approved state needs one sourced approval of all current artifact digests');
  }
  if(record.state==='accepted')require(approvals.some(a=>a?.decision==='accepted'&&nonempty(a.source)&&artifacts.every(f=>object(f)&&a.artifacts?.[f.path]===f.sha256)),'accepted state requires a sourced human acceptance');
  require(Array.isArray(record.authorizations),'authorizations must be an array');
  for(const a of Array.isArray(record.authorizations)?record.authorizations:[])require(object(a)&&scopes.includes(a.scope)&&nonempty(a.source),'authorization needs a known scope and source');
  return {ok:errors.length===0,errors,warnings};
}
