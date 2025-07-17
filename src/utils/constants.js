/**
 * Constants for the blockchain monitoring tool
 */

// Known interesting addresses for monitoring
export const INTERESTING_ADDRESSES = {
  // High balance accounts (whales)
  WHALES: {
    WHALE_1: {
      address: '16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yffMAZ9czzBD',
      name: 'Web3 Foundation',
      type: 'whale'
    },
    WHALE_2: {
      address: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
      name: 'Large Holder 1',
      type: 'whale'
    },
    WHALE_3: {
      address: '13fqhWQCqTHTPbU1fyvbz9Ua3NC47fVVexYuNQRBwpSeZyKM',
      name: 'Large Holder 2',
      type: 'whale'
    },
    WHALE_4: {
      address: '16GDRhRYxk42paoK6TfHAqWej8PdDDUwdDazjv4bAn4KGNeb',
      name: 'Large Holder 3',
      type: 'whale'
    },
    WHALE_5: {
      address: '13Ybj8CPEArUee78DxUAP9yX3ABmFNVQME1ZH4w8HVncHGzc',
      name: 'Large Holder 4',
      type: 'whale'
    }
  },
  
  // Active addresses from test data
  ACTIVE: {
    ACTIVE_1: {
      address: '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
      name: 'Active Account 1',
      type: 'active'
    },
    ACTIVE_2: {
      address: '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3',
      name: 'Validator Example',
      type: 'validator'
    },
    ACTIVE_3: {
      address: '1zugcag7cJVBtVRnFxv5Qftn7xKAnR6YJ9x4x3XLgGgmNnS',
      name: 'Active Account 2',
      type: 'active'
    }
  },
  
  // More whale addresses for analysis
  MORE_WHALES: {
    WHALE_6: {
      address: '153YD8ZHD9dRh82U419bSCB5SzWhbdAFzjj4NtA5pMazR2yC',
      name: 'Large Holder 5',
      type: 'whale'
    }
  }
};

// Flatten all addresses for easy access
export const ALL_INTERESTING_ADDRESSES = Object.values(INTERESTING_ADDRESSES)
  .flatMap(category => Object.values(category));

// Anomaly detection thresholds
export const ANOMALY_THRESHOLDS = {
  // Dormant account threshold in days
  DORMANT_DAYS: parseInt(process.env.DORMANT_THRESHOLD_DAYS) || 180,
  
  // Transaction size anomaly multiplier
  SIZE_MULTIPLIER: parseInt(process.env.SIZE_ANOMALY_MULTIPLIER) || 10,
  
  // Frequency anomaly - transactions happening X times faster than normal
  FREQUENCY_MULTIPLIER: 0.1, // 10x faster than average
  
  // Minimum value to consider for analysis (in planck)
  MIN_VALUE_PLANCK: BigInt(10 ** 10), // 1 DOT
  
  // XCM volume spike multiplier
  XCM_SPIKE_MULTIPLIER: 10
};

// Common XCM routes for monitoring
export const XCM_ROUTES = [
  { from: 'polkadot', to: 'assetHub', name: 'Polkadot → Asset Hub' },
  { from: 'polkadot', to: 'moonbeam', name: 'Polkadot → Moonbeam' },
  { from: 'polkadot', to: 'acala', name: 'Polkadot → Acala' },
  { from: 'polkadot', to: 'parallel', name: 'Polkadot → Parallel' },
  { from: 'assetHub', to: 'moonbeam', name: 'Asset Hub → Moonbeam' },
  { from: 'assetHub', to: 'acala', name: 'Asset Hub → Acala' }
];

// Data collection limits
export const COLLECTION_LIMITS = {
  MAX_ADDRESSES: parseInt(process.env.MAX_ADDRESSES) || 20,
  MAX_PAGES_PER_ADDRESS: parseInt(process.env.MAX_PAGES_PER_ADDRESS) || 10,
  MAX_TRANSFERS_PER_ADDRESS: parseInt(process.env.MAX_TRANSFERS_PER_ADDRESS) || 1000,
  RATE_LIMIT_DELAY: 200 // ms between requests (5 req/s)
};

// Time constants
export const TIME_CONSTANTS = {
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  ONE_MONTH: 30 * 24 * 60 * 60 * 1000,
  SIX_MONTHS: 180 * 24 * 60 * 60 * 1000
};

// File paths
export const PATHS = {
  HISTORICAL_DATA: './data/historical',
  BASELINES: './data/baselines',
  ANOMALIES: './data/anomalies',
  LOGS: './logs'
};

export default {
  INTERESTING_ADDRESSES,
  ALL_INTERESTING_ADDRESSES,
  ANOMALY_THRESHOLDS,
  XCM_ROUTES,
  COLLECTION_LIMITS,
  TIME_CONSTANTS,
  PATHS
};