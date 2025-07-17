import { createLogger } from '../utils/logger.js';
import { ANOMALY_THRESHOLDS } from '../utils/constants.js';

const logger = createLogger('pattern-matcher');

/**
 * PatternMatcher - Fast pattern detection algorithms for whale monitoring
 */
export class PatternMatcher {
  constructor() {
    // Pre-compiled patterns
    this.patterns = {
      dormantWhale: this.compileDormantWhalePattern(),
      suddenActivity: this.compileSuddenActivityPattern(),
      velocityChange: this.compileVelocityChangePattern(),
      washTrading: this.compileWashTradingPattern(),
      accumulation: this.compileAccumulationPattern(),
      distribution: this.compileDistributionPattern()
    };
    
    // Caches for performance
    this.patternCache = new Map();
    this.scoreCache = new Map();
    
    // Bloom filters for quick negative checks
    this.bloomFilters = {
      dormant: this.createBloomFilter(10000),
      active: this.createBloomFilter(10000)
    };
  }

  /**
   * Extract patterns from a single profile
   */
  extractPatterns(profile) {
    const patterns = [];
    
    // Quick bloom filter check
    if (this.bloomFilters.dormant.has(profile.address)) {
      return this.patternCache.get(profile.address) || [];
    }
    
    // Check each pattern type
    for (const [patternName, patternFn] of Object.entries(this.patterns)) {
      const result = patternFn(profile);
      if (result) {
        patterns.push({
          type: patternName,
          address: profile.address,
          ...result
        });
      }
    }
    
    // Cache results
    this.patternCache.set(profile.address, patterns);
    
    return patterns;
  }

  /**
   * Detect dormant whales in batch
   */
  detectDormantWhales(profiles) {
    const dormantWhales = [];
    
    // Use parallel array operations for speed
    const candidates = profiles.filter(p => {
      // Quick checks first
      if (!p.analysis?.isDormant) return false;
      if (!p.totalVolumeSent || !p.totalVolumeReceived) return false;
      
      const totalVolume = BigInt(p.totalVolumeSent) + BigInt(p.totalVolumeReceived);
      return totalVolume > ANOMALY_THRESHOLDS.MIN_VALUE_PLANCK * BigInt(10000);
    });
    
    // Detailed analysis for candidates
    for (const profile of candidates) {
      const pattern = this.analyzeDormantWhale(profile);
      if (pattern) {
        dormantWhales.push({
          type: 'dormant_whale',
          severity: 'high',
          address: profile.address,
          name: profile.name,
          ...pattern
        });
        
        // Update bloom filter
        this.bloomFilters.dormant.add(profile.address);
      }
    }
    
    return dormantWhales;
  }

  /**
   * Detect unusual activity patterns
   */
  detectUnusualActivity(profiles) {
    const patterns = [];
    
    // Build activity baseline
    const activityBaseline = this.buildActivityBaseline(profiles);
    
    for (const profile of profiles) {
      // Skip if no recent activity
      if (profile.analysis?.daysSinceLastActivity > 30) continue;
      
      const anomalies = this.detectActivityAnomalies(profile, activityBaseline);
      
      if (anomalies.length > 0) {
        patterns.push({
          type: 'unusual_activity',
          severity: this.calculateSeverity(anomalies),
          address: profile.address,
          name: profile.name,
          anomalies
        });
      }
    }
    
    return patterns;
  }

  /**
   * Detect velocity changes (rapid increase/decrease in activity)
   */
  detectVelocityChanges(profiles) {
    const patterns = [];
    
    for (const profile of profiles) {
      if (!profile.dailyActivity || Object.keys(profile.dailyActivity).length < 7) {
        continue;
      }
      
      const velocityChange = this.analyzeVelocity(profile.dailyActivity);
      
      if (velocityChange && Math.abs(velocityChange.changePercent) > 200) {
        patterns.push({
          type: 'velocity_change',
          severity: Math.abs(velocityChange.changePercent) > 500 ? 'high' : 'medium',
          address: profile.address,
          name: profile.name,
          ...velocityChange
        });
      }
    }
    
    return patterns;
  }

