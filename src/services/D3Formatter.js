import { logger } from '../utils/logger.js';

/**
 * D3Formatter service for converting graph data to D3.js visualization format
 * Handles force-directed graphs, hierarchical layouts, and Sankey diagrams
 */
export class D3Formatter {
  constructor(options = {}) {
    this.options = {
      // Visual range configurations
      nodeSize: {
        min: 20,
        max: 150,
        default: 40
      },
      edgeWidth: {
        min: 1,
        max: 10,
        default: 2
      },
      opacity: {
        min: 0.3,
        max: 1.0,
        default: 0.8
      },
      // Color schemes
      colors: {
        safe: '#4CAF50',      // Green
        medium: '#FF9800',    // Orange/Yellow
        high: '#F44336',      // Red
        neutral: '#9E9E9E',   // Gray
        exchange: '#2196F3',  // Blue
        validator: '#9C27B0', // Purple
        mixer: '#FF5722'      // Deep orange
      },
      // Force simulation defaults
      force: {
        chargeStrength: -300,
        linkDistance: 80,
        linkStrength: 0.7,
        collideRadius: 30,
        alpha: 0.9,
        alphaDecay: 0.028,
        velocityDecay: 0.4
      },
      ...options
    };
  }

  /**
   * Format data for D3.js force-directed graph
   * @param {Array} nodes - Array of node objects from API
   * @param {Array} edges - Array of edge objects from API
   * @param {Object} options - Formatting options
   * @returns {Object} D3.js compatible format
   */
  formatForceGraph(nodes, edges, options = {}) {
    const startTime = Date.now();
    
    try {
      logger.info('Formatting data for D3.js force-directed graph', {
        nodeCount: nodes.length,
        edgeCount: edges.length
      });

      // Format nodes with visual properties
      const formattedNodes = nodes.map(node => {
        const size = this.calculateNodeSize(node);
        const color = this.calculateNodeColor(node);
        const opacity = this.calculateNodeOpacity(node);
        
        return {
          // Core D3 properties
          id: node.address,
          
          // Original data
          ...node,
          
          // Visual properties
          size,
          color,
          opacity,
          
          // Physics properties
          radius: size / 2,
          mass: Math.max(1, size / 20),
          
          // Labels and display
          label: this.getNodeLabel(node),
          shortLabel: this.getShortNodeLabel(node),
          
          // Group for styling
          group: this.getNodeGroup(node),
          
          // Fixed position (if specified in API)
          fx: node.fixedPosition?.x || null,
          fy: node.fixedPosition?.y || null,
          
          // Additional visual hints
          strokeWidth: this.calculateStrokeWidth(node),
          strokeColor: this.calculateStrokeColor(node),
          
          // Tooltip data
          tooltip: this.generateNodeTooltip(node)
        };
      });

      // Format edges with visual properties
      const formattedEdges = edges.map(edge => {
        const width = this.calculateEdgeWidth(edge);
        const color = this.calculateEdgeColor(edge);
        const opacity = this.calculateEdgeOpacity(edge);
        
        return {
          // Core D3 properties
          source: edge.source,
          target: edge.target,
          id: edge.id || `${edge.source}-${edge.target}`,
          
          // Original data
          ...edge,
          
          // Visual properties
          width,
          color,
          opacity,
          
          // Line styling
          strokeDasharray: this.calculateDashArray(edge),
          
          // Animation
          animated: edge.animated || false,
          
          // Tooltip data
          tooltip: this.generateEdgeTooltip(edge)
        };
      });

      // Add layout hints
      const layoutHints = this.addLayoutHints({
        nodes: formattedNodes,
        edges: formattedEdges
      }, options);

      const executionTime = Date.now() - startTime;
      logger.info(`Force graph formatted in ${executionTime}ms`);

      return {
        nodes: formattedNodes,
        links: formattedEdges, // D3 uses 'links' for edges
        ...layoutHints,
        metadata: {
          nodeCount: formattedNodes.length,
          linkCount: formattedEdges.length,
          executionTime,
          formatType: 'force'
        }
      };

    } catch (error) {
      logger.error('Error formatting force graph', error);
      throw error;
    }
  }

  /**
   * Calculate node size based on importance metrics
   * @param {Object} node - Node object
   * @returns {number} Size value
   */
  calculateNodeSize(node) {
    const { min, max, default: defaultSize } = this.options.nodeSize;
    
    try {
      // Base size factors
      let sizeFactor = 0;
      let factorCount = 0;

      // Degree centrality (30% weight)
      if (node.degree !== undefined) {
        sizeFactor += Math.min(1, node.degree / 100) * 0.3;
        factorCount++;
      }

      // Volume factor (25% weight)
      if (node.totalVolume) {
        const volumeNormalized = Math.min(1, Number(BigInt(node.totalVolume) / BigInt('1000000000000'))); // 1T threshold
        sizeFactor += volumeNormalized * 0.25;
        factorCount++;
      }

      // Importance score (20% weight)
      if (node.importanceScore !== undefined) {
        sizeFactor += (node.importanceScore / 100) * 0.2;
        factorCount++;
      }

      // Risk score inverse (15% weight) - higher risk = smaller
      if (node.riskScore !== undefined) {
        sizeFactor += (1 - node.riskScore / 100) * 0.15;
        factorCount++;
      }

      // Node type boost (10% weight)
      const typeBoost = this.getNodeTypeBoost(node.nodeType);
      sizeFactor += typeBoost * 0.1;
      factorCount++;

      // Calculate final size
      if (factorCount === 0) {
        return defaultSize;
      }

      const normalizedFactor = sizeFactor / factorCount;
      return min + (max - min) * normalizedFactor;

    } catch (error) {
      logger.warn('Error calculating node size, using default', { error: error.message });
      return defaultSize;
    }
  }

  /**
   * Calculate node color based on type and risk
   * @param {Object} node - Node object
   * @returns {string} Color value
   */
  calculateNodeColor(node) {
    try {
      // Priority 1: Risk-based coloring
      if (node.riskScore !== undefined) {
        if (node.riskScore >= 70) {
          return this.options.colors.high; // Red
        } else if (node.riskScore >= 30) {
          return this.options.colors.medium; // Orange
        } else {
          return this.options.colors.safe; // Green
        }
      }

      // Priority 2: Node type coloring
      if (node.nodeType) {
        switch (node.nodeType.toLowerCase()) {
          case 'exchange':
            return this.options.colors.exchange;
          case 'validator':
            return this.options.colors.validator;
          case 'mixer':
            return this.options.colors.mixer;
          default:
            return this.options.colors.neutral;
        }
      }

      // Priority 3: Subscan tag coloring
      if (node.subscanAccount?.accountDisplay?.merkle?.tagType) {
        const tagType = node.subscanAccount.accountDisplay.merkle.tagType;
        switch (tagType) {
          case 'infrastructure':
            return this.options.colors.validator;
          case 'exchange':
            return this.options.colors.exchange;
          default:
            return this.options.colors.neutral;
        }
      }

      return this.options.colors.neutral;

    } catch (error) {
      logger.warn('Error calculating node color, using neutral', { error: error.message });
      return this.options.colors.neutral;
    }
  }

  /**
   * Calculate edge width based on volume
   * @param {Object} edge - Edge object
   * @returns {number} Width value
   */
  calculateEdgeWidth(edge) {
    const { min, max, default: defaultWidth } = this.options.edgeWidth;
    
    try {
      // Volume-based width
      if (edge.volume) {
        const volumeNormalized = Math.min(1, Number(BigInt(edge.volume) / BigInt('100000000000'))); // 100B threshold
        return min + (max - min) * volumeNormalized;
      }

      // Count-based width
      if (edge.count) {
        const countNormalized = Math.min(1, edge.count / 100);
        return min + (max - min) * countNormalized;
      }

      return defaultWidth;

    } catch (error) {
      logger.warn('Error calculating edge width, using default', { error: error.message });
      return defaultWidth;
    }
  }

  /**
   * Calculate node opacity based on recency and activity
   * @param {Object} node - Node object
   * @returns {number} Opacity value (0-1)
   */
  calculateNodeOpacity(node) {
    const { min, max, default: defaultOpacity } = this.options.opacity;
    
    try {
      const now = Date.now() / 1000; // Convert to seconds
      
      // Recency factor
      if (node.lastActive) {
        const daysSinceActive = (now - node.lastActive) / 86400; // Days
        if (daysSinceActive < 1) {
          return max; // Very recent
        } else if (daysSinceActive < 7) {
          return max * 0.9; // Recent
        } else if (daysSinceActive < 30) {
          return max * 0.7; // Somewhat recent
        } else {
          return max * 0.5; // Old
        }
      }

      return defaultOpacity;

    } catch (error) {
      logger.warn('Error calculating node opacity, using default', { error: error.message });
      return defaultOpacity;
    }
  }

