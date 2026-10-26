import {defineConfig} from '@playwright/test';
import path from 'node:path';
// @ts-expect-error: maintained Node helper is JavaScript, shared with the CLI tests.
import {readVisualOptions} from './tools/visual-options.mjs';
const options=readVisualOptions();
export default defineConfig({
 snapshotPathTemplate:'{testDir}/__screenshots__/{platform}/{arg}{ext}',testDir:'./visual',fullyParallel:false,workers:1,retries:0,timeout:30000,
 outputDir:path.join(options.output,'test-results'),
 reporter:[['list'],['json',{outputFile:path.join(options.output,'report.json')}],['html',{outputFolder:path.join(options.output,'html'),open:'never'}]],
 use:{baseURL:options.origin,headless:true,browserName:'chromium',viewport:{width:1440,height:900},timezoneId:'UTC',locale:'en-US',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:`npm --prefix ../frontend run dev:mock -- --port ${options.port} --configLoader runner`,url:options.origin,reuseExistingServer:false,env:{VITE_DISABLE_HMR:'true',STOVO_VITE_CACHE_DIR:path.join(options.output,'vite-cache')},timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}},
});
