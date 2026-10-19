import {main,argumentsOf,readJson,nonempty} from './common.mjs';
import {planDigest,validatePlan,remoteValue,GhTransport} from './github-plan.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Compare existing option names/order; GitHub may allocate replacement IDs on update.
const satisfied=(actual,after,kind)=>kind==='project.statuses'?actual?.projectId===after.projectId&&actual?.fieldId===after.fieldId&&equal(actual.options.map(o=>o.name),after.options.map(o=>o.name)):kind==='rules.upsert'?actual&&equal({...actual,id:undefined},{...after,id:undefined}):equal(actual,after);
export async function applyPlan(plan,{transport,authorization,confirmAuthorization}={}){
 const valid=validatePlan(plan);if(!valid.ok)throw Error(valid.errors.join('; '));
 if(authorization?.reviewedDigest!==planDigest(plan))throw Error('reviewed plan digest does not match');
 if(!nonempty(authorization.source)||!Array.isArray(authorization.scopes))throw Error('trusted human authorization source and scopes required');
 for(const op of plan.operations)if(!authorization.scopes.includes(op.scope))throw Error(`missing authorization scope ${op.scope}`);
 if(confirmAuthorization&&!await confirmAuthorization(authorization,plan))throw Error('host rejected authorization');
 const results=[];for(const op of plan.operations){const snapshot=await transport.snapshot();if(snapshot.repository!==plan.repository)throw Error('repository mismatch');const access=op.kind.startsWith('issue')?'issues':op.kind.startsWith('milestone')?'milestones':op.kind.startsWith('project')?'projects':'rules';if(!snapshot.access[access])throw Error(`missing access for ${access}`);const actual=remoteValue(snapshot,op);if(satisfied(actual,op.after,op.kind)){results.push({key:op.key,status:'already-applied'});continue;}
 if(!equal(actual,op.before))throw Error(`changed remote state for ${op.key}; regenerate and review the plan`);
 await transport.mutate(op);const checked=remoteValue(await transport.snapshot(),op);if(!satisfied(checked,op.after,op.kind))throw Error(`readback mismatch for ${op.key}; stop and inspect before retry`);results.push({key:op.key,status:'applied'});
 }return {ok:true,planDigest:planDigest(plan),authorizationSource:authorization.source,results};
}
main(import.meta.url,async args=>{const o=argumentsOf(args);if(!o.plan)throw Error('require --plan reviewed-plan.json');const plan=readJson(o.plan);const authorization={reviewedDigest:o.digest,source:o.source,scopes:typeof o.scopes==='string'?o.scopes.split(','):[]};
 // An agent-written file is never an authorization token. The host must supply this for the reviewed call only.
 if(process.env.STOVO_GITHUB_APPROVED_PLAN_DIGEST!==authorization.reviewedDigest)throw Error('host approval boundary missing: obtain actual human authorization and supply the exact digest for this invocation');
 return applyPlan(plan,{transport:new GhTransport(plan.repository),authorization});});
