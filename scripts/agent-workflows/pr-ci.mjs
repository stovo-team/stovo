import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { main, argumentsOf } from './common.mjs';

export function classifyChecks(pr, required = []) {
  const result = { head:pr?.headRefOid, passed:[], failed:[], pending:[], skipped:[], ignored:[] };
  const checks = Array.isArray(pr?.statusCheckRollup) ? pr.statusCheckRollup : [];
  for (const check of checks) {
    const name = check.name ?? check.context ?? 'unknown check';
    const item = {name, workflow:check.workflowName ?? '', url:check.detailsUrl ?? check.targetUrl};
    if (/^codeql$/i.test(item.workflow) || /^codeql\b/i.test(name)) { result.ignored.push(item); continue; }
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

const requiredChecks = ['PR size','Pipeline Contract','Agent workflow gate'];
const execute = (tool,args) => execFileSync(tool,args,{encoding:'utf8',timeout:60000});
export async function deliverPr({repo,branch,title,bodyFile,base='master',run=execute,onPublished=()=>{},...watchOptions}) {
  const actual=JSON.parse(run('gh',['repo','view','--json','nameWithOwner'])).nameWithOwner;
  if (repo !== actual) throw Error(`Target repository is ${actual}, not ${repo}`);
  const current=run('git',['branch','--show-current']).trim();
  if (!branch || branch !== current || !/^(feature|hotfix|release|left-try)\//.test(branch)) throw Error('Publish the current dedicated task branch');
  if (!/^(Feature|Fix|CritFix|Test|Docs): /.test(title ?? '') || !bodyFile) throw Error('PR title and body file required');
  const count=run('git',['diff','--numstat',`origin/${base}...HEAD`]).trim().split('\n').filter(Boolean).reduce((sum,line)=>sum+line.split('\t').slice(0,2).reduce((n,v)=>n+(v==='-'?0:Number(v)),0),0);
  if (!Number.isSafeInteger(count) || count>445) throw Error(`Split the ${count}-line PR before publishing (limit 445)`);
  run('git',['push','--set-upstream','origin',branch]);
  const existing=JSON.parse(run('gh',['pr','list','--repo',repo,'--head',branch,'--state','open','--json','url,isCrossRepository']));
  let url=existing.find(pr=>pr.isCrossRepository===false)?.url;
  if (url) run('gh',['pr','edit',url,'--repo',repo,'--base',base,'--title',title,'--body-file',bodyFile]);
  else url=run('gh',['pr','create','--repo',repo,'--base',base,'--head',branch,'--title',title,'--body-file',bodyFile]).trim();
  if (!/^https:\/\/github\.com\//.test(url)) throw Error('Missing usable PR URL');
  onPublished(url);
  const read=()=>JSON.parse(run('gh',['pr','view',url,'--repo',repo,'--json','headRefOid,statusCheckRollup']));
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
  const read = () => JSON.parse(execFileSync('gh', ['pr','view',String(o.pr),'--repo',String(o.repo),'--json','headRefOid,statusCheckRollup'], {encoding:'utf8',timeout:30000}));
  const required=requiredChecks;
  const result = o.once ? classifyChecks(read(),required) : await watchPr({read,required,timeout:seconds*1000,interval:interval*1000,onUpdate:r=>console.error(JSON.stringify(r))});
  return {...result,ok:result.state === 'passed'};
});
