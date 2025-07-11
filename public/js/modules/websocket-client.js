/**
 * WebSocket Client for real-time graph updates
 * Handles Socket.IO connections and real-time data streaming
 */
export class WebSocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.eventHandlers = new Map();
    this.subscriptions = new Set();
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    if (this.socket && this.connected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Use Socket.IO client from CDN
      this.socket = io();

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.connected = true;
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        this.connected = false;
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      // Setup message handlers
      this.setupMessageHandlers();

      // Connection timeout
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Setup message handlers for different event types
   */
  setupMessageHandlers() {
    // Graph updates
    this.socket.on('graph:update', (data) => {
      this.emit('graph:update', data);
    });

    this.socket.on('graph:new_node', (data) => {
      this.emit('graph:new_node', data);
    });

    this.socket.on('graph:new_edge', (data) => {
      this.emit('graph:new_edge', data);
    });

    // Pattern alerts
    this.socket.on('pattern:detected', (data) => {
      this.emit('pattern:detected', data);
    });

    // Streaming updates
    this.socket.on('stream:progress', (data) => {
      this.emit('stream:progress', data);
    });

    this.socket.on('stream:complete', (data) => {
      this.emit('stream:complete', data);
    });

    this.socket.on('stream:error', (data) => {
      this.emit('stream:error', data);
    });
  }

  /**
   * Subscribe to address updates
   */
  subscribeToAddress(address, options = {}) {
    if (!this.connected) {
      throw new Error('WebSocket not connected');
    }

    const subscription = {
      type: 'address',
      address,
      ...options
    };

    this.socket.emit('subscribe:address', subscription);
    this.subscriptions.add(`address:${address}`);
    
    return subscription;
  }

  /**
   * Unsubscribe from address updates
   */
  unsubscribeFromAddress(address) {
    if (!this.connected) {
      return;
    }

    this.socket.emit('unsubscribe:address', { address });
    this.subscriptions.delete(`address:${address}`);
  }

  /**
   * Subscribe to pattern alerts
   */
  subscribeToPatterns() {
    if (!this.connected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('subscribe:patterns');
    this.subscriptions.add('patterns');
  }

  /**
   * Unsubscribe from pattern alerts
   */
  unsubscribeFromPatterns() {
    if (!this.connected) {
      return;
    }

    this.socket.emit('unsubscribe:patterns');
    this.subscriptions.delete('patterns');
  }

  /**
   * Start streaming graph data
   */
  startGraphStream(address, options = {}) {
    if (!this.connected) {
      throw new Error('WebSocket not connected');
    }

    const streamConfig = {
      address,
      progressive: true,
      batchSize: options.batchSize || 50,
      depth: options.depth || 2,
      ...options
    };

    this.socket.emit('stream:graph', streamConfig);
  }

  /**
   * Stop graph streaming
   */
  stopGraphStream() {
    if (!this.connected) {
      return;
    }

    this.socket.emit('stream:stop');
  }

  /**
   * Add event listener
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);
  }

  /**
   * Remove event listener
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).delete(handler);
    }
  }

  /**
   * Emit event to handlers
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.subscriptions.clear();
    }
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions() {
    return Array.from(this.subscriptions);
  }
}