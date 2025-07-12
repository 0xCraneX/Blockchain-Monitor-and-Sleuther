const { chromium } = require('playwright');

async function monitorConsole() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  const logs = [];
  
  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    
    logs.push({ type, text, timestamp: new Date().toISOString() });
    
    if (type === 'error') {
      errors.push({ text, timestamp: new Date().toISOString() });
      console.log(`🚨 CONSOLE ERROR: ${text}`);
    } else if (type === 'warn') {
      console.log(`⚠️  CONSOLE WARN: ${text}`);
    } else if (type === 'log' && text.includes('Error')) {
      console.log(`❌ APP ERROR: ${text}`);
    } else {
      console.log(`📝 CONSOLE: ${text}`);
    }
  });
  
  // Capture network failures
  page.on('response', response => {
    if (!response.ok()) {
      console.log(`🌐 NETWORK ERROR: ${response.status()} ${response.url()}`);
    }
  });
  
  console.log('🚀 Starting automated console monitoring...');
  
  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
    
    console.log('✅ Page loaded, monitoring for 10 seconds...');
    
    // Wait for initial load and interactions
    await page.waitForTimeout(10000);
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`Total console messages: ${logs.length}`);
    console.log(`Errors found: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log(`\n🚨 ERRORS DETECTED:`);
      errors.forEach((error, i) => {
        console.log(`${i + 1}. ${error.text}`);
      });
    } else {
      console.log('✅ No console errors detected!');
    }
    
  } catch (error) {
    console.log(`❌ Monitoring failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

monitorConsole().catch(console.error);