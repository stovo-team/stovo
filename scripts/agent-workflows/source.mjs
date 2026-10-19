import {spawnSync} from 'node:child_process';
import {lstatSync,readlinkSync} from 'node:fs';
import path from 'node:path';
import {hashFile,sha256} from './common.mjs';
export function sourceSnapshot(root){
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout;};
 const revision=git('rev-parse','HEAD').trim(),diff=git('diff','HEAD','--binary');
 const other=git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean).sort().map(p=>{const file=path.join(root,p);return [p,lstatSync(file).isSymbolicLink()?sha256('symlink:'+readlinkSync(file)):hashFile(file)];});
 const dirty=!!diff||other.length>0;return {sourceRevision:revision,dirty,...dirty?{patchDigest:sha256(JSON.stringify({diff,other}))}:{}};
}

export function changedSourcePaths(root,baseRevision){
 if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(baseRevision??''))throw Error('verified base revision required');
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.split('\0').filter(Boolean);};
 return [...new Set([...git('diff',baseRevision,'--name-only','-z'),...git('ls-files','--others','--exclude-standard','-z')])].sort();
}

export function deliveryBase(root,target='origin/master'){
 if(typeof target!=='string'||target.startsWith('-'))throw Error('invalid target ref');
 const r=spawnSync('git',['merge-base','HEAD',target],{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error('Cannot determine delivery base; provide an available trusted --target ref');return r.stdout.trim();
}
