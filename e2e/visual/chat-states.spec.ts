import {test,expect} from './fixtures';import {shellScenarios,prepareVisualScenario,screenshot,type Scenario} from './scenarios';
for(const s of shellScenarios)test(s.id+' loaded shell '+s.theme+' '+s.locale,async({page},info)=>{await prepareVisualScenario(page,s);await expect(page.locator('#msg-planning-kickoff .message-body')).toBeVisible();await expect(page.locator('.message-composer textarea')).toBeVisible();if(s.viewport.width<600)await expect(page.locator('.mobile-back-button')).toBeVisible();else await expect(page.locator('.app-nav')).toBeVisible();await screenshot(page,info,s);});
for(const s of [
 {id:'V-09',viewport:{width:1440,height:900},theme:'light',locale:'en',state:'empty'},
 {id:'V-10',viewport:{width:390,height:844},theme:'dark',locale:'ru',state:'loading'},
 {id:'V-11',viewport:{width:1440,height:900},theme:'dark',locale:'en',state:'history-error'},
] satisfies Scenario[])test(s.id+' '+s.state,async({page},info)=>{
 await prepareVisualScenario(page,s);
 if(s.state==='empty')await expect(page.locator('.phase-empty-state').filter({has:page.locator('strong')})).toBeVisible();
 if(s.state==='loading')await expect(page.locator('.skeleton-message-list')).toBeVisible();
 if(s.state==='history-error')await expect(page.getByRole('alert')).toContainText('Synthetic history error');
 await screenshot(page,info,s);
 if(s.state==='history-error'){await page.evaluate(()=>fetch('/api/dev/visual/recover',{method:'POST'}));await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('#msg-planning-kickoff .message-body')).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);}
});
