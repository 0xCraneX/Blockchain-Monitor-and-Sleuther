/**
 * WebSocket Testing Utilities
 * 
 * Provides comprehensive WebSocket testing capabilities that would have caught
 * the CORS and connection issues we encountered.
 */

export class WebSocketTester {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.connections = [];
  }

  /**
   * Test WebSocket connection from different origins
   */
  async testCrossOriginConnection(origin) {
    return await this.page.evaluate(async ({ baseUrl, origin }) => {
      // Override fetch to set origin header
      const originalFetch = window.fetch;
      window.fetch = function(url, options = {}) {
        options.headers = {
          ...options.headers,
          'Origin': origin
        };
        return originalFetch(url, options);
      };

      try {
        const socket = io(baseUrl, {
          transports: ['websocket'],
          withCredentials: true,
          extraHeaders: {
            'Origin': origin
          }
        });

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            socket.close();
            resolve({
              success: false,
              error: 'Connection timeout',
              origin
            });
          }, 5000);

          socket.on('connect', () => {
            clearTimeout(timeout);
            const result = {
              success: true,
              socketId: socket.id,
              origin,
              transport: socket.io.engine.transport.name
            };
            socket.close();
            resolve(result);
          });

          socket.on('connect_error', (error) => {
            clearTimeout(timeout);
            socket.close();
            resolve({
              success: false,
              error: error.message,
              type: error.type,
              origin
            });
          });
        });
      } catch (error) {
        return {
          success: false,
          error: error.message,
          origin
        };
      }
    }, { baseUrl: this.baseUrl, origin });
  }

  /**
   * Test WebSocket with various connection scenarios
   */
  async testConnectionScenarios() {
    const scenarios = [
      {
        name: 'Standard connection',
        options: {}
      },
      {
        name: 'No origin header',
        options: { extraHeaders: { 'Origin': null } }
      },
      {
        name: 'Different port origin',
        options: { extraHeaders: { 'Origin': 'http://localhost:4000' } }
      },
      {
        name: 'HTTPS origin',
        options: { extraHeaders: { 'Origin': 'https://localhost:3001' } }
      },
      {
        name: 'IP address origin',
        options: { extraHeaders: { 'Origin': 'http://127.0.0.1:3001' } }
      },
      {
        name: 'External origin',
        options: { extraHeaders: { 'Origin': 'http://example.com' } }
      },
      {
        name: 'WebSocket only transport',
        options: { transports: ['websocket'] }
      },
      {
        name: 'Polling only transport',
        options: { transports: ['polling'] }
      }
    ];

    const results = [];

    for (const scenario of scenarios) {
      const result = await this.page.evaluate(async ({ baseUrl, options, name }) => {
        try {
          const socket = io(baseUrl, {
            ...options,
            timeout: 3000
          });

          return new Promise((resolve) => {
            const startTime = Date.now();
            
            socket.on('connect', () => {
              const result = {
                scenario: name,
                success: true,
                connectionTime: Date.now() - startTime,
                transport: socket.io.engine.transport.name,
                socketId: socket.id
              };
              socket.close();
              resolve(result);
            });

            socket.on('connect_error', (error) => {
              resolve({
                scenario: name,
                success: false,
                error: error.message,
                type: error.type,
                connectionTime: Date.now() - startTime
              });
              socket.close();
            });

            setTimeout(() => {
              socket.close();
              resolve({
                scenario: name,
                success: false,
                error: 'Timeout',
                connectionTime: Date.now() - startTime
              });
            }, 5000);
          });
        } catch (error) {
          return {
            scenario: name,
            success: false,
            error: error.message
          };
        }
      }, { baseUrl: this.baseUrl, options: scenario.options, name: scenario.name });

      results.push(result);
    }

    return results;
  }

  /**
   * Test WebSocket message handling and performance
   */
  async testMessageHandling() {
    return await this.page.evaluate(async (baseUrl) => {
      const socket = io(baseUrl, {
        transports: ['websocket', 'polling']
      });

      const results = {
        connectionTime: 0,
        messageLatencies: [],
        errors: [],
        disconnections: []
      };

      return new Promise((resolve) => {
        const startTime = Date.now();

        socket.on('connect', async () => {
          results.connectionTime = Date.now() - startTime;

          // Test various message patterns
          const testMessages = [
            { type: 'small', data: { test: 'data' } },
            { type: 'medium', data: { array: new Array(100).fill('test') } },
            { type: 'large', data: { array: new Array(1000).fill('test') } },
            { type: 'nested', data: { level1: { level2: { level3: 'deep' } } } },
            { type: 'special-chars', data: { text: '<!@#$%^&*()>' } },
            { type: 'unicode', data: { text: '🚀 Unicode test 测试' } },
            { type: 'null-values', data: { null: null, undefined: undefined } }
          ];

          for (const testMsg of testMessages) {
            const msgStart = Date.now();
            
            socket.emit('test:echo', testMsg, (response) => {
              results.messageLatencies.push({
                type: testMsg.type,
                latency: Date.now() - msgStart,
                success: true
              });
            });

            // Small delay between messages
            await new Promise(r => setTimeout(r, 100));
          }

          // Test graph generation
          const graphStart = Date.now();
          socket.emit('graph:generate', {
            address: '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
            options: { depth: 2 }
          });

          socket.on('graph:data', (data) => {
            results.graphGeneration = {
              success: true,
              latency: Date.now() - graphStart,
              nodes: data.graph?.nodes?.length || 0,
              edges: data.graph?.edges?.length || 0
            };
          });

          socket.on('graph:error', (error) => {
            results.graphGeneration = {
              success: false,
              error: error.message,
              latency: Date.now() - graphStart
            };
          });

          // Wait for all tests to complete
          setTimeout(() => {
            socket.close();
            resolve(results);
          }, 3000);
        });

        socket.on('error', (error) => {
          results.errors.push({
            message: error.message || error,
            timestamp: Date.now() - startTime
          });
        });

        socket.on('disconnect', (reason) => {
          results.disconnections.push({
            reason,
            timestamp: Date.now() - startTime
          });
        });

        socket.on('connect_error', (error) => {
          resolve({
            ...results,
            connectionError: error.message
          });
        });

        // Timeout
        setTimeout(() => {
          socket.close();
          resolve({
            ...results,
            timeout: true
          });
        }, 10000);
      });
    }, this.baseUrl);
  }

  /**
   * Test WebSocket reconnection behavior
   */
  async testReconnection() {
    return await this.page.evaluate(async (baseUrl) => {
      const socket = io(baseUrl, {
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2000
      });

      const events = [];
      
      return new Promise((resolve) => {
        const startTime = Date.now();
        
        const logEvent = (type, data = {}) => {
          events.push({
            type,
            timestamp: Date.now() - startTime,
            ...data
          });
        };

        socket.on('connect', () => {
          logEvent('connect', { id: socket.id });
          
          // Simulate disconnection after 1 second
          setTimeout(() => {
            socket.io.engine.close();
          }, 1000);
        });

        socket.on('disconnect', (reason) => {
          logEvent('disconnect', { reason });
        });

        socket.on('reconnect', (attemptNumber) => {
          logEvent('reconnect', { attemptNumber });
        });

        socket.on('reconnect_attempt', (attemptNumber) => {
          logEvent('reconnect_attempt', { attemptNumber });
        });

        socket.on('reconnect_error', (error) => {
          logEvent('reconnect_error', { error: error.message });
        });

        socket.on('reconnect_failed', () => {
          logEvent('reconnect_failed');
        });

        // End test after 5 seconds
        setTimeout(() => {
          socket.close();
          resolve({
            events,
            finalState: {
              connected: socket.connected,
              disconnected: socket.disconnected
            }
          });
        }, 5000);
      });
    }, this.baseUrl);
  }

  /**
   * Clean up all connections
   */
  async cleanup() {
    await this.page.evaluate(() => {
      if (window.io && window.io.sockets) {
        window.io.sockets.forEach(socket => socket.close());
      }
    });
  }
}

/**
 * Create a mock WebSocket server for testing
 */
export function createMockWebSocketServer(port = 3005) {
  const { Server } = require('socket.io');
  const http = require('http');
  
  const server = http.createServer();
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    // Echo test
    socket.on('test:echo', (data, callback) => {
      if (callback) callback(data);
    });

    // Mock graph generation
    socket.on('graph:generate', (data) => {
      setTimeout(() => {
        socket.emit('graph:data', {
          graph: {
            nodes: Array(10).fill(null).map((_, i) => ({ id: `node-${i}` })),
            edges: Array(15).fill(null).map((_, i) => ({ 
              source: `node-${i % 10}`, 
              target: `node-${(i + 1) % 10}` 
            }))
          }
        });
      }, 100);
    });
  });

  server.listen(port);
  
  return {
    io,
    server,
    close: () => new Promise(resolve => server.close(resolve))
  };
}