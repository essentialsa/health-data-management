const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  console.log('Navigating to forum login...');
  await page.goto('https://forum.trae.cn/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Take screenshot of login page
  await page.screenshot({ path: '/tmp/login_page.png' });
  console.log('Login page screenshot saved');
  
  // Get page content to understand login options
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('Page text (first 2000 chars):', pageText.substring(0, 2000));
  
  // Look for phone login option or form
  const hasPhoneInput = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    const inputTypes = Array.from(inputs).map(i => ({ type: i.type, placeholder: i.placeholder, name: i.name, id: i.id }));
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    const links = Array.from(document.querySelectorAll('a')).map(a => a.textContent.trim());
    return { inputs: inputTypes, buttons, links };
  });
  console.log('Form elements:', JSON.stringify(hasPhoneInput, null, 2));
  
  await browser.close();
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
