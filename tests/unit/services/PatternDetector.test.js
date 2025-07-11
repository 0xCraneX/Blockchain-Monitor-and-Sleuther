import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternDetector } from '../../../src/services/PatternDetector.js';
import { DatabaseService } from '../../../src/services/DatabaseService.js';
import { createTestDatabase, cleanupTestDatabase } from '../../utils/database-test-helper.js';

describe('PatternDetector', () => {
  let patternDetector;
  let databaseService;
  let db;

  beforeEach(async () => {
    // Create test database
    db = await createTestDatabase();
    databaseService = new DatabaseService();
    databaseService.db = db;
    
    // Initialize PatternDetector
    patternDetector = new PatternDetector(databaseService);

    // Insert test data
    await insertTestData(db);
  });

  afterEach(async () => {
    if (db) {
      await cleanupTestDatabase(db);
    }
  });

  describe('constructor', () => {
    it('should initialize with database service', () => {
      expect(patternDetector.db).toBe(db);
      expect(patternDetector.databaseService).toBe(databaseService);
      expect(patternDetector.patternTypes).toBeDefined();
    });

    it('should handle missing database service', () => {
      const detector = new PatternDetector(null);
      expect(detector.db).toBeNull();
      expect(detector.databaseService).toBeNull();
    });
  });

  describe('detectRapidMovement', () => {
    it('should detect rapid sequential transfers', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Insert rapid movement test data
      insertRapidMovementData(db, testAddress);
      
      const result = await patternDetector.detectRapidMovement(testAddress, 300);
      
      expect(result.patternType).toBe('RAPID_MOVEMENT');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.evidence).toHaveLength.greaterThan(0);
      expect(result.severity).toMatch(/^(low|medium|high)$/);
      expect(result.metadata.address).toBe(testAddress);
      expect(result.metadata.timeWindow).toBe(300);
    });

    it('should return low confidence for no rapid movement', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const result = await patternDetector.detectRapidMovement(testAddress, 300);
      
      expect(result.patternType).toBe('RAPID_MOVEMENT');
      expect(result.confidence).toBe(0);
      expect(result.evidence).toHaveLength(0);
      expect(result.severity).toBe('low');
    });

    it('should handle different time windows', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      insertRapidMovementData(db, testAddress);
      
      const result60 = await patternDetector.detectRapidMovement(testAddress, 60);
      const result600 = await patternDetector.detectRapidMovement(testAddress, 600);
      
      expect(result600.confidence).toBeGreaterThanOrEqual(result60.confidence);
    });

    it('should throw error when database not initialized', async () => {
      const detector = new PatternDetector(null);
      
      await expect(detector.detectRapidMovement('test')).rejects.toThrow('Database not initialized');
    });
  });

  describe('detectCircularFlow', () => {
    it('should detect circular money flows', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Insert circular flow test data
      insertCircularFlowData(db, testAddress);
      
      const result = await patternDetector.detectCircularFlow(testAddress, 5);
      
      expect(result.patternType).toBe('CIRCULAR_FLOW');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.evidence).toHaveLength.greaterThan(0);
      expect(result.severity).toMatch(/^(low|medium|high)$/);
      expect(result.metadata.address).toBe(testAddress);
      expect(result.metadata.maxDepth).toBe(5);
    });

    it('should return low confidence for no circular flows', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const result = await patternDetector.detectCircularFlow(testAddress, 5);
      
      expect(result.patternType).toBe('CIRCULAR_FLOW');
      expect(result.confidence).toBe(0);
      expect(result.evidence).toHaveLength(0);
      expect(result.severity).toBe('low');
    });

    it('should boost confidence for shorter circular paths', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      insertCircularFlowData(db, testAddress, 2); // Short path
      
      const result = await patternDetector.detectCircularFlow(testAddress, 5);
      
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('detectLayering', () => {
    it('should detect layering patterns', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Insert layering test data
      insertLayeringData(db, testAddress);
      
      const result = await patternDetector.detectLayering(testAddress);
      
      expect(result.patternType).toBe('LAYERING');
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.evidence).toHaveLength.greaterThan(0);
      expect(result.severity).toMatch(/^(low|medium|high)$/);
      expect(result.metadata.address).toBe(testAddress);
    });

    it('should return low confidence for no layering patterns', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const result = await patternDetector.detectLayering(testAddress);
      
      expect(result.patternType).toBe('LAYERING');
      expect(result.confidence).toBe(0);
      expect(result.evidence).toHaveLength(0);
      expect(result.severity).toBe('low');
    });
  });

  describe('detectMixingPatterns', () => {
    it('should detect mixing patterns with high-degree nodes', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Insert mixing patterns test data
      insertMixingPatternsData(db, testAddress);
      
      const result = await patternDetector.detectMixingPatterns(testAddress);
      
      expect(result.patternType).toBe('MIXING_PATTERNS');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.evidence).toHaveLength.greaterThan(0);
      expect(result.severity).toMatch(/^(low|medium|high)$/);
      expect(result.metadata.address).toBe(testAddress);
    });

    it('should return low confidence for no mixing patterns', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const result = await patternDetector.detectMixingPatterns(testAddress);
      
      expect(result.patternType).toBe('MIXING_PATTERNS');
      expect(result.confidence).toBe(0);
      expect(result.evidence).toHaveLength(0);
      expect(result.severity).toBe('low');
    });

    it('should boost confidence for connections to risky nodes', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      insertMixingPatternsData(db, testAddress, true); // High risk nodes
      
      const result = await patternDetector.detectMixingPatterns(testAddress);
      
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('detectUnusualTiming', () => {
    it('should detect unusual timing patterns', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Insert unusual timing test data
      insertUnusualTimingData(db, testAddress);
      
      const result = await patternDetector.detectUnusualTiming(testAddress);
      
      expect(result.patternType).toBe('UNUSUAL_TIMING');
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.evidence.unusualTransfers).toHaveLength.greaterThan(0);
      expect(result.evidence.statistics).toBeDefined();
      expect(result.severity).toMatch(/^(low|medium)$/); // Unusual timing max is medium
      expect(result.metadata.address).toBe(testAddress);
    });

    it('should return low confidence for normal timing', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      insertNormalTimingData(db, testAddress);
      
      const result = await patternDetector.detectUnusualTiming(testAddress);
      
      expect(result.patternType).toBe('UNUSUAL_TIMING');
      expect(result.confidence).toBe(0);
      expect(result.evidence.unusualTransfers).toHaveLength(0);
      expect(result.severity).toBe('low');
    });
  });

  describe('detectRoundNumbers', () => {
    it('should detect round number patterns', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Insert round numbers test data
      insertRoundNumbersData(db, testAddress);
      
      const result = await patternDetector.detectRoundNumbers(testAddress);
      
      expect(result.patternType).toBe('ROUND_NUMBERS');
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.evidence.roundTransfers).toHaveLength.greaterThan(0);
      expect(result.evidence.statistics).toBeDefined();
      expect(result.severity).toMatch(/^(low|medium)$/); // Round numbers max is medium
      expect(result.metadata.address).toBe(testAddress);
    });

    it('should return low confidence for no round numbers', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      insertNonRoundData(db, testAddress);
      
      const result = await patternDetector.detectRoundNumbers(testAddress);
      
      expect(result.patternType).toBe('ROUND_NUMBERS');
      expect(result.confidence).toBe(0);
      expect(result.evidence.roundTransfers).toHaveLength(0);
      expect(result.severity).toBe('low');
    });

    it('should classify round number types correctly', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      insertRoundNumbersData(db, testAddress);
      
      const result = await patternDetector.detectRoundNumbers(testAddress);
      
      const perfectRound = result.evidence.roundTransfers.filter(t => t.roundType === 'perfect_round');
      const semiRound = result.evidence.roundTransfers.filter(t => t.roundType === 'semi_round');
      
      expect(perfectRound.length + semiRound.length).toBe(result.evidence.roundTransfers.length);
    });
  });

  describe('analyzeTransferPatterns', () => {
    it('should analyze transfer patterns comprehensively', () => {
      const transfers = createTestTransfers();
      
      const result = patternDetector.analyzeTransferPatterns(transfers);
      
      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.severity).toMatch(/^(low|medium|high)$/);
      expect(result.analysis.totalTransfers).toBe(transfers.length);
      expect(result.analysis.breakdown).toBeDefined();
    });

    it('should handle empty transfer array', () => {
      const result = patternDetector.analyzeTransferPatterns([]);
      
      expect(result.patterns).toHaveLength(0);
      expect(result.confidence).toBe(0);
      expect(result.severity).toBe('low');
      expect(result.analysis.totalTransfers).toBe(0);
    });

    it('should handle non-array input', () => {
      const result = patternDetector.analyzeTransferPatterns(null);
      
      expect(result.patterns).toHaveLength(0);
      expect(result.confidence).toBe(0);
      expect(result.severity).toBe('low');
      expect(result.analysis.totalTransfers).toBe(0);
    });

    it('should detect volume patterns', () => {
      const transfers = createVolumeSpikesTransfers();
      
      const result = patternDetector.analyzeTransferPatterns(transfers);
      
      const volumePattern = result.patterns.find(p => p.type === 'volume_patterns');
      expect(volumePattern).toBeDefined();
      expect(volumePattern.suspicious).toBe(true);
    });

    it('should detect temporal patterns', () => {
      const transfers = createRegularTimingTransfers();
      
      const result = patternDetector.analyzeTransferPatterns(transfers);
      
      const temporalPattern = result.patterns.find(p => p.type === 'temporal_patterns');
      expect(temporalPattern).toBeDefined();
      expect(temporalPattern.suspicious).toBe(true);
    });

    it('should detect counterparty patterns', () => {
      const transfers = createLimitedCounterpartyTransfers();
      
      const result = patternDetector.analyzeTransferPatterns(transfers);
      
      const counterpartyPattern = result.patterns.find(p => p.type === 'counterparty_patterns');
      expect(counterpartyPattern).toBeDefined();
      expect(counterpartyPattern.suspicious).toBe(true);
    });

    it('should detect frequency patterns', () => {
      const transfers = createHighFrequencyTransfers();
      
      const result = patternDetector.analyzeTransferPatterns(transfers);
      
      const frequencyPattern = result.patterns.find(p => p.type === 'frequency_patterns');
      expect(frequencyPattern).toBeDefined();
      expect(frequencyPattern.suspicious).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('should calculate uniformity correctly', () => {
      // Test with uniform values
      const uniformValues = [100, 100, 100, 100];
      const uniformity = patternDetector._calculateUniformity(uniformValues);
      expect(uniformity).toBeCloseTo(1, 2);

      // Test with varied values
      const variedValues = [100, 200, 50, 300];
      const variety = patternDetector._calculateUniformity(variedValues);
      expect(variety).toBeLessThan(0.5);
    });

    it('should create result with proper format', () => {
      const result = patternDetector._createResult(
        'TEST_PATTERN', 
        0.7, 
        ['evidence1', 'evidence2'], 
        'medium',
        { testMetadata: true }
      );
      
      expect(result.patternType).toBe('TEST_PATTERN');
      expect(result.confidence).toBe(0.7);
      expect(result.evidence).toEqual(['evidence1', 'evidence2']);
      expect(result.severity).toBe('medium');
      expect(result.metadata.detectedAt).toBeDefined();
      expect(result.metadata.testMetadata).toBe(true);
    });

    it('should clamp confidence values', () => {
      const lowResult = patternDetector._createResult('TEST', -0.5, [], 'low', {});
      const highResult = patternDetector._createResult('TEST', 1.5, [], 'high', {});
      
      expect(lowResult.confidence).toBe(0);
      expect(highResult.confidence).toBe(1);
    });
  });
});

