const { ApiPromise, WsProvider } = require('@polkadot/api');
const { monitorLogger } = require('../utils/simple-logger');

class RealtimeMonitor {
  constructor(config = {}) {
    this.config = {
      wsEndpoint: config.wsEndpoint || 'wss://rpc.polkadot.io',
      reconnectDelay: config.reconnectDelay || 5000,
      minTransferAmount: config.minTransferAmount || 10000,
      ...config
    };
    
    this.api = null;
    this.subscriptions = new Map();
    this.alertCallback = config.onAlert || (() => {});
    this.isConnected = false;
    this.watchedAddresses = new Set();
  }

  async connect() {
    try {
      monitorLogger.section('Connecting to Polkadot Network');
      
      const provider = new WsProvider(this.config.wsEndpoint);
      this.api = await ApiPromise.create({ provider });
      
      // Wait for the API to be ready
      await this.api.isReady;
      
      this.isConnected = true;
      
      // Get chain info
      const [chain, nodeName, nodeVersion] = await Promise.all([
        this.api.rpc.system.chain(),
        this.api.rpc.system.name(),
        this.api.rpc.system.version()
      ]);
      
      monitorLogger.success('Connected to Polkadot network', {
        chain: chain.toString(),
        node: `${nodeName} v${nodeVersion}`,
        endpoint: this.config.wsEndpoint
      });
      
      // Set up reconnection handler
      provider.on('disconnected', () => {
        monitorLogger.error('WebSocket disconnected, attempting reconnect...');
        this.isConnected = false;
        setTimeout(() => this.reconnect(), this.config.reconnectDelay);
      });
      
      return true;
    } catch (error) {
      monitorLogger.error('Failed to connect to Polkadot network', error);
      this.isConnected = false;
      return false;
    }
  }

  async reconnect() {
    if (this.isConnected) return;
    
    monitorLogger.info('Attempting to reconnect...');
    const connected = await this.connect();
    
    if (connected) {
      // Re-subscribe to all watched addresses
      const addresses = Array.from(this.watchedAddresses);
      this.watchedAddresses.clear();
      this.subscriptions.clear();
      
      for (const address of addresses) {
        await this.watchAddress(address);
      }
    }
  }

  async watchAddress(address, metadata = {}) {
    if (!this.api || !this.isConnected) {
      monitorLogger.error('Cannot watch address - not connected to network');
      return false;
    }
    
    if (this.watchedAddresses.has(address)) {
      monitorLogger.debug(`Already watching ${address.slice(0,8)}...`);
      return true;
    }
    
    try {
      monitorLogger.info(`Starting real-time monitoring for ${address.slice(0,8)}...${address.slice(-6)}`);
      
      // Subscribe to balance changes
      const unsubBalance = await this.api.query.system.account(
        address,
        (accountInfo) => this.handleBalanceChange(address, accountInfo, metadata)
      );
      
      // Subscribe to transfer events for this address
      const unsubTransfers = await this.subscribeToTransfers(address, metadata);
      
      // Store subscriptions
      this.subscriptions.set(address, {
        balance: unsubBalance,
        transfers: unsubTransfers,
        metadata,
        previousBalance: null
      });
      
      this.watchedAddresses.add(address);
      return true;
      
    } catch (error) {
      monitorLogger.error(`Failed to watch address ${address}`, error);
      return false;
    }
  }

  async subscribeToTransfers(address, metadata) {
    // Subscribe to all balance.Transfer events
    return await this.api.query.system.events((events) => {
      events.forEach((record) => {
        const { event } = record;
        
        // Check if this is a transfer event
        if (event.section === 'balances' && event.method === 'Transfer') {
          const [from, to, amount] = event.data;
          
          // Check if our watched address is involved
          if (from.toString() === address || to.toString() === address) {
            this.handleTransferEvent(address, {
              from: from.toString(),
              to: to.toString(),
              amount: amount.toString(),
              blockNumber: event.blockNumber?.toNumber() || 0,
              eventIndex: record.eventIndex || '0-0'
            }, metadata);
          }
        }
      });
    });
  }

