#!/usr/bin/env node

/**
 * Test script to verify @polkadot/api v16.4.1 compatibility
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

async function testPolkadotApi() {
  console.log('🧪 Testing @polkadot/api v16.4.1 upgrade...');
  
  try {
    console.log('📡 Creating provider...');
    const provider = new WsProvider('wss://rpc.polkadot.io', 1000, {}, 5000);
    
    console.log('🔗 Creating API instance...');
    const api = await ApiPromise.create({ provider });
    
    console.log('⏳ Waiting for API to be ready...');
    await api.isReady;
    
    console.log('📊 Getting chain information...');
    const [chain, nodeName, nodeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version()
    ]);
    
    console.log('✅ Successfully connected to blockchain!');
    console.log(`  Chain: ${chain.toString()}`);
    console.log(`  Node: ${nodeName.toString()}`);
    console.log(`  Version: ${nodeVersion.toString()}`);
    
    console.log('🧱 Testing block retrieval...');
    const header = await api.rpc.chain.getHeader();
    const blockNumber = header.number.toNumber();
    console.log(`  Current block: #${blockNumber}`);
    
    console.log('👤 Testing account query...');
    const testAddress = '1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg'; // Random Polkadot address
    const accountInfo = await api.query.system.account(testAddress);
    console.log(`  Account balance: ${accountInfo.data.free.toString()}`);
    
    console.log('🔄 Testing transfer extraction logic...');
    // Test the extrinsic parsing structure that BlockchainService uses
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber - 1);
    const block = await api.rpc.chain.getBlock(blockHash);
    const events = await api.query.system.events.at(blockHash);
    
    console.log(`  Block has ${block.block.extrinsics.length} extrinsics`);
    console.log(`  Block has ${events.length} events`);
    
    // Test extrinsic structure (like BlockchainService does)
    if (block.block.extrinsics.length > 0) {
      const firstExtrinsic = block.block.extrinsics[0];
      console.log(`  First extrinsic method: ${firstExtrinsic.method.section}.${firstExtrinsic.method.method}`);
      
      // Test signer access (this might fail if the breaking changes affect it)
      try {
        if (firstExtrinsic.signer) {
          console.log(`  First extrinsic signer: ${firstExtrinsic.signer.toString()}`);
        } else {
          console.log(`  First extrinsic has no signer (system extrinsic)`);
        }
      } catch (signerError) {
        console.log(`  ⚠️  Signer access issue: ${signerError.message}`);
      }
    }
    
    console.log('🔌 Disconnecting...');
    await api.disconnect();
    
    console.log('🎉 All tests passed! API upgrade successful.');
    return true;
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
testPolkadotApi()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });