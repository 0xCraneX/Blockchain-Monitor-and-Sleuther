import { BaseAnomalyDetector } from '../BaseAnomalyDetector.js';

/**
 * NetworkAnomalyDetector - Detects anomalies in transaction network patterns
 * Identifies new connections, clustering behavior, and coordinated activities
 */
export class NetworkAnomalyDetector extends BaseAnomalyDetector {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      // Connection thresholds
      newConnectionThreshold: config.newConnectionThreshold || 5,
      massiveConnectionThreshold: config.massiveConnectionThreshold || 20,
      
      // Clustering detection
      clusteringThreshold: config.clusteringThreshold || 0.7, // Similarity threshold
      minClusterSize: config.minClusterSize || 3,
      
      // Interaction patterns
      interactionWindow: config.interactionWindow || 7 * 24 * 60 * 60 * 1000, // 7 days
      coreNetworkPercentile: config.coreNetworkPercentile || 80, // Top 20% are core
      
      // Coordinated activity
      coordinationTimeWindow: config.coordinationTimeWindow || 300000, // 5 minutes
      coordinationThreshold: config.coordinationThreshold || 0.8,
      
      // Exchange detection
      knownExchanges: config.knownExchanges || [
        // Add known exchange addresses here
      ],
      
      // Network metrics
      calculateCentrality: config.calculateCentrality !== false,
      detectBridges: config.detectBridges !== false
    };
    
    // Network analysis cache
    this.networkCache = new Map(); // address -> network metrics
    this.globalNetwork = new Map(); // all known connections
  }
  
  /**
   * Main detection method
   */
  async detect(address, activity, context) {
    const { pattern, recentTransfers, relatedAddresses } = context;
    
    if (!pattern || !recentTransfers || recentTransfers.length === 0) {
      return null;
    }
    
    const anomalies = [];
    
    // Extract network information from recent transfers
    const networkData = this.extractNetworkData(address, recentTransfers);
    
    // 1. New connection detection
    const newConnectionAnomaly = await this.detectNewConnections(
      address,
      networkData,
      pattern.network
    );
    if (newConnectionAnomaly) anomalies.push(newConnectionAnomaly);
    
    // 2. Clustering detection
    const clusteringAnomaly = await this.detectClustering(
      address,
      networkData,
      pattern.network
    );
    if (clusteringAnomaly) anomalies.push(clusteringAnomaly);
    
    // 3. Coordinated activity detection
    if (relatedAddresses && relatedAddresses.length > 0) {
      const coordinationAnomaly = await this.detectCoordinatedActivity(
        address,
        recentTransfers,
        relatedAddresses
      );
      if (coordinationAnomaly) anomalies.push(coordinationAnomaly);
    }
    
    // 4. Bridge/hub detection
    if (this.config.detectBridges) {
      const bridgeAnomaly = await this.detectBridgeBehavior(
        address,
        networkData,
        pattern.network
      );
      if (bridgeAnomaly) anomalies.push(bridgeAnomaly);
    }
    
    // 5. Exchange interaction pattern
    const exchangeAnomaly = await this.detectExchangePattern(
      address,
      networkData,
      pattern.network
    );
    if (exchangeAnomaly) anomalies.push(exchangeAnomaly);
    
    // Update network cache
    this.updateNetworkCache(address, networkData);
    
    // Return most significant anomaly
    if (anomalies.length > 0) {
      return anomalies.sort((a, b) => {
        const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })[0];
    }
    
    return null;
  }
  
  /**
   * Detect new connections outside established network
   */
  async detectNewConnections(address, networkData, historicalNetwork) {
    const currentConnections = networkData.connections;
    const historicalConnections = new Set(historicalNetwork.recentConnections || []);
    const coreNetwork = new Set(historicalNetwork.coreNetwork || []);
    
    // Find truly new connections
    const newConnections = currentConnections.filter(conn => 
      !historicalConnections.has(conn.address) && !coreNetwork.has(conn.address)
    );
    
    if (newConnections.length >= this.config.newConnectionThreshold) {
      // Analyze the new connections
      const analysis = await this.analyzeNewConnections(newConnections, historicalNetwork);
      
      const severity = this.calculateNewConnectionSeverity(
        newConnections.length,
        analysis
      );
      
      return this.formatAnomaly(
        'NETWORK_EXPANSION',
        severity,
        {
          newAddressCount: newConnections.length,
          totalCurrentConnections: currentConnections.length,
          historicalUniqueAddresses: historicalNetwork.totalUniqueAddresses || 0,
          newConnections: newConnections.slice(0, 10), // Top 10
          connectionTypes: analysis.types,
          riskScore: analysis.riskScore,
          patterns: analysis.patterns,
          potentialReason: analysis.reason,
          coreNetworkSize: coreNetwork.size
        },
        Math.min(0.95, 0.7 + newConnections.length / 50),
        `${newConnections.length} new address connections detected${analysis.reason ? ` (likely ${analysis.reason})` : ''}`
      );
    }
    
    return null;
  }
  
  /**
   * Detect clustering behavior in network
   */
  async detectClustering(address, networkData, historicalNetwork) {
    const connections = networkData.connections;
    
    if (connections.length < this.config.minClusterSize * 2) {
      return null; // Not enough connections for clustering
    }
    
    // Build connection graph
    const graph = this.buildConnectionGraph(connections);
    
    // Find clusters using simple similarity
    const clusters = this.findClusters(graph);
    
    if (clusters.length > 0) {
      const largestCluster = clusters.sort((a, b) => b.size - a.size)[0];
      
      if (largestCluster.size >= this.config.minClusterSize) {
        const clusterAnalysis = this.analyzeCluster(largestCluster, connections);
        
        return this.formatAnomaly(
          'NETWORK_CLUSTERING',
          clusterAnalysis.severity,
          {
            clusterCount: clusters.length,
            largestClusterSize: largestCluster.size,
            clusterMembers: Array.from(largestCluster.members).slice(0, 10),
            clusterDensity: largestCluster.density,
            interClusterConnections: clusterAnalysis.interConnections,
            pattern: clusterAnalysis.pattern,
            suspicionLevel: clusterAnalysis.suspicionLevel,
            totalVolume: clusterAnalysis.totalVolume
          },
          0.85,
          `Network clustering detected: ${clusters.length} clusters with largest having ${largestCluster.size} members`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Detect coordinated activity between addresses
   */
  async detectCoordinatedActivity(address, transfers, relatedAddresses) {
    // Time-based correlation analysis
    const activities = new Map();
    
    // Collect activities for each address
    for (const addr of [address, ...relatedAddresses]) {
      const addrTransfers = transfers.filter(tx => 
        tx.from === addr || tx.to === addr
      );
      
      if (addrTransfers.length > 0) {
        activities.set(addr, addrTransfers);
      }
    }
    
    if (activities.size < 2) {
      return null; // Need at least 2 active addresses
    }
    
    // Calculate temporal correlation
    const correlation = this.calculateTemporalCorrelation(activities);
    
    if (correlation.score >= this.config.coordinationThreshold) {
      // Analyze coordination pattern
      const pattern = this.analyzeCoordinationPattern(activities, correlation);
      
      return this.formatAnomaly(
        'COORDINATED_ACTIVITY',
        pattern.severity,
        {
          addressCount: activities.size,
          correlationScore: correlation.score,
          timeAlignment: correlation.alignment,
          pattern: pattern.type,
          coordinatedTransfers: correlation.coordinatedTransfers,
          totalVolume: pattern.totalVolume,
          commonCounterparties: pattern.commonTargets,
          sequenceAnalysis: pattern.sequence,
          confidence: correlation.confidence
        },
        correlation.confidence,
        `${activities.size} addresses showing coordinated behavior (${(correlation.score * 100).toFixed(0)}% correlation)`
      );
    }
    
    return null;
  }
  
  /**
   * Detect bridge/hub behavior
   */
  async detectBridgeBehavior(address, networkData, historicalNetwork) {
    const connections = networkData.connections;
    
    if (connections.length < 10) {
      return null; // Not enough connections for bridge detection
    }
    
    // Calculate network metrics
    const metrics = this.calculateNetworkMetrics(address, connections);
    
    // Check for bridge characteristics
    if (metrics.betweennessCentrality > 0.5 && metrics.inOutRatio > 0.4 && metrics.inOutRatio < 0.6) {
      // Appears to be a bridge/intermediary
      const bridgeAnalysis = this.analyzeBridgePattern(connections, metrics);
      
      if (bridgeAnalysis.confidence > 0.7) {
        return this.formatAnomaly(
          'BRIDGE_BEHAVIOR',
          bridgeAnalysis.severity,
          {
            betweennessCentrality: metrics.betweennessCentrality,
            incomingConnections: metrics.incoming,
            outgoingConnections: metrics.outgoing,
            uniquePathways: bridgeAnalysis.pathways,
            volumeRouted: bridgeAnalysis.volumeRouted,
            pattern: bridgeAnalysis.pattern,
            suspectedRole: bridgeAnalysis.role,
            connectedClusters: bridgeAnalysis.clusters
          },
          bridgeAnalysis.confidence,
          `Address acting as network bridge with ${metrics.betweennessCentrality.toFixed(2)} centrality score`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Detect exchange interaction patterns
   */
  async detectExchangePattern(address, networkData, historicalNetwork) {
    const connections = networkData.connections;
    
    // Check for known exchange interactions
    const exchangeConnections = connections.filter(conn => 
      this.isKnownExchange(conn.address) || this.hasExchangePattern(conn)
    );
    
    if (exchangeConnections.length > 0) {
      const totalVolume = exchangeConnections.reduce((sum, conn) => sum + conn.volume, 0);
      const pattern = this.analyzeExchangeInteraction(exchangeConnections, connections);
      
      if (pattern.isSignificant) {
        return this.formatAnomaly(
          'EXCHANGE_INTERACTION',
          pattern.severity,
          {
            exchangeCount: exchangeConnections.length,
            exchanges: exchangeConnections.map(c => ({
              address: c.address,
              volume: c.volume,
              type: c.direction
            })),
            totalVolume: totalVolume,
            pattern: pattern.type,
            timing: pattern.timing,
            percentOfActivity: (exchangeConnections.length / connections.length) * 100,
            depositWithdrawRatio: pattern.ratio
          },
          0.9,
          `Significant exchange activity: ${this.formatAmount(totalVolume)} across ${exchangeConnections.length} exchanges`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Helper methods for network analysis
   */
  extractNetworkData(address, transfers) {
    const connections = new Map();
    
    transfers.forEach(tx => {
      const counterparty = tx.from === address ? tx.to : tx.from;
      const direction = tx.from === address ? 'outgoing' : 'incoming';
      
      if (!connections.has(counterparty)) {
        connections.set(counterparty, {
          address: counterparty,
          incoming: 0,
          outgoing: 0,
          volume: 0,
          count: 0,
          firstSeen: tx.timestamp || tx.block_timestamp,
          lastSeen: tx.timestamp || tx.block_timestamp
        });
      }
      
      const conn = connections.get(counterparty);
      conn[direction] += 1;
      conn.volume += parseFloat(tx.amount || 0);
      conn.count += 1;
      conn.lastSeen = tx.timestamp || tx.block_timestamp;
    });
    
    return {
      connections: Array.from(connections.values()),
      uniqueAddresses: connections.size,
      totalVolume: Array.from(connections.values()).reduce((sum, c) => sum + c.volume, 0)
    };
  }
  
  async analyzeNewConnections(newConnections, historicalNetwork) {
    const analysis = {
      types: {},
      riskScore: 0,
      patterns: [],
      reason: null
    };
    
    // Categorize new connections
    newConnections.forEach(conn => {
      if (conn.volume > 100000) {
        analysis.types.highValue = (analysis.types.highValue || 0) + 1;
      }
      
      if (conn.incoming > conn.outgoing * 2) {
        analysis.types.collector = (analysis.types.collector || 0) + 1;
      } else if (conn.outgoing > conn.incoming * 2) {
        analysis.types.distributor = (analysis.types.distributor || 0) + 1;
      }
    });
    
    // Detect patterns
    if (analysis.types.distributor > newConnections.length * 0.7) {
      analysis.patterns.push('distribution');
      analysis.reason = 'distribution phase';
      analysis.riskScore = 0.8;
    }
    
    if (analysis.types.highValue > newConnections.length * 0.5) {
      analysis.patterns.push('high_value_network');
      analysis.riskScore = Math.max(analysis.riskScore, 0.7);
    }
    
    return analysis;
  }
  
  buildConnectionGraph(connections) {
    const graph = new Map();
    
    connections.forEach(conn => {
      if (!graph.has(conn.address)) {
        graph.set(conn.address, new Set());
      }
      
      // Add bidirectional connections
      connections.forEach(other => {
        if (conn.address !== other.address) {
          // Simple similarity based on interaction patterns
          const similarity = this.calculateConnectionSimilarity(conn, other);
          if (similarity > this.config.clusteringThreshold) {
            graph.get(conn.address).add(other.address);
          }
        }
      });
    });
    
    return graph;
  }
  
  findClusters(graph) {
    const visited = new Set();
    const clusters = [];
    
    for (const [node, neighbors] of graph.entries()) {
      if (!visited.has(node)) {
        const cluster = this.dfs(node, graph, visited);
        
        if (cluster.size >= this.config.minClusterSize) {
          const density = this.calculateClusterDensity(cluster, graph);
          clusters.push({
            members: cluster,
            size: cluster.size,
            density
          });
        }
      }
    }
    
    return clusters;
  }
  
  dfs(node, graph, visited) {
    const cluster = new Set();
    const stack = [node];
    
    while (stack.length > 0) {
      const current = stack.pop();
      
      if (!visited.has(current)) {
        visited.add(current);
        cluster.add(current);
        
        const neighbors = graph.get(current) || new Set();
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        });
      }
    }
    
    return cluster;
  }
  
  calculateClusterDensity(cluster, graph) {
    let edges = 0;
    const nodes = cluster.size;
    
    cluster.forEach(node => {
      const neighbors = graph.get(node) || new Set();
      neighbors.forEach(neighbor => {
        if (cluster.has(neighbor)) {
          edges++;
        }
      });
    });
    
    // Density = actual edges / possible edges
    const possibleEdges = nodes * (nodes - 1);
    return possibleEdges > 0 ? edges / possibleEdges : 0;
  }
  
  analyzeCluster(cluster, connections) {
    const members = Array.from(cluster.members);
    const memberConnections = connections.filter(c => members.includes(c.address));
    
    const totalVolume = memberConnections.reduce((sum, c) => sum + c.volume, 0);
    const avgVolume = totalVolume / memberConnections.length;
    
    let pattern = 'unknown';
    let suspicionLevel = 'low';
    let severity = 'LOW';
    
    // High density + similar volumes = possible wash trading
    if (cluster.density > 0.8 && this.haveSimilarVolumes(memberConnections)) {
      pattern = 'wash_trading';
      suspicionLevel = 'high';
      severity = 'HIGH';
    }
    // Many small transactions = possible sybil network
    else if (avgVolume < 100 && memberConnections.length > 20) {
      pattern = 'sybil_network';
      suspicionLevel = 'medium';
      severity = 'MEDIUM';
    }
    
    return {
      pattern,
      suspicionLevel,
      severity,
      totalVolume,
      interConnections: this.countInterClusterConnections(cluster, connections)
    };
  }
  
  calculateTemporalCorrelation(activities) {
    // Convert activities to time series
    const timeSeries = new Map();
    
    activities.forEach((transfers, address) => {
      const times = transfers.map(tx => 
        new Date(tx.timestamp || tx.block_timestamp).getTime()
      ).sort((a, b) => a - b);
      
      timeSeries.set(address, times);
    });
    
    // Calculate correlation between time series
    const addresses = Array.from(timeSeries.keys());
    let totalCorrelation = 0;
    let comparisons = 0;
    const coordinatedTransfers = [];
    
    for (let i = 0; i < addresses.length; i++) {
      for (let j = i + 1; j < addresses.length; j++) {
        const correlation = this.calculatePairwiseCorrelation(
          timeSeries.get(addresses[i]),
          timeSeries.get(addresses[j])
        );
        
        if (correlation.score > 0.7) {
          coordinatedTransfers.push(...correlation.coordinated);
        }
        
        totalCorrelation += correlation.score;
        comparisons++;
      }
    }
    
    const avgCorrelation = comparisons > 0 ? totalCorrelation / comparisons : 0;
    
    return {
      score: avgCorrelation,
      alignment: this.calculateTimeAlignment(timeSeries),
      coordinatedTransfers: coordinatedTransfers.slice(0, 10),
      confidence: Math.min(0.95, avgCorrelation * 1.1)
    };
  }
  
  calculatePairwiseCorrelation(times1, times2) {
    const coordinated = [];
    let matches = 0;
    
    // Check for temporal proximity
    times1.forEach(t1 => {
      times2.forEach(t2 => {
        if (Math.abs(t1 - t2) <= this.config.coordinationTimeWindow) {
          matches++;
          coordinated.push({ time1: t1, time2: t2, delta: Math.abs(t1 - t2) });
        }
      });
    });
    
    const maxPossible = Math.min(times1.length, times2.length);
    const score = maxPossible > 0 ? matches / maxPossible : 0;
    
    return { score, coordinated };
  }
  
  calculateTimeAlignment(timeSeries) {
    // Check if activities are synchronized
    const allTimes = [];
    
    timeSeries.forEach(times => {
      allTimes.push(...times);
    });
    
    allTimes.sort((a, b) => a - b);
    
    // Look for bunching of activities
    let alignedWindows = 0;
    
    for (let i = 0; i < allTimes.length - timeSeries.size; i++) {
      const windowEnd = allTimes[i] + this.config.coordinationTimeWindow;
      let addressesInWindow = 0;
      
      timeSeries.forEach(times => {
        if (times.some(t => t >= allTimes[i] && t <= windowEnd)) {
          addressesInWindow++;
        }
      });
      
      if (addressesInWindow >= timeSeries.size * 0.8) {
        alignedWindows++;
      }
    }
    
    return alignedWindows;
  }
  
  analyzeCoordinationPattern(activities, correlation) {
    const volumes = [];
    const targets = new Map();
    let totalVolume = 0;
    
    activities.forEach(transfers => {
      transfers.forEach(tx => {
        volumes.push(parseFloat(tx.amount || 0));
        totalVolume += parseFloat(tx.amount || 0);
        
        // Track common targets
        if (tx.to) {
          targets.set(tx.to, (targets.get(tx.to) || 0) + 1);
        }
      });
    });
    
    // Find common targets
    const commonTargets = Array.from(targets.entries())
      .filter(([addr, count]) => count >= activities.size * 0.5)
      .map(([addr]) => addr);
    
    let type = 'synchronized';
    let severity = 'MEDIUM';
    
    if (commonTargets.length > 0) {
      type = 'coordinated_targeting';
      severity = 'HIGH';
    }
    
    if (this.haveSimilarVolumes(volumes)) {
      type = 'coordinated_wash';
      severity = 'CRITICAL';
    }
    
    return {
      type,
      severity,
      totalVolume,
      commonTargets,
      sequence: this.detectSequentialPattern(activities)
    };
  }
  
  calculateNetworkMetrics(address, connections) {
    const incoming = connections.filter(c => c.incoming > 0).length;
    const outgoing = connections.filter(c => c.outgoing > 0).length;
    const total = connections.length;
    
    // Simple betweenness centrality approximation
    const bidirectional = connections.filter(c => c.incoming > 0 && c.outgoing > 0).length;
    const betweennessCentrality = total > 0 ? bidirectional / total : 0;
    
    return {
      incoming,
      outgoing,
      total,
      inOutRatio: total > 0 ? incoming / total : 0,
      betweennessCentrality
    };
  }
  
  analyzeBridgePattern(connections, metrics) {
    const incomingVolume = connections
      .filter(c => c.incoming > 0)
      .reduce((sum, c) => sum + c.volume * (c.incoming / c.count), 0);
    
    const outgoingVolume = connections
      .filter(c => c.outgoing > 0)
      .reduce((sum, c) => sum + c.volume * (c.outgoing / c.count), 0);
    
    const volumeRouted = Math.min(incomingVolume, outgoingVolume);
    
    let pattern = 'mixer';
    let role = 'intermediary';
    let confidence = 0.7;
    let severity = 'MEDIUM';
    
    // High volume routing = exchange or mixer
    if (volumeRouted > 1000000) {
      pattern = 'high_volume_routing';
      role = 'major_intermediary';
      confidence = 0.9;
      severity = 'HIGH';
    }
    
    // Many unique connections = possible mixer
    if (connections.length > 50 && metrics.betweennessCentrality > 0.7) {
      pattern = 'mixing_service';
      role = 'mixer';
      confidence = 0.85;
      severity = 'HIGH';
    }
    
    return {
      pattern,
      role,
      volumeRouted,
      confidence,
      severity,
      pathways: this.identifyPathways(connections),
      clusters: this.identifyConnectedClusters(connections)
    };
  }
  
  isKnownExchange(address) {
    return this.config.knownExchanges.includes(address);
  }
  
  hasExchangePattern(connection) {
    // Heuristics for exchange-like behavior
    return connection.count > 100 || // Many transactions
           connection.volume > 1000000 || // High volume
           (connection.incoming > 50 && connection.outgoing < 5); // Many deposits, few withdrawals
  }
  
  analyzeExchangeInteraction(exchangeConnections, allConnections) {
    const deposits = exchangeConnections.filter(c => c.outgoing > c.incoming);
    const withdrawals = exchangeConnections.filter(c => c.incoming > c.outgoing);
    
    const depositVolume = deposits.reduce((sum, c) => sum + c.volume, 0);
    const withdrawalVolume = withdrawals.reduce((sum, c) => sum + c.volume, 0);
    
    let type = 'mixed';
    let timing = 'normal';
    let severity = 'LOW';
    
    // Large deposit = potential sell pressure
    if (depositVolume > 100000 && deposits.length > 0) {
      type = 'major_deposit';
      severity = 'HIGH';
    }
    
    // Large withdrawal = accumulation
    if (withdrawalVolume > 100000 && withdrawals.length > 0) {
      type = 'major_withdrawal';
      severity = 'MEDIUM';
    }
    
    // Rapid deposits/withdrawals
    const recentExchangeActivity = exchangeConnections.filter(c => {
      const age = Date.now() - new Date(c.lastSeen).getTime();
      return age < 3600000; // Last hour
    });
    
    if (recentExchangeActivity.length > 5) {
      timing = 'rapid';
      severity = 'HIGH';
    }
    
    return {
      isSignificant: depositVolume + withdrawalVolume > 10000 || severity !== 'LOW',
      type,
      timing,
      severity,
      ratio: depositVolume > 0 ? withdrawalVolume / depositVolume : 0
    };
  }
  
  calculateConnectionSimilarity(conn1, conn2) {
    // Simple similarity based on interaction patterns
    const volumeSimilarity = 1 - Math.abs(conn1.volume - conn2.volume) / 
                            Math.max(conn1.volume, conn2.volume);
    
    const patternSimilarity = 1 - Math.abs(
      (conn1.incoming / Math.max(1, conn1.count)) - 
      (conn2.incoming / Math.max(1, conn2.count))
    );
    
    return (volumeSimilarity + patternSimilarity) / 2;
  }
  
  haveSimilarVolumes(items) {
    if (items.length < 2) return false;
    
    const volumes = items.map(item => 
      typeof item === 'number' ? item : item.volume
    );
    
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const variance = volumes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / volumes.length;
    const cv = Math.sqrt(variance) / mean;
    
    return cv < 0.2; // Low coefficient of variation
  }
  
  countInterClusterConnections(cluster, connections) {
    const members = Array.from(cluster.members);
    let interConnections = 0;
    
    connections.forEach(conn => {
      if (members.includes(conn.address)) {
        // Count connections to non-cluster members
        const hasExternalConnection = connections.some(other => 
          !members.includes(other.address) && 
          (other.address === conn.address)
        );
        
        if (hasExternalConnection) {
          interConnections++;
        }
      }
    });
    
    return interConnections;
  }
  
  detectSequentialPattern(activities) {
    // Check if activities follow a sequence
    const timelines = [];
    
    activities.forEach((transfers, address) => {
      if (transfers.length > 0) {
        const times = transfers.map(tx => 
          new Date(tx.timestamp || tx.block_timestamp).getTime()
        );
        
        timelines.push({
          address,
          start: Math.min(...times),
          end: Math.max(...times)
        });
      }
    });
    
    // Sort by start time
    timelines.sort((a, b) => a.start - b.start);
    
    // Check for sequential pattern
    let isSequential = true;
    for (let i = 1; i < timelines.length; i++) {
      if (timelines[i].start < timelines[i - 1].end) {
        isSequential = false;
        break;
      }
    }
    
    return isSequential ? 'sequential' : 'overlapping';
  }
  
  identifyPathways(connections) {
    // Count unique transaction paths
    const paths = new Set();
    
    connections.forEach(conn => {
      if (conn.incoming > 0 && conn.outgoing > 0) {
        paths.add(`bidirectional:${conn.address}`);
      } else if (conn.incoming > 0) {
        paths.add(`from:${conn.address}`);
      } else if (conn.outgoing > 0) {
        paths.add(`to:${conn.address}`);
      }
    });
    
    return paths.size;
  }
  
  identifyConnectedClusters(connections) {
    // Rough estimate of connected network clusters
    const volumeGroups = new Map();
    
    connections.forEach(conn => {
      const volumeClass = Math.floor(Math.log10(conn.volume + 1));
      
      if (!volumeGroups.has(volumeClass)) {
        volumeGroups.set(volumeClass, 0);
      }
      
      volumeGroups.set(volumeClass, volumeGroups.get(volumeClass) + 1);
    });
    
    return volumeGroups.size;
  }
  
  calculateNewConnectionSeverity(count, analysis) {
    if (count >= this.config.massiveConnectionThreshold) {
      return 'CRITICAL';
    }
    
    if (analysis.riskScore >= 0.8) {
      return 'HIGH';
    }
    
    if (count >= this.config.newConnectionThreshold * 2) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }
  
  updateNetworkCache(address, networkData) {
    this.networkCache.set(address, {
      timestamp: Date.now(),
      data: networkData
    });
    
    // Update global network
    networkData.connections.forEach(conn => {
      if (!this.globalNetwork.has(conn.address)) {
        this.globalNetwork.set(conn.address, new Set());
      }
      this.globalNetwork.get(conn.address).add(address);
    });
  }
  
  formatAmount(amount) {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M DOT`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K DOT`;
    }
    return `${amount.toFixed(2)} DOT`;
  }
}