  handleBalanceChange(address, accountInfo, metadata) {
    const sub = this.subscriptions.get(address);
    if (!sub) return;
    
    const currentBalance = accountInfo.data.free.toBn();
    const currentBalanceFloat = parseFloat(
      currentBalance.toString() + '.' + currentBalance.mod(1e10).toString()
    ) / 1e10;
    
    if (sub.previousBalance !== null) {
      const previousBalanceFloat = sub.previousBalance;
      const change = currentBalanceFloat - previousBalanceFloat;
      
      // Only alert on significant changes
      if (Math.abs(change) >= this.config.minTransferAmount) {
        const alert = {
          id: `realtime_balance_${address}_${Date.now()}`,
          type: 'balance_change',
          pattern: change > 0 ? 'balance_increase' : 'balance_decrease',
          severity: Math.abs(change) > 100000 ? 'high' : 'medium',
          title: `Real-time Balance ${change > 0 ? 'Increase' : 'Decrease'}`,
          description: `${metadata.identity || 'Account'} balance ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toLocaleString()} DOT`,
          message: `Live blockchain balance change detected`,
          timestamp: new Date().toISOString(),
          address,
          amount: Math.abs(Math.floor(change)),
          metadata: {
            previousBalance: previousBalanceFloat,
            currentBalance: currentBalanceFloat,
            change,
            identity: metadata.identity,
            accountType: metadata.accountType,
            source: 'websocket'
          }
        };
        
        this.alertCallback(alert);
        monitorLogger.info(`Real-time alert: ${alert.description}`);
      }
    }
    
    sub.previousBalance = currentBalanceFloat;
  }

  handleTransferEvent(address, transfer, metadata) {
    const amount = parseFloat(transfer.amount) / 1e10;
    
    if (amount < this.config.minTransferAmount) return;
    
    const isIncoming = transfer.to === address;
    
    const alert = {
      id: `realtime_transfer_${transfer.blockNumber}_${transfer.eventIndex}`,
      type: 'transfer',
      pattern: isIncoming ? 'incoming_transfer' : 'outgoing_transfer',
      severity: amount > 100000 ? 'high' : 'medium',
      title: `Real-time ${isIncoming ? 'Incoming' : 'Outgoing'} Transfer`,
      description: `${metadata.identity || 'Account'} ${isIncoming ? 'received' : 'sent'} ${amount.toLocaleString()} DOT`,
      message: `Live transfer detected on blockchain`,
      timestamp: new Date().toISOString(),
      address,
      amount: Math.floor(amount),
      metadata: {
        from: transfer.from,
        to: transfer.to,
        blockNumber: transfer.blockNumber,
        eventIndex: transfer.eventIndex,
        identity: metadata.identity,
        accountType: metadata.accountType,
        direction: isIncoming ? 'incoming' : 'outgoing',
        source: 'websocket'
      }
    };
    
    this.alertCallback(alert);
    monitorLogger.info(`Real-time transfer: ${alert.description}`);
  }

  async watchAccounts(accounts) {
    monitorLogger.section('Setting up Real-time Monitoring');
    
    if (!this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        monitorLogger.error('Failed to establish WebSocket connection');
        return false;
      }
    }
    
    let successCount = 0;
    for (const account of accounts) {
      const success = await this.watchAddress(account.address, {
        identity: account.identity,
        accountType: account.accountType
      });
      if (success) successCount++;
      
      // Small delay to avoid overwhelming the RPC
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    monitorLogger.success(`Watching ${successCount}/${accounts.length} accounts in real-time`);
    return successCount > 0;
  }

  async stopWatching(address) {
    const sub = this.subscriptions.get(address);
    if (!sub) return;
    
    // Unsubscribe from all events
    if (sub.balance) await sub.balance();
    if (sub.transfers) await sub.transfers();
    
    this.subscriptions.delete(address);
    this.watchedAddresses.delete(address);
    
    monitorLogger.info(`Stopped watching ${address.slice(0,8)}...`);
  }

  async disconnect() {
    monitorLogger.info('Disconnecting from Polkadot network...');
    
    // Unsubscribe from all addresses
    for (const [address] of this.subscriptions) {
      await this.stopWatching(address);
    }
    
    // Disconnect from network
    if (this.api) {
      await this.api.disconnect();
      this.api = null;
    }
    
    this.isConnected = false;
    monitorLogger.success('Disconnected from network');
  }

  isWatching(address) {
    return this.watchedAddresses.has(address);
  }

  getStats() {
    return {
      connected: this.isConnected,
      endpoint: this.config.wsEndpoint,
      watchedAddresses: this.watchedAddresses.size,
      activeSubscriptions: this.subscriptions.size
    };
  }
}

module.exports = RealtimeMonitor;