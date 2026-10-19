import path from 'node:path';import {readJson,hashFile,nonempty} from './common.mjs';
export async function runCase(input,{input:directory,caseDigest}){
 if(!directory)throw Error('A captured native Desktop run directory is required; no simulated fallback.');
 const file=path.join(directory,'answers.json'),receipt=readJson(path.join(directory,'receipt.json'));
 if(receipt.runtime!=='desktop-native'||!nonempty(receipt.agentId)||!nonempty(receipt.source)||receipt.answersDigest!==hashFile(file))throw Error('Native run receipt missing or output was modified');
 if(receipt.caseDigests?.[input.id]!==caseDigest||receipt.guidanceDigest!==hashFile(path.join(directory,'guidance.md')))throw Error('Native receipt does not bind the supplied case and guidance');
 const output=readJson(file).find(r=>r.id===input.id);if(!output)throw Error('Native run omitted case '+input.id);
 return {output,receipt,runtime:'desktop-native',model:receipt.model??'desktop-inherited; exact identifier unavailable'};
}
