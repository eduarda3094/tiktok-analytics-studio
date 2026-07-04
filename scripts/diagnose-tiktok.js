// Diagnose: what's actually being rendered?
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function diagnose(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1280, height: 720 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);

    // Get visible body text (what the user actually sees)
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('=== Visible body text ===');
    console.log(bodyText);

    // Title
    const title = await page.title();
    console.log('\nTitle:', title);
    
    // URL after redirects
    console.log('Final URL:', page.url());

    // Take screenshot
    await page.screenshot({ path: '/tmp/tiktok-diagnose.png', fullPage: false });
    console.log('\nScreenshot saved to /tmp/tiktok-diagnose.png');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

diagnose(process.argv[2] || 'https://www.tiktok.com/@tiktok/video/7106594312292453675');