// Test data insertion helpers

async function insertTestData(db) {
  // Insert test accounts
  const accounts = [
    {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      identity_display: 'Test Account 1',
      balance: '1000000000000000'
    },
    {
      address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      identity_display: 'Test Account 2',
      balance: '500000000000000'
    },
    {
      address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      identity_display: 'Test Account 3',
      balance: '2000000000000000'
    },
    {
      address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      identity_display: 'High Degree Node',
      balance: '10000000000000000'
    }
  ];

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (address, identity_display, balance)
    VALUES (?, ?, ?)
  `);

  accounts.forEach(account => {
    insertAccount.run(account.address, account.identity_display, account.balance);
  });
}

function insertRapidMovementData(db, address) {
  const now = new Date();
  const transfers = [
    {
      hash: 'rapid1',
      from_address: address,
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1000000000000',
      timestamp: new Date(now.getTime() - 60000).toISOString(), // 1 minute ago
      success: 1
    },
    {
      hash: 'rapid2',
      from_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '950000000000',
      timestamp: new Date(now.getTime() - 30000).toISOString(), // 30 seconds ago
      success: 1
    }
  ];

  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO transfers (hash, from_address, to_address, value, timestamp, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  transfers.forEach(transfer => {
    insertTransfer.run(
      transfer.hash,
      transfer.from_address,
      transfer.to_address,
      transfer.value,
      transfer.timestamp,
      transfer.success
    );
  });
}

function insertCircularFlowData(db, address, pathLength = 3) {
  // Create account relationships for circular flow
  const relationships = [];
  
  if (pathLength === 2) {
    relationships.push(
      {
        from_address: address,
        to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        total_volume: '5000000000000',
        transfer_count: 3
      },
      {
        from_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        to_address: address,
        total_volume: '4500000000000',
        transfer_count: 2
      }
    );
  } else {
    relationships.push(
      {
        from_address: address,
        to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        total_volume: '5000000000000',
        transfer_count: 3
      },
      {
        from_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
        total_volume: '4500000000000',
        transfer_count: 2
      },
      {
        from_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
        to_address: address,
        total_volume: '4000000000000',
        transfer_count: 1
      }
    );
  }

  const insertRelationship = db.prepare(`
    INSERT OR IGNORE INTO account_relationships (from_address, to_address, total_volume, transfer_count)
    VALUES (?, ?, ?, ?)
  `);

  relationships.forEach(rel => {
    insertRelationship.run(rel.from_address, rel.to_address, rel.total_volume, rel.transfer_count);
  });
}

function insertLayeringData(db, address) {
  const relationships = [
    {
      from_address: address,
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      total_volume: '10000000000000',
      transfer_count: 1
    },
    {
      from_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      total_volume: '9800000000000',
      transfer_count: 1
    },
    {
      from_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      to_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      total_volume: '9600000000000',
      transfer_count: 1
    }
  ];

  const insertRelationship = db.prepare(`
    INSERT OR IGNORE INTO account_relationships (from_address, to_address, total_volume, transfer_count)
    VALUES (?, ?, ?, ?)
  `);

  relationships.forEach(rel => {
    insertRelationship.run(rel.from_address, rel.to_address, rel.total_volume, rel.transfer_count);
  });
}

function insertMixingPatternsData(db, address, highRisk = false) {
  // Insert high-degree node metrics
  const insertNodeMetrics = db.prepare(`
    INSERT OR IGNORE INTO node_metrics (address, degree, risk_score, node_type)
    VALUES (?, ?, ?, ?)
  `);

  insertNodeMetrics.run(
    '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
    150,
    highRisk ? 80 : 30,
    'mixer'
  );

  // Insert relationship with high-degree node
  const insertRelationship = db.prepare(`
    INSERT OR IGNORE INTO account_relationships (from_address, to_address, total_volume, transfer_count)
    VALUES (?, ?, ?, ?)
  `);

  insertRelationship.run(
    address,
    '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
    '5000000000000',
    5
  );

  if (highRisk) {
    // Insert suspicious patterns for the connected node
    const insertPattern = db.prepare(`
      INSERT OR IGNORE INTO patterns (address, pattern_type, confidence, false_positive)
      VALUES (?, ?, ?, ?)
    `);

    insertPattern.run('5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw', 'LAYERING', 0.8, 0);
    insertPattern.run('5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw', 'CIRCULAR_FLOW', 0.7, 0);
  }
}

function insertUnusualTimingData(db, address) {
  const transfers = [
    {
      hash: 'night1',
      from_address: address,
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1000000000000',
      timestamp: '2024-01-15T02:30:00Z', // 2:30 AM
      success: 1
    },
    {
      hash: 'night2',
      from_address: address,
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '2000000000000',
      timestamp: '2024-01-15T23:45:00Z', // 11:45 PM
      success: 1
    },
    {
      hash: 'weekend1',
      from_address: address,
      to_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      value: '1500000000000',
      timestamp: '2024-01-14T15:00:00Z', // Sunday 3 PM
      success: 1
    }
  ];

  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO transfers (hash, from_address, to_address, value, timestamp, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  transfers.forEach(transfer => {
    insertTransfer.run(
      transfer.hash,
      transfer.from_address,
      transfer.to_address,
      transfer.value,
      transfer.timestamp,
      transfer.success
    );
  });
}

function insertNormalTimingData(db, address) {
  const transfers = [
    {
      hash: 'normal1',
      from_address: address,
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1000000000000',
      timestamp: '2024-01-15T10:30:00Z', // 10:30 AM Monday
      success: 1
    },
    {
      hash: 'normal2',
      from_address: address,
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '2000000000000',
      timestamp: '2024-01-16T14:15:00Z', // 2:15 PM Tuesday
      success: 1
    }
  ];

  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO transfers (hash, from_address, to_address, value, timestamp, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  transfers.forEach(transfer => {
    insertTransfer.run(
      transfer.hash,
      transfer.from_address,
      transfer.to_address,
      transfer.value,
      transfer.timestamp,
      transfer.success
    );
  });
}

function insertRoundNumbersData(db, address) {
  const transfers = [
    {
      hash: 'round1',
      from_address: address,
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '10000000000000', // 10 DOT - perfect round
      timestamp: '2024-01-15T10:30:00Z',
      success: 1
    },
    {
      hash: 'round2',
      from_address: address,
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '15000000000000', // 15 DOT - semi round
      timestamp: '2024-01-16T14:15:00Z',
      success: 1
    },
    {
      hash: 'round3',
      from_address: address,
      to_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      value: '5000000000000', // 5 DOT - perfect round
      timestamp: '2024-01-17T09:00:00Z',
      success: 1
    }
  ];

  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO transfers (hash, from_address, to_address, value, timestamp, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  transfers.forEach(transfer => {
    insertTransfer.run(
      transfer.hash,
      transfer.from_address,
      transfer.to_address,
      transfer.value,
      transfer.timestamp,
      transfer.success
    );
  });
}

function insertNonRoundData(db, address) {
  const transfers = [
    {
      hash: 'nonround1',
      from_address: address,
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1234567890123', // Non-round
      timestamp: '2024-01-15T10:30:00Z',
      success: 1
    },
    {
      hash: 'nonround2',
      from_address: address,
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '9876543210987', // Non-round
      timestamp: '2024-01-16T14:15:00Z',
      success: 1
    }
  ];

  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO transfers (hash, from_address, to_address, value, timestamp, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  transfers.forEach(transfer => {
    insertTransfer.run(
      transfer.hash,
      transfer.from_address,
      transfer.to_address,
      transfer.value,
      transfer.timestamp,
      transfer.success
    );
  });
}

// Transfer pattern test data creators

function createTestTransfers() {
  return [
    {
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1000000000000',
      timestamp: '2024-01-15T10:00:00Z'
    },
    {
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '2000000000000',
      timestamp: '2024-01-15T11:00:00Z'
    },
    {
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
      value: '1500000000000',
      timestamp: '2024-01-15T12:00:00Z'
    }
  ];
}

function createVolumeSpikesTransfers() {
  return [
    { value: '1000000000000', timestamp: '2024-01-15T10:00:00Z' },
    { value: '1100000000000', timestamp: '2024-01-15T11:00:00Z' },
    { value: '15000000000000', timestamp: '2024-01-15T12:00:00Z' }, // Spike
    { value: '900000000000', timestamp: '2024-01-15T13:00:00Z' },
    { value: '1200000000000', timestamp: '2024-01-15T14:00:00Z' }
  ];
}

function createRegularTimingTransfers() {
  const transfers = [];
  const baseTime = new Date('2024-01-15T10:00:00Z');
  
  for (let i = 0; i < 10; i++) {
    transfers.push({
      value: '1000000000000',
      timestamp: new Date(baseTime.getTime() + i * 60 * 60 * 1000).toISOString() // Every hour
    });
  }
  
  return transfers;
}

function createLimitedCounterpartyTransfers() {
  const sameCounterparty = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
  const transfers = [];
  
  for (let i = 0; i < 15; i++) {
    transfers.push({
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: sameCounterparty,
      value: '1000000000000',
      timestamp: `2024-01-15T${10 + i}:00:00Z`
    });
  }
  
  return transfers;
}

function createHighFrequencyTransfers() {
  const transfers = [];
  const baseTime = new Date('2024-01-15T10:00:00Z');
  
  for (let i = 0; i < 200; i++) {
    transfers.push({
      value: '1000000000000',
      timestamp: new Date(baseTime.getTime() + i * 10 * 60 * 1000).toISOString() // Every 10 minutes
    });
  }
  
  return transfers;
}