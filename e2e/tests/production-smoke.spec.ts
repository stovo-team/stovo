import { test, expect } from '@playwright/test';

// These tests deliberately do not log in, submit forms, or create data. They
// verify that the public production deployment is reachable after a rollout.
test.describe('Production smoke checks', () => {
  test('serves the application shell', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('#root')).toBeAttached();
  });

  test('reports a healthy API', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });
});
