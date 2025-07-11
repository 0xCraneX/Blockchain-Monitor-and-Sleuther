import { ApiPromise, WsProvider } from '@polkadot/api';
import { logger } from '../utils/logger.js';

export class BlockchainService {
  constructor() {
    this.api = null;
    this.provider = null;
    this.chainId = process.env.CHAIN_ID || 'polkadot';
    this.endpoint = process.env.RPC_ENDPOINT || 'wss://rpc.polkadot.io';
    this.subscriptions = new Map();
  }

  async connect() {
    try {
      logger.info(`Connecting to ${this.chainId} at ${this.endpoint}`);
      
      this.provider = new WsProvider(this.endpoint, 1000, {}, 5000);
      this.api = await ApiPromise.create({ provider: this.provider });

      // Wait for the API to be ready
      await this.api.isReady;

      // Get chain info
      const [chain, nodeName, nodeVersion] = await Promise.all([
        this.api.rpc.system.chain(),
        this.api.rpc.system.name(),
        this.api.rpc.system.version()
      ]);

      logger.info('Connected to blockchain', {
        chain: chain.toString(),
        nodeName: nodeName.toString(),
        nodeVersion: nodeVersion.toString()
      });

      // Subscribe to new blocks
      this.subscribeToNewBlocks();

    } catch (error) {
      logger.error('Failed to connect to blockchain', error);
      throw error;
    }
  }

  async disconnect() {
    // Unsubscribe from all subscriptions
    for (const [id, unsubscribe] of this.subscriptions) {
      await unsubscribe();
      logger.debug(`Unsubscribed from ${id}`);
    }
    this.subscriptions.clear();

    // Disconnect from the provider
    if (this.api) {
      await this.api.disconnect();
      logger.info('Disconnected from blockchain');
    }
  }

  subscribeToNewBlocks() {
    this.api.rpc.chain.subscribeNewHeads(async (header) => {
      const blockNumber = header.number.toNumber();
      logger.debug(`New block: #${blockNumber}`);
      
      // Emit block event for other services
      this.emit('newBlock', {
        number: blockNumber,
        hash: header.hash.toString(),
        parentHash: header.parentHash.toString()
      });
    }).then(unsubscribe => {
      this.subscriptions.set('newHeads', unsubscribe);
    });
  }

  // Account methods
  async getAccount(address) {
    try {
      const [accountInfo, identity] = await Promise.all([
        this.api.query.system.account(address),
        this.api.query.identity?.identityOf ? 
          this.api.query.identity.identityOf(address) : 
          Promise.resolve(null)
      ]);

      const balance = accountInfo.data.free.toString();
      
      // Parse identity if available
      let identityInfo = null;
      if (identity && identity.isSome) {
        const identityData = identity.unwrap();
        identityInfo = this.parseIdentity(identityData.info);
      }

      return {
        address,
        balance,
        nonce: accountInfo.nonce.toNumber(),
        identity: identityInfo
      };
    } catch (error) {
      logger.error('Failed to get account', { address, error });
      throw error;
    }
  }

  parseIdentity(info) {
    const parseField = (field) => {
      if (field.isNone) return null;
      const raw = field.isRaw ? field.asRaw.toHuman() : field.toString();
      return raw ? raw.replace(/^0x/, '') : null;
    };

    return {
      display: parseField(info.display),
      legal: parseField(info.legal),
      web: parseField(info.web),
      email: parseField(info.email),
      twitter: parseField(info.twitter),
      riot: parseField(info.riot)
    };
  }

  // Block methods
  async getBlock(blockNumber) {
    try {
      const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
      const [block, events] = await Promise.all([
        this.api.rpc.chain.getBlock(blockHash),
        this.api.query.system.events.at(blockHash)
      ]);

      return {
        number: blockNumber,
        hash: blockHash.toString(),
        parentHash: block.block.header.parentHash.toString(),
        extrinsics: block.block.extrinsics,
        events: events
      };
    } catch (error) {
      logger.error('Failed to get block', { blockNumber, error });
      throw error;
    }
  }

  // Transfer extraction
  async extractTransfers(blockNumber) {
    try {
      const block = await this.getBlock(blockNumber);
      const transfers = [];

      // Process extrinsics
      block.extrinsics.forEach((extrinsic, index) => {
        const { method: { method, section } } = extrinsic;
        
        // Check for balance transfers
        if (section === 'balances' && 
            (method === 'transfer' || method === 'transferKeepAlive' || method === 'transferAll')) {
          
          const [dest, value] = extrinsic.method.args;
          const from = extrinsic.signer.toString();
          const to = dest.toString();
          
          // Find corresponding events
          const extrinsicEvents = block.events.filter(({ phase }) =>
            phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index)
          );
          
          const success = extrinsicEvents.some(({ event }) =>
            event.section === 'system' && event.method === 'ExtrinsicSuccess'
          );
          
          // Get fee from events
          let fee = '0';
          const feeEvent = extrinsicEvents.find(({ event }) =>
            event.section === 'transactionPayment' && event.method === 'TransactionFeePaid'
          );
          if (feeEvent) {
            fee = feeEvent.event.data[1].toString();
          }
          
          transfers.push({
            hash: extrinsic.hash.toString(),
            blockNumber,
            timestamp: new Date().toISOString(), // Will be updated with actual block timestamp
            fromAddress: from,
            toAddress: to,
            value: value ? value.toString() : '0',
            fee,
            success,
            method,
            section
          });
        }
      });

      // Also check for treasury proposals, tips, etc.
      block.events.forEach(({ event }) => {
        if (event.section === 'balances' && event.method === 'Transfer') {
          const [from, to, value] = event.data;
          
          // Check if this transfer is already captured from extrinsics
          const exists = transfers.some(t => 
            t.fromAddress === from.toString() && 
            t.toAddress === to.toString() &&
            t.value === value.toString()
          );
          
          if (!exists) {
            transfers.push({
              hash: `${block.hash}-event-${event.index}`,
              blockNumber,
              timestamp: new Date().toISOString(),
              fromAddress: from.toString(),
              toAddress: to.toString(),
              value: value.toString(),
              fee: '0',
              success: true,
              method: 'transfer',
              section: 'balances'
            });
          }
        }
      });

      return transfers;
    } catch (error) {
      logger.error('Failed to extract transfers', { blockNumber, error });
      throw error;
    }
  }

  // Get current block number
  async getCurrentBlock() {
    const header = await this.api.rpc.chain.getHeader();
    return header.number.toNumber();
  }

  // Get finalized block number
  async getFinalizedBlock() {
    const hash = await this.api.rpc.chain.getFinalizedHead();
    const header = await this.api.rpc.chain.getHeader(hash);
    return header.number.toNumber();
  }

  // Subscribe to address updates
  async subscribeToAddress(address, callback) {
    const unsubscribe = await this.api.query.system.account(address, (accountInfo) => {
      callback({
        address,
        balance: accountInfo.data.free.toString(),
        nonce: accountInfo.nonce.toNumber()
      });
    });

    this.subscriptions.set(`account:${address}`, unsubscribe);
    return () => {
      this.subscriptions.delete(`account:${address}`);
      unsubscribe();
    };
  }

  // Event emitter functionality
  emit(event, data) {
    // This would be replaced with proper event emitter
    // For now, just log
    logger.debug(`Event: ${event}`, data);
  }
}