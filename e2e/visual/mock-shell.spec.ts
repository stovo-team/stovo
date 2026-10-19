import {test,expect,ready} from './fixtures';
test('mock shell renders the actual chat and produces success evidence',async({page},testInfo)=>{
 await page.goto('/app/chats/chat-planning-team');await ready(page);
 await expect(page.locator('#msg-planning-kickoff .message-body')).toBeVisible();
 const file=testInfo.outputPath('mock-shell.png');await page.screenshot({path:file,animations:'disabled'});
 await testInfo.attach('mock-shell',{path:file,contentType:'image/png'});
});
