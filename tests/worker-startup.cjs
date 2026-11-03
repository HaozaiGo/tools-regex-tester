const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const lang of ['en', 'zh']) {
      const context = await browser.newContext();
      let startupDelay = 1600;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'https://regex.toolkitbox.org' || url.pathname.startsWith('/_vercel/')) return route.abort();
        if (url.pathname.endsWith('/regex-worker.js')) await new Promise(resolve => setTimeout(resolve, startupDelay));
        const file = path.join(root, url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
        try { await route.fulfill({ body: await fs.readFile(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); }
        catch { await route.fulfill({ status: 404 }); }
      });
      const page = await context.newPage();
      await page.goto(`https://regex.toolkitbox.org/${lang === 'zh' ? 'zh/' : ''}`);
      await page.fill('#regex-pattern', 'a');
      await page.fill('#regex-flags', 'g');
      await page.fill('#test-string', 'aaa');
      await page.waitForFunction(() => document.querySelector('#match-count').textContent.startsWith('3 '), null, { timeout: 5000 });
      assert.doesNotMatch(await page.textContent('#highlight-preview'), /timed out|超过/);
      // Replacing an input during startup must cancel the old task and its timer.
      await page.fill('#test-string', 'aaaa');
      await page.waitForTimeout(300);
      await page.fill('#regex-pattern', 'z');
      await page.fill('#test-string', 'z');
      await page.waitForFunction(() => document.querySelector('#match-count').textContent.startsWith('1 '), null, { timeout: 5000 });
      await page.waitForTimeout(1100);
      assert.doesNotMatch(await page.textContent('#highlight-preview'), /timed out|超过/);
      // The execution deadline still applies after the delayed script has loaded.
      await page.fill('#regex-pattern', '(a+)+$');
      await page.fill('#test-string', 'a'.repeat(32) + '!');
      await page.waitForFunction(() => /timed out|超过/.test(document.querySelector('#highlight-preview').textContent), null, { timeout: 6000 });
      assert.equal(await page.evaluate(() => 2 + 2), 4);
      startupDelay = 11000;
      await page.fill('#regex-pattern', 'z');
      await page.fill('#test-string', 'z');
      await page.waitForFunction(() => /could not load|未能在 10 秒内加载/.test(document.querySelector('#highlight-preview').textContent), null, { timeout: 13000 });
      startupDelay = 0;
      await page.fill('#test-string', 'zz');
      await page.waitForFunction(() => document.querySelector('#match-count').textContent.startsWith('2 '), null, { timeout: 5000 });
      console.log(`PASS ${lang}: slow startup, cancellation, execution deadline, startup timeout and recovery`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
