import { logger } from '../utils/logger.js';

/**
 * GraphWebSocket Service - Handles real-time graph updates via WebSocket
 * Provides efficient room-based broadcasting for graph changes and analytics
 */
export class GraphWebSocket {
  constructor() {
    this.io = null;
    this.subscribedClients = new Map(); // clientId -> Set of subscriptions
    this.addressSubscriptions = new Map(); // address -> Set of clientIds
    this.patternSubscriptions = new Set(); // clientIds subscribed to pattern alerts
    this.streamingSessions = new Map(); // clientId -> streaming session info
  }

  /**
   * Initialize WebSocket handlers
   * @param {Server} io - Socket.io server instance
   */
  initializeHandlers(io) {
    this.io = io;
    
    io.on('connection', (socket) => {
      logger.info('GraphWebSocket: Client connected', { id: socket.id });
      
      // Initialize client tracking
      this.subscribedClients.set(socket.id, new Set());
      
      // Handle address subscription
      socket.on('subscribe:address', (data) => {
        this.handleSubscription(socket, data);
      });
      
      // Handle address unsubscription
      socket.on('unsubscribe:address', (data) => {
        this.handleUnsubscription(socket, data);
      });
      
      // Handle pattern alert subscription
      socket.on('subscribe:patterns', () => {
        this.handlePatternSubscription(socket);
      });
      
      // Handle pattern alert unsubscription
      socket.on('unsubscribe:patterns', () => {
        this.handlePatternUnsubscription(socket);
      });
      
      // Handle progressive graph building
      socket.on('stream:graph', (data) => {
        this.streamGraphBuilding(socket, data);
      });
      
      // Handle stopping graph streaming
      socket.on('stream:stop', () => {
        this.stopGraphStreaming(socket);
      });
      
      // Handle heartbeat for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
      
      // Clean up on disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
    
    logger.info('GraphWebSocket: Handlers initialized');
  }

  /**
   * Handle client subscription to address updates
   * @param {Socket} socket - Socket instance
   * @param {Object} data - Subscription data
   */
  handleSubscription(socket, data) {
    try {
      const { address, filters = {} } = data;
      
      if (!address || typeof address !== 'string') {
        socket.emit('error', {
          type: 'subscription_error',
          message: 'Invalid address provided'
        });
        return;
      }
      
      // Add to address-specific room
      const roomName = `address:${address}`;
      socket.join(roomName);
      
      // Track subscription
      const clientSubscriptions = this.subscribedClients.get(socket.id);
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
      if (!this.io) return;
      
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
      if (!this.io) return;
      
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
      if (!this.io) return;
      
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
      if (!this.io) return;
      
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
      if (!this.io) return;
      
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
      const { address, depth = 2, minVolume = '0', streamId } = query;
      
      if (!address) {
        socket.emit('error', {
          type: 'stream_error',
          message: 'Address required for graph streaming'
        });
        return;
      }
      
      const sessionId = streamId || `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store streaming session
      this.streamingSessions.set(socket.id, {
        sessionId,
        address,
        depth,
        startTime: Date.now(),
        status: 'active'
      });
      
      // Send stream start confirmation
      socket.emit('stream:started', {
        sessionId,
        address,
        depth,
        timestamp: Date.now()
      });
      
      logger.info('GraphWebSocket: Graph streaming started', {
        clientId: socket.id,
        sessionId,
        address,
        depth
      });
      
      // Simulate progressive graph building
      // In a real implementation, this would interface with GraphQueries
      await this._simulateProgressiveGraphBuilding(socket, sessionId, address, depth, minVolume);
      
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
   * Simulate progressive graph building (placeholder for real implementation)
   * @param {Socket} socket - Socket instance
   * @param {string} sessionId - Stream session ID
   * @param {string} address - Center address
   * @param {number} depth - Graph depth
   * @param {string} minVolume - Minimum volume filter
   */
  async _simulateProgressiveGraphBuilding(socket, sessionId, address, depth, minVolume) {
    const session = this.streamingSessions.get(socket.id);
    if (!session || session.status !== 'active') return;
    
    // Send progress updates
    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
      if (!session || session.status !== 'active') break;
      
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
        .reduce((sum, subs) => sum + subs.size, 0)
    };
  }

  /**
   * Broadcast general graph analytics updates
   * @param {Object} analytics - Analytics data
   */
  broadcastAnalytics(analytics) {
    try {
      if (!this.io) return;
      
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
}