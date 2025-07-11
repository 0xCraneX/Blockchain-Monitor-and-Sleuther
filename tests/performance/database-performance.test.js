import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { DatabaseTestHelper } from '../utils/database-test-helper.js';
import { GraphGenerators } from '../fixtures/graph-generators.js';
import { logger } from '../../src/utils/logger.js';

// Performance benchmarking utilities
class DatabaseBenchmark {
  static async measureQueryTime(fn) {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    return {
      result,
      duration: endTime - startTime
    };
  }

  static async runMultipleTimes(fn, times = 5) {
    const durations = [];
    let lastResult;
    
    for (let i = 0; i < times; i++) {
      const { result, duration } = await this.measureQueryTime(fn);
      durations.push(duration);
      lastResult = result;
    }
    
    return {
      result: lastResult,
      durations,
      avg: durations.reduce((a, b) => a + b) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations)
    };
  }
}

describe('Database Performance Tests', () => {
  let dbService;
  let rawDb;
  let testData;

  beforeEach(async () => {
    logger.level = 'error';
    
    const testDb = await DatabaseTestHelper.createIsolatedDatabase();
    rawDb = testDb.db;
    
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = testDb.dbPath;
  });

  afterEach(async () => {
    if (rawDb) {
      const dbPath = rawDb.name;
      await DatabaseTestHelper.cleanupDatabase(rawDb, dbPath);
    }
  });

  describe('Query Performance with Large Datasets', () => {
    const setupLargeDataset = async (nodeCount, edgeMultiplier = 5) => {
      console.log(`Setting up dataset with ${nodeCount} nodes and ~${nodeCount * edgeMultiplier} edges...`);
      
      // Generate graph data
      testData = GraphGenerators.generateScaleFreeNetwork(null, nodeCount, edgeMultiplier);
      
      // Batch insert addresses
      const insertAddress = rawDb.prepare(`
        INSERT OR IGNORE INTO addresses (address, first_seen_at, last_seen_at, total_transactions, total_volume)
        VALUES (?, datetime('now'), datetime('now'), ?, ?)
      `);
      
      const insertAddressBatch = rawDb.transaction((addresses) => {
        for (const addr of addresses) {
          insertAddress.run(addr.address, addr.transactionCount, addr.totalVolume);
        }
      });
      
      insertAddressBatch(testData.nodes);
      
      // Batch insert transactions
      const insertTransaction = rawDb.prepare(`
        INSERT INTO transactions (
          from_address, to_address, amount, block_number, timestamp, 
          transaction_hash, transaction_index, success
        ) VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' days'), ?, 0, 1)
      `);
      
      const insertTransactionBatch = rawDb.transaction((transactions) => {
        for (const tx of transactions) {
          insertTransaction.run(
            tx.source,
            tx.target,
            tx.amount,
            tx.blockNumber,
            Math.floor(Math.random() * 365), // Random day in past year
            tx.hash
          );
        }
      });
      
      // Insert in chunks to avoid memory issues
      const chunkSize = 1000;
      for (let i = 0; i < testData.edges.length; i += chunkSize) {
        const chunk = testData.edges.slice(i, i + chunkSize);
        insertTransactionBatch(chunk);
      }
      
      console.log(`Dataset created: ${testData.nodes.length} addresses, ${testData.edges.length} transactions`);
    };

    it('should handle address lookup efficiently with 10k addresses', async () => {
      await setupLargeDataset(10000, 3);
      
      const testAddress = testData.nodes[Math.floor(Math.random() * 1000)].address;
      
      const benchmark = await DatabaseBenchmark.runMultipleTimes(() => 
        rawDb.prepare('SELECT * FROM addresses WHERE address = ?').get(testAddress)
      );
      
      expect(benchmark.avg).toBeLessThan(5); // Should be under 5ms
      console.log(`Address lookup (10k dataset): avg ${benchmark.avg.toFixed(2)}ms, min ${benchmark.min.toFixed(2)}ms, max ${benchmark.max.toFixed(2)}ms`);
    });

    it('should handle transaction queries efficiently with indexed columns', async () => {
      await setupLargeDataset(5000, 10);
      
      const testAddress = testData.nodes[0].address;
      
      // Test with index
      const withIndexBenchmark = await DatabaseBenchmark.runMultipleTimes(() => 
        rawDb.prepare(`
          SELECT * FROM transactions 
          WHERE from_address = ? OR to_address = ?
          ORDER BY timestamp DESC
          LIMIT 100
        `).all(testAddress, testAddress)
      );
      
      expect(withIndexBenchmark.avg).toBeLessThan(50); // Should be under 50ms with index
      console.log(`Transaction query with index: avg ${withIndexBenchmark.avg.toFixed(2)}ms`);
      
      // Test aggregation query
      const aggregationBenchmark = await DatabaseBenchmark.runMultipleTimes(() => 
        rawDb.prepare(`
          SELECT 
            COUNT(*) as tx_count,
            SUM(CAST(amount AS REAL)) as total_volume,
            AVG(CAST(amount AS REAL)) as avg_amount
          FROM transactions
          WHERE from_address = ? OR to_address = ?
        `).get(testAddress, testAddress)
      );
      
      expect(aggregationBenchmark.avg).toBeLessThan(100);
      console.log(`Aggregation query: avg ${aggregationBenchmark.avg.toFixed(2)}ms`);
    });

    it('should test index effectiveness on different query patterns', async () => {
      await setupLargeDataset(10000, 5);
      
      const queries = [
        {
          name: 'Range query on block_number',
          sql: 'SELECT COUNT(*) FROM transactions WHERE block_number BETWEEN ? AND ?',
          params: [100000, 200000]
        },
        {
          name: 'Time range query',
          sql: `SELECT COUNT(*) FROM transactions 
                WHERE timestamp BETWEEN datetime('now', '-30 days') AND datetime('now')`,
          params: []
        },
        {
          name: 'Complex join query',
          sql: `SELECT a1.address, a2.address, COUNT(*) as tx_count, SUM(CAST(t.amount AS REAL)) as total
                FROM transactions t
                JOIN addresses a1 ON t.from_address = a1.address
                JOIN addresses a2 ON t.to_address = a2.address
                WHERE t.amount > ?
                GROUP BY a1.address, a2.address
                HAVING tx_count > 5
                LIMIT 100`,
          params: ['1000000']
        },
        {
          name: 'Pattern matching query',
          sql: `SELECT DISTINCT address FROM addresses WHERE address LIKE ?`,
          params: ['1%']
        }
      ];
      
      console.log('\nIndex Effectiveness Test Results:');
      console.log('================================');
      
      for (const query of queries) {
        const benchmark = await DatabaseBenchmark.runMultipleTimes(() => 
          rawDb.prepare(query.sql).all(...query.params)
        );
        
        console.log(`${query.name}:`);
        console.log(`  Results: ${benchmark.result.length} rows`);
        console.log(`  Avg: ${benchmark.avg.toFixed(2)}ms, Min: ${benchmark.min.toFixed(2)}ms, Max: ${benchmark.max.toFixed(2)}ms`);
      }
    }, 60000);
  });

  describe('Transaction Throughput Testing', () => {
    it('should measure INSERT transaction throughput', async () => {
      const batchSizes = [1, 10, 100, 1000];
      const results = {};
      
      for (const batchSize of batchSizes) {
        // Prepare test data
        const addresses = Array.from({ length: 100 }, (_, i) => ({
          address: `test_address_${i}`,
          transactionCount: 10,
          totalVolume: '1000000'
        }));
        
        // Insert addresses first
        const insertAddress = rawDb.prepare(`
          INSERT OR IGNORE INTO addresses (address, first_seen_at, last_seen_at, total_transactions, total_volume)
          VALUES (?, datetime('now'), datetime('now'), ?, ?)
        `);
        
        for (const addr of addresses) {
          insertAddress.run(addr.address, addr.transactionCount, addr.totalVolume);
        }
        
        // Prepare transactions
        const transactions = Array.from({ length: batchSize * 10 }, (_, i) => ({
          from: addresses[i % addresses.length].address,
          to: addresses[(i + 1) % addresses.length].address,
          amount: '100000',
          blockNumber: 1000000 + i,
          hash: `0x${i.toString(16).padStart(64, '0')}`
        }));
        
        // Measure insert performance
        const insertTransaction = rawDb.prepare(`
          INSERT INTO transactions (
            from_address, to_address, amount, block_number, timestamp,
            transaction_hash, transaction_index, success
          ) VALUES (?, ?, ?, ?, datetime('now'), ?, 0, 1)
        `);
        
        if (batchSize === 1) {
          // Single inserts
          const startTime = performance.now();
          for (const tx of transactions) {
            insertTransaction.run(tx.from, tx.to, tx.amount, tx.blockNumber, tx.hash);
          }
          const duration = performance.now() - startTime;
          results[batchSize] = {
            totalTime: duration,
            transactionsPerSecond: (transactions.length / duration) * 1000
          };
        } else {
          // Batch inserts
          const insertBatch = rawDb.transaction((txs) => {
            for (const tx of txs) {
              insertTransaction.run(tx.from, tx.to, tx.amount, tx.blockNumber, tx.hash);
            }
          });
          
          const startTime = performance.now();
          for (let i = 0; i < transactions.length; i += batchSize) {
            const batch = transactions.slice(i, i + batchSize);
            insertBatch(batch);
          }
          const duration = performance.now() - startTime;
          results[batchSize] = {
            totalTime: duration,
            transactionsPerSecond: (transactions.length / duration) * 1000
          };
        }
      }
      
      console.log('\nTransaction Insert Throughput:');
      console.log('==============================');
      for (const [batchSize, result] of Object.entries(results)) {
        console.log(`Batch size ${batchSize}: ${result.transactionsPerSecond.toFixed(0)} tx/sec (${result.totalTime.toFixed(2)}ms total)`);
      }
    });

    it('should test concurrent read/write performance', async () => {
      // Setup initial data
      await setupLargeDataset(1000, 5);
      
      const concurrentOps = 50;
      const promises = [];
      const metrics = {
        reads: [],
        writes: [],
        conflicts: 0
      };
      
      // Mix of read and write operations
      for (let i = 0; i < concurrentOps; i++) {
        if (i % 3 === 0) {
          // Write operation
          promises.push((async () => {
            const startTime = performance.now();
            try {
              const insertStmt = rawDb.prepare(`
                INSERT INTO transactions (
                  from_address, to_address, amount, block_number, timestamp,
                  transaction_hash, transaction_index, success
                ) VALUES (?, ?, ?, ?, datetime('now'), ?, 0, 1)
              `);
              
              insertStmt.run(
                testData.nodes[0].address,
                testData.nodes[1].address,
                '100000',
                2000000 + i,
                `0x${i.toString(16).padStart(64, '0')}`
              );
              
              metrics.writes.push(performance.now() - startTime);
            } catch (error) {
              metrics.conflicts++;
            }
          })());
        } else {
          // Read operation
          promises.push((async () => {
            const startTime = performance.now();
            const address = testData.nodes[i % testData.nodes.length].address;
            
            rawDb.prepare(`
              SELECT COUNT(*) as count FROM transactions
              WHERE from_address = ? OR to_address = ?
            `).get(address, address);
            
            metrics.reads.push(performance.now() - startTime);
          })());
        }
      }
      
      await Promise.all(promises);
      
      const avgRead = metrics.reads.reduce((a, b) => a + b, 0) / metrics.reads.length;
      const avgWrite = metrics.writes.reduce((a, b) => a + b, 0) / metrics.writes.length;
      
      console.log(`\nConcurrent Operations (${concurrentOps} total):`);
      console.log(`Reads: ${metrics.reads.length}, avg ${avgRead.toFixed(2)}ms`);
      console.log(`Writes: ${metrics.writes.length}, avg ${avgWrite.toFixed(2)}ms`);
      console.log(`Conflicts: ${metrics.conflicts}`);
      
      expect(avgRead).toBeLessThan(10);
      expect(avgWrite).toBeLessThan(20);
    });
  });

  describe('Lock Contention Testing', () => {
    it('should measure lock contention under heavy write load', async () => {
      // Setup
      const addresses = Array.from({ length: 10 }, (_, i) => `address_${i}`);
      
      // Insert addresses
      for (const addr of addresses) {
        rawDb.prepare(`
          INSERT OR IGNORE INTO addresses (address, first_seen_at, last_seen_at, total_transactions, total_volume)
          VALUES (?, datetime('now'), datetime('now'), 0, '0')
        `).run(addr);
      }
      
      const writers = 5;
      const writesPerWorker = 100;
      const results = [];
      
      // Simulate multiple writers updating the same addresses
      const writePromises = Array.from({ length: writers }, async (_, workerId) => {
        const workerResults = {
          workerId,
          durations: [],
          errors: 0
        };
        
        for (let i = 0; i < writesPerWorker; i++) {
          const startTime = performance.now();
          
          try {
            // Update address statistics (causes contention)
            rawDb.prepare(`
              UPDATE addresses 
              SET total_transactions = total_transactions + 1,
                  total_volume = CAST(CAST(total_volume AS REAL) + 100000 AS TEXT),
                  last_seen_at = datetime('now')
              WHERE address = ?
            `).run(addresses[i % addresses.length]);
            
            workerResults.durations.push(performance.now() - startTime);
          } catch (error) {
            workerResults.errors++;
          }
        }
        
        results.push(workerResults);
      });
      
      await Promise.all(writePromises);
      
      console.log('\nLock Contention Test Results:');
      console.log('=============================');
      
      for (const result of results) {
        const avgDuration = result.durations.reduce((a, b) => a + b, 0) / result.durations.length;
        const maxDuration = Math.max(...result.durations);
        
        console.log(`Worker ${result.workerId}: avg ${avgDuration.toFixed(2)}ms, max ${maxDuration.toFixed(2)}ms, errors: ${result.errors}`);
      }
    });
  });
});

// Helper to setup large dataset
async function setupLargeDataset(nodeCount, edgeMultiplier) {
  // Implementation provided in the test methods above
}