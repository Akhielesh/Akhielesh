const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  // Test index.html
  await page.goto('file:///app/index.html');
  const headHtml = await page.innerHTML('head');
  if (!headHtml.includes('link rel="preconnect"')) {
     console.error("Missing preconnect in index.html");
     process.exit(1);
  }

  // Test 404.html
  await page.goto('file:///app/404.html');
  const headHtml404 = await page.innerHTML('head');
  if (!headHtml404.includes('link rel="preconnect"')) {
     console.error("Missing preconnect in 404.html");
     process.exit(1);
  }

  console.log("Successfully verified preconnect links.");
  await browser.close();
})();