  /**
   * Calculate edge opacity based on recency
   * @param {Object} edge - Edge object  
   * @returns {number} Opacity value (0-1)
   */
  calculateEdgeOpacity(edge) {
    const { min, max, default: defaultOpacity } = this.options.opacity;
    
    try {
      const now = Date.now() / 1000;
      
      if (edge.lastTransfer) {
        const daysSinceTransfer = (now - edge.lastTransfer) / 86400;
        if (daysSinceTransfer < 1) {
          return max;
        } else if (daysSinceTransfer < 7) {
          return max * 0.8;
        } else if (daysSinceTransfer < 30) {
          return max * 0.6;
        } else {
          return min;
        }
      }

      return defaultOpacity;

    } catch (error) {
      logger.warn('Error calculating edge opacity, using default', { error: error.message });
      return defaultOpacity;
    }
  }

  /**
   * Calculate edge color based on properties
   * @param {Object} edge - Edge object
   * @returns {string} Color value
   */
  calculateEdgeColor(edge) {
    try {
      // Suspicious pattern coloring
      if (edge.suspiciousPattern) {
        return this.options.colors.high; // Red for suspicious
      }

      // Use suggested color from API if available
      if (edge.suggestedColor) {
        return edge.suggestedColor;
      }

      // Default edge color based on direction
      if (edge.bidirectional) {
        return '#666666'; // Gray for bidirectional
      }

      return '#999999'; // Light gray for unidirectional

    } catch (error) {
      logger.warn('Error calculating edge color, using default', { error: error.message });
      return '#999999';
    }
  }

  /**
   * Add force simulation layout hints
   * @param {Object} graph - Graph object with nodes and edges
   * @param {Object} options - Layout options
   * @returns {Object} Layout configuration
   */
  addLayoutHints(graph, options = {}) {
    try {
      const nodeCount = graph.nodes.length;
      const linkCount = graph.links?.length || graph.edges?.length || 0;
      
      // Adjust force parameters based on graph size
      const forceConfig = { ...this.options.force };
      
      // Scale charge strength with node count
      forceConfig.chargeStrength = -Math.max(100, Math.min(1000, nodeCount * 5));
      
      // Scale link distance with density
      const density = linkCount / (nodeCount * (nodeCount - 1) / 2);
      forceConfig.linkDistance = Math.max(30, Math.min(200, 80 / Math.max(0.01, density)));
      
      // Adjust collision radius based on average node size
      const avgNodeSize = graph.nodes.reduce((sum, n) => sum + (n.size || 40), 0) / nodeCount;
      forceConfig.collideRadius = avgNodeSize * 0.6;

      return {
        simulation: {
          ...forceConfig,
          nodes: nodeCount,
          links: linkCount
        },
        viewport: this.calculateViewport(graph),
        clustering: this.generateClusteringHints(graph),
        rendering: this.generateRenderingHints(graph)
      };

    } catch (error) {
      logger.warn('Error adding layout hints, using defaults', { error: error.message });
      return {
        simulation: this.options.force,
        viewport: { width: 800, height: 600, scale: 1 }
      };
    }
  }

  /**
   * Format data for hierarchical tree layout
   * @param {Object} rootNode - Root node with children
   * @param {Object} options - Formatting options
   * @returns {Object} D3.js tree format
   */
  formatHierarchicalGraph(rootNode, options = {}) {
    const startTime = Date.now();
    
    try {
      logger.info('Formatting hierarchical graph', { rootAddress: rootNode.address });

      const formatNode = (node, depth = 0) => {
        const size = this.calculateNodeSize(node) * (1 - depth * 0.1); // Smaller at deeper levels
        const color = this.calculateNodeColor(node);
        
        const formatted = {
          id: node.address,
          name: this.getNodeLabel(node),
          ...node,
          size,
          color,
          depth,
          value: node.totalVolume ? Number(BigInt(node.totalVolume) / BigInt('1000000000')) : 1, // In billions
          tooltip: this.generateNodeTooltip(node)
        };

        if (node.children && node.children.length > 0) {
          formatted.children = node.children.map(child => formatNode(child, depth + 1));
        }

        return formatted;
      };

      const formattedTree = formatNode(rootNode);
      
      const executionTime = Date.now() - startTime;
      logger.info(`Hierarchical graph formatted in ${executionTime}ms`);

      return {
        ...formattedTree,
        metadata: {
          formatType: 'hierarchical',
          maxDepth: this.calculateMaxDepth(formattedTree),
          totalNodes: this.countNodesInTree(formattedTree),
          executionTime
        }
      };

    } catch (error) {
      logger.error('Error formatting hierarchical graph', error);
      throw error;
    }
  }

