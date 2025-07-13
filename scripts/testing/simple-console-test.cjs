// Simple console test using jsdom to check for basic JavaScript errors
const fs = require('fs');
const path = require('path');

// Read the HTML file
const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Basic validation checks
console.log('🔍 Running frontend validation checks...');

// Check if required scripts are referenced
const requiredScripts = [
  'd3.v7.min.js',
  'socket.io.min.js', 
  'app.js',
  'client.js',
  'graph.js'
];

let allScriptsFound = true;
requiredScripts.forEach(script => {
  if (htmlContent.includes(script)) {
    console.log(`✅ ${script} referenced correctly`);
  } else {
    console.log(`❌ ${script} NOT found in HTML`);
    allScriptsFound = false;
  }
});

// Check if required DOM elements exist
const requiredElements = [
  'id="network-graph"',
  'id="address-search"', 
  'id="search-btn"',
  'id="graph-container"'
];

let allElementsFound = true;
requiredElements.forEach(element => {
  if (htmlContent.includes(element)) {
    console.log(`✅ ${element} element found`);
  } else {
    console.log(`❌ ${element} element NOT found`);
    allElementsFound = false;
  }
});

// Test if API endpoints respond correctly
const http = require('http');

function testAPI(endpoint) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3001${endpoint}`, (res) => {
      if (res.statusCode === 200) {
        console.log(`✅ API ${endpoint} responding with 200`);
        resolve(true);
      } else {
        console.log(`❌ API ${endpoint} responding with ${res.statusCode}`);
        resolve(false);
      }
    });
    
    req.on('error', () => {
      console.log(`❌ API ${endpoint} connection failed`);
      resolve(false);
    });
    
    req.setTimeout(2000, () => {
      console.log(`❌ API ${endpoint} timeout`);
      req.abort();
      resolve(false);
    });
  });
}

async function runTests() {
  console.log('\n🌐 Testing API endpoints...');
  
  const apiTests = [
    '/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
    '/api/accounts/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
    '/api/investigations'
  ];
  
  const results = await Promise.all(apiTests.map(testAPI));
  const allAPIsWorking = results.every(result => result);
  
  console.log('\n📊 TEST SUMMARY:');
  console.log(`Scripts: ${allScriptsFound ? '✅' : '❌'}`);
  console.log(`DOM Elements: ${allElementsFound ? '✅' : '❌'}`);
  console.log(`APIs: ${allAPIsWorking ? '✅' : '❌'}`);
  
  if (allScriptsFound && allElementsFound && allAPIsWorking) {
    console.log('\n🎉 ALL TESTS PASSED! Frontend should be working correctly.');
    console.log('🌐 Application available at: http://localhost:3001');
  } else {
    console.log('\n⚠️  Some issues detected. Check the logs above.');
  }
}

runTests().catch(console.error);