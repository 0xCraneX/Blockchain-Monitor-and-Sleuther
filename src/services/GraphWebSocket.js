import {
  logger,
  createLogger,
  logMethodEntry,
  logMethodExit,
  logWebSocketEvent,
  logError,
  startPerformanceTimer,
  endPerformanceTimer
} from '../utils/logger.js';

const wsLogger = createLogger('GraphWebSocket');

/**
 * GraphWebSocket Service - Handles real-time graph updates via WebSocket
 * Provides efficient room-based broadcasting for graph changes and analytics
 */
export class GraphWebSocket {
  constructor(realDataService = null) {
    const trackerId = logMethodEntry('GraphWebSocket', 'constructor');

    this.io = null;
    this.realDataService = realDataService;
    this.subscribedClients = new Map(); // clientId -> Set of subscriptions
    this.addressSubscriptions = new Map(); // address -> Set of clientIds
    this.patternSubscriptions = new Set(); // clientIds subscribed to pattern alerts
    this.streamingSessions = new Map(); // clientId -> streaming session info

    // Memory management settings
    this.maxSubscriptionsPerClient = 100;
    this.maxStreamingSessions = 50;
    this.maxPatternSubscriptions = 500;
    this.cleanupInterval = null;

    // Start periodic cleanup
    this.startPeriodicCleanup();

    wsLogger.info('GraphWebSocket service initialized', {
      maxSubscriptionsPerClient: this.maxSubscriptionsPerClient,
      maxStreamingSessions: this.maxStreamingSessions,
      maxPatternSubscriptions: this.maxPatternSubscriptions,
      hasRealDataService: !!realDataService
    });

    logMethodExit('GraphWebSocket', 'constructor', trackerId);
  }

  /**
   * Set the RealDataService instance (can be called after initialization)
   * @param {RealDataService} realDataService - The RealDataService instance
   */
  setRealDataService(realDataService) {
    this.realDataService = realDataService;
    wsLogger.info('RealDataService set in GraphWebSocket', {
      hasRealDataService: !!realDataService
    });
  }

  /**
   * Initialize WebSocket handlers
   * @param {Server} io - Socket.io server instance
   */
  initializeHandlers(io) {
    const trackerId = logMethodEntry('GraphWebSocket', 'initializeHandlers');
    this.io = io;

    io.on('connection', (socket) => {
      const connectionTimer = startPerformanceTimer('websocket_connection');

      logWebSocketEvent('connection', socket.id, {
        address: socket.handshake.address,
        headers: socket.handshake.headers,
        query: socket.handshake.query
      });

      wsLogger.info('Client connected', {
        id: socket.id,
        transport: socket.conn.transport.name,
        address: socket.handshake.address
      });

      // Initialize client tracking
      this.subscribedClients.set(socket.id, new Set());

      // Handle address subscription
      socket.on('subscribe:address', (data) => {
        logWebSocketEvent('subscribe:address', socket.id, data);
        this.handleSubscription(socket, data);
      });

      // Handle address unsubscription
      socket.on('unsubscribe:address', (data) => {
        logWebSocketEvent('unsubscribe:address', socket.id, data);
        this.handleUnsubscription(socket, data);
      });

      // Handle pattern alert subscription
      socket.on('subscribe:patterns', () => {
        logWebSocketEvent('subscribe:patterns', socket.id);
        this.handlePatternSubscription(socket);
      });

      // Handle pattern alert unsubscription
      socket.on('unsubscribe:patterns', () => {
        logWebSocketEvent('unsubscribe:patterns', socket.id);
        this.handlePatternUnsubscription(socket);
      });

      // Handle progressive graph building
      socket.on('stream:graph', (data) => {
        logWebSocketEvent('stream:graph', socket.id, data);
        this.streamGraphBuilding(socket, data);
      });

      // Handle stopping graph streaming
      socket.on('stream:stop', () => {
        logWebSocketEvent('stream:stop', socket.id);
        this.stopGraphStreaming(socket);
      });

      // Handle heartbeat for connection health
      socket.on('ping', () => {
        wsLogger.debug('Ping received', { socketId: socket.id });
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Clean up on disconnect
      socket.on('disconnect', (reason) => {
        const duration = endPerformanceTimer(connectionTimer, 'websocket_connection');
        logWebSocketEvent('disconnect', socket.id, { reason, duration });
        this.handleDisconnect(socket);
      });

      // Error handling
      socket.on('error', (error) => {
        logError(error, { socketId: socket.id, type: 'websocket_error' });
      });
    });

    wsLogger.info('WebSocket handlers initialized successfully');
    logMethodExit('GraphWebSocket', 'initializeHandlers', trackerId);
  }

  /**
   * Handle client subscription to address updates
   * @param {Socket} socket - Socket instance
   * @param {Object} data - Subscription data
   */
  handleSubscription(socket, data) {
    const methodTimer = startPerformanceTimer('handle_subscription');

    try {
      const { address, filters = {} } = data;

      wsLogger.debug('Processing subscription request', {
        socketId: socket.id,
        address,
        filters
      });

      if (!address || typeof address !== 'string') {
        wsLogger.warn('Invalid subscription request', {
          socketId: socket.id,
          address,
          reason: 'Invalid or missing address'
        });

        socket.emit('error', {
          type: 'subscription_error',
          message: 'Invalid address provided'
        });
        endPerformanceTimer(methodTimer, 'handle_subscription');
        return;
      }

      // Check memory limits
      const clientSubscriptions = this.subscribedClients.get(socket.id);
      if (clientSubscriptions && clientSubscriptions.size >= this.maxSubscriptionsPerClient) {
        socket.emit('error', {
          type: 'subscription_limit_exceeded',
          message: `Maximum ${this.maxSubscriptionsPerClient} subscriptions per client exceeded`
        });
        logger.warn(`GraphWebSocket: Client ${socket.id} exceeded subscription limit`);
        return;
      }

      // Check if already subscribed
      if (clientSubscriptions && clientSubscriptions.has(address)) {
        socket.emit('subscription:confirmed', {
          type: 'address',
          address,
          filters,
          room: `address:${address}`,
          timestamp: Date.now(),
          note: 'Already subscribed'
        });
        return;
      }

      // Add to address-specific room
      const roomName = `address:${address}`;
      socket.join(roomName);

      // Track subscription
      clientSubscriptions.add(address);

      if (!this.addressSubscriptions.has(address)) {
        this.addressSubscriptions.set(address, new Set());
      }
      this.addressSubscriptions.get(address).add(socket.id);

      // Send confirmation
      socket.emit('subscription:confirmed', {
        type: 'address',
        address,
        filters,
        room: roomName,
        timestamp: Date.now()
      });

      logger.info('GraphWebSocket: Client subscribed to address', {
        clientId: socket.id,
        address,
        filters
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error handling subscription', error);
      socket.emit('error', {
        type: 'subscription_error',
        message: 'Failed to process subscription'
      });
    }
  }

  /**
   * Handle client unsubscription from address updates
   * @param {Socket} socket - Socket instance
   * @param {Object} data - Unsubscription data
   */
  handleUnsubscription(socket, data) {
    try {
      const { address } = data;

      if (!address) {
        socket.emit('error', {
          type: 'unsubscription_error',
          message: 'Invalid address provided'
        });
        return;
      }

      // Remove from room
      const roomName = `address:${address}`;
      socket.leave(roomName);

      // Update tracking
      const clientSubscriptions = this.subscribedClients.get(socket.id);
      if (clientSubscriptions) {
        clientSubscriptions.delete(address);
      }

      const addressSubs = this.addressSubscriptions.get(address);
      if (addressSubs) {
        addressSubs.delete(socket.id);
        if (addressSubs.size === 0) {
          this.addressSubscriptions.delete(address);
        }
      }

      socket.emit('unsubscription:confirmed', {
        type: 'address',
        address,
        timestamp: Date.now()
      });

      logger.info('GraphWebSocket: Client unsubscribed from address', {
        clientId: socket.id,
        address
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error handling unsubscription', error);
    }
  }

  /**
   * Handle pattern alert subscription
   * @param {Socket} socket - Socket instance
   */
  handlePatternSubscription(socket) {
    try {
      // Check memory limits
      if (this.patternSubscriptions.size >= this.maxPatternSubscriptions) {
        socket.emit('error', {
          type: 'pattern_subscription_limit_exceeded',
          message: `Maximum ${this.maxPatternSubscriptions} pattern subscriptions exceeded`
        });
        logger.warn(`GraphWebSocket: Pattern subscription limit exceeded`);
        return;
      }

      // Check if already subscribed
      if (this.patternSubscriptions.has(socket.id)) {
        socket.emit('subscription:confirmed', {
          type: 'patterns',
          room: 'patterns:alerts',
          timestamp: Date.now(),
          note: 'Already subscribed'
        });
        return;
      }

      socket.join('patterns:alerts');
      this.patternSubscriptions.add(socket.id);

      socket.emit('subscription:confirmed', {
        type: 'patterns',
        room: 'patterns:alerts',
        timestamp: Date.now()
      });

      logger.info('GraphWebSocket: Client subscribed to pattern alerts', {
        clientId: socket.id
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error handling pattern subscription', error);
    }
  }

  /**
   * Handle pattern alert unsubscription
   * @param {Socket} socket - Socket instance
   */
  handlePatternUnsubscription(socket) {
    try {
      socket.leave('patterns:alerts');
      this.patternSubscriptions.delete(socket.id);

      socket.emit('unsubscription:confirmed', {
        type: 'patterns',
        timestamp: Date.now()
      });

      logger.info('GraphWebSocket: Client unsubscribed from pattern alerts', {
        clientId: socket.id
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error handling pattern unsubscription', error);
    }
  }

  /**
   * Broadcast node updates to subscribed clients
   * @param {string} address - Address of the updated node
   * @param {Object} changes - Node changes data
   */
  broadcastNodeUpdate(address, changes) {
    try {
      if (!this.io) {
        logger.warn('GraphWebSocket: IO not initialized, skipping node update broadcast');
        return;
      }

      const roomName = `address:${address}`;
      const updateData = {
        type: 'node_updated',
        address,
        changes,
        timestamp: Date.now()
      };

      // Broadcast to address-specific room
      this.io.to(roomName).emit('graph:update', updateData);

      logger.debug('GraphWebSocket: Node update broadcasted', {
        address,
        room: roomName,
        changeTypes: Object.keys(changes)
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting node update', error);
    }
  }

  /**
   * Broadcast new node addition
   * @param {Object} node - New node data
   */
  broadcastNodeAdded(node) {
    try {
      if (!this.io) {
        return;
      }

      const updateData = {
        type: 'node_added',
        node,
        timestamp: Date.now()
      };

      // Broadcast to all relevant address rooms
      if (node.address) {
        const roomName = `address:${node.address}`;
        this.io.to(roomName).emit('graph:update', updateData);
      }

      logger.debug('GraphWebSocket: Node addition broadcasted', {
        address: node.address,
        nodeType: node.nodeType
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting node addition', error);
    }
  }

  /**
   * Broadcast node removal
   * @param {string} address - Address of removed node
   */
  broadcastNodeRemoved(address) {
    try {
      if (!this.io) {
        return;
      }

      const updateData = {
        type: 'node_removed',
        address,
        timestamp: Date.now()
      };

      const roomName = `address:${address}`;
      this.io.to(roomName).emit('graph:update', updateData);

      logger.debug('GraphWebSocket: Node removal broadcasted', {
        address
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting node removal', error);
    }
  }

  /**
   * Broadcast edge updates to relevant clients
   * @param {Object} edge - Edge data
   * @param {Object} changes - Edge changes data
   */
  broadcastEdgeUpdate(edge, changes) {
    try {
      if (!this.io) {
        logger.warn('GraphWebSocket: IO not initialized, skipping edge update broadcast');
        return;
      }

      const updateData = {
        type: 'edge_updated',
        edge: {
          id: edge.id,
          source: edge.source,
          target: edge.target
        },
        changes,
        timestamp: Date.now()
      };

      // Broadcast to both source and target address rooms
      const sourceRoom = `address:${edge.source}`;
      const targetRoom = `address:${edge.target}`;

      this.io.to(sourceRoom).emit('graph:update', updateData);
      if (edge.source !== edge.target) {
        this.io.to(targetRoom).emit('graph:update', updateData);
      }

      logger.debug('GraphWebSocket: Edge update broadcasted', {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        changeTypes: Object.keys(changes)
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting edge update', error);
    }
  }

  /**
   * Broadcast new edge addition
   * @param {Object} edge - New edge data
   */
  broadcastEdgeAdded(edge) {
    try {
      if (!this.io) {
        return;
      }

      const updateData = {
        type: 'edge_added',
        edge,
        timestamp: Date.now()
      };

      // Broadcast to both source and target rooms
      const sourceRoom = `address:${edge.source}`;
      const targetRoom = `address:${edge.target}`;

      this.io.to(sourceRoom).emit('graph:update', updateData);
      if (edge.source !== edge.target) {
        this.io.to(targetRoom).emit('graph:update', updateData);
      }

      logger.debug('GraphWebSocket: Edge addition broadcasted', {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting edge addition', error);
    }
  }

  /**
   * Broadcast edge removal
   * @param {Object} edge - Removed edge data
   */
  broadcastEdgeRemoved(edge) {
    try {
      if (!this.io) {
        return;
      }

      const updateData = {
        type: 'edge_removed',
        edge: {
          id: edge.id,
          source: edge.source,
          target: edge.target
        },
        timestamp: Date.now()
      };

      // Broadcast to both source and target rooms
      const sourceRoom = `address:${edge.source}`;
      const targetRoom = `address:${edge.target}`;

      this.io.to(sourceRoom).emit('graph:update', updateData);
      if (edge.source !== edge.target) {
        this.io.to(targetRoom).emit('graph:update', updateData);
      }

      logger.debug('GraphWebSocket: Edge removal broadcasted', {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting edge removal', error);
    }
  }

  /**
   * Broadcast pattern detection alerts
   * @param {Object} pattern - Detected pattern data
   */
  broadcastPatternAlert(pattern) {
    try {
      if (!this.io) {
        logger.warn('GraphWebSocket: IO not initialized, skipping pattern alert broadcast');
        return;
      }

      const alertData = {
        type: 'pattern_detected',
        pattern: {
          id: pattern.id,
          type: pattern.type,
          confidence: pattern.confidence,
          addresses: pattern.addresses,
          description: pattern.description,
          riskLevel: pattern.riskLevel
        },
        timestamp: Date.now()
      };

      // Broadcast to pattern subscribers
      this.io.to('patterns:alerts').emit('pattern:alert', alertData);

      // Also broadcast to specific address rooms if applicable
      if (pattern.addresses && Array.isArray(pattern.addresses)) {
        pattern.addresses.forEach(address => {
          const roomName = `address:${address}`;
          this.io.to(roomName).emit('pattern:alert', alertData);
        });
      }

      logger.info('GraphWebSocket: Pattern alert broadcasted', {
        patternId: pattern.id,
        patternType: pattern.type,
        riskLevel: pattern.riskLevel,
        addressCount: pattern.addresses?.length || 0
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting pattern alert', error);
    }
  }

  /**
   * Broadcast risk alerts
   * @param {Object} alert - Risk alert data
   */
  broadcastRiskAlert(alert) {
    try {
      if (!this.io) {
        return;
      }

      const alertData = {
        type: 'risk_alert',
        alert: {
          id: alert.id,
          severity: alert.severity,
          address: alert.address,
          riskType: alert.riskType,
          description: alert.description,
          score: alert.score
        },
        timestamp: Date.now()
      };

      // Broadcast to pattern subscribers
      this.io.to('patterns:alerts').emit('risk:alert', alertData);

      // Also broadcast to specific address room
      if (alert.address) {
        const roomName = `address:${alert.address}`;
        this.io.to(roomName).emit('risk:alert', alertData);
      }

      logger.info('GraphWebSocket: Risk alert broadcasted', {
        alertId: alert.id,
        severity: alert.severity,
        address: alert.address
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting risk alert', error);
    }
  }

  /**
   * Stream progressive graph building to client
   * @param {Socket} socket - Socket instance
   * @param {Object} query - Graph query parameters
   */
  async streamGraphBuilding(socket, query) {
    try {
      const { address, depth = 2, minVolume = '0', streamId, maxPages = 10 } = query;

      if (!address) {
        socket.emit('error', {
          type: 'stream_error',
          message: 'Address required for graph streaming'
        });
        return;
      }

      // Check memory limits
      if (this.streamingSessions.size >= this.maxStreamingSessions) {
        socket.emit('error', {
          type: 'streaming_limit_exceeded',
          message: `Maximum ${this.maxStreamingSessions} concurrent streaming sessions exceeded`
        });
        logger.warn(`GraphWebSocket: Streaming session limit exceeded`);
        return;
      }

      // Check if client already has an active stream
      if (this.streamingSessions.has(socket.id)) {
        socket.emit('error', {
          type: 'stream_already_active',
          message: 'Client already has an active streaming session'
        });
        return;
      }

      const sessionId = streamId || `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store streaming session
      this.streamingSessions.set(socket.id, {
        sessionId,
        address,
        depth,
        minVolume,
        maxPages,
        startTime: Date.now(),
        status: 'active'
      });

      // Send stream start confirmation
      socket.emit('stream:started', {
        sessionId,
        address,
        depth,
        minVolume: minVolume ? (BigInt(minVolume) / BigInt(10 ** 10)).toString() + ' DOT' : 'none',
        timestamp: Date.now()
      });

      logger.info('GraphWebSocket: Graph streaming started', {
        clientId: socket.id,
        sessionId,
        address,
        depth,
        minVolume: minVolume ? (BigInt(minVolume) / BigInt(10 ** 10)).toString() + ' DOT' : 'none'
      });

      // Use real progressive graph building if available
      if (BigInt(minVolume) > BigInt(0) && this.realDataService) {
        await this._streamRealGraphData(socket, sessionId, address, depth, minVolume, maxPages);
      } else {
        // Fallback to simulation
        await this._simulateProgressiveGraphBuilding(socket, sessionId, address, depth, minVolume);
      }

    } catch (error) {
      logger.error('GraphWebSocket: Error in graph streaming', error);
      socket.emit('stream:error', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Stop graph streaming for a client
   * @param {Socket} socket - Socket instance
   */
  stopGraphStreaming(socket) {
    try {
      const session = this.streamingSessions.get(socket.id);
      if (session) {
        session.status = 'stopped';
        this.streamingSessions.delete(socket.id);

        socket.emit('stream:stopped', {
          sessionId: session.sessionId,
          timestamp: Date.now()
        });

        logger.info('GraphWebSocket: Graph streaming stopped', {
          clientId: socket.id,
          sessionId: session.sessionId
        });
      }
    } catch (error) {
      logger.error('GraphWebSocket: Error stopping graph streaming', error);
    }
  }

  /**
   * Stream real graph data progressively
   * @param {Socket} socket - Socket instance
   * @param {string} sessionId - Stream session ID
   * @param {string} address - Center address
   * @param {number} depth - Graph depth
   * @param {string} minVolume - Minimum volume filter
   * @param {number} maxPages - Maximum pages to fetch
   */
  async _streamRealGraphData(socket, sessionId, address, depth, minVolume, maxPages) {
    const session = this.streamingSessions.get(socket.id);
    if (!session || session.status !== 'active') {
      return;
    }

    try {
      wsLogger.info('Starting real graph data streaming', {
        sessionId,
        address,
        depth,
        minVolume: (BigInt(minVolume) / BigInt(10 ** 10)).toString() + ' DOT'
      });

      // Stream filtered graph data
      const result = await this.realDataService.buildFilteredGraphData(address, depth, {
        minVolume,
        maxPages,
        pageSize: 100,
        onProgress: (progress) => {
          // Check if session is still active
          const currentSession = this.streamingSessions.get(socket.id);
          if (!currentSession || currentSession.status !== 'active') {
            return;
          }

          // Send progress update
          socket.emit('stream:progress', {
            sessionId,
            progress: {
              ...progress,
              phase: progress.type === 'fetching' ? `Fetching connections (${progress.currentAddress}/${progress.totalAddresses})` : 'Processing',
              percentage: Math.round((progress.currentAddress / progress.totalAddresses) * 100)
            },
            timestamp: Date.now()
          });

          // Send batch data if available
          if (progress.type === 'completed' && progress.foundRelationships > 0) {
            socket.emit('stream:data', {
              sessionId,
              batch: {
                address: progress.address,
                depth: progress.depth,
                relationshipsFound: progress.foundRelationships,
                currentNodes: progress.currentNodes,
                currentEdges: progress.currentEdges
              },
              timestamp: Date.now()
            });
          }
        }
      });

      // Send final result
      if (session && session.status === 'active') {
        socket.emit('stream:completed', {
          sessionId,
          summary: {
            totalNodes: result.nodes.length,
            totalEdges: result.edges.length,
            executionTime: Date.now() - session.startTime,
            metadata: result.metadata
          },
          graph: result,
          timestamp: Date.now()
        });

        wsLogger.info('Real graph data streaming completed', {
          sessionId,
          totalNodes: result.nodes.length,
          totalEdges: result.edges.length,
          executionTime: Date.now() - session.startTime
        });
      }
    } catch (error) {
      wsLogger.error('Error streaming real graph data', {
        sessionId,
        error: error.message
      });
      
      socket.emit('stream:error', {
        sessionId,
        error: error.message,
        timestamp: Date.now()
      });
    } finally {
      // Clean up session
      this.streamingSessions.delete(socket.id);
    }
  }

  /**
   * Simulate progressive graph building (placeholder for real implementation)
   * @param {Socket} socket - Socket instance
   * @param {string} sessionId - Stream session ID
   * @param {string} address - Center address
   * @param {number} depth - Graph depth
   * @param {string} minVolume - Minimum volume filter
   */
  async _simulateProgressiveGraphBuilding(socket, sessionId, address, depth, _minVolume) {
    const session = this.streamingSessions.get(socket.id);
    if (!session || session.status !== 'active') {
      return;
    }

    // Send progress updates
    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
      if (!session || session.status !== 'active') {
        break;
      }

      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send progress update
      socket.emit('stream:progress', {
        sessionId,
        progress: {
          currentDepth,
          totalDepth: depth,
          phase: `Building depth ${currentDepth}`,
          percentage: Math.round((currentDepth / depth) * 100)
        },
        timestamp: Date.now()
      });

      // Simulate nodes/edges being found
      const mockNodes = [{
        id: `node_${currentDepth}_1`,
        address: `addr_${currentDepth}_1`,
        hopLevel: currentDepth,
        nodeType: 'discovered'
      }];

      const mockEdges = currentDepth > 1 ? [{
        id: `edge_${currentDepth}_1`,
        source: `addr_${currentDepth - 1}_1`,
        target: `addr_${currentDepth}_1`,
        volume: '1000000'
      }] : [];

      socket.emit('stream:data', {
        sessionId,
        batch: {
          nodes: mockNodes,
          edges: mockEdges,
          depth: currentDepth
        },
        timestamp: Date.now()
      });
    }

    // Send completion
    if (session && session.status === 'active') {
      socket.emit('stream:completed', {
        sessionId,
        summary: {
          totalNodes: depth,
          totalEdges: depth - 1,
          executionTime: Date.now() - session.startTime
        },
        timestamp: Date.now()
      });

      this.streamingSessions.delete(socket.id);
    }
  }

  /**
   * Handle client disconnect cleanup
   * @param {Socket} socket - Socket instance
   */
  handleDisconnect(socket) {
    try {
      logger.info('GraphWebSocket: Client disconnected', { id: socket.id });

      // Clean up subscriptions
      const clientSubscriptions = this.subscribedClients.get(socket.id);
      if (clientSubscriptions) {
        clientSubscriptions.forEach(address => {
          const addressSubs = this.addressSubscriptions.get(address);
          if (addressSubs) {
            addressSubs.delete(socket.id);
            if (addressSubs.size === 0) {
              this.addressSubscriptions.delete(address);
            }
          }
        });
        this.subscribedClients.delete(socket.id);
      }

      // Clean up pattern subscriptions
      this.patternSubscriptions.delete(socket.id);

      // Clean up streaming sessions
      this.streamingSessions.delete(socket.id);

    } catch (error) {
      logger.error('GraphWebSocket: Error handling disconnect', error);
    }
  }

  /**
   * Get subscription statistics
   * @returns {Object} Subscription statistics
   */
  getSubscriptionStats() {
    return {
      connectedClients: this.subscribedClients.size,
      addressSubscriptions: this.addressSubscriptions.size,
      patternSubscriptions: this.patternSubscriptions.size,
      activeStreams: this.streamingSessions.size,
      totalAddressSubscriptions: Array.from(this.addressSubscriptions.values())
        .reduce((sum, subs) => sum + subs.size, 0),
      memoryLimits: {
        maxSubscriptionsPerClient: this.maxSubscriptionsPerClient,
        maxStreamingSessions: this.maxStreamingSessions,
        maxPatternSubscriptions: this.maxPatternSubscriptions
      }
    };
  }

  /**
   * Start periodic cleanup of orphaned data
   */
  startPeriodicCleanup() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Perform periodic cleanup of memory leaks
   */
  performPeriodicCleanup() {
    try {
      let cleanedCount = 0;

      // Clean orphaned address subscriptions
      for (const [address, clientIds] of this.addressSubscriptions.entries()) {
        const validClientIds = new Set();
        for (const clientId of clientIds) {
          if (this.subscribedClients.has(clientId)) {
            validClientIds.add(clientId);
          } else {
            cleanedCount++;
          }
        }

        if (validClientIds.size === 0) {
          this.addressSubscriptions.delete(address);
        } else if (validClientIds.size !== clientIds.size) {
          this.addressSubscriptions.set(address, validClientIds);
        }
      }

      // Clean orphaned pattern subscriptions
      const validPatternSubs = new Set();
      for (const clientId of this.patternSubscriptions) {
        if (this.subscribedClients.has(clientId)) {
          validPatternSubs.add(clientId);
        } else {
          cleanedCount++;
        }
      }
      this.patternSubscriptions = validPatternSubs;

      // Clean orphaned streaming sessions
      for (const [clientId, session] of this.streamingSessions.entries()) {
        if (!this.subscribedClients.has(clientId) ||
            Date.now() - session.startTime > 30 * 60 * 1000) { // 30 minute timeout
          this.streamingSessions.delete(clientId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info(`GraphWebSocket: Periodic cleanup removed ${cleanedCount} orphaned entries`);
      }

      // Log memory statistics
      const stats = this.getSubscriptionStats();
      logger.debug('GraphWebSocket: Memory stats', stats);

    } catch (error) {
      logger.error('GraphWebSocket: Error during periodic cleanup', error);
    }
  }

  /**
   * Broadcast general graph analytics updates
   * @param {Object} analytics - Analytics data
   */
  broadcastAnalytics(analytics) {
    try {
      if (!this.io) {
        return;
      }

      const analyticsData = {
        type: 'analytics_update',
        analytics,
        timestamp: Date.now()
      };

      // Broadcast to all connected clients
      this.io.emit('analytics:update', analyticsData);

      logger.debug('GraphWebSocket: Analytics update broadcasted', {
        metricsCount: Object.keys(analytics).length
      });

    } catch (error) {
      logger.error('GraphWebSocket: Error broadcasting analytics', error);
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup() {
    try {
      logger.info('GraphWebSocket: Starting cleanup...');

      // Stop periodic cleanup
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Perform final cleanup
      this.performPeriodicCleanup();

      // Clear all data structures
      this.subscribedClients.clear();
      this.addressSubscriptions.clear();
      this.patternSubscriptions.clear();
      this.streamingSessions.clear();

      // Close all WebSocket connections if IO is available
      if (this.io) {
        this.io.emit('server_maintenance', {
          message: 'Server is shutting down for maintenance',
          timestamp: Date.now()
        });

        // Give clients time to disconnect gracefully
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('GraphWebSocket: Cleanup completed');
    } catch (error) {
      logger.error('GraphWebSocket: Error during cleanup', error);
    }
  }
}