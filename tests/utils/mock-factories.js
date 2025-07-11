/**
 * Mock data factories for testing
 */

import { randomBytes } from 'crypto';

/**
 * Factory for creating mock accounts
 */
export const AccountFactory = {
  create(overrides = {}) {
    const defaultAccount = {
      address: this.generateAddress(),
      identity_display: `Account ${Math.random().toString(36).substr(2, 9)}`,
      identity_legal: null,
      identity_web: null,
      identity_email: null,
      identity_twitter: null,
      identity_riot: null,
      identity_verified: false,
      balance: String(Math.floor(Math.random() * 1000 + 1) * 1000000000000),
      total_transfers_in: Math.floor(Math.random() * 100),
      total_transfers_out: Math.floor(Math.random() * 100),
      volume_in: String(Math.floor(Math.random() * 10000) * 1000000000000),
      volume_out: String(Math.floor(Math.random() * 10000) * 1000000000000),
      first_seen_block: Math.floor(Math.random() * 1000000) + 1000000,
      last_seen_block: Math.floor(Math.random() * 1000000) + 2000000,
      risk_score: Math.random() * 0.5,
      tags: JSON.stringify([]),
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    return { ...defaultAccount, ...overrides };
  },
  
  createBatch(count, overrides = {}) {
    return Array(count).fill(null).map((_, i) => 
      this.create({ 
        identity_display: `Account ${i + 1}`,
        ...overrides 
      })
    );
  },
  
  generateAddress() {
    const prefix = '5';
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = prefix;
    
    for (let i = 0; i < 47; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    
    return address;
  },
  
  createWithIdentity(identity = {}) {
    return this.create({
      identity_display: identity.display || 'Verified Account',
      identity_legal: identity.legal || 'Legal Name',
      identity_web: identity.web || 'https://example.com',
      identity_email: identity.email || 'account@example.com',
      identity_twitter: identity.twitter || '@account',
      identity_verified: true
    });
  },
  
  createHighRisk() {
    return this.create({
      risk_score: 0.7 + Math.random() * 0.3,
      tags: JSON.stringify(['high-risk', 'monitor']),
      notes: 'Flagged for suspicious activity'
    });
  },
  
  createWhale() {
    return this.create({
      balance: String(Math.floor(Math.random() * 1000000 + 100000) * 1000000000000),
      volume_in: String(Math.floor(Math.random() * 10000000) * 1000000000000),
      volume_out: String(Math.floor(Math.random() * 10000000) * 1000000000000),
      total_transfers_in: Math.floor(Math.random() * 1000) + 100,
      total_transfers_out: Math.floor(Math.random() * 1000) + 100
    });
  }
};

/**
 * Factory for creating mock transfers
 */
export const TransferFactory = {
  create(overrides = {}) {
    const defaultTransfer = {
      hash: `0x${randomBytes(32).toString('hex')}`,
      block_number: Math.floor(Math.random() * 1000000) + 2000000,
      timestamp: this.randomTimestamp(),
      from_address: AccountFactory.generateAddress(),
      to_address: AccountFactory.generateAddress(),
      value: String(Math.floor(Math.random() * 100 + 1) * 1000000000000),
      fee: '125000000',
      success: true,
      method: 'transfer',
      section: 'balances',
      created_at: new Date().toISOString()
    };
    
    return { ...defaultTransfer, ...overrides };
  },
  
  createBatch(count, overrides = {}) {
    return Array(count).fill(null).map(() => this.create(overrides));
  },
  
  randomTimestamp(daysAgo = 30) {
    const now = new Date();
    const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const random = new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
    return random.toISOString();
  },
  
  createBetween(from, to, overrides = {}) {
    return this.create({
      from_address: from,
      to_address: to,
      ...overrides
    });
  },
  
  createLargeTransfer() {
    return this.create({
      value: String(Math.floor(Math.random() * 10000 + 1000) * 1000000000000),
      fee: String(Math.floor(Math.random() * 10 + 1) * 125000000)
    });
  },
  
  createFailedTransfer() {
    return this.create({
      success: false,
      method: 'transferKeepAlive',
      notes: 'Insufficient balance'
    });
  },
  
  createRapidSequence(from, to, count = 5) {
    const baseTime = new Date();
    return Array(count).fill(null).map((_, i) => {
      const time = new Date(baseTime);
      time.setMinutes(time.getMinutes() + i);
      
      return this.create({
        from_address: from,
        to_address: to,
        timestamp: time.toISOString(),
        block_number: 3000000 + i
      });
    });
  }
};

/**
 * Factory for creating mock relationships
 */
export const RelationshipFactory = {
  create(overrides = {}) {
    const transferCount = Math.floor(Math.random() * 50) + 1;
    const avgTransferValue = Math.floor(Math.random() * 100 + 1) * 1000000000000;
    
    const defaultRelationship = {
      from_address: AccountFactory.generateAddress(),
      to_address: AccountFactory.generateAddress(),
      transfer_count: transferCount,
      total_volume: String(transferCount * avgTransferValue),
      first_transfer_block: Math.floor(Math.random() * 1000000) + 1000000,
      last_transfer_block: Math.floor(Math.random() * 1000000) + 2000000,
      relationship_type: 'direct',
      volume_score: Math.random() * 100,
      frequency_score: Math.random() * 100,
      temporal_score: Math.random() * 100,
      network_score: Math.random() * 100,
      risk_score: Math.random() * 50,
      total_score: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Calculate total score
    const scores = {
      volume: defaultRelationship.volume_score,
      frequency: defaultRelationship.frequency_score,
      temporal: defaultRelationship.temporal_score,
      network: defaultRelationship.network_score,
      risk: defaultRelationship.risk_score
    };
    
    defaultRelationship.total_score = this.calculateTotalScore(scores);
    
    const relationship = { ...defaultRelationship, ...overrides };
    
    // Recalculate if scores were overridden
    if (overrides.volume_score || overrides.frequency_score || 
        overrides.temporal_score || overrides.network_score || overrides.risk_score) {
      relationship.total_score = this.calculateTotalScore({
        volume: relationship.volume_score,
        frequency: relationship.frequency_score,
        temporal: relationship.temporal_score,
        network: relationship.network_score,
        risk: relationship.risk_score
      });
    }
    
    return relationship;
  },
  
  calculateTotalScore(scores) {
    const baseScore = (
      scores.volume * 0.25 +
      scores.frequency * 0.25 +
      scores.temporal * 0.20 +
      scores.network * 0.30
    );
    
    return baseScore * (1 - scores.risk / 200);
  },
  
  createStrong() {
    return this.create({
      transfer_count: Math.floor(Math.random() * 100) + 50,
      total_volume: String(Math.floor(Math.random() * 10000 + 1000) * 1000000000000),
      volume_score: 80 + Math.random() * 20,
      frequency_score: 80 + Math.random() * 20,
      temporal_score: 70 + Math.random() * 30,
      network_score: 70 + Math.random() * 30,
      risk_score: Math.random() * 10
    });
  },
  
  createWeak() {
    return this.create({
      transfer_count: Math.floor(Math.random() * 5) + 1,
      total_volume: String(Math.floor(Math.random() * 10 + 1) * 1000000000000),
      volume_score: Math.random() * 30,
      frequency_score: Math.random() * 30,
      temporal_score: Math.random() * 40,
      network_score: Math.random() * 40,
      risk_score: Math.random() * 20
    });
  },
  
  createSuspicious() {
    return this.create({
      risk_score: 60 + Math.random() * 40,
      volume_score: 70 + Math.random() * 30,
      frequency_score: 80 + Math.random() * 20,
      temporal_score: 20 + Math.random() * 30,
      network_score: 10 + Math.random() * 20
    });
  }
};

/**
 * Factory for creating mock patterns
 */
export const PatternFactory = {
  create(overrides = {}) {
    const patterns = ['rapid_movement', 'circular_flow', 'mixing', 'layering', 'structuring'];
    
    const defaultPattern = {
      address: AccountFactory.generateAddress(),
      pattern_type: patterns[Math.floor(Math.random() * patterns.length)],
      confidence: 0.5 + Math.random() * 0.5,
      details: JSON.stringify({
        involvedAddresses: [AccountFactory.generateAddress(), AccountFactory.generateAddress()],
        transferCount: Math.floor(Math.random() * 20) + 5,
        timeSpan: Math.floor(Math.random() * 7) + 1,
        totalVolume: String(Math.floor(Math.random() * 1000) * 1000000000000)
      }),
      detected_at: new Date().toISOString(),
      reviewed: false,
      false_positive: false
    };
    
    return { ...defaultPattern, ...overrides };
  },
  
  createRapidMovement(address, targets) {
    return this.create({
      address,
      pattern_type: 'rapid_movement',
      confidence: 0.8 + Math.random() * 0.2,
      details: JSON.stringify({
        involvedAddresses: targets,
        transferCount: targets.length * 3,
        timeSpan: 0.1, // hours
        totalVolume: String(targets.length * 10 * 1000000000000),
        averageInterval: 2 // minutes
      })
    });
  },
  
  createCircularFlow(addresses) {
    return this.create({
      address: addresses[0],
      pattern_type: 'circular_flow',
      confidence: 0.7 + Math.random() * 0.3,
      details: JSON.stringify({
        involvedAddresses: addresses,
        cycleLength: addresses.length,
        completedCycles: Math.floor(Math.random() * 5) + 1,
        totalVolume: String(Math.floor(Math.random() * 1000) * 1000000000000),
        timeSpan: Math.floor(Math.random() * 30) + 1
      })
    });
  },
  
  createMixingPattern(mixerAddress, inputAddresses, outputAddresses) {
    return this.create({
      address: mixerAddress,
      pattern_type: 'mixing',
      confidence: 0.6 + Math.random() * 0.4,
      details: JSON.stringify({
        mixerAddress,
        inputAddresses,
        outputAddresses,
        inputCount: inputAddresses.length,
        outputCount: outputAddresses.length,
        totalInputVolume: String(inputAddresses.length * 100 * 1000000000000),
        totalOutputVolume: String(outputAddresses.length * 95 * 1000000000000),
        timeWindow: Math.floor(Math.random() * 24) + 1
      })
    });
  }
};

/**
 * Factory for creating mock investigations
 */
export const InvestigationFactory = {
  create(overrides = {}) {
    const addresses = Array(Math.floor(Math.random() * 5) + 2)
      .fill(null)
      .map(() => AccountFactory.generateAddress());
    
    const defaultInvestigation = {
      session_id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: `Investigation ${new Date().toLocaleDateString()}`,
      description: 'Analyzing suspicious transfer patterns',
      addresses: JSON.stringify(addresses),
      filters: JSON.stringify({
        minVolume: '1000000000000',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        riskThreshold: 0.5
      }),
      graph_state: JSON.stringify({
        depth: 2,
        layout: 'force-directed',
        showLabels: true,
        nodeSize: 'volume',
        edgeWidth: 'transfers'
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    return { ...defaultInvestigation, ...overrides };
  },
  
  createWithPattern(patternType) {
    const patternInvestigations = {
      money_laundering: {
        title: 'Potential Money Laundering Investigation',
        description: 'Investigating rapid movement and layering patterns',
        filters: JSON.stringify({
          patterns: ['rapid_movement', 'layering', 'structuring'],
          minRiskScore: 0.7,
          timeWindow: 7
        })
      },
      whale_tracking: {
        title: 'Whale Movement Tracking',
        description: 'Monitoring large balance accounts and their activities',
        filters: JSON.stringify({
          minBalance: '1000000000000000',
          minTransferVolume: '100000000000000',
          includeExchanges: false
        })
      },
      network_analysis: {
        title: 'Network Centrality Analysis',
        description: 'Identifying key nodes in the transaction network',
        filters: JSON.stringify({
          minConnections: 20,
          centralityThreshold: 0.8,
          includeMetrics: ['degree', 'betweenness', 'pagerank']
        })
      }
    };
    
    const pattern = patternInvestigations[patternType] || {};
    return this.create(pattern);
  }
};

/**
 * Factory for creating mock statistics
 */
export const StatisticsFactory = {
  create(overrides = {}) {
    const metrics = [
      'total_accounts',
      'total_transfers',
      'total_volume',
      'active_accounts_24h',
      'new_accounts_24h',
      'high_risk_accounts'
    ];
    
    const defaultStat = {
      metric_name: metrics[Math.floor(Math.random() * metrics.length)],
      metric_value: String(Math.floor(Math.random() * 10000) + 1000),
      metric_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };
    
    return { ...defaultStat, ...overrides };
  },
  
  createDailySummary(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    
    return [
      this.create({
        metric_name: 'total_accounts',
        metric_value: String(Math.floor(Math.random() * 1000) + 10000),
        metric_date: dateStr
      }),
      this.create({
        metric_name: 'total_transfers',
        metric_value: String(Math.floor(Math.random() * 10000) + 50000),
        metric_date: dateStr
      }),
      this.create({
        metric_name: 'total_volume',
        metric_value: String(Math.floor(Math.random() * 1000000) * 1000000000000),
        metric_date: dateStr
      }),
      this.create({
        metric_name: 'active_accounts_24h',
        metric_value: String(Math.floor(Math.random() * 500) + 500),
        metric_date: dateStr
      }),
      this.create({
        metric_name: 'new_accounts_24h',
        metric_value: String(Math.floor(Math.random() * 50) + 10),
        metric_date: dateStr
      }),
      this.create({
        metric_name: 'high_risk_accounts',
        metric_value: String(Math.floor(Math.random() * 20) + 5),
        metric_date: dateStr
      })
    ];
  }
};

/**
 * Factory for creating complete test scenarios
 */
export const ScenarioFactory = {
  createBasicNetwork(nodeCount = 10) {
    const accounts = AccountFactory.createBatch(nodeCount);
    const transfers = [];
    const relationships = [];
    
    // Create random transfers between accounts
    for (let i = 0; i < nodeCount * 3; i++) {
      const from = accounts[Math.floor(Math.random() * accounts.length)];
      const to = accounts[Math.floor(Math.random() * accounts.length)];
      
      if (from.address !== to.address) {
        transfers.push(TransferFactory.createBetween(from.address, to.address));
      }
    }
    
    // Create relationships
    const relationshipMap = new Map();
    transfers.forEach(transfer => {
      const key = `${transfer.from_address}-${transfer.to_address}`;
      if (!relationshipMap.has(key)) {
        relationshipMap.set(key, {
          from_address: transfer.from_address,
          to_address: transfer.to_address,
          transfers: []
        });
      }
      relationshipMap.get(key).transfers.push(transfer);
    });
    
    relationshipMap.forEach(rel => {
      relationships.push(RelationshipFactory.create({
        from_address: rel.from_address,
        to_address: rel.to_address,
        transfer_count: rel.transfers.length,
        total_volume: String(
          rel.transfers.reduce((sum, t) => sum + BigInt(t.value), BigInt(0))
        )
      }));
    });
    
    return { accounts, transfers, relationships };
  },
  
  createSuspiciousNetwork() {
    // Create a hub account (potential mixer)
    const hub = AccountFactory.createHighRisk();
    
    // Create input accounts
    const inputs = AccountFactory.createBatch(5);
    
    // Create output accounts
    const outputs = AccountFactory.createBatch(5);
    
    const transfers = [];
    
    // Transfers from inputs to hub
    inputs.forEach(input => {
      const rapidTransfers = TransferFactory.createRapidSequence(
        input.address,
        hub.address,
        3
      );
      transfers.push(...rapidTransfers);
    });
    
    // Transfers from hub to outputs
    outputs.forEach(output => {
      const rapidTransfers = TransferFactory.createRapidSequence(
        hub.address,
        output.address,
        3
      );
      transfers.push(...rapidTransfers);
    });
    
    // Create patterns
    const patterns = [
      PatternFactory.createMixingPattern(
        hub.address,
        inputs.map(a => a.address),
        outputs.map(a => a.address)
      ),
      PatternFactory.createRapidMovement(
        hub.address,
        outputs.map(a => a.address)
      )
    ];
    
    return {
      accounts: [hub, ...inputs, ...outputs],
      transfers,
      patterns
    };
  },
  
  createWhaleNetwork() {
    const whale = AccountFactory.createWhale();
    const associates = AccountFactory.createBatch(10);
    const transfers = [];
    
    // Large transfers from whale to associates
    associates.forEach(associate => {
      transfers.push(
        TransferFactory.createLargeTransfer({
          from_address: whale.address,
          to_address: associate.address
        })
      );
    });
    
    // Some transfers between associates
    for (let i = 0; i < 20; i++) {
      const from = associates[Math.floor(Math.random() * associates.length)];
      const to = associates[Math.floor(Math.random() * associates.length)];
      
      if (from.address !== to.address) {
        transfers.push(
          TransferFactory.createBetween(from.address, to.address)
        );
      }
    }
    
    return {
      accounts: [whale, ...associates],
      transfers
    };
  }
};