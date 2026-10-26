import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export function visualApplicable(paths){
 if(!Array.isArray(paths)||!paths.every(p=>typeof p==='string'&&p&&!p.startsWith('/')&&!p.split(/[\\/]/).includes('..')))throw Error('invalid changed paths');
 return paths.some(p=>/^(frontend\/|e2e\/|scripts\/agent-workflows\/(?:common|source)\.mjs$)/.test(p));
}

export function aggregate(needs, disabled=false){
 if(disabled)return {ok:true,disabled:true,status:'temporarily disabled',scope:'workflow-tools-and-synthetic-ui',errors:[]};
 const errors=[];
 if(needs?.changes?.result!=='success')errors.push('change discovery failed or missing');
 if(needs?.validators?.result!=='success')errors.push('required validators failed or missing');
 const visual=needs?.changes?.outputs?.visual;
 if(!['true','false'].includes(visual))errors.push('visual applicability missing');
 if(visual==='true'&&needs?.visual?.result!=='success')errors.push('required visual evidence failed or missing');
 if(visual==='false'&&!['success','skipped'].includes(needs?.visual?.result))errors.push('unexpected visual job outcome');
 return {ok:errors.length===0,visualRequired:visual==='true',scope:'workflow-tools-and-synthetic-ui',limitations:['Does not certify backend acceptance, independent code review, other required PR checks or production rollout.'],errors};
}

async function selectChanges(base,head){
 let mergeBase;
 try{
  mergeBase=execFileSync('git',['merge-base',base,head],{encoding:'utf8'}).trim();
 }catch{
  const {GITHUB_TOKEN,GITHUB_REPOSITORY}=process.env;
  if(!GITHUB_TOKEN||!GITHUB_REPOSITORY)throw Error('common ancestor is unavailable from shallow history and GitHub credentials are missing');
  const response=await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/compare/${base}...${head}`,{headers:{Authorization:`Bearer ${GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw Error(`GitHub compare API failed with ${response.status}`);
  const comparison=await response.json();
  mergeBase=comparison.merge_base_commit?.sha;
  if(!/^[a-f0-9]{40}$/.test(mergeBase??''))throw Error('GitHub compare API did not return a merge base');
  try{
   execFileSync('git',['cat-file','-e',`${mergeBase}^{commit}`],{stdio:'ignore'});
  }catch{
   execFileSync('git',['fetch','--no-tags','--depth=1','origin',mergeBase],{stdio:'inherit'});
  }
 }
 const paths=execFileSync('git',['diff','--no-renames','--name-only','-z',mergeBase,head],{encoding:'utf8'}).split('\0').filter(Boolean);
 return {paths,mergeBase};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv[2]==='select'){
  const {BASE_SHA,HEAD_SHA,GITHUB_OUTPUT}=process.env;
  if(![BASE_SHA,HEAD_SHA].every(s=>/^[a-f0-9]{40}$/.test(s??''))||!GITHUB_OUTPUT){console.error('exact base/head SHAs and GITHUB_OUTPUT are required');process.exitCode=1;}
  else selectChanges(BASE_SHA,HEAD_SHA).then(({paths,mergeBase})=>{
   const visual=visualApplicable(paths);
   appendFileSync(GITHUB_OUTPUT,`visual=${visual}\n`);
   console.log(JSON.stringify({baseRevision:BASE_SHA,sourceRevision:HEAD_SHA,mergeBaseRevision:mergeBase,visualRequired:visual,changedPaths:paths}));
  }).catch(e=>{console.error(e.message);process.exitCode=1;});
 }else if(process.argv[2]==='aggregate'){
  try{
   const disabled=process.env.WORKFLOW_DISABLED==='true';
   const result=aggregate(JSON.parse(process.env.JOB_RESULTS??'null'),disabled);
   console.log(JSON.stringify(result,null,2));
   if(disabled&&process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'Agent workflow evidence is temporarily disabled.\n');
   if(!result.ok)process.exitCode=1;
  }catch(e){console.error(e.message);process.exitCode=1;}
 }else{console.error('require select or aggregate');process.exitCode=1;}
}
