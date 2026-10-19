import path from 'node:path';import {readJson,hashFile,localFile,nonempty} from '../../scripts/agent-workflows/common.mjs';
export function verifyReferences({directory,environment}){
 const m=readJson(path.join(directory,'reference-approval.json'));
 if(m.schemaVersion!==1||m.status!=='approved'||!nonempty(m.source)||!Array.isArray(m.files)||m.files.length===0)throw Error('Visual references require a sourced human approval');
 for(const key of ['platform','browserVersion','timezone'])if(m.environment?.[key]!==environment[key])throw Error('Visual reference environment mismatch: '+key);
 for(const file of m.files)if(hashFile(localFile(directory,file.path))!==file.sha256)throw Error('Visual reference digest mismatch: '+file.path);
 return {ok:true,source:m.source};
}
