import {test,expect} from './fixtures';
import {prepareVisualScenario,screenshot} from './scenarios';

test('chat details photo button is a perfect circle',async({page},info)=>{
 const scenario={id:'V-DETAILS-PHOTO',viewport:{width:1440,height:900},theme:'dark' as const,locale:'en' as const};
 await prepareVisualScenario(page,scenario);
 await page.locator('.chat-title-group').click();
 const button=page.getByRole('button',{name:'Change chat photo'});
 await expect(button).toBeVisible();
 await expect.poll(()=>button.evaluate((element)=>{
  const rect=element.getBoundingClientRect();
  const style=getComputedStyle(element);
  return {width:rect.width,height:rect.height,radius:style.borderRadius,minHeight:style.minHeight,padding:style.padding};
 })).toEqual({width:28,height:28,radius:'50%',minHeight:'0px',padding:'0px'});
 await screenshot(page,info,scenario);
});
