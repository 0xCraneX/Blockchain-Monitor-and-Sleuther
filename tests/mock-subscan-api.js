/**
 * Mock Subscan API Responses for Testing
 * Provides realistic API responses without hitting rate limits
 */

export class MockSubscanAPI {
  constructor() {
    this.responses = this.initializeResponses();
    this.requestCount = 0;
    this.rateLimit = 100; // Simulate rate limit
  }

  /**
   * Initialize mock responses matching real Subscan API structure
   */
  initializeResponses() {
    return {
      // Account info endpoint
      '/api/v2/scan/account/info': {
        success: true,
        data: {
          address: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
          balance: '2470695500000000',
          balance_format: '2,470,695.5',
          nonce: 1234,
          lock: '0',
          reserved: '0',
          bonded: '0',
          unbonding: '0',
          democracy_lock: '0',
          election_lock: '0',
          is_evm_account: false,
          is_module_account: false,
          is_vesting: false,
          transferrable: '2470695500000000',
          account_display: {
            address: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
            display: 'Ancient Whale #1',
            judgements: []
          }
        }
      },

      // Transfers endpoint
      '/api/v2/scan/transfers': {
        success: true,
        data: {
          count: 423,
          transfers: [
            {
              block_num: 14268787,
              block_timestamp: 1676530302,
              extrinsic_index: '14268787-2',
              success: true,
              hash: '0x8a4e5c...3f2d1b',
              from: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
              to: '13fqhWQCqTHTPbU1fyvbz9Ua3NC47fVVexYuNQRBwpSeZyKM',
              amount: '164285000000000',
              amount_format: '164,285',
              fee: '12500000000',
              fee_format: '0.0125',
              from_account_display: {
                address: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
                display: 'Ancient Whale #1'
              },
              to_account_display: {
                address: '13fqhWQCqTHTPbU1fyvbz9Ua3NC47fVVexYuNQRBwpSeZyKM',
                display: ''
              },
              event_idx: 3,
              module: 'balances',
              event: 'Transfer'
            }
          ]
        }
      },

      // Extrinsics endpoint
      '/api/v2/scan/extrinsics': {
        success: true,
        data: {
          count: 2341,
          extrinsics: [
            {
              block_num: 14268787,
              block_timestamp: 1676530302,
              extrinsic_index: '14268787-2',
              call_module: 'balances',
              call_module_function: 'transfer_keep_alive',
              params: JSON.stringify([
                {
                  name: 'dest',
                  type: 'sp_runtime:multiaddress:MultiAddress',
                  value: '13fqhWQCqTHTPbU1fyvbz9Ua3NC47fVVexYuNQRBwpSeZyKM'
                },
                {
                  name: 'value',
                  type: 'compact<U128>',
                  value: '164285000000000'
                }
              ]),
              account_id: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
              account_display: {
                address: '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f'
              },
              signature: '0x123...',
              nonce: 1234,
              extrinsic_hash: '0x8a4e5c...3f2d1b',
              success: true,
              fee: '12500000000',
              fee_format: '0.0125',
              finalized: true
            }
          ]
        }
      },

      // Daily statistics
      '/api/v2/scan/daily': {
        success: true,
        data: {
          count: 30,
          list: [
            {
              time_utc: '2025-01-15',
              total_transfer_count: 18534,
              total_transfer_amount: '125342567000000000',
              total_transfer_amount_format: '125,342,567',
              active_account_count: 3421,
              new_account_count: 89,
              total_extrinsic_count: 24567,
              total_signed_extrinsic_count: 23456,
              total_fee: '308765000000000',
              total_fee_format: '308.765'
            }
          ]
        }
      },

      // Block info
      '/api/v2/scan/block': {
        success: true,
        data: {
          block_num: 14268787,
          block_timestamp: 1676530302,
          hash: '0x7b5e...2d1f',
          parent_hash: '0x6a4d...1e0c',
          state_root: '0x8f3c...4b2a',
          extrinsics_root: '0x9d2e...3c1b',
          extrinsics: ['0x8a4e5c...3f2d1b'],
          event_count: 12,
          extrinsic_count: 4,
          spec_version: 9430,
          validator: '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3',
          finalized: true
        }
      },

      // Price info
      '/api/open/price': {
        success: true,
        data: {
          price: '7.12',
          usd_24h_change: '-3.2',
          btc_24h_change: '-2.8'
        }
      }
    };
  }