  /**
   * Format data for Sankey diagram
   * @param {Array} flows - Flow data with source, target, value
   * @param {Object} options - Formatting options
   * @returns {Object} D3.js Sankey format
   */
  formatSankeyDiagram(flows, options = {}) {
    const startTime = Date.now();
    
    try {
      logger.info('Formatting Sankey diagram', { flowCount: flows.length });

      // Extract unique nodes from flows
      const nodeMap = new Map();
      
      flows.forEach(flow => {
        if (!nodeMap.has(flow.source)) {
          nodeMap.set(flow.source, {
            id: flow.source,
            name: flow.sourceName || flow.source,
            nodeType: flow.sourceType || 'unknown',
            category: this.getSankeyCategory(flow.sourceType)
          });
        }
        
        if (!nodeMap.has(flow.target)) {
          nodeMap.set(flow.target, {
            id: flow.target,
            name: flow.targetName || flow.target,
            nodeType: flow.targetType || 'unknown',
            category: this.getSankeyCategory(flow.targetType)
          });
        }
      });

      const nodes = Array.from(nodeMap.values()).map(node => ({
        ...node,
        color: this.calculateNodeColor(node),
        tooltip: this.generateNodeTooltip(node)
      }));

      // Format links with visual properties
      const links = flows.map(flow => ({
        source: flow.source,
        target: flow.target,
        value: Number(BigInt(flow.volume || flow.value || 0) / BigInt('1000000000')), // In billions
        color: this.calculateSankeyLinkColor(flow),
        opacity: this.calculateEdgeOpacity(flow),
        tooltip: this.generateEdgeTooltip(flow)
      }));

      const executionTime = Date.now() - startTime;
      logger.info(`Sankey diagram formatted in ${executionTime}ms`);

      return {
        nodes,
        links,
        metadata: {
          formatType: 'sankey',
          nodeCount: nodes.length,
          linkCount: links.length,
          totalValue: links.reduce((sum, link) => sum + link.value, 0),
          executionTime
        }
      };

    } catch (error) {
      logger.error('Error formatting Sankey diagram', error);
      throw error;
    }
  }

  // Helper methods

  getNodeLabel(node) {
    if (node.identity?.display) {
      return node.identity.display;
    }
    if (node.subscanAccount?.display) {
      return node.subscanAccount.display;
    }
    return this.shortenAddress(node.address);
  }

  getShortNodeLabel(node) {
    const label = this.getNodeLabel(node);
    return label.length > 20 ? label.substring(0, 17) + '...' : label;
  }

  shortenAddress(address) {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  getNodeGroup(node) {
    if (node.clusterId) return node.clusterId;
    if (node.nodeType) return node.nodeType;
    return 'default';
  }

  getNodeTypeBoost(nodeType) {
    switch (nodeType?.toLowerCase()) {
      case 'exchange': return 1.0;
      case 'validator': return 0.8;
      case 'mixer': return 0.6;
      case 'parachain': return 0.7;
      case 'pool': return 0.5;
      default: return 0.3;
    }
  }

  calculateStrokeWidth(node) {
    if (node.riskScore && node.riskScore > 70) {
      return 3; // Thick border for high risk
    }
    if (node.nodeType === 'exchange' || node.nodeType === 'validator') {
      return 2; // Medium border for important types
    }
    return 1; // Thin border for regular nodes
  }

  calculateStrokeColor(node) {
    if (node.riskScore && node.riskScore > 70) {
      return this.options.colors.high;
    }
    return '#333333';
  }

  calculateDashArray(edge) {
    if (edge.suspiciousPattern) {
      return '5,5'; // Dashed line for suspicious
    }
    if (edge.edgeType === 'inferred') {
      return '3,3'; // Dotted for inferred
    }
    return 'none'; // Solid line
  }

  calculateViewport(graph) {
    const nodeCount = graph.nodes.length;
    
    // Estimate required space based on node count
    const baseSize = Math.sqrt(nodeCount) * 100;
    const width = Math.max(800, Math.min(2000, baseSize));
    const height = Math.max(600, Math.min(1500, baseSize * 0.75));
    
    return {
      width,
      height,
      scale: 1,
      centerX: width / 2,
      centerY: height / 2
    };
  }

  generateClusteringHints(graph) {
    // Group nodes by cluster for visual hints
    const clusters = new Map();
    
    graph.nodes.forEach(node => {
      const clusterKey = node.clusterId || node.group || 'default';
      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey).push(node);
    });

    return Array.from(clusters.entries()).map(([id, nodes]) => ({
      id,
      nodes: nodes.map(n => n.id),
      size: nodes.length,
      color: this.generateClusterColor(id),
      opacity: 0.1
    }));
  }

