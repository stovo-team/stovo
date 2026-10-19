import {expect,ready} from './fixtures';
import path from 'node:path';
// @ts-expect-error: shared maintained Node helper.
import {verifyReferences} from '../tools/references.mjs';import type {Page,TestInfo} from '@playwright/test';
export type Scenario={id:string;viewport:{width:number;height:number};theme:'light'|'dark';locale:'en'|'ru';state?:string};
export const shellScenarios:Scenario[]=[];
for(const [width,height] of [[1440,900],[390,844]])for(const theme of ['light','dark'] as const)for(const locale of ['en','ru'] as const)shellScenarios.push({id:`V-${String(shellScenarios.length+1).padStart(2,'0')}`,viewport:{width,height},theme,locale});
export async function prepareVisualScenario(page:Page,s:Scenario,route='/app/chats/chat-planning-team'){
 await page.setViewportSize(s.viewport);await page.emulateMedia({colorScheme:s.theme});
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('familyMessenger.appearance',JSON.stringify({themeMode:theme}));localStorage.setItem('familyMessenger.devicePreferences',JSON.stringify({language:locale}));},{theme:s.theme,locale:s.locale});
 await page.goto(route+(s.state?`?mockScenario=${s.state}`:''));await ready(page);
}
export async function screenshot(page:Page,info:TestInfo,s:Scenario){
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const file=info.outputPath(s.id+'.png');await page.screenshot({path:file,animations:'disabled'});
 await info.attach(s.id,{path:file,contentType:'image/png'});
 if(process.env.STOVO_VISUAL_COMPARE==='true'){
  verifyReferences({requiredFiles:[s.id+'.png'],directory:path.resolve('visual/__screenshots__',process.platform),environment:{platform:process.platform,browserVersion:page.context().browser()?.version(),timezone:'UTC'}});
  await expect(page).toHaveScreenshot(s.id+'.png',{animations:'disabled',maxDiffPixels:0});
 }
 info.annotations.push({type:'scenario',description:JSON.stringify({...s,timezone:'UTC'})});
}
