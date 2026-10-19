import {test as base,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
export const test=base.extend<{networkGuard:void}>({
 networkGuard:[async({page,baseURL},use)=>{
  const violations:string[]=[],errors:string[]=[];
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===baseURL){
    if(url.pathname.startsWith('/__visual-assets/')){const name=url.pathname.slice('/__visual-assets/'.length);if(!['material-symbols.css','material-symbols.ttf'].includes(name))throw Error('unknown visual asset');return route.fulfill({body:readFileSync(path.resolve('visual/assets',name)),contentType:name.endsWith('.css')?'text/css':'font/ttf'});}
    if(route.request().isNavigationRequest()){const response=await route.fetch();const html=await response.text();return route.fulfill({response,body:html.replace(/https:\/\/fonts\.googleapis\.com\/[^"\s]+/g,'/__visual-assets/material-symbols.css')});}
    return route.continue();
   }
   if(/^(data:|blob:)/.test(url.protocol))return route.continue();
   violations.push(url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  await page.routeWebSocket('**/*',ws=>{const u=new URL(ws.url());if(u.protocol==='ws:'&&u.host==='127.0.0.1:5174'&&u.pathname==='/'){ws.connectToServer();return;}violations.push(u.origin);ws.close();});
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z'));
  await use();expect(violations,'unexpected external request or WebSocket').toEqual([]);expect(errors,'uncaught application errors').toEqual([]);
 },{auto:true}],
});
export {expect};
export async function ready(page:import('@playwright/test').Page){
 await expect(page.locator('.app-nav')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 await page.addStyleTag({content:'*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}'});
}
