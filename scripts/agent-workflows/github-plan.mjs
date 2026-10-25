import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {main,argumentsOf,readJson,sha256,object,nonempty,digest} from './common.mjs';
export const scopes={'issue.create':'issues','milestone.create':'issues','project.create':'projects','project.statuses':'projects','rules.upsert':'administration'};
export const planDigest=plan=>sha256(JSON.stringify(plan));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const marker=key=>`<!-- stovo-workflow:${key} -->`;
export function remoteValue(snapshot,op){
 if(op.kind==='issue.create'){const i=snapshot.issues.find(i=>i.body?.includes(marker(op.key))||i.title===op.after.title);return i?{title:i.title,body:i.body}:null;}
 if(op.kind==='milestone.create')return snapshot.milestones.find(m=>m.title===op.after.title)?op.after:null;
 if(op.kind==='project.create')return snapshot.projects.find(p=>p.title===op.after.title)?op.after:null;
 if(op.kind==='project.statuses'){const p=snapshot.projects.find(p=>p.id===op.before.projectId),f=p?.fields.find(f=>f.id===op.before.fieldId);return f?{projectId:p.id,fieldId:f.id,options:f.options}:null;}
 if(op.kind==='rules.upsert')return snapshot.rules.find(r=>r.name===op.after.name)??null;
 throw Error('unsupported operation');
}
export function validatePlan(p){
 const errors=[];if(!object(p)||p.schemaVersion!==1||!/^[-\w.]+\/[-\w.]+$/.test(p.repository??'')||!digest(p.discoveryDigest)||!Array.isArray(p.operations))return {ok:false,errors:['invalid version-1 GitHub plan']};
 const keys=new Set();for(const op of p.operations){if(!object(op)||!scopes[op.kind]||op.scope!==scopes[op.kind]||!nonempty(op.key)||keys.has(op.key)||!object(op.after)||!('before'in op)){errors.push('invalid or duplicate operation');continue;}keys.add(op.key);
 if(!/^[a-zA-Z0-9._:-]+$/.test(op.key))errors.push('invalid stable operation identity');
 if(op.kind==='issue.create'&&(!nonempty(op.after.title)||!nonempty(op.after.body)||!op.after.body.includes(marker(op.key))||op.before!==null))errors.push('invalid issue operation');
 if((op.kind==='project.create'||op.kind==='milestone.create')&&(!nonempty(op.after.title)||op.before!==null))errors.push('invalid creation operation');
 if(op.kind==='project.statuses'&&(!object(op.before)||!nonempty(op.before.projectId)||!nonempty(op.before.fieldId)||!Array.isArray(op.after.options)||!same({...op.after,options:op.before.options},op.before)))errors.push('invalid Project options operation');
 if(op.kind==='rules.upsert'&&(!nonempty(op.after.name)||op.after.target!=='branch'||op.after.enforcement!=='active'||!Array.isArray(op.after.rules)))errors.push('invalid rules operation');
 }return {ok:errors.length===0,errors};
}
export function createPlan(snapshot,desired){
 const operations=[],followUps=[];function add(kind,key,before,after,access){if(!snapshot.access?.[access])throw Error(`missing access for ${access}; inspect permissions before planning mutations`);operations.push({kind,key,scope:scopes[kind],before,after});}
 for(const issue of desired.issues??[]){if(snapshot.issues.some(i=>i.title===issue.title||i.body?.includes(marker(issue.key))))continue;add('issue.create',issue.key,null,{title:issue.title,body:`${issue.body}\n\n${marker(issue.key)}`},'issues');}
 for(const milestone of desired.milestones??[]){if(!snapshot.milestones.some(m=>m.title===milestone.title))add('milestone.create',`milestone:${milestone.title}`,null,{title:milestone.title},'milestones');}
 if(desired.project){const project=snapshot.projects.find(p=>p.title===desired.project.title);if(!project){add('project.create','project:create',null,{title:desired.project.title},'projects');followUps.push({kind:'project.statuses',title:desired.project.title,statuses:desired.project.statuses,reason:'After authorized creation, regenerate discovery and review the concrete field IDs before configuring statuses.'});}
 else {const field=project.fields.find(f=>f.name==='Status');if(!field)throw Error('Project has no Status field; inspect it before proposing changes');const options=[...field.options];for(const name of desired.project.statuses)if(!options.some(o=>o.name===name))options.push({name});if(!same(options,field.options)){const before={projectId:project.id,fieldId:field.id,options:field.options};add('project.statuses','project:statuses',before,{...before,options},'projects');}}
 }
 if(desired.rules){const r=desired.rules;const existing=snapshot.rules.find(x=>x.name===r.name)??null;
 const oldPR=existing?.rules.find(x=>x.type==='pull_request')?.parameters??{},oldChecks=existing?.rules.find(x=>x.type==='required_status_checks')?.parameters??{};
 const checks=[...(oldChecks.required_status_checks??[])];if(!checks.some(x=>x.context===r.requiredCheck))checks.push({context:r.requiredCheck});
 const after={...(existing??{}),name:r.name,target:'branch',enforcement:'active',conditions:existing?.conditions??{ref_name:{include:['~DEFAULT_BRANCH'],exclude:[]}},rules:[...(existing?.rules??[]).filter(x=>!['pull_request','required_status_checks'].includes(x.type)),{type:'pull_request',parameters:{...oldPR,required_approving_review_count:Math.max(oldPR.required_approving_review_count??0,r.requiredReviews),dismiss_stale_reviews_on_push:true,require_code_owner_review:oldPR.require_code_owner_review??false,require_last_push_approval:true,required_review_thread_resolution:true,allowed_merge_methods:oldPR.allowed_merge_methods??['merge','squash','rebase']}},{type:'required_status_checks',parameters:{...oldChecks,strict_required_status_checks_policy:true,do_not_enforce_on_create:false,required_status_checks:checks}}]};if(!same(existing,after))add('rules.upsert','rules:agent-workflow',existing,after,'rules');}
 const plan={schemaVersion:1,repository:snapshot.repository,discoveryDigest:sha256(JSON.stringify(snapshot)),operations,followUps,limitations:snapshot.limitations??[]};const valid=validatePlan(plan);if(!valid.ok)throw Error(valid.errors.join('; '));return plan;
}
export class GhTransport {
 constructor(repository,run=execFileSync){if(!/^[-\w.]+\/[-\w.]+$/.test(repository??''))throw Error('invalid repository');this.repository=repository;this.run=run;}
 gh(args,input){return JSON.parse(this.run('gh',args,{encoding:'utf8',timeout:45000,...(input?{input:JSON.stringify(input)}:{})}));}
 api(endpoint,method='GET',input){return this.gh(['api',endpoint,'--method',method,...(input?['--input','-']:[])],input);}
 pages(endpoint){const rows=[];for(let page=1;page<=1000;page++){const batch=this.api(`${endpoint}${endpoint.includes('?')?'&':'?'}per_page=100&page=${page}`);if(!Array.isArray(batch))throw Error('invalid paginated response');rows.push(...batch);if(batch.length<100)return rows;}throw Error('inventory pagination limit reached');}
 snapshot(){const repo=this.repository,owner=repo.split('/')[0],s={repository:repo,issues:[],milestones:[],projects:[],rules:[],access:{},limitations:[]};
 const load=(key,fn)=>{try{s[key]=fn();s.access[key]=true;}catch(e){s.access[key]=false;s.limitations.push(`${key}: discovery unavailable (${e.status??'access or network'}); no mutation can be planned safely`);}};
 load('issues',()=>this.pages(`repos/${repo}/issues?state=all`).filter(i=>!i.pull_request).map(i=>({number:i.number,title:i.title,body:i.body??'',state:i.state,url:i.html_url})));
 load('milestones',()=>this.pages(`repos/${repo}/milestones?state=all`).map(m=>({number:m.number,title:m.title,state:m.state})));
 load('projects',()=>{const result=this.gh(['project','list','--owner',owner,'--format','json','--limit','1000']);if(result.projects.length>=1000)throw Error('Project inventory truncated');return result.projects.map(p=>({id:p.id,number:p.number,title:p.title,url:p.url,fields:this.gh(['project','field-list',String(p.number),'--owner',owner,'--format','json','--limit','1000']).fields}));});
 load('rules',()=>this.pages(`repos/${repo}/rulesets`).filter(r=>r.source===repo||r.source_type==='Repository').map(r=>{const x=this.api(`repos/${repo}/rulesets/${r.id}`);return {id:x.id,name:x.name,target:x.target,enforcement:x.enforcement,conditions:x.conditions,rules:x.rules,...(x.bypass_actors?{bypass_actors:x.bypass_actors}:{})};}));return s;
 }
 mutate(op){const repo=this.repository,owner=repo.split('/')[0];if(op.kind==='issue.create')return this.api(`repos/${repo}/issues`,'POST',op.after);if(op.kind==='milestone.create')return this.api(`repos/${repo}/milestones`,'POST',op.after);if(op.kind==='project.create')return this.gh(['project','create','--owner',owner,'--title',op.after.title,'--format','json']);
 if(op.kind==='project.statuses'){
 // GitHub requires complete option metadata. Resolve it again before writing; preserve every existing option.
 const query='query($id:ID!){node(id:$id){... on ProjectV2SingleSelectField{id options{id name color description}}}}';const field=this.gh(['api','graphql','-f',`query=${query}`,'-f',`id=${op.before.fieldId}`]).data.node;if(!field)throw Error('Status field unavailable');
 const options=op.after.options.map(o=>{const old=field.options.find(x=>x.id===o.id);return old?{id:old.id,name:old.name,color:old.color,description:old.description??''}:{name:o.name,color:'GRAY',description:''};});
 const mutation='mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id}}}}';return this.gh(['api','graphql','--input','-'],{query:mutation,variables:{input:{fieldId:op.before.fieldId,singleSelectOptions:options}}});
 }
 if(op.kind==='rules.upsert'){const {id,...body}=op.after;return this.api(`repos/${repo}/rulesets${id?`/${id}`:''}`,id?'PUT':'POST',body);}throw Error('unsupported mutation');
 }
}
main(import.meta.url,args=>{const o=argumentsOf(args);if(!o.repo||!o.desired||!o.output)throw Error('require --repo owner/repository --desired desired.json --output plan.json');const snapshot=new GhTransport(o.repo).snapshot();writeFileSync(`${o.output}.inventory.json`,JSON.stringify(snapshot,null,2)+'\n');const plan=createPlan(snapshot,readJson(o.desired));writeFileSync(o.output,JSON.stringify(plan,null,2)+'\n');return {ok:true,digest:planDigest(plan),plan:o.output,operations:plan.operations.length,limitations:plan.limitations};});
