module.exports = async (page, assert, lang) => {
  const count = async n => page.waitForFunction(n => document.querySelector('#match-count').textContent.startsWith(n+' '),n);
  await page.fill('#regex-pattern','a'); await page.fill('#regex-flags','g'); await page.fill('#test-string','aaa');
  await count(3);
  await page.click('[data-mode="replace"]'); await page.fill('#replace-with','b');
  await page.waitForFunction(() => document.querySelector('#replace-result').textContent === 'bbb');
  await page.fill('#regex-flags','');
  await page.waitForFunction(() => document.querySelector('#replace-result').textContent === 'baa');
  await count(1);
  await page.fill('#regex-pattern','[');
  await page.waitForSelector('.regex-error');
  assert.equal(await page.textContent('#replace-result'), '');
  await page.click('[data-mode="test"]');
  await page.fill('#regex-pattern','(?:)'); await page.fill('#regex-flags','gu'); await page.fill('#test-string','😀');
  await count(2);
  await page.fill('#regex-pattern',' '); await page.fill('#test-string','a b'); await count(1);
  for (const mode of ['test','replace']) {
    await page.click(`[data-mode="${mode}"]`);
    await page.fill('#regex-pattern','(a+)+$'); await page.fill('#regex-flags','g');
    await page.fill('#test-string','a'.repeat(32)+'!');
    await page.waitForFunction(() => /timed out|超过/.test(document.querySelector('#highlight-preview').textContent),null,{timeout:5000});
    assert.equal(await page.evaluate(() => 2+2),4);
    await page.fill('#regex-pattern','a'); await page.fill('#test-string','a'); await count(1);
  }
  await page.fill('#regex-pattern','(a+)+$'); await page.fill('#test-string','a'.repeat(32)+'!');
  await page.waitForTimeout(200);
  await page.fill('#regex-pattern','z'); await page.fill('#test-string','z'); await count(1);
  await page.waitForTimeout(1100);
  assert.doesNotMatch(await page.textContent('#highlight-preview'), /timed out|超过/);
  await page.fill('#regex-pattern','a'); await page.fill('#regex-flags','g');
  await page.fill('#replace-with','b'.repeat(1000)); await page.fill('#test-string','a'.repeat(2000));
  await page.waitForFunction(() => /1,000,000/.test(document.querySelector('#highlight-preview').textContent));
  assert.match(await page.textContent('#highlight-preview'), lang === 'en' ? /Shorten/ : /缩短/);
  assert.equal(await page.textContent('#replace-result'),'');
  await page.fill('#replace-with','b'); await page.fill('#test-string','a'.repeat(10001));
  await page.waitForFunction(() => /10,000/.test(document.querySelector('#highlight-preview').textContent));
  await page.fill('#test-string','aaa');
  await page.waitForFunction(() => document.querySelector('#replace-result').textContent === 'bbb');
};
