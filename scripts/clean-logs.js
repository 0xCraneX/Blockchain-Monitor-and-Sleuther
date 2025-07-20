#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

const LOGS_DIR = path.join(__dirname, '../logs');
const MAX_LOG_AGE_DAYS = 7; // Keep logs for 7 days
const MAX_LOG_SIZE_MB = 100; // Max size before compression warning

async function cleanLogs() {
  console.log('🧹 Starting log cleanup...\n');

  try {
    // Ensure logs directory exists
    if (!fs.existsSync(LOGS_DIR)) {
      console.log('No logs directory found. Nothing to clean.');
      return;
    }

    const files = await readdir(LOGS_DIR);
    const now = Date.now();
    const maxAge = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

    let totalSize = 0;
    let deletedCount = 0;
    let deletedSize = 0;

    for (const file of files) {
      // Skip audit files and non-log files
      if (file.startsWith('.') || !file.endsWith('.log')) {
        continue;
      }

      const filePath = path.join(LOGS_DIR, file);
      const stats = await stat(filePath);
      const fileAge = now - stats.mtime.getTime();
      const fileSizeMB = stats.size / (1024 * 1024);

      totalSize += fileSizeMB;

      // Delete old files
      if (fileAge > maxAge) {
        await unlink(filePath);
        deletedCount++;
        deletedSize += fileSizeMB;
        console.log(`❌ Deleted old log: ${file} (${fileSizeMB.toFixed(2)} MB, ${Math.floor(fileAge / (24 * 60 * 60 * 1000))} days old)`);
      } else if (fileSizeMB > MAX_LOG_SIZE_MB) {
        console.log(`⚠️  Large log file: ${file} (${fileSizeMB.toFixed(2)} MB)`);
      } else {
        console.log(`✅ Keeping: ${file} (${fileSizeMB.toFixed(2)} MB, ${Math.floor(fileAge / (24 * 60 * 60 * 1000))} days old)`);
      }
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`   Total files processed: ${files.length}`);
    console.log(`   Files deleted: ${deletedCount}`);
    console.log(`   Space freed: ${deletedSize.toFixed(2)} MB`);
    console.log(`   Current log size: ${(totalSize - deletedSize).toFixed(2)} MB`);

    // Clean up specific large files if they exist
    const largeFiles = ['debug.log', 'server.log'];
    for (const file of largeFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const stats = await stat(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB > 10) {
          // Truncate file instead of deleting
          fs.writeFileSync(filePath, '');
          console.log(`\n🔄 Truncated large ${file} (was ${sizeMB.toFixed(2)} MB)`);
        }
      }
    }

    console.log('\n✨ Log cleanup complete!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanLogs();