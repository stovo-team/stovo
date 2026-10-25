import { readdirSync,realpathSync,lstatSync,existsSync,readFileSync,writeFileSync,mkdirSync,symlinkSync,readlinkSync,cpSync,rmSync } from 'node:fs';
import path from 'node:path';
import { hashFile, main, argumentsOf } from './common.mjs';
function present(p){try{return lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export function installSkills({sourceRoot,targetRoot,mode='link',dryRun=false}) {
  if(!['link','copy'].includes(mode))throw Error('mode must be link or copy');
  const source=realpathSync(sourceRoot),target=path.resolve(targetRoot), installed=[],unchanged=[],collisions=[],operations=[];
  for(let p=target;;p=path.dirname(p)){if(present(p)?.isSymbolicLink())throw Error('target ancestry must not contain symlinks');if(p===path.dirname(p))break;}
  for(const name of readdirSync(source).filter(n=>n.startsWith('stovo-')).sort()) {
    const from=realpathSync(path.join(source,name)),to=path.join(target,name),stat=present(to);
    if(!from.startsWith(source+path.sep)||!existsSync(path.join(from,'SKILL.md')))throw Error(`invalid or escaping skill source: ${name}`);
    if(source===target){unchanged.push(name);continue;}
    if(stat?.isSymbolicLink()) {
      if(mode==='link' && path.resolve(path.dirname(to),readlinkSync(to))===from){unchanged.push(name);continue;}
      collisions.push(name);continue;
    }
    if(stat) {
      const owner=path.join(to,'.stovo-skill.json');
      let previous;try{previous=JSON.parse(readFileSync(owner,'utf8'));}catch{}
      if(mode!=='copy'||!previous||previous.source!==from){collisions.push(name);continue;}
      const files=readdirSync(to).sort();
      if(files.some(n=>n!=='.stovo-skill.json'&&!Object.hasOwn(previous.hashes,n))||Object.entries(previous.hashes).some(([file,hash])=>!existsSync(path.join(to,file))||lstatSync(path.join(to,file)).isSymbolicLink()||hashFile(path.join(to,file))!==hash)){collisions.push(name);continue;}
      if(Object.entries(previous.hashes).every(([file,hash])=>existsSync(path.join(from,file))&&hashFile(path.join(from,file))===hash)&&readdirSync(from).length===Object.keys(previous.hashes).length){unchanged.push(name);continue;}
    }
    const files=readdirSync(from);for(const file of files)if(!lstatSync(path.join(from,file)).isFile())throw Error(`skill copy sources must be flat regular files: ${name}/${file}`);
    operations.push({name,from,to,files,replace:!!stat});
  }
  if(collisions.length)return {ok:false,installed,unchanged,collisions};
  if(!dryRun)for(const op of operations){mkdirSync(target,{recursive:true});if(op.replace)rmSync(op.to,{recursive:true});if(mode==='link')symlinkSync(path.relative(path.dirname(op.to),op.from),op.to,'dir');else{cpSync(op.from,op.to,{recursive:true});writeFileSync(path.join(op.to,'.stovo-skill.json'),JSON.stringify({source:op.from,hashes:Object.fromEntries(op.files.map(f=>[f,hashFile(path.join(op.from,f))]))}));}}
  installed.push(...operations.map(o=>o.name));return {ok:true,dryRun,installed,unchanged,collisions};
}
main(import.meta.url,args=>{const o=argumentsOf(args);return installSkills({sourceRoot:o.source??path.resolve('.agents/skills'),targetRoot:o.target??path.resolve('.agents/skills'),mode:o.mode??'link',dryRun:!!o['dry-run']});});
