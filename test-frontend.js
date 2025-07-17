// Test script to verify the frontend is working
const http = require('http');

console.log('Testing frontend functionality...\n');

// Test API endpoints
const endpoints = [
    'http://localhost:3003/api/current',
    'http://localhost:3003/api/alerts'
];

endpoints.forEach(url => {
    http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const json = JSON.parse(data);
            console.log(`${url}:`);
            if (url.includes('current')) {
                console.log(`  - Accounts monitored: ${json.data.accountsMonitored}`);
                console.log(`  - Top account: ${json.data.topAccounts[0]?.address || 'None'}`);
                console.log(`  - Top account identity: ${json.data.topAccounts[0]?.identity || 'None'}`);
            } else if (url.includes('alerts')) {
                console.log(`  - Total alerts: ${json.alerts.length}`);
                console.log(`  - First alert address: ${json.alerts[0]?.address || 'None'}`);
                console.log(`  - Link would be: https://polkadot.subscan.io/account/${json.alerts[0]?.address}`);
            }
            console.log('');
        });
    });
});

console.log('\nOpen http://localhost:3003 in your browser to see clickable addresses.');
console.log('The addresses should appear as blue links that open Subscan when clicked.');