#!/usr/bin/env node

/**
 * Script to clear mock data from the SQLite database
 * This forces the application to use real blockchain data from Subscan API
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DATABASE_PATH || './data/analysis.db';

console.log('🧹 Clearing mock data from database...');
console.log(`📂 Database path: ${dbPath}`);

try {
  // Open database connection
  const db = new Database(dbPath);
  
  // Check if database has any data
  const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
  const transferCount = db.prepare('SELECT COUNT(*) as count FROM transfers').get();
  const relationshipCount = db.prepare('SELECT COUNT(*) as count FROM account_relationships').get();
  
  console.log(`📊 Current data in database:`);
  console.log(`   - Accounts: ${accountCount.count}`);
  console.log(`   - Transfers: ${transferCount.count}`);
  console.log(`   - Relationships: ${relationshipCount.count}`);
  
  if (accountCount.count === 0 && transferCount.count === 0 && relationshipCount.count === 0) {
    console.log('✅ Database is already empty');
    process.exit(0);
  }
  
  // Clear all mock data in the correct order (due to foreign key constraints)
  console.log('🗑️  Clearing mock data...');
  
  // Disable foreign key checks temporarily
  db.pragma('foreign_keys = OFF');
  
  // Start transaction
  const clearData = db.transaction(() => {
    // Clear tables in order that respects foreign key dependencies
    console.log('   - Clearing patterns...');
    db.prepare('DELETE FROM patterns').run();
    
    console.log('   - Clearing watchlist...');
    db.prepare('DELETE FROM watchlist').run();
    
    console.log('   - Clearing account_relationships...');
    db.prepare('DELETE FROM account_relationships').run();
    
    console.log('   - Clearing transfers...');
    db.prepare('DELETE FROM transfers').run();
    
    console.log('   - Clearing accounts...');
    db.prepare('DELETE FROM accounts').run();
    
    console.log('   - Clearing search_history...');
    db.prepare('DELETE FROM search_history').run();
    
    console.log('   - Clearing investigations...');
    db.prepare('DELETE FROM investigations').run();
    
    console.log('   - Resetting sync_status...');
    db.prepare('DELETE FROM sync_status').run();
    
    console.log('   - Clearing statistics...');
    db.prepare('DELETE FROM statistics').run();
  });
  
  // Execute the transaction
  clearData();
  
  // Re-enable foreign key checks
  db.pragma('foreign_keys = ON');
  
  // Verify data was cleared
  const finalAccountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
  const finalTransferCount = db.prepare('SELECT COUNT(*) as count FROM transfers').get();
  const finalRelationshipCount = db.prepare('SELECT COUNT(*) as count FROM account_relationships').get();
  
  console.log(`✅ Mock data cleared successfully!`);
  console.log(`📊 Final data in database:`);
  console.log(`   - Accounts: ${finalAccountCount.count}`);
  console.log(`   - Transfers: ${finalTransferCount.count}`);
  console.log(`   - Relationships: ${finalRelationshipCount.count}`);
  
  // Close database
  db.close();
  
  console.log('');
  console.log('🚀 The application will now use real blockchain data from Subscan API!');
  console.log('📝 When you restart the server, GraphController will fall back to RealDataService');
  console.log('   since the database no longer contains mock data.');
  
} catch (error) {
  console.error('❌ Error clearing mock data:', error.message);
  process.exit(1);
}