  /**
   * Detect relationship patterns
   */
  detectRelationshipPatterns(profiles) {
    const patterns = [];
    
    // Build relationship graph
    const relationshipGraph = this.buildRelationshipGraph(profiles);
    
    // Detect clusters
    const clusters = this.detectClusters(relationshipGraph);
    
    // Detect circular patterns (potential wash trading)
    const circularPatterns = this.detectCircularPatterns(relationshipGraph);
    
    // Analyze each cluster
    for (const cluster of clusters) {
      if (cluster.addresses.length >= 3) {
        patterns.push({
          type: 'address_cluster',
          severity: cluster.addresses.length > 10 ? 'high' : 'medium',
          addresses: cluster.addresses,
          totalVolume: cluster.totalVolume,
          interconnections: cluster.edges.length
        });
      }
    }
    
    // Add circular patterns
    patterns.push(...circularPatterns);
    
    return patterns;
  }

  /**
   * Compile pattern functions for performance
   */
  compileDormantWhalePattern() {
    return (profile) => {
      if (!profile.analysis?.isDormant) return null;
      
      const totalVolume = BigInt(profile.totalVolumeSent || '0') + BigInt(profile.totalVolumeReceived || '0');
      const thresholdVolume = ANOMALY_THRESHOLDS.MIN_VALUE_PLANCK * BigInt(10000);
      
      if (totalVolume < thresholdVolume) return null;
      
      return {
        daysDormant: profile.analysis.daysSinceLastActivity,
        totalVolume: totalVolume.toString(),
        lastSeen: profile.lastSeen,
        risk: 'reactivation'
      };
    };
  }

  compileSuddenActivityPattern() {
    return (profile) => {
      if (profile.analysis?.isDormant) return null;
      
      // Check for sudden spike in activity
      const recentDays = this.getRecentDays(profile.dailyActivity, 7);
      const olderDays = this.getRecentDays(profile.dailyActivity, 30, 7);
      
      if (recentDays.length === 0 || olderDays.length === 0) return null;
      
      const recentAvg = this.average(recentDays.map(d => d.count));
      const olderAvg = this.average(olderDays.map(d => d.count));
      
      if (olderAvg === 0) return null;
      
      const increase = (recentAvg - olderAvg) / olderAvg;
      
      if (increase > 5) { // 500% increase
        return {
          increasePercent: Math.round(increase * 100),
          recentAvgDaily: recentAvg,
          historicalAvgDaily: olderAvg
        };
      }
      
      return null;
    };
  }

  compileVelocityChangePattern() {
    return (profile) => {
      const changes = this.analyzeVelocity(profile.dailyActivity || {});
      return changes && Math.abs(changes.changePercent) > 200 ? changes : null;
    };
  }

  compileWashTradingPattern() {
    return (profile) => {
      if (!profile.counterparties || profile.counterparties.length < 2) return null;
      
      // Look for circular trading patterns
      const selfReferential = profile.counterparties.filter(cp => {
        // Check if counterparty also transacts heavily with this address
        return cp.transactionCount > 10 && cp.volumeSent && cp.volumeReceived;
      });
      
      if (selfReferential.length >= 2) {
        const totalCircularVolume = selfReferential.reduce((sum, cp) => {
          return sum + BigInt(cp.volumeSent || '0') + BigInt(cp.volumeReceived || '0');
        }, BigInt(0));
        
        return {
          suspectedCounterparties: selfReferential.length,
          circularVolume: totalCircularVolume.toString()
        };
      }
      
      return null;
    };
  }

  compileAccumulationPattern() {
    return (profile) => {
      const received = BigInt(profile.totalVolumeReceived || '0');
      const sent = BigInt(profile.totalVolumeSent || '0');
      
      if (received === BigInt(0)) return null;
      
      const ratio = Number(sent) / Number(received);
      
      if (ratio < 0.2) { // Sending less than 20% of received
        return {
          accumulationRatio: ratio.toFixed(2),
          netAccumulation: (received - sent).toString()
        };
      }
      
      return null;
    };
  }

  compileDistributionPattern() {
    return (profile) => {
      const received = BigInt(profile.totalVolumeReceived || '0');
      const sent = BigInt(profile.totalVolumeSent || '0');
      
      if (sent === BigInt(0)) return null;
      
      const ratio = Number(received) / Number(sent);
      
      if (ratio < 0.2) { // Receiving less than 20% of sent
        return {
          distributionRatio: ratio.toFixed(2),
          netDistribution: (sent - received).toString()
        };
      }
      
      return null;
    };
  }

  /**
   * Analyze dormant whale details
   */
  analyzeDormantWhale(profile) {
    const totalVolume = BigInt(profile.totalVolumeSent || '0') + BigInt(profile.totalVolumeReceived || '0');
    const avgTransactionSize = BigInt(profile.avgTransactionSize || '0');
    
    // Calculate risk score
    let riskScore = 0;
    
    // Volume factor
    if (totalVolume > BigInt(100000) * BigInt(10 ** 10)) riskScore += 3;
    else if (totalVolume > BigInt(10000) * BigInt(10 ** 10)) riskScore += 2;
    else riskScore += 1;
    
    // Dormancy factor
    if (profile.analysis.daysSinceLastActivity > 365) riskScore += 2;
    else if (profile.analysis.daysSinceLastActivity > 180) riskScore += 1;
    
    // Transaction size factor
    if (avgTransactionSize > BigInt(1000) * BigInt(10 ** 10)) riskScore += 1;
    
    return {
      daysDormant: profile.analysis.daysSinceLastActivity,
      totalVolume: totalVolume.toString(),
      avgTransactionSize: avgTransactionSize.toString(),
      lastSeen: new Date(profile.lastSeen).toISOString(),
      riskScore,
      riskLevel: riskScore >= 5 ? 'critical' : riskScore >= 3 ? 'high' : 'medium'
    };
  }

  /**
   * Build activity baseline from all profiles
   */
  buildActivityBaseline(profiles) {
    const baseline = {
      avgDailyTransactions: 0,
      avgTransactionSize: BigInt(0),
      hourlyDistribution: new Array(24).fill(0),
      totalProfiles: 0
    };
    
    let totalDailyTx = 0;
    let totalTxSize = BigInt(0);
    let profileCount = 0;
    
    for (const profile of profiles) {
      if (profile.analysis?.avgDailyTransactions) {
        totalDailyTx += profile.analysis.avgDailyTransactions;
        profileCount++;
      }
      
      if (profile.avgTransactionSize) {
        totalTxSize += BigInt(profile.avgTransactionSize);
      }
      
      if (profile.hourlyActivity) {
        for (let i = 0; i < 24; i++) {
          baseline.hourlyDistribution[i] += profile.hourlyActivity[i] || 0;
        }
      }
    }
    
    baseline.avgDailyTransactions = profileCount > 0 ? totalDailyTx / profileCount : 0;
    baseline.avgTransactionSize = profileCount > 0 ? totalTxSize / BigInt(profileCount) : BigInt(0);
    baseline.totalProfiles = profileCount;
    
    // Normalize hourly distribution
    const totalHourly = baseline.hourlyDistribution.reduce((sum, val) => sum + val, 0);
    if (totalHourly > 0) {
      baseline.hourlyDistribution = baseline.hourlyDistribution.map(val => val / totalHourly);
    }
    
    return baseline;
  }

  /**
   * Detect activity anomalies
   */
  detectActivityAnomalies(profile, baseline) {
    const anomalies = [];
    
    // Check transaction frequency
    if (profile.analysis?.avgDailyTransactions) {
      const deviation = Math.abs(profile.analysis.avgDailyTransactions - baseline.avgDailyTransactions);
      const deviationPercent = baseline.avgDailyTransactions > 0 ? 
        (deviation / baseline.avgDailyTransactions) * 100 : 0;
      
      if (deviationPercent > 300) {
        anomalies.push({
          type: 'frequency_anomaly',
          value: profile.analysis.avgDailyTransactions,
          baseline: baseline.avgDailyTransactions,
          deviationPercent: Math.round(deviationPercent)
        });
      }
    }
    
    // Check transaction size
    if (profile.avgTransactionSize) {
      const profileAvg = BigInt(profile.avgTransactionSize);
      const baselineAvg = baseline.avgTransactionSize;
      
      if (baselineAvg > BigInt(0)) {
        const ratio = Number(profileAvg * BigInt(100) / baselineAvg);
        
        if (ratio > 1000 || ratio < 10) { // 10x larger or 10x smaller
          anomalies.push({
            type: 'size_anomaly',
            value: profileAvg.toString(),
            baseline: baselineAvg.toString(),
            ratio: ratio / 100
          });
        }
      }
    }
    
    // Check hourly patterns
    if (profile.hourlyActivity && baseline.hourlyDistribution) {
      const kl = this.calculateKLDivergence(
        this.normalizeDistribution(profile.hourlyActivity),
        baseline.hourlyDistribution
      );
      
      if (kl > 1.0) { // High divergence
        anomalies.push({
          type: 'temporal_anomaly',
          klDivergence: kl.toFixed(3),
          peakHour: profile.analysis?.mostActiveHour
        });
      }
    }
    
    return anomalies;
  }

