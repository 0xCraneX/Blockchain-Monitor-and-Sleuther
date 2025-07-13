/**
 * Test Data Fixtures
 * 
 * Centralized test data for consistent testing
 */

export const TEST_ADDRESSES = {
  ALICE: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  BOB: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  CHARLIE: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
  EVE: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
  TREASURY: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',
  VALIDATOR_1: '14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2',
  VALIDATOR_2: '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu'
};

export const TEST_ACCOUNTS = [
  {
    address: TEST_ADDRESSES.ALICE,
    identity_display: 'Alice',
    balance: '1000000000000000',
    risk_score: 0.1,
    total_transfers_in: 5,
    total_transfers_out: 3,
    volume_in: '5000000000000',
    volume_out: '3000000000000'
  },
  {
    address: TEST_ADDRESSES.BOB,
    identity_display: 'Bob',
    balance: '500000000000000',
    risk_score: 0.2,
    total_transfers_in: 2,
    total_transfers_out: 4,
    volume_in: '2000000000000',
    volume_out: '4000000000000'
  },
  {
    address: TEST_ADDRESSES.CHARLIE,
    identity_display: 'Charlie',
    balance: '2000000000000000',
    risk_score: 0.15,
    total_transfers_in: 10,
    total_transfers_out: 8,
    volume_in: '10000000000000',
    volume_out: '8000000000000'
  },
  {
    address: TEST_ADDRESSES.EVE,
    identity_display: 'Eve (High Risk)',
    balance: '10000000000000000',
    risk_score: 0.8,
    total_transfers_in: 100,
    total_transfers_out: 120,
    volume_in: '100000000000000',
    volume_out: '120000000000000'
  }
];

export const TEST_TRANSFERS = [
  {
    hash: '0x123456789',
    block_number: 1500000,
    timestamp: '2024-01-15T10:00:00Z',
    from_address: TEST_ADDRESSES.ALICE,
    to_address: TEST_ADDRESSES.BOB,
    value: '1000000000000',
    fee: '125000000',
    success: true,
    method: 'transfer',
    section: 'balances'
  },
  {
    hash: '0x987654321',
    block_number: 1600000,
    timestamp: '2024-01-16T14:30:00Z',
    from_address: TEST_ADDRESSES.BOB,
    to_address: TEST_ADDRESSES.CHARLIE,
    value: '500000000000',
    fee: '125000000',
    success: true,
    method: 'transferKeepAlive',
    section: 'balances'
  },
  {
    hash: '0xaabbccdd',
    block_number: 1700000,
    timestamp: '2024-01-17T09:15:00Z',
    from_address: TEST_ADDRESSES.CHARLIE,
    to_address: TEST_ADDRESSES.ALICE,
    value: '2000000000000',
    fee: '125000000',
    success: true,
    method: 'transfer',
    section: 'balances'
  }
];

export const TEST_RELATIONSHIPS = [
  {
    from_address: TEST_ADDRESSES.ALICE,
    to_address: TEST_ADDRESSES.BOB,
    transfer_count: 5,
    total_volume: '5000000000000',
    first_transfer_block: 1000000,
    last_transfer_block: 1500000
  },
  {
    from_address: TEST_ADDRESSES.BOB,
    to_address: TEST_ADDRESSES.CHARLIE,
    transfer_count: 3,
    total_volume: '1500000000000',
    first_transfer_block: 1100000,
    last_transfer_block: 1600000
  },
  {
    from_address: TEST_ADDRESSES.CHARLIE,
    to_address: TEST_ADDRESSES.ALICE,
    transfer_count: 2,
    total_volume: '4000000000000',
    first_transfer_block: 1200000,
    last_transfer_block: 1700000
  }
];

/**
 * Generate mock transfers for testing patterns
 */
export function generateMockTransfers(options = {}) {
  const {
    count = 10,
    fromAddress = TEST_ADDRESSES.ALICE,
    toAddress = TEST_ADDRESSES.BOB,
    baseValue = '1000000000000',
    startTime = new Date('2024-01-01'),
    intervalMinutes = 60
  } = options;

  const transfers = [];
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);
    transfers.push({
      hash: `0x${i.toString(16).padStart(64, '0')}`,
      block_number: 1000000 + i * 100,
      timestamp: timestamp.toISOString(),
      from_address: fromAddress,
      to_address: toAddress,
      value: baseValue,
      fee: '125000000',
      success: true,
      method: 'transfer',
      section: 'balances'
    });
  }
  
  return transfers;
}

/**
 * Generate circular flow pattern
 */
export function generateCircularFlow(addresses = [TEST_ADDRESSES.ALICE, TEST_ADDRESSES.BOB, TEST_ADDRESSES.CHARLIE]) {
  const relationships = [];
  
  for (let i = 0; i < addresses.length; i++) {
    const from = addresses[i];
    const to = addresses[(i + 1) % addresses.length];
    
    relationships.push({
      from_address: from,
      to_address: to,
      transfer_count: 5,
      total_volume: '5000000000000',
      first_transfer_block: 1000000 + i * 100000,
      last_transfer_block: 1500000 + i * 100000
    });
  }
  
  return relationships;
}

/**
 * Generate round number transfers
 */
export function generateRoundNumberTransfers(address) {
  return [
    {
      hash: '0xround1',
      from_address: address,
      to_address: TEST_ADDRESSES.BOB,
      value: '10000000000000', // 10 DOT - perfect round
      timestamp: '2024-01-15T10:00:00Z',
      success: true
    },
    {
      hash: '0xround2',
      from_address: address,
      to_address: TEST_ADDRESSES.CHARLIE,
      value: '50000000000000', // 50 DOT - perfect round
      timestamp: '2024-01-16T11:00:00Z',
      success: true
    },
    {
      hash: '0xround3',
      from_address: address,
      to_address: TEST_ADDRESSES.EVE,
      value: '100000000000000', // 100 DOT - perfect round
      timestamp: '2024-01-17T12:00:00Z',
      success: true
    }
  ];
}

/**
 * Generate rapid movement pattern
 */
export function generateRapidMovement(address) {
  const now = new Date();
  return [
    {
      hash: '0xrapid1',
      from_address: address,
      to_address: TEST_ADDRESSES.BOB,
      value: '10000000000000',
      timestamp: new Date(now.getTime() - 120000).toISOString(), // 2 minutes ago
      success: true
    },
    {
      hash: '0xrapid2',
      from_address: TEST_ADDRESSES.BOB,
      to_address: TEST_ADDRESSES.CHARLIE,
      value: '9500000000000',
      timestamp: new Date(now.getTime() - 60000).toISOString(), // 1 minute ago
      success: true
    },
    {
      hash: '0xrapid3',
      from_address: TEST_ADDRESSES.CHARLIE,
      to_address: TEST_ADDRESSES.EVE,
      value: '9000000000000',
      timestamp: now.toISOString(), // now
      success: true
    }
  ];
}