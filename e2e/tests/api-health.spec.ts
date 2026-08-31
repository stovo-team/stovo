import { test, expect } from '@playwright/test';

test.describe('API & Service Health Checks', () => {
  test('frontend web page loads successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response?.status()).toBeLessThan(400);

    // Verify HTML root element exists
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });

  test('backend health endpoint returns status OK', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('database health endpoint is reachable', async ({ request }) => {
    const response = await request.get('/api/health/db');
    expect(response.status()).toBe(200);
  });
});