  /**
   * Analyze velocity changes
   */
  analyzeVelocity(dailyActivity) {
    const dates = Object.keys(dailyActivity).sort();
    if (dates.length < 7) return null;
    
    // Get recent and historical windows
    const recentDates = dates.slice(-7);
    const historicalDates = dates.slice(0, -7).slice(-30);
    
    if (historicalDates.length === 0) return null;
    
    const recentSum = recentDates.reduce((sum, date) => sum + dailyActivity[date], 0);
    const historicalSum = historicalDates.reduce((sum, date) => sum + dailyActivity[date], 0);
    
    const recentAvg = recentSum / recentDates.length;
    const historicalAvg = historicalSum / historicalDates.length;
    
    if (historicalAvg === 0) return null;
    
    const changePercent = ((recentAvg - historicalAvg) / historicalAvg) * 100;
    
    return {
      direction: changePercent > 0 ? 'increase' : 'decrease',
      changePercent: Math.round(changePercent),
      recentAvg: recentAvg.toFixed(2),
      historicalAvg: historicalAvg.toFixed(2),
      period: `${recentDates.length} days vs ${historicalDates.length} days`
    };
  }

  /**
   * Build relationship graph
   */
  buildRelationshipGraph(profiles) {
    const graph = {
      nodes: new Map(),
      edges: []
    };
    
    for (const profile of profiles) {
      graph.nodes.set(profile.address, {
        address: profile.address,
        name: profile.name,
        volume: BigInt(profile.totalVolumeSent || '0') + BigInt(profile.totalVolumeReceived || '0')
      });
      
      if (profile.counterparties) {
        for (const cp of profile.counterparties) {
          graph.edges.push({
            from: profile.address,
            to: cp.address,
            volume: BigInt(cp.totalVolume || '0'),
            count: cp.transactionCount
          });
        }
      }
    }
    
    return graph;
  }

  /**
   * Detect clusters using Union-Find algorithm
   */
  detectClusters(graph) {
    const uf = new UnionFind();
    
    // Initialize all nodes
    for (const [address] of graph.nodes) {
      uf.makeSet(address);
    }
    
    // Union connected addresses
    for (const edge of graph.edges) {
      if (edge.count >= 5) { // Minimum 5 transactions to consider connected
        uf.union(edge.from, edge.to);
      }
    }
    
    // Group by cluster
    const clusters = new Map();
    
    for (const [address, node] of graph.nodes) {
      const root = uf.find(address);
      
      if (!clusters.has(root)) {
        clusters.set(root, {
          addresses: [],
          totalVolume: BigInt(0),
          edges: []
        });
      }
      
      const cluster = clusters.get(root);
      cluster.addresses.push(address);
      cluster.totalVolume += node.volume;
    }
    
    // Add edges to clusters
    for (const edge of graph.edges) {
      const root = uf.find(edge.from);
      const cluster = clusters.get(root);
      if (cluster && uf.find(edge.to) === root) {
        cluster.edges.push(edge);
      }
    }
    
    return Array.from(clusters.values());
  }

