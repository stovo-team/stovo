import {defineConfig} from '@playwright/test';
import visual from './playwright.visual.config';
export default defineConfig({...visual,testDir:'./tests',testMatch:'local-mock-mode.spec.ts',outputDir:'../artifacts/agent-workflows/mock-regression/test-results',reporter:[['list'],['json',{outputFile:'../artifacts/agent-workflows/mock-regression/report.json'}]]});