  /**
   * Simulate API request with rate limiting and latency
   */
  async request(endpoint, params = {}) {
    // Simulate network latency
    await this.simulateLatency();

    // Check rate limit
    this.requestCount++;
    if (this.requestCount > this.rateLimit) {
      throw new Error('Rate limit exceeded');
    }

    // Find matching endpoint
    const response = this.responses[endpoint];
    if (!response) {
      throw new Error(`Unknown endpoint: ${endpoint}`);
    }

    // Clone response to avoid mutations
    const responseData = JSON.parse(JSON.stringify(response));

    // Apply params filtering if needed
    if (params.address && responseData.data) {
      // Filter by address if applicable
      if (responseData.data.address) {
        responseData.data.address = params.address;
      }
      if (responseData.data.transfers) {
        responseData.data.transfers = responseData.data.transfers.filter(
          tx => tx.from === params.address || tx.to === params.address
        );
      }
    }

    // Add request metadata
    responseData.generated_at = Date.now();
    responseData.mock = true;

    return responseData;
  }

  /**
   * Generate dynamic whale movement data
   */
  generateWhaleMovement(address, amount, timestamp) {
    return {
      success: true,
      data: {
        transfers: [
          {
            block_num: 14268787 + Math.floor(Math.random() * 1000),
            block_timestamp: timestamp || Date.now() / 1000,
            extrinsic_index: `${14268787}-${Math.floor(Math.random() * 10)}`,
            success: true,
            hash: this.generateHash(),
            from: address,
            to: this.generateAddress(),
            amount: amount.toString(),
            amount_format: this.formatAmount(amount),
            fee: '12500000000',
            fee_format: '0.0125',
            module: 'balances',
            event: 'Transfer'
          }
        ]
      }
    };
  }

  /**
   * Generate exchange flow data
   */
  generateExchangeFlow(exchangeAddress, netOutflow) {
    const transfers = [];
    const baseAmount = 100000;
    
    // Generate withdrawals
    for (let i = 0; i < 20; i++) {
      transfers.push({
        block_num: 14268787 + i,
        block_timestamp: (Date.now() / 1000) - (i * 300), // 5 min intervals
        from: exchangeAddress,
        to: this.generateAddress(),
        amount: (baseAmount * (1 + Math.random())).toString(),
        amount_format: this.formatAmount(baseAmount * (1 + Math.random())),
        type: 'withdrawal'
      });
    }

    // Generate deposits (fewer to create net outflow)
    for (let i = 0; i < 5; i++) {
      transfers.push({
        block_num: 14268787 + i + 20,
        block_timestamp: (Date.now() / 1000) - (i * 600),
        from: this.generateAddress(),
        to: exchangeAddress,
        amount: (baseAmount * 0.8).toString(),
        amount_format: this.formatAmount(baseAmount * 0.8),
        type: 'deposit'
      });
    }

    return {
      success: true,
      data: {
        transfers: transfers.sort((a, b) => b.block_timestamp - a.block_timestamp),
        summary: {
          withdrawals: transfers.filter(t => t.type === 'withdrawal').length,
          deposits: transfers.filter(t => t.type === 'deposit').length,
          netOutflow: netOutflow
        }
      }
    };
  }

  /**
   * Utility functions
   */
  async simulateLatency() {
    const latency = 50 + Math.random() * 150; // 50-200ms
    await new Promise(resolve => setTimeout(resolve, latency));
  }

  generateHash() {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  generateAddress() {
    const prefix = '1';
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return prefix + Array.from({ length: 47 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  formatAmount(amount) {
    return new Intl.NumberFormat('en-US').format(amount / 1000000000000);
  }

  resetRateLimit() {
    this.requestCount = 0;
  }
}

// Export singleton instance
export const mockSubscanAPI = new MockSubscanAPI();