  generateClusterColor(clusterId) {
    // Generate deterministic color based on cluster ID
    let hash = 0;
    for (let i = 0; i < clusterId.length; i++) {
      hash = clusterId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 50%, 70%)`;
  }

  generateRenderingHints(graph) {
    const nodeCount = graph.nodes.length;
    const linkCount = graph.links?.length || 0;
    
    return {
      complexity: this.assessComplexity(nodeCount, linkCount),
      performance: {
        useCanvas: nodeCount > 500,
        enableWebGL: nodeCount > 2000,
        levelOfDetail: nodeCount > 1000,
        maxFPS: nodeCount > 500 ? 30 : 60
      },
      optimization: {
        spatialIndexing: nodeCount > 200,
        frustumCulling: nodeCount > 500,
        instancedRendering: linkCount > 1000
      }
    };
  }

  assessComplexity(nodeCount, linkCount) {
    const score = nodeCount + linkCount * 2;
    if (score < 100) return 'low';
    if (score < 500) return 'medium';
    if (score < 2000) return 'high';
    return 'very_high';
  }

  getSankeyCategory(nodeType) {
    switch (nodeType?.toLowerCase()) {
      case 'exchange': return 'exchange';
      case 'validator': return 'infrastructure';
      case 'parachain': return 'infrastructure';
      case 'mixer': return 'privacy';
      default: return 'user';
    }
  }

  calculateSankeyLinkColor(flow) {
    if (flow.suspiciousPattern) {
      return this.options.colors.high;
    }
    // Gradient from light to dark based on volume
    const volumeRatio = Math.min(1, Number(BigInt(flow.volume || 0) / BigInt('1000000000000')));
    const opacity = 0.3 + volumeRatio * 0.7;
    return `rgba(100, 149, 237, ${opacity})`; // Blue with variable opacity
  }

  calculateMaxDepth(tree, depth = 0) {
    if (!tree.children || tree.children.length === 0) {
      return depth;
    }
    return Math.max(...tree.children.map(child => this.calculateMaxDepth(child, depth + 1)));
  }

  countNodesInTree(tree) {
    let count = 1;
    if (tree.children) {
      count += tree.children.reduce((sum, child) => sum + this.countNodesInTree(child), 0);
    }
    return count;
  }

  generateNodeTooltip(node) {
    const parts = [];
    
    parts.push(`Address: ${this.shortenAddress(node.address)}`);
    
    if (node.identity?.display) {
      parts.push(`Identity: ${node.identity.display}`);
    }
    
    if (node.nodeType) {
      parts.push(`Type: ${node.nodeType}`);
    }
    
    if (node.balance?.free) {
      parts.push(`Balance: ${this.formatBalance(node.balance.free)}`);
    }
    
    if (node.degree !== undefined) {
      parts.push(`Connections: ${node.degree}`);
    }
    
    if (node.totalVolume) {
      parts.push(`Volume: ${this.formatVolume(node.totalVolume)}`);
    }
    
    if (node.riskScore !== undefined) {
      parts.push(`Risk Score: ${node.riskScore}/100`);
    }

    return parts.join('\n');
  }

  generateEdgeTooltip(edge) {
    const parts = [];
    
    parts.push(`From: ${this.shortenAddress(edge.source)}`);
    parts.push(`To: ${this.shortenAddress(edge.target)}`);
    
    if (edge.count) {
      parts.push(`Transactions: ${edge.count}`);
    }
    
    if (edge.volume) {
      parts.push(`Volume: ${this.formatVolume(edge.volume)}`);
    }
    
    if (edge.firstTransfer) {
      parts.push(`First: ${new Date(edge.firstTransfer * 1000).toLocaleDateString()}`);
    }
    
    if (edge.lastTransfer) {
      parts.push(`Last: ${new Date(edge.lastTransfer * 1000).toLocaleDateString()}`);
    }

    return parts.join('\n');
  }

  formatBalance(balance) {
    const balanceNum = Number(BigInt(balance) / BigInt('1000000000000')); // Convert to DOT
    return `${balanceNum.toLocaleString()} DOT`;
  }

  formatVolume(volume) {
    const volumeNum = Number(BigInt(volume) / BigInt('1000000000000')); // Convert to DOT
    if (volumeNum >= 1000000) {
      return `${(volumeNum / 1000000).toFixed(1)}M DOT`;
    } else if (volumeNum >= 1000) {
      return `${(volumeNum / 1000).toFixed(1)}K DOT`;
    } else {
      return `${volumeNum.toLocaleString()} DOT`;
    }
  }
}