#!/usr/bin/env node

/**
 * Test script to verify real Polkadot connection
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

async function testConnection() {
  const endpoints = [
    { name: 'Polkadot', url: 'wss://rpc.polkadot.io' },
    { name: 'Kusama', url: 'wss://kusama-rpc.polkadot.io' },
    { name: 'Westend', url: 'wss://westend-rpc.polkadot.io' }
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTesting ${endpoint.name} connection...`);
    
    try {
      const provider = new WsProvider(endpoint.url);
      const api = await ApiPromise.create({ provider });
      
      await api.isReady;
      
      const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version()
      ]);
      
      console.log(`✓ Connected to ${chain}`);
      console.log(`  Node: ${nodeName} v${nodeVersion}`);
      
      // Test fetching an account
      const testAddress = '15kUt2i86LHRWCkE3D9Bg1HZAoc2smhn1fwPzDERTb1BXAkX';
      const account = await api.query.system.account(testAddress);
      console.log(`  Test account balance: ${account.data.free.toHuman()}`);
      
      // Test fetching identity
      if (api.query.identity) {
        const identity = await api.query.identity.identityOf(testAddress);
        if (identity.isSome) {
          const info = identity.unwrap().info;
          console.log(`  Identity: ${info.display.asRaw.toHuman()}`);
        }
      }
      
      await api.disconnect();
      
    } catch (error) {
      console.error(`✗ Failed to connect to ${endpoint.name}:`, error.message);
    }
  }
  
  console.log('\n---\nTo use real data, set SKIP_BLOCKCHAIN=false in your .env file');
}

testConnection().then(() => process.exit(0)).catch(console.error);