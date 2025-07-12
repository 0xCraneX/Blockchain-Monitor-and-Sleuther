import fetch from 'node-fetch';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SubscanService');

export class SubscanService {
  constructor() {
    this.apiKey = process.env.SUBSCAN_API_KEY || '';
    this.endpoint = process.env.SUBSCAN_API_ENDPOINT || 'https://polkadot.api.subscan.io';
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'polkadot-analysis-tool/1.0'
    };
    
    if (this.apiKey) {
      this.headers['X-API-Key'] = this.apiKey;
    }
  }

  async request(path, data = {}) {
    const url = `${this.endpoint}${path}`;
    
    logger.debug('Subscan API request', { path, hasApiKey: !!this.apiKey });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`Subscan API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.code !== 0) {
        throw new Error(`Subscan API error: ${result.message || 'Unknown error'}`);
      }

      logger.debug('Subscan API response', { path, hasData: !!result.data });
      return result.data;
    } catch (error) {
      logger.error('Subscan API request failed', { path, error: error.message });
      throw error;
    }
  }

  /**
   * Get account information including identity
   */
  async getAccountInfo(address) {
    try {
      const data = await this.request('/api/v2/scan/accounts', { address: [address] });
      
      // API returns a list, get the first item if available
      const account = data.list && data.list.length > 0 ? data.list[0] : null;
      
      if (!account) {
        return null;
      }
      
      return {
        address: account.address || address,
        identity: {
          display: account.display_name || account.identity?.display || null,
          legal: account.identity?.legal || null,
          web: account.identity?.web || null,
          email: account.identity?.email || null,
          twitter: account.identity?.twitter || null,
          verified: account.identity?.judgements?.some(j => j.status === 'KnownGood') || false
        },
        balance: {
          free: account.balance || '0',
          reserved: account.reserved || '0',
          locked: account.locked || '0'
        },
        nonce: account.nonce || 0,
        role: account.role || 'regular',
        registrar: account.registrar || null
      };
    } catch (error) {
      logger.warn('Failed to get account info from Subscan', { address, error: error.message });
      return null;
    }
  }

  /**
   * Get transfers for an address
   */
  async getTransfers(address, options = {}) {
    const {
      row = 100,
      page = 0,
      from_block = null,
      to_block = null,
      direction = 'all' // 'all', 'sent', 'received'
    } = options;

    try {
      const params = {
        address,
        row,
        page
      };

      if (from_block) params.from_block = from_block;
      if (to_block) params.to_block = to_block;
      if (direction !== 'all') params.direction = direction;

      const data = await this.request('/api/v2/scan/transfers', params);
      
      return {
        transfers: (data.transfers || []).map(t => ({
          hash: t.hash,
          block_num: t.block_num,
          block_timestamp: t.block_timestamp,
          from: t.from,
          to: t.to,
          amount: t.amount,
          fee: t.fee,
          success: t.success,
          module: t.module,
          nonce: t.nonce,
          asset_type: t.asset_type || 'native'
        })),
        count: data.count || 0
      };
    } catch (error) {
      logger.warn('Failed to get transfers from Subscan', { address, error: error.message });
      return { transfers: [], count: 0 };
    }
  }

  /**
   * Get account relationships based on transfers
   */
  async getAccountRelationships(address, options = {}) {
    const { limit = 100 } = options;
    
    try {
      // Get both sent and received transfers
      const [sent, received] = await Promise.all([
        this.getTransfers(address, { row: limit, direction: 'sent' }),
        this.getTransfers(address, { row: limit, direction: 'received' })
      ]);

      // Build relationship map
      const relationships = new Map();

      // Process sent transfers
      sent.transfers.forEach(transfer => {
        const key = transfer.to;
        if (!relationships.has(key)) {
          relationships.set(key, {
            address: key,
            sent_count: 0,
            sent_volume: BigInt(0),
            received_count: 0,
            received_volume: BigInt(0),
            first_interaction: transfer.block_timestamp,
            last_interaction: transfer.block_timestamp
          });
        }
        const rel = relationships.get(key);
        rel.sent_count++;
        rel.sent_volume += BigInt(transfer.amount || 0);
        rel.last_interaction = Math.max(rel.last_interaction, transfer.block_timestamp);
        rel.first_interaction = Math.min(rel.first_interaction, transfer.block_timestamp);
      });

      // Process received transfers
      received.transfers.forEach(transfer => {
        const key = transfer.from;
        if (!relationships.has(key)) {
          relationships.set(key, {
            address: key,
            sent_count: 0,
            sent_volume: BigInt(0),
            received_count: 0,
            received_volume: BigInt(0),
            first_interaction: transfer.block_timestamp,
            last_interaction: transfer.block_timestamp
          });
        }
        const rel = relationships.get(key);
        rel.received_count++;
        rel.received_volume += BigInt(transfer.amount || 0);
        rel.last_interaction = Math.max(rel.last_interaction, transfer.block_timestamp);
        rel.first_interaction = Math.min(rel.first_interaction, transfer.block_timestamp);
      });

      // Convert to array and calculate totals
      const relationshipArray = Array.from(relationships.values()).map(rel => ({
        connected_address: rel.address,
        total_transactions: rel.sent_count + rel.received_count,
        sent_count: rel.sent_count,
        sent_volume: rel.sent_volume.toString(),
        received_count: rel.received_count,
        received_volume: rel.received_volume.toString(),
        total_volume: (rel.sent_volume + rel.received_volume).toString(),
        first_interaction: rel.first_interaction,
        last_interaction: rel.last_interaction,
        relationship_type: rel.sent_count > 0 && rel.received_count > 0 ? 'bidirectional' : 
                          rel.sent_count > 0 ? 'outgoing' : 'incoming'
      }));

      // Sort by total volume descending
      relationshipArray.sort((a, b) => {
        const volA = BigInt(a.total_volume);
        const volB = BigInt(b.total_volume);
        return volB > volA ? 1 : volB < volA ? -1 : 0;
      });

      return relationshipArray.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get account relationships', { address, error: error.message });
      return [];
    }
  }

  /**
   * Search for accounts by address or identity
   */
  async searchAccounts(query, limit = 10) {
    try {
      // First try direct address lookup
      if (query.length > 40) {
        const accountInfo = await this.getAccountInfo(query);
        if (accountInfo) {
          return [accountInfo];
        }
      }

      // For identity search, we need to use a different approach
      // Subscan doesn't have a direct identity search endpoint in free tier
      // Would need to implement local caching or use paid features
      
      logger.info('Identity search requires Subscan paid tier or local indexing');
      return [];
    } catch (error) {
      logger.error('Failed to search accounts', { query, error: error.message });
      return [];
    }
  }

  /**
   * Get price info (if available)
   */
  async getPriceInfo() {
    try {
      const data = await this.request('/api/open/price', {});
      return {
        price: parseFloat(data.price || 0),
        price_change: parseFloat(data.price_change || 0),
        market_cap: data.market_cap || '0',
        volume_24h: data.volume_24h || '0'
      };
    } catch (error) {
      logger.warn('Failed to get price info', { error: error.message });
      return null;
    }
  }
}

// Singleton instance
export const subscanService = new SubscanService();