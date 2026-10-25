import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {sourceSnapshot} from './source.mjs';
import {main,argumentsOf,localFile,hashFile,nonempty} from './common.mjs';
// The command must consume stdin and print a sanitized observable result.
export function captureBackend({root=process.cwd(),input,output,command,environment,target,runtime,kind}){
 root=realpathSync(root);
 if(!Array.isArray(command)||!command.length||!command.every(nonempty))throw Error('command argument array required');
 if(!['local','stage'].includes(environment)||![target,runtime].every(nonempty)||!['api','persistence','trace','measurement'].includes(kind))throw Error('isolated execution environment and observation kind required');
 if(!nonempty(output)||path.isAbsolute(output)||output.split(/[\\/]/).includes('..'))throw Error('output must be repository-relative');
 const destination=path.resolve(root,output);mkdirSync(path.dirname(destination),{recursive:true});
 const parent=realpathSync(path.dirname(destination));if(parent!==root&&!parent.startsWith(root+path.sep))throw Error('output escapes checkout');
 const ignored=spawnSync('git',['check-ignore','--quiet','--',output],{cwd:root});if(ignored.status!==0)throw Error('output must be Git-ignored so capture does not change source');
 const file=localFile(root,input),inputDigest=hashFile(file),source=sourceSnapshot(root),startedAt=new Date().toISOString();
 const result=spawnSync(command[0],command.slice(1),{cwd:root,input:readFileSync(file),encoding:'utf8',timeout:240000,shell:false});
 if(result.error)throw result.error;
 if(JSON.stringify(source)!==JSON.stringify(sourceSnapshot(root))||hashFile(file)!==inputDigest)throw Error('source or input changed during capture');
 const receipt={schemaVersion:1,...source,inputDigest,startedAt,command,environment,target,runtime,kind,exitCode:result.status,stdout:result.stdout,stderr:result.stderr,actual:(result.stdout||result.stderr).trim()||`exit code ${result.status}`};
 writeFileSync(destination,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 const {stdout,stderr,dirty,...observation}=receipt;
 return {...observation,executionSource:output,artifact:{path:output,sha256:hashFile(destination)}};
}
main(import.meta.url,args=>{const o=argumentsOf(args),observation=captureBackend({root:o.root,input:o.input,output:o.output,command:JSON.parse(o.command),environment:o.environment,target:o.target,runtime:o.runtime,kind:o.kind});return {ok:observation.exitCode===0,observation};});
