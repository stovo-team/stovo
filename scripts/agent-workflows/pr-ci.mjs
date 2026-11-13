import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { main, argumentsOf } from './common.mjs';

export function classifyChecks(pr, required = []) {
  const result = { head:pr?.headRefOid, passed:[], failed:[], pending:[], skipped:[], ignored:[] };
  const checks = Array.isArray(pr?.statusCheckRollup) ? pr.statusCheckRollup : [];
  for (const check of checks) {
    const name = check.name ?? check.context ?? 'unknown check';
    const item = {name, workflow:check.workflowName ?? '', url:check.detailsUrl ?? check.targetUrl};
    if (/^codeql$/i.test(item.workflow) || (!item.workflow && /^codeql(?:\s*\/|$)/i.test(name))) { result.ignored.push(item); continue; }
    if (check.context !== undefined) {
      (check.state === 'SUCCESS' ? result.passed : ['ERROR','FAILURE'].includes(check.state) ? result.failed : result.pending).push(item);
    } else if (check.status !== 'COMPLETED') result.pending.push(item);
    else if (check.conclusion === 'SUCCESS') result.passed.push(item);
    else if (check.conclusion === 'SKIPPED') result.skipped.push(item);
    else if (['FAILURE','CANCELLED','TIMED_OUT','ACTION_REQUIRED','NEUTRAL','STALE','STARTUP_FAILURE'].includes(check.conclusion)) result.failed.push(item);
    else result.pending.push(item);
  }
  for (const name of required) if (!result.passed.some(check => check.name === name)) result.pending.push({name, reason:'required success missing'});
  result.state = result.failed.length ? 'failed' : result.pending.length || !result.passed.length || !result.head ? 'pending' : 'passed';
  return result;
}

export async function watchPr({read, required=[], sleep=delay, interval=15000, timeout=2700000, now=Date.now, onUpdate=()=>{}}) {
  const started = now(); let settled = '', previous = '';
  for (;;) {
    const result = classifyChecks(await read(), required), snapshot = JSON.stringify(result);
    if (snapshot !== previous) { onUpdate(result); previous = snapshot; }
    if (result.state === 'failed') return result;
    if (result.state === 'passed' && settled === snapshot) return result;
    settled = result.state === 'passed' ? snapshot : '';
    if (now() - started >= timeout) return {...result, state:'pending', reason:'timeout'};
    await sleep(interval);
  }
}

const requiredChecks = ['Pipeline Contract','Agent workflow gate'];
const execute = (tool,args) => execFileSync(tool,args,{encoding:'utf8',timeout:60000});
export function isTaskBranch(branch) {
  return /^(feature|hotfix|release|left-try)\//.test(branch) || /^ao\/[^/]+\/[^/]+$/.test(branch);
}
function readPrChecks(repo, pr, run=execute) {
  const result=JSON.parse(run('gh',['pr','view',String(pr),'--repo',repo,'--json','headRefOid,statusCheckRollup'])), seen=new Set();
  for(const w of JSON.parse(run('gh',['run','list','--repo',repo,'--commit',result.headRefOid,'--limit','100','--json','workflowName,conclusion,url']))) { if(seen.has(w.workflowName))continue;seen.add(w.workflowName);if(w.conclusion==='startup_failure')(result.statusCheckRollup??=[]).push({name:`Workflow: ${w.workflowName}`,workflowName:w.workflowName,status:'COMPLETED',conclusion:'STARTUP_FAILURE',detailsUrl:w.url}); }
  return result;
}
export async function deliverPr({repo,branch,title,bodyFile,base='master',run=execute,onPublished=()=>{},...watchOptions}) {
  const actual=JSON.parse(run('gh',['repo','view','--json','nameWithOwner'])).nameWithOwner;
  if (repo !== actual) throw Error(`Target repository is ${actual}, not ${repo}`);
  const current=run('git',['branch','--show-current']).trim();
  if (!branch || branch !== current || !isTaskBranch(branch)) throw Error('Publish the current dedicated task branch');
  if (!/^(Feature|Fix|CritFix|Test|Docs): /.test(title ?? '') || !bodyFile) throw Error('PR title and body file required');
  run('git',['push','--set-upstream','origin',branch]);
  const existing=JSON.parse(run('gh',['pr','list','--repo',repo,'--head',branch,'--state','open','--json','url,isCrossRepository']));
  let url=existing.find(pr=>pr.isCrossRepository===false)?.url;
  if (url) run('gh',['api',`repos/${repo}/pulls/${url.split('/').pop()}`,'--method','PATCH','-f',`base=${base}`,'-f',`title=${title}`,'-F',`body=@${bodyFile}`]);
  else url=run('gh',['pr','create','--repo',repo,'--base',base,'--head',branch,'--title',title,'--body-file',bodyFile]).trim();
  if (!/^https:\/\/github\.com\//.test(url)) throw Error('Missing usable PR URL');
  onPublished(url);
  const read=()=>readPrChecks(repo,url,run);
  return {url,...await watchPr({...watchOptions,read,required:requiredChecks})};
}

main(import.meta.url, async args => {
  const o=argumentsOf(args);
  if ((!o.pr && !o.publish) || !o.repo) throw Error('Use --repo owner/repo --pr number-or-URL; run this gh-backed command outside the sandbox.');
  const seconds = Number(o['timeout-seconds'] ?? 2700), interval = Number(o['interval-seconds'] ?? 15);
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(interval) || interval < 1) throw Error('Invalid timeout or interval');
  if (o.publish) {
    const result=await deliverPr({repo:o.repo,branch:o.branch,base:o.base??'master',title:o.title,bodyFile:o['body-file'],timeout:seconds*1000,interval:interval*1000,onPublished:url=>console.error(`PR: ${url}`),onUpdate:r=>console.error(JSON.stringify(r))});
    return {...result,ok:result.state==='passed'};
  }
  const read = () => readPrChecks(String(o.repo),o.pr);
  const required=requiredChecks;
  const result = o.once ? classifyChecks(read(),required) : await watchPr({read,required,timeout:seconds*1000,interval:interval*1000,onUpdate:r=>console.error(JSON.stringify(r))});
  return {...result,ok:result.state === 'passed'};
});
