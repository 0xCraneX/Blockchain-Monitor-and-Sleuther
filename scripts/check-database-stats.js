#!/usr/bin/env node

import { DatabaseService } from '../src/services/DatabaseService.js';
import { performance } from 'perf_hooks';

async function checkDatabaseStats() {
  console.log('\n📊 Polkadot Analysis Tool - Database Statistics\n');
  
  const dbService = new DatabaseService();
  await dbService.initialize();
  
  try {
    // Get table counts
    const tables = [
      'accounts',
      'transfers', 
      'account_relationships',
      'patterns',
      'investigations',
      'watchlist',
      'statistics',
      'sync_status'
    ];
    
    console.log('📈 Table Record Counts:');
    console.log('─'.repeat(40));
    
    for (const table of tables) {
      const start = performance.now();
      const count = dbService.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
      const time = performance.now() - start;
      console.log(`${table.padEnd(25)} ${count.toString().padStart(10)} records (${time.toFixed(2)}ms)`);
    }
    
    // Get database size
    const stats = dbService.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
    const dbSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log('\n💾 Database Size:');
    console.log('─'.repeat(40));
    console.log(`Total size: ${dbSizeMB} MB`);
    
    // Get index information
    console.log('\n🔍 Indexes:');
    console.log('─'.repeat(40));
    const indexes = dbService.db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all();
    console.log(`Total indexes: ${indexes.length}`);
    
    // Get some sample statistics
    if (dbService.db.prepare("SELECT COUNT(*) as count FROM accounts").get().count > 0) {
      console.log('\n📊 Account Statistics:');
      console.log('─'.repeat(40));
      
      const avgBalance = dbService.db.prepare(`
        SELECT AVG(CAST(balance AS REAL)) as avg_balance 
        FROM accounts 
        WHERE balance IS NOT NULL AND balance != '0'
      `).get();
      
      const topAccounts = dbService.db.prepare(`
        SELECT COUNT(*) as count 
        FROM accounts 
        WHERE total_transfers_in + total_transfers_out > 10
      `).get();
      
      const identifiedAccounts = dbService.db.prepare(`
        SELECT COUNT(*) as count 
        FROM accounts 
        WHERE identity_display IS NOT NULL
      `).get();
      
      console.log(`Accounts with >10 transfers: ${topAccounts.count}`);
      console.log(`Accounts with identity: ${identifiedAccounts.count}`);
    }
    
    // Check for any patterns detected
    const patternStats = dbService.db.prepare(`
      SELECT pattern_type, COUNT(*) as count 
      FROM patterns 
      GROUP BY pattern_type
    `).all();
    
    if (patternStats.length > 0) {
      console.log('\n🎯 Pattern Detection:');
      console.log('─'.repeat(40));
      patternStats.forEach(p => {
        console.log(`${p.pattern_type.padEnd(20)} ${p.count} detections`);
      });
    }
    
    // Performance check
    console.log('\n⚡ Query Performance Test:');
    console.log('─'.repeat(40));
    
    const perfTests = [
      {
        name: 'Simple account lookup',
        query: () => dbService.db.prepare("SELECT * FROM accounts WHERE address = ?").get('test')
      },
      {
        name: 'Account search',
        query: () => dbService.db.prepare("SELECT * FROM accounts WHERE address LIKE ? LIMIT 10").all('%test%')
      },
      {
        name: 'Transfer aggregation',
        query: () => dbService.db.prepare(`
          SELECT from_address, COUNT(*) as count, SUM(CAST(value AS INTEGER)) as total
          FROM transfers
          GROUP BY from_address
          LIMIT 10
        `).all()
      }
    ];
    
    for (const test of perfTests) {
      const start = performance.now();
      test.query();
      const time = performance.now() - start;
      console.log(`${test.name.padEnd(25)} ${time.toFixed(2)}ms`);
    }
    
    console.log('\n✅ Database health check complete!\n');
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    dbService.close();
  }
}

checkDatabaseStats();