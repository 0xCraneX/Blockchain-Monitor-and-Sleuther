import { ApiPromise, WsProvider } from '@polkadot/api';
import { EventEmitter } from 'events';

export class PolkadotRpcClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.endpoints = config.endpoints || [
      'wss://rpc.polkadot.io',
      'wss://polkadot-rpc.dwellir.com',
      'wss://polkadot.api.onfinality.io/public-ws'
    ];
    
    this.currentEndpointIndex = 0;
    this.api = null;
    this.provider = null;
    this.subscriptions = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 5000;
    
    this.isConnected = false;
    this.isConnecting = false;
    
    // Metrics
    this.metrics = {
      blocksProcessed: 0,
      eventsProcessed: 0,
      reconnections: 0,
      lastBlockTime: null,
      connectionUptime: 0
    };
    
    console.log('[RPC] PolkadotRpcClient initialized', {
      endpoints: this.endpoints.length,
      maxReconnectAttempts: this.maxReconnectAttempts
    });
  }
  
  async connect() {
    if (this.isConnecting) {
      console.log('[RPC] Connection already in progress');
      return;
    }
    
    this.isConnecting = true;
    
    try {
      const endpoint = this.endpoints[this.currentEndpointIndex];
      console.log(`[RPC] Connecting to ${endpoint}...`);
      
      this.provider = new WsProvider(endpoint, 1000); // 1 second timeout
      
      // Set up provider event handlers
      this.provider.on('connected', () => {
        console.log(`[RPC] WebSocket connected to ${endpoint}`);
      });
      
      this.provider.on('disconnected', () => {
        console.log(`[RPC] WebSocket disconnected from ${endpoint}`);
        this.isConnected = false;
        this.emit('disconnected');
        this.handleReconnection();
      });
      
      this.provider.on('error', (error) => {
        console.error(`[RPC] WebSocket error:`, error.message);
        this.emit('error', error);
      });
      
      // Create API instance
      this.api = await ApiPromise.create({ 
        provider: this.provider,
        throwOnConnect: true
      });
      
      await this.api.isReady;
      
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.metrics.connectionUptime = Date.now();
      
      console.log('[RPC] API connected successfully', {
        chain: (await this.api.rpc.system.chain()).toString(),
        version: (await this.api.rpc.system.version()).toString(),
        endpoint
      });
      
      this.emit('connected');
      
      // Start basic monitoring
      this.startBlockMonitoring();
      
    } catch (error) {
      console.error('[RPC] Connection failed:', error.message);
      this.isConnecting = false;
      await this.handleConnectionFailure();
    }
  }
  
  async handleConnectionFailure() {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[RPC] Retrying connection (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    } else {
      console.error('[RPC] Max reconnection attempts reached');
      this.emit('maxReconnectsReached');
    }
  }
  
  async handleReconnection() {
    if (!this.isConnected && !this.isConnecting) {
      console.log('[RPC] Attempting to reconnect...');
      this.metrics.reconnections++;
      await this.connect();
    }
  }
  
  startBlockMonitoring() {
    if (!this.api) return;
    
    // Subscribe to new block headers
    this.api.rpc.chain.subscribeNewHeads((header) => {
      this.metrics.blocksProcessed++;
      this.metrics.lastBlockTime = Date.now();
      
      this.emit('newBlock', {
        number: header.number.toNumber(),
        hash: header.hash.toString(),
        parentHash: header.parentHash.toString(),
        timestamp: Date.now()
      });
    });
    
    console.log('[RPC] Block monitoring started');
  }
  
  async subscribeBalance(address, callback) {
    if (!this.api || !this.isConnected) {
      throw new Error('API not connected');
    }
    
    try {
      const unsubscribe = await this.api.query.system.account(address, (account) => {
        const balance = {
          address,
          free: account.data.free.toString(),
          reserved: account.data.reserved.toString(),
          frozen: account.data.frozen.toString(),
          timestamp: Date.now()
        };
        
        callback(balance);
      });
      
      this.subscriptions.set(address, unsubscribe);
      console.log(`[RPC] Balance subscription created for ${address}`);
      
      return unsubscribe;
    } catch (error) {
      console.error(`[RPC] Failed to subscribe to balance for ${address}:`, error.message);
      throw error;
    }
  }
  
  async getBlockEvents(blockHash) {
    if (!this.api || !this.isConnected) {
      throw new Error('API not connected');
    }
    
    try {
      const events = await this.api.query.system.events.at(blockHash);
      this.metrics.eventsProcessed += events.length;
      
      return events.map(event => ({
        section: event.event.section,
        method: event.event.method,
        data: event.event.data.toString(),
        phase: event.phase.toString(),
        blockHash
      }));
    } catch (error) {
      console.error(`[RPC] Failed to get block events for ${blockHash}:`, error.message);
      throw error;
    }
  }
  
  async getAccountTransfers(address, limit = 10) {
    if (!this.api || !this.isConnected) {
      throw new Error('API not connected');
    }
    
    try {
      // This is a simplified approach - in practice you'd need to scan recent blocks
      // or use a more sophisticated indexing approach
      const currentBlock = await this.api.rpc.chain.getHeader();
      const blockNumber = currentBlock.number.toNumber();
      
      const transfers = [];
      const scanBlocks = Math.min(1000, blockNumber); // Scan last 1000 blocks max
      
      for (let i = 0; i < scanBlocks && transfers.length < limit; i++) {
        const targetBlock = blockNumber - i;
        const blockHash = await this.api.rpc.chain.getBlockHash(targetBlock);
        const events = await this.getBlockEvents(blockHash);
        
        // Filter for transfer events involving this address
        const transferEvents = events.filter(event => 
          event.section === 'balances' && 
          event.method === 'Transfer' &&
          event.data.includes(address)
        );
        
        transfers.push(...transferEvents.map(event => ({
          ...event,
          blockNumber: targetBlock
        })));
      }
      
      return transfers.slice(0, limit);
    } catch (error) {
      console.error(`[RPC] Failed to get transfers for ${address}:`, error.message);
      throw error;
    }
  }
  
  async disconnect() {
    console.log('[RPC] Disconnecting...');
    
    // Unsubscribe from all subscriptions
    for (const [address, unsubscribe] of this.subscriptions) {
      try {
        await unsubscribe();
        console.log(`[RPC] Unsubscribed from ${address}`);
      } catch (error) {
        console.error(`[RPC] Error unsubscribing from ${address}:`, error.message);
      }
    }
    
    this.subscriptions.clear();
    
    if (this.api) {
      await this.api.disconnect();
      this.api = null;
    }
    
    if (this.provider) {
      await this.provider.disconnect();
      this.provider = null;
    }
    
    this.isConnected = false;
    console.log('[RPC] Disconnected successfully');
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      isConnected: this.isConnected,
      currentEndpoint: this.endpoints[this.currentEndpointIndex],
      subscriptionCount: this.subscriptions.size,
      uptime: this.isConnected ? Date.now() - this.metrics.connectionUptime : 0
    };
  }
}