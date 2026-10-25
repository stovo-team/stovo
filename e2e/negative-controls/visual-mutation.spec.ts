import {test,expect} from '../visual/fixtures';import {prepareVisualScenario,shellScenarios} from '../visual/scenarios';
// An opt-in expected-failure probe, excluded from the normal visual test directory.
test('a deliberate clipped composer is rejected by the accepted pixel reference',async({page})=>{
 await prepareVisualScenario(page,shellScenarios[0]);await expect(page.locator('#msg-planning-kickoff .message-body')).toBeVisible();
 await page.addStyleTag({content:'.message-composer{visibility:hidden!important}'});
 await expect(page).toHaveScreenshot('V-01.png',{animations:'disabled',maxDiffPixels:0});
});