  /**
   * Detect circular patterns (potential wash trading)
   */
  detectCircularPatterns(graph) {
    const patterns = [];
    const visited = new Set();
    
    // Simple cycle detection (limited to 3-4 node cycles for performance)
    for (const [address] of graph.nodes) {
      if (visited.has(address)) continue;
      
      const cycles = this.findCycles(graph, address, 4);
      
      for (const cycle of cycles) {
        visited.add(address);
        
        // Calculate cycle volume
        let cycleVolume = BigInt(0);
        for (let i = 0; i < cycle.length; i++) {
          const from = cycle[i];
          const to = cycle[(i + 1) % cycle.length];
          
          const edge = graph.edges.find(e => e.from === from && e.to === to);
          if (edge) {
            cycleVolume += edge.volume;
          }
        }
        
        patterns.push({
          type: 'circular_flow',
          severity: 'high',
          addresses: cycle,
          cycleVolume: cycleVolume.toString(),
          suspicion: 'wash_trading'
        });
      }
    }
    
    return patterns;
  }

  /**
   * Find cycles in graph (DFS with depth limit)
   */
  findCycles(graph, start, maxDepth) {
    const cycles = [];
    const adjacency = new Map();
    
    // Build adjacency list
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, []);
      }
      adjacency.get(edge.from).push(edge.to);
    }
    
    // DFS for cycles
    const visited = new Set();
    const stack = [];
    
    const dfs = (node, depth) => {
      if (depth > maxDepth) return;
      
      visited.add(node);
      stack.push(node);
      
      const neighbors = adjacency.get(node) || [];
      for (const neighbor of neighbors) {
        if (neighbor === start && stack.length >= 3) {
          // Found cycle
          cycles.push([...stack]);
        } else if (!visited.has(neighbor)) {
          dfs(neighbor, depth + 1);
        }
      }
      
      stack.pop();
      visited.delete(node);
    };
    
    dfs(start, 0);
    
    return cycles;
  }

  /**
   * Helper functions
   */
  
  getRecentDays(dailyActivity, days, offset = 0) {
    const dates = Object.keys(dailyActivity).sort();
    const end = dates.length - offset;
    const start = Math.max(0, end - days);
    
    return dates.slice(start, end).map(date => ({
      date,
      count: dailyActivity[date]
    }));
  }

  average(numbers) {
    return numbers.length > 0 ? 
      numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
  }

  calculateSeverity(anomalies) {
    const severityScores = {
      frequency_anomaly: 2,
      size_anomaly: 3,
      temporal_anomaly: 1
    };
    
    const totalScore = anomalies.reduce((sum, anomaly) => 
      sum + (severityScores[anomaly.type] || 1), 0
    );
    
    return totalScore >= 5 ? 'high' : totalScore >= 3 ? 'medium' : 'low';
  }

  normalizeDistribution(distribution) {
    const sum = distribution.reduce((s, v) => s + v, 0);
    return sum > 0 ? distribution.map(v => v / sum) : distribution;
  }

  calculateKLDivergence(p, q) {
    let kl = 0;
    
    for (let i = 0; i < p.length; i++) {
      if (p[i] > 0 && q[i] > 0) {
        kl += p[i] * Math.log(p[i] / q[i]);
      }
    }
    
    return kl;
  }

  /**
   * Create simple bloom filter
   */
  createBloomFilter(size) {
    const bits = new Uint8Array(Math.ceil(size / 8));
    
    return {
      add(item) {
        const hash = this.hash(item);
        const index = hash % size;
        const byteIndex = Math.floor(index / 8);
        const bitIndex = index % 8;
        bits[byteIndex] |= (1 << bitIndex);
      },
      
      has(item) {
        const hash = this.hash(item);
        const index = hash % size;
        const byteIndex = Math.floor(index / 8);
        const bitIndex = index % 8;
        return (bits[byteIndex] & (1 << bitIndex)) !== 0;
      },
      
      hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash = hash & hash;
        }
        return Math.abs(hash);
      }
    };
  }
}

/**
 * Union-Find data structure for clustering
 */
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  makeSet(x) {
    this.parent.set(x, x);
    this.rank.set(x, 0);
  }

  find(x) {
    if (!this.parent.has(x)) {
      this.makeSet(x);
    }
    
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x))); // Path compression
    }
    
    return this.parent.get(x);
  }

  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    
    if (rootX === rootY) return;
    
    // Union by rank
    if (this.rank.get(rootX) < this.rank.get(rootY)) {
      this.parent.set(rootX, rootY);
    } else if (this.rank.get(rootX) > this.rank.get(rootY)) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, this.rank.get(rootX) + 1);
    }
  }
}

export default PatternMatcher;