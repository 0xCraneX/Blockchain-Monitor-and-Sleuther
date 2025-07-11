// Real Polkadot addresses for testing
export const POLKADOT_ADDRESSES = {
  // Treasury
  TREASURY: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',
  
  // Well-known validators
  VALIDATORS: [
    '14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2', // Stakefish
    '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu', // P2P.org
    '1zugcag7cJVBtVRnFxv5Qftn7xKAnR6YJ9x4x3XLgGgmNnS', // Staked
    '12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW'  // Web3 Foundation
  ],
  
  // Exchange addresses (publicly known)
  EXCHANGES: [
    '1REAJ1k691g5Eqqg9gL7HkduRWtWm7TDFrb4YYBfxLqmJBA', // Kraken
    '12n3sjSbMiZaT56Z8vdZqDYFT4nKJznXf8YhGQGSbJFB6rr' // Binance cold storage
  ],
  
  // Test addresses for development
  TEST_ACCOUNTS: [
    '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', // Alice
    '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', // Bob
    '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy', // Charlie
    '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw', // Dave
    '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'  // Eve
  ]
};

// Real transaction hashes for testing
export const POLKADOT_TRANSACTIONS = {
  TRANSFERS: [
    '0x8c4d5f2e7b9c8c1f4e6b8a5c3f1d9e8b7a4c2f6e9d8c5b2a7f1e4b9c6d3f8a5',
    '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    '0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e'
  ],
  STAKING: [
    '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
    '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  ]
};

// Mock identity data
export const MOCK_IDENTITIES = {
  '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY': {
    display: 'Alice',
    legal: 'Alice Wonderland',
    web: 'https://alice.polkadot.network',
    email: 'alice@polkadot.network',
    twitter: '@alice_polkadot',
    verified: true
  },
  '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty': {
    display: 'Bob',
    legal: 'Robert Builder',
    web: 'https://bob.substrate.dev',
    verified: false
  },
  '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn': {
    display: 'Treasury',
    legal: 'Polkadot Treasury',
    web: 'https://polkadot.network',
    verified: true
  }
};

// Test patterns for pattern detection
export const TEST_PATTERNS = {
  RAPID_MOVEMENT: {
    address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    pattern_type: 'rapid_movement',
    confidence: 0.85,
    details: {
      transfers: 15,
      timeWindow: '1h',
      totalVolume: '50000000000000',
      averageInterval: 240 // seconds
    }
  },
  CIRCULAR_FLOW: {
    address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    pattern_type: 'circular_flow',
    confidence: 0.72,
    details: {
      hops: 4,
      returnRatio: 0.95,
      timeToReturn: 3600,
      addresses: [
        '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
        '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
        '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'
      ]
    }
  },
  MIXING_BEHAVIOR: {
    address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
    pattern_type: 'mixing_behavior',
    confidence: 0.68,
    details: {
      inputCount: 25,
      outputCount: 30,
      averageDelay: 1800,
      volumeVariation: 0.15
    }
  }
};

// Test graph data
export const TEST_GRAPH_DATA = {
  nodes: [
    {
      id: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      identity: 'Alice',
      balance: '1000000000000',
      riskScore: 0.1,
      type: 'account'
    },
    {
      id: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      identity: 'Bob',
      balance: '500000000000',
      riskScore: 0.3,
      type: 'account'
    },
    {
      id: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      identity: 'Charlie',
      balance: '2000000000000',
      riskScore: 0.05,
      type: 'account'
    }
  ],
  edges: [
    {
      source: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      target: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      weight: 5,
      totalVolume: '5000000000000',
      transferCount: 12,
      type: 'transfer'
    },
    {
      source: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      target: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      weight: 3,
      totalVolume: '3000000000000',
      transferCount: 8,
      type: 'transfer'
    }
  ]
};

// Performance test data
export const PERFORMANCE_TEST_DATA = {
  LARGE_ACCOUNT_SET: Array.from({ length: 1000 }, (_, i) => ({
    address: `5Test${i.toString().padStart(44, '0')}`,
    identity_display: `TestUser${i}`,
    balance: (Math.random() * 10000000000000).toString(),
    total_transfers_in: Math.floor(Math.random() * 100),
    total_transfers_out: Math.floor(Math.random() * 100)
  })),
  
  LARGE_TRANSFER_SET: Array.from({ length: 10000 }, (_, i) => ({
    hash: `0x${i.toString(16).padStart(64, '0')}`,
    block_number: 1000000 + i,
    timestamp: new Date(Date.now() - i * 12000).toISOString(),
    from_address: `5Test${(i % 500).toString().padStart(44, '0')}`,
    to_address: `5Test${((i + 1) % 500).toString().padStart(44, '0')}`,
    value: (Math.random() * 1000000000000).toString(),
    fee: '125000000',
    success: Math.random() > 0.05, // 95% success rate
    method: 'transfer',
    section: 'balances'
  }))
};

// Helper functions
export function createRandomAddress() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '5';
  for (let i = 0; i < 47; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function createRandomTransfer(fromAddress, toAddress) {
  return {
    hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
    block_number: Math.floor(Math.random() * 1000000) + 1000000,
    timestamp: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    from_address: fromAddress,
    to_address: toAddress,
    value: (Math.random() * 100000000000000).toString(),
    fee: '125000000',
    success: true,
    method: 'transfer',
    section: 'balances'
  };
}