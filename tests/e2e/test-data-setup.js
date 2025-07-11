/**
 * Test Data Setup for E2E Workflow Tests
 * 
 * Creates comprehensive test data including addresses, relationships,
 * patterns, and historical data for testing all workflows.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

class TestDataSetup {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../temp/e2e-test-data.db');
    this.db = null;
  }

  async setup() {
    console.log('📊 Setting up comprehensive test data...');
    
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
      
      // Create database
      this.db = new Database(this.dbPath);
      
      // Initialize schema
      await this.initializeSchema();
      
      // Generate test data
      await this.generateTestData();
      
      console.log('✅ Test data setup complete!');
      
    } catch (error) {
      console.error('❌ Test data setup failed:', error);
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }

  async initializeSchema() {
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    this.db.exec(schema);
    console.log('✅ Database schema initialized');
  }

  async generateTestData() {
    // Generate different types of test data
    await this.generateAccounts();
    await this.generateTransfers();
    await this.generatePatterns();
    await this.generateInvestigations();
    await this.generateRiskScores();
    await this.generateHistoricalData();
  }

  generateAccounts() {
    console.log('👤 Generating test accounts...');
    
    const accounts = [
      // Known good actors
      {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        identity_display: 'Alice',
        balance: '10000000000000',
        risk_score: 0.1,
        account_type: 'validator'
      },
      {
        address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        identity_display: 'Bob',
        balance: '5000000000000',
        risk_score: 0.2,
        account_type: 'normal'
      },
      {
        address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
        identity_display: 'Charlie',
        balance: '3000000000000',
        risk_score: 0.3,
        account_type: 'normal'
      },
      
      // Suspicious actors
      {
        address: '5HIGHriskAddressForPatternTesting123456789ABCDEF',
        identity_display: 'High Risk Test',
        balance: '50000000000000',
        risk_score: 0.9,
        account_type: 'suspicious'
      },
      {
        address: '5MIXERaddressForTestingMixingPatterns1234567890',
        identity_display: 'Mixer Service',
        balance: '100000000000000',
        risk_score: 0.8,
        account_type: 'mixer'
      },
      
      // Exchange addresses
      {
        address: '5EXCHANGEaddress1ForTestingExchangePatterns123',
        identity_display: 'Exchange Hot Wallet 1',
        balance: '1000000000000000',
        risk_score: 0.4,
        account_type: 'exchange'
      },
      {
        address: '5EXCHANGEaddress2ForTestingExchangePatterns456',
        identity_display: 'Exchange Cold Wallet',
        balance: '5000000000000000',
        risk_score: 0.3,
        account_type: 'exchange'
      },
      
      // Test monitoring addresses
      {
        address: '5MONITORaddressForRealtimeTestingUpdates123456',
        identity_display: 'Monitored Address 1',
        balance: '2000000000000',
        risk_score: 0.5,
        account_type: 'monitored'
      },
      
      // Addresses for bulk operations
      ...this.generateBulkAccounts(100)
    ];

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO accounts (
        address, identity_display, balance, 
        total_transfers_in, total_transfers_out,
        volume_in, volume_out,
        first_seen_block, last_seen_block,
        created_at, updated_at
      ) VALUES (
        @address, @identity_display, @balance,
        @total_transfers_in, @total_transfers_out,
        @volume_in, @volume_out,
        @first_seen_block, @last_seen_block,
        datetime('now'), datetime('now')
      )
    `);

    const insertMany = this.db.transaction((accounts) => {
      for (const account of accounts) {
        const stats = this.generateAccountStats(account.risk_score);
        insert.run({
          ...account,
          ...stats
        });
      }
    });

    insertMany(accounts);
    console.log(`✅ Generated ${accounts.length} test accounts`);
  }

  generateBulkAccounts(count) {
    const bulkAccounts = [];
    for (let i = 0; i < count; i++) {
      bulkAccounts.push({
        address: `5BULK${i.toString().padStart(5, '0')}AddressForTestingBulkOps${crypto.randomBytes(5).toString('hex')}`,
        identity_display: `Bulk Test Account ${i}`,
        balance: Math.floor(Math.random() * 1000000000000).toString(),
        risk_score: Math.random(),
        account_type: 'bulk_test'
      });
    }
    return bulkAccounts;
  }

  generateAccountStats(riskScore) {
    // Generate realistic stats based on risk score
    const baseTransfers = Math.floor(Math.random() * 100) + 10;
    const multiplier = riskScore > 0.7 ? 10 : 1;
    
    return {
      total_transfers_in: baseTransfers * multiplier,
      total_transfers_out: Math.floor(baseTransfers * multiplier * 0.9),
      volume_in: (baseTransfers * multiplier * 1000000000000).toString(),
      volume_out: (baseTransfers * multiplier * 900000000000).toString(),
      first_seen_block: Math.floor(Math.random() * 1000000),
      last_seen_block: Math.floor(Math.random() * 1000000) + 1000000
    };
  }

  generateTransfers() {
    console.log('💸 Generating test transfers...');
    
    const transfers = [];
    
    // Create circular transfer pattern
    const circularAddresses = [
      '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
      '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY' // Back to first
    ];
    
    for (let i = 0; i < circularAddresses.length - 1; i++) {
      transfers.push({
        from_address: circularAddresses[i],
        to_address: circularAddresses[i + 1],
        amount: '1000000000000',
        block_number: 1000000 + i * 100,
        timestamp: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    
    // Create mixing pattern
    const mixer = '5MIXERaddressForTestingMixingPatterns1234567890';
    const mixerClients = [
      '5HIGHriskAddressForPatternTesting123456789ABCDEF',
      '5BULK00001AddressForTestingBulkOps',
      '5BULK00002AddressForTestingBulkOps'
    ];
    
    // Deposits to mixer
    for (const client of mixerClients) {
      transfers.push({
        from_address: client,
        to_address: mixer,
        amount: Math.floor(Math.random() * 10000000000000).toString(),
        block_number: Math.floor(Math.random() * 100000) + 1100000,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    
    // Withdrawals from mixer
    for (const client of mixerClients) {
      transfers.push({
        from_address: mixer,
        to_address: client,
        amount: Math.floor(Math.random() * 9000000000000).toString(),
        block_number: Math.floor(Math.random() * 100000) + 1200000,
        timestamp: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    
    // Create rapid transfer pattern
    const rapidFrom = '5HIGHriskAddressForPatternTesting123456789ABCDEF';
    const rapidTo = '5MONITORaddressForRealtimeTestingUpdates123456';
    
    for (let i = 0; i < 20; i++) {
      transfers.push({
        from_address: rapidFrom,
        to_address: rapidTo,
        amount: '100000000000',
        block_number: 1300000 + i,
        timestamp: new Date(Date.now() - 60 * 60 * 1000 + i * 60 * 1000).toISOString() // 20 transfers in 20 minutes
      });
    }
    
    // Create exchange patterns
    const exchangeHot = '5EXCHANGEaddress1ForTestingExchangePatterns123';
    const exchangeCold = '5EXCHANGEaddress2ForTestingExchangePatterns456';
    
    // Hot to cold transfers
    for (let i = 0; i < 5; i++) {
      transfers.push({
        from_address: exchangeHot,
        to_address: exchangeCold,
        amount: '100000000000000',
        block_number: 1400000 + i * 10000,
        timestamp: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    
    // Random transfers for graph complexity
    const allAddresses = [
      '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
      '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw'
    ];
    
    for (let i = 0; i < 50; i++) {
      const from = allAddresses[Math.floor(Math.random() * allAddresses.length)];
      const to = allAddresses[Math.floor(Math.random() * allAddresses.length)];
      
      if (from !== to) {
        transfers.push({
          from_address: from,
          to_address: to,
          amount: Math.floor(Math.random() * 1000000000000).toString(),
          block_number: Math.floor(Math.random() * 500000) + 1500000,
          timestamp: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString()
        });
      }
    }

    const insert = this.db.prepare(`
      INSERT INTO transfers (
        from_address, to_address, amount, block_number, timestamp
      ) VALUES (
        @from_address, @to_address, @amount, @block_number, @timestamp
      )
    `);

    const insertMany = this.db.transaction((transfers) => {
      for (const transfer of transfers) {
        insert.run(transfer);
      }
    });

    insertMany(transfers);
    console.log(`✅ Generated ${transfers.length} test transfers`);
  }

  generatePatterns() {
    console.log('🔍 Generating test patterns...');
    
    const patterns = [
      {
        pattern_type: 'circular_transfer',
        addresses: JSON.stringify([
          '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
          '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'
        ]),
        risk_score: 0.8,
        description: 'Circular transfer pattern detected',
        metadata: JSON.stringify({
          cycle_count: 3,
          total_volume: '3000000000000',
          time_span: '3 days'
        })
      },
      {
        pattern_type: 'mixing_service',
        addresses: JSON.stringify([
          '5MIXERaddressForTestingMixingPatterns1234567890',
          '5HIGHriskAddressForPatternTesting123456789ABCDEF'
        ]),
        risk_score: 0.9,
        description: 'Potential mixing service activity',
        metadata: JSON.stringify({
          deposit_count: 10,
          withdrawal_count: 8,
          obfuscation_level: 'high'
        })
      },
      {
        pattern_type: 'rapid_transfer',
        addresses: JSON.stringify([
          '5HIGHriskAddressForPatternTesting123456789ABCDEF',
          '5MONITORaddressForRealtimeTestingUpdates123456'
        ]),
        risk_score: 0.7,
        description: 'Rapid transfer sequence detected',
        metadata: JSON.stringify({
          transfer_count: 20,
          time_window: '20 minutes',
          average_interval: '1 minute'
        })
      },
      {
        pattern_type: 'exchange_consolidation',
        addresses: JSON.stringify([
          '5EXCHANGEaddress1ForTestingExchangePatterns123',
          '5EXCHANGEaddress2ForTestingExchangePatterns456'
        ]),
        risk_score: 0.3,
        description: 'Exchange consolidation pattern',
        metadata: JSON.stringify({
          consolidation_count: 5,
          total_consolidated: '500000000000000',
          pattern_confidence: 0.95
        })
      }
    ];

    const insert = this.db.prepare(`
      INSERT INTO patterns (
        pattern_type, addresses, risk_score, description, metadata,
        detected_at, created_at
      ) VALUES (
        @pattern_type, @addresses, @risk_score, @description, @metadata,
        datetime('now'), datetime('now')
      )
    `);

    const insertMany = this.db.transaction((patterns) => {
      for (const pattern of patterns) {
        insert.run(pattern);
      }
    });

    insertMany(patterns);
    console.log(`✅ Generated ${patterns.length} test patterns`);
  }

  generateInvestigations() {
    console.log('🔎 Generating test investigations...');
    
    const investigations = [
      {
        name: 'High Risk Address Investigation',
        description: 'Investigation of suspicious mixing activity',
        status: 'active',
        addresses: JSON.stringify([
          '5HIGHriskAddressForPatternTesting123456789ABCDEF',
          '5MIXERaddressForTestingMixingPatterns1234567890'
        ]),
        findings: JSON.stringify({
          risk_level: 'high',
          patterns_found: ['mixing_service', 'rapid_transfer'],
          total_volume_analyzed: '150000000000000',
          recommendation: 'Flag for further review'
        }),
        metadata: JSON.stringify({
          investigator: 'test_user',
          tags: ['mixer', 'high-risk', 'monitoring']
        })
      },
      {
        name: 'Exchange Activity Analysis',
        description: 'Routine analysis of exchange wallet movements',
        status: 'completed',
        addresses: JSON.stringify([
          '5EXCHANGEaddress1ForTestingExchangePatterns123',
          '5EXCHANGEaddress2ForTestingExchangePatterns456'
        ]),
        findings: JSON.stringify({
          risk_level: 'low',
          patterns_found: ['exchange_consolidation'],
          total_volume_analyzed: '6000000000000000',
          recommendation: 'Normal exchange operations'
        }),
        metadata: JSON.stringify({
          investigator: 'test_user',
          tags: ['exchange', 'routine', 'low-risk']
        })
      },
      {
        name: 'Circular Transfer Investigation',
        description: 'Detected circular transfer pattern requiring investigation',
        status: 'pending',
        addresses: JSON.stringify([
          '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
          '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'
        ]),
        findings: JSON.stringify({
          risk_level: 'medium',
          patterns_found: ['circular_transfer'],
          total_volume_analyzed: '3000000000000',
          recommendation: 'Monitor for additional activity'
        }),
        metadata: JSON.stringify({
          investigator: 'test_user',
          tags: ['circular', 'monitoring', 'medium-risk']
        })
      }
    ];

    const insert = this.db.prepare(`
      INSERT INTO investigations (
        name, description, status, addresses, findings, metadata,
        created_at, updated_at
      ) VALUES (
        @name, @description, @status, @addresses, @findings, @metadata,
        datetime('now'), datetime('now')
      )
    `);

    const insertMany = this.db.transaction((investigations) => {
      for (const investigation of investigations) {
        insert.run(investigation);
      }
    });

    insertMany(investigations);
    console.log(`✅ Generated ${investigations.length} test investigations`);
  }

  generateRiskScores() {
    console.log('⚠️  Generating risk scores...');
    
    // Update risk scores based on patterns and behavior
    const updateRiskScore = this.db.prepare(`
      UPDATE accounts 
      SET risk_score = @risk_score 
      WHERE address = @address
    `);

    const riskScores = [
      { address: '5HIGHriskAddressForPatternTesting123456789ABCDEF', risk_score: 0.9 },
      { address: '5MIXERaddressForTestingMixingPatterns1234567890', risk_score: 0.85 },
      { address: '5MONITORaddressForRealtimeTestingUpdates123456', risk_score: 0.6 },
      { address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', risk_score: 0.2 },
      { address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', risk_score: 0.25 },
      { address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y', risk_score: 0.3 }
    ];

    const updateMany = this.db.transaction((scores) => {
      for (const score of scores) {
        updateRiskScore.run(score);
      }
    });

    updateMany(riskScores);
    console.log(`✅ Updated ${riskScores.length} risk scores`);
  }

  generateHistoricalData() {
    console.log('📈 Generating historical data...');
    
    // Generate historical snapshots for time-based analysis
    const addresses = [
      '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      '5HIGHriskAddressForPatternTesting123456789ABCDEF',
      '5EXCHANGEaddress1ForTestingExchangePatterns123'
    ];
    
    const snapshots = [];
    
    for (const address of addresses) {
      // Generate 30 days of historical data
      for (let day = 0; day < 30; day++) {
        const timestamp = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
        const baseBalance = Math.floor(Math.random() * 1000000000000);
        
        snapshots.push({
          address: address,
          timestamp: timestamp.toISOString(),
          balance: (baseBalance * (1 + Math.random() * 0.1)).toString(),
          transfer_count: Math.floor(Math.random() * 50),
          volume: (baseBalance * Math.random() * 10).toString(),
          risk_score: Math.random() * 0.5 + 0.2
        });
      }
    }
    
    // Create historical data table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        balance TEXT,
        transfer_count INTEGER,
        volume TEXT,
        risk_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const insert = this.db.prepare(`
      INSERT INTO account_history (
        address, timestamp, balance, transfer_count, volume, risk_score
      ) VALUES (
        @address, @timestamp, @balance, @transfer_count, @volume, @risk_score
      )
    `);
    
    const insertMany = this.db.transaction((snapshots) => {
      for (const snapshot of snapshots) {
        insert.run(snapshot);
      }
    });
    
    insertMany(snapshots);
    console.log(`✅ Generated ${snapshots.length} historical data points`);
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new TestDataSetup();
  setup.setup().catch(console.error);
}

module.exports = TestDataSetup;