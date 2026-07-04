// Test with stealth mode + XHR interception
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function scrapeTikTok(url) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  // Spoof webdriver property
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  const xhrResponses = [];

  // Intercept all XHR/fetch responses that might contain video data
  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json') && (url.includes('item') || url.includes('video') || url.includes('detail'))) {
      try {
        const text = await response.text();
        if (text.length > 100 && (text.includes('playCount') || text.includes('itemStruct') || text.includes('ItemModule'))) {
          xhrResponses.push({ url, length: text.length, sample: text.slice(0, 200) });
          if (text.length < 50000) {
            console.log(`\n=== XHR JSON from ${url.slice(0, 80)} ===`);
            console.log(text.slice(0, 2000));
          }
        }
      } catch (e) {
        // ignore
      }
    }
  });

  try {
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded, waiting 5s for hydration...');
    await page.waitForTimeout(5000);

    const html = await page.content();
    console.log('\nHTML length:', html.length);
    console.log('Has __UNIVERSAL_DATA_FOR_REHYDRATION__:', html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__'));
    console.log('Has SIGI_STATE:', html.includes('SIGI_STATE'));
    console.log('Has playCount:', html.includes('playCount'));
    console.log('Has diggCount:', html.includes('diggCount'));

    // Try to extract from universal data
    const result = await page.evaluate(() => {
      const universal = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (universal && universal.textContent && universal.textContent.length > 100) {
        try {
          const parsed = JSON.parse(universal.textContent);
          return { type: 'universal', data: parsed };
        } catch (e) {
          return { type: 'universal_parse_error', error: e.message, content: universal.textContent.slice(0, 200) };
        }
      }
      const sigi = document.getElementById('SIGI_STATE');
      if (sigi && sigi.textContent) {
        try {
          return { type: 'sigi', data: JSON.parse(sigi.textContent) };
        } catch (e) {
          return { type: 'sigi_parse_error', error: e.message };
        }
      }
      return { type: 'none' };
    });

    console.log('\nExtraction type:', result.type);
    if (result.type === 'universal') {
      const scope = result.data?.__DEFAULT_SCOPE__ || {};
      console.log('__DEFAULT_SCOPE__ keys:', Object.keys(scope));
      const vd = scope?.['webapp.video-detail'];
      if (vd) {
        console.log('video-detail keys:', Object.keys(vd));
        const item = vd?.itemInfo?.itemStruct;
        if (item) {
          console.log('\n=== itemStruct FOUND ===');
          console.log('Keys:', Object.keys(item));
          console.log('\nstats:', JSON.stringify(item.stats, null, 2));
          console.log('\nauthor:', JSON.stringify(item.author, null, 2));
          console.log('\nauthorStats:', JSON.stringify(item.authorStats, null, 2));
          console.log('\nvideo (first 1.5KB):', JSON.stringify(item.video, null, 2).slice(0, 1500));
          console.log('\nmusic (first 800B):', JSON.stringify(item.music, null, 2).slice(0, 800));
          console.log('\ndesc:', item.desc);
          console.log('createTime:', item.createTime, '→', new Date(item.createTime * 1000).toISOString());
          console.log('region:', item.region);
          console.log('language:', item.language);
          console.log('locationCreated:', item.locationCreated);
          console.log('textExtra:', JSON.stringify(item.textExtra?.slice(0, 5), null, 2));
        }
      }
    } else if (result.type === 'sigi') {
      console.log('SIGI keys:', Object.keys(result.data));
      if (result.data.ItemModule) {
        const first = Object.keys(result.data.ItemModule)[0];
        console.log('First ItemModule:', first);
        console.log(JSON.stringify(result.data.ItemModule[first], null, 2).slice(0, 2000));
      }
    } else if (result.type === 'none') {
      // Try DOM counts as fallback
      const domCounts = await page.evaluate(() => {
        const get = (sel) => document.querySelector(sel)?.textContent || null;
        return {
          likeCount: get('[data-e2e="like-count"]'),
          commentCount: get('[data-e2e="comment-count"]'),
          shareCount: get('[data-e2e="share-count"]'),
          collectCount: get('[data-e2e="undefined-count"]'),
          username: get('[data-e2e="browse-username"]'),
          desc: get('[data-e2e="browse-video-desc"]'),
        };
      });
      console.log('\n=== DOM fallback ===');
      console.log(JSON.stringify(domCounts, null, 2));

      console.log('\nXHR captured responses:', xhrResponses.length);
      xhrResponses.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.url.slice(0, 100)} (${r.length}b)`);
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await browser.close();
  }
}

const url = process.argv[2] || 'https://www.tiktok.com/@tiktok/video/7106594312292453675';
scrapeTikTok(url);
