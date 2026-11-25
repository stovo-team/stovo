import {writeFileSync} from 'node:fs';import {main,argumentsOf,readJson,nonempty} from './common.mjs';
const clean=value=>String(value??'').replace(/[<>]/g,'').replace(/\r/g,'');
export function renderPr(p){
 if(!nonempty(p?.problem)||!nonempty(p?.behavior)||!Array.isArray(p.checks)||!Array.isArray(p.manualReview)||!p.manualReview.length)throw Error('PR packet requires problem, behavior, check results and manual review');
 const lines=[
  '> [!NOTE]',
  '> ### ⚡ 5-Second Quick Glance',
  `> - 🔴 **Problem / Trigger:** ${clean(p.quickGlance?.problem??p.problem)}`,
  `> - 🟢 **Fix / Change:** ${clean(p.quickGlance?.fix??p.behavior)}`,
  `> - 🛡️ **Scope & Impact:** ${clean(p.quickGlance?.impact??(p.risks?.[0]??'Low risk; see details below.'))}`,
  ''
 ];
 if(Array.isArray(p.scopeMatrix)&&p.scopeMatrix.length){
  lines.push('| Area / Component | Change Summary | Production Risk |','| :--- | :--- | :---: |',...p.scopeMatrix.map(m=>`| ${clean(m.area)} | ${clean(m.change)} | ${clean(m.risk??'🟢 Low')} |`),'');
 }
 lines.push('## Problem and behavior','',clean(p.problem),'',clean(p.behavior));
 if(p.contractUrl)lines.push('',`Contract: ${clean(p.contractUrl)}`);
 if(p.issueUrl)lines.push('',`Related issue: ${clean(p.issueUrl)}`);
 if(p.scope?.length)lines.push('','## Scope','',...p.scope.map(s=>'- '+clean(s)));
 if(p.diagram)lines.push('','## Architecture and Call Trace','','```mermaid',clean(p.diagram),'```');
 lines.push('','## Evidence','',...p.checks.map(c=>`- **${clean(c.id)}:** ${clean(c.result)} — \`${clean(c.command?.join(' ')).replace(/`/g,'')}\``));
 for(const s of p.visualEvidence??[]){if(!/^https:\/\//.test(s.url??''))throw Error('Remote PR evidence needs a usable HTTPS artifact URL; local capture is still pending publication');lines.push('',`![${clean(s.caption)}](${encodeURI(s.url)})`,`*${clean(s.caption)} — ${clean(s.viewport)}*`);}
 lines.push('','## Risks and limitations','',...(p.risks?.length?p.risks:['No additional known limitations.']).map(s=>'- '+clean(s)),'','## Manual review','',...p.manualReview.map((s,i)=>`${i+1}. ${clean(s)}`));return lines.join('\n')+'\n';
}
main(import.meta.url,args=>{const o=argumentsOf(args);const body=renderPr(readJson(o.packet??o._[0]));if(o.output)writeFileSync(o.output,body);else {process.stdout.write(body);return;}return {ok:true,output:o.output};});
