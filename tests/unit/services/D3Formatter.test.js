import { describe, it, expect, beforeEach } from 'vitest';
import { D3Formatter } from '../../../src/services/D3Formatter.js';

describe('D3Formatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new D3Formatter();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(formatter.options.nodeSize.min).toBe(20);
      expect(formatter.options.nodeSize.max).toBe(150);
      expect(formatter.options.edgeWidth.min).toBe(1);
      expect(formatter.options.edgeWidth.max).toBe(10);
    });

    it('should accept custom options', () => {
      const customFormatter = new D3Formatter({
        nodeSize: { min: 10, max: 200 }
      });
      
      expect(customFormatter.options.nodeSize.min).toBe(10);
      expect(customFormatter.options.nodeSize.max).toBe(200);
      expect(customFormatter.options.edgeWidth.min).toBe(1); // Should keep defaults
    });
  });

  describe('formatForceGraph', () => {
    const sampleNodes = [
      {
        address: 'address_1',
        nodeType: 'validator',
        degree: 25,
        totalVolume: '5000000000000000',
        riskScore: 15,
        importanceScore: 85,
        lastActive: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
        identity: { display: 'Alice Validator' },
        balance: { free: '1000000000000000' }
      },
      {
        address: 'address_2',
        nodeType: 'exchange',
        degree: 150,
        totalVolume: '50000000000000000',
        riskScore: 75,
        importanceScore: 95,
        lastActive: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        subscanAccount: { display: 'Major Exchange' }
      },
      {
        address: 'address_3',
        nodeType: 'regular',
        degree: 5,
        totalVolume: '100000000000000',
        riskScore: 25,
        importanceScore: 30,
        lastActive: Math.floor(Date.now() / 1000) - 86400 * 30 // 30 days ago
      }
    ];

    const sampleEdges = [
      {
        id: 1,
        source: 'address_1',
        target: 'address_2',
        volume: '1000000000000000',
        count: 25,
        lastTransfer: Math.floor(Date.now() / 1000) - 3600,
        suspiciousPattern: false,
        bidirectional: true
      },
      {
        id: 2,
        source: 'address_2',
        target: 'address_3',
        volume: '500000000000000',
        count: 10,
        lastTransfer: Math.floor(Date.now() / 1000) - 86400 * 7,
        suspiciousPattern: true,
        bidirectional: false
      }
    ];

    it('should format nodes and edges for D3.js force graph', () => {
      const result = formatter.formatForceGraph(sampleNodes, sampleEdges);

      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(2);
      expect(result.metadata.formatType).toBe('force');
    });

    it('should add required D3.js properties to nodes', () => {
      const result = formatter.formatForceGraph(sampleNodes, sampleEdges);
      const node = result.nodes[0];

      expect(node.id).toBe('address_1');
      expect(node.size).toBeTypeOf('number');
      expect(node.color).toBeTypeOf('string');
      expect(node.opacity).toBeTypeOf('number');
      expect(node.radius).toBeTypeOf('number');
      expect(node.mass).toBeTypeOf('number');
      expect(node.label).toBeTypeOf('string');
      expect(node.group).toBeTypeOf('string');
      expect(node.tooltip).toBeTypeOf('string');
    });

    it('should add required D3.js properties to edges', () => {
      const result = formatter.formatForceGraph(sampleNodes, sampleEdges);
      const edge = result.links[0];

      expect(edge.source).toBe('address_1');
      expect(edge.target).toBe('address_2');
      expect(edge.width).toBeTypeOf('number');
      expect(edge.color).toBeTypeOf('string');
      expect(edge.opacity).toBeTypeOf('number');
      expect(edge.tooltip).toBeTypeOf('string');
    });

    it('should include layout hints', () => {
      const result = formatter.formatForceGraph(sampleNodes, sampleEdges);

      expect(result.simulation).toBeDefined();
      expect(result.viewport).toBeDefined();
      expect(result.clustering).toBeDefined();
      expect(result.rendering).toBeDefined();
    });
  });

  describe('calculateNodeSize', () => {
    it('should calculate size based on degree', () => {
      const node = { degree: 50 };
      const size = formatter.calculateNodeSize(node);
      
      expect(size).toBeGreaterThan(formatter.options.nodeSize.min);
      expect(size).toBeLessThan(formatter.options.nodeSize.max);
    });

    it('should calculate size based on volume', () => {
      const highVolumeNode = { totalVolume: '10000000000000000' }; // 10T
      const lowVolumeNode = { totalVolume: '100000000000000' }; // 100B
      
      const highSize = formatter.calculateNodeSize(highVolumeNode);
      const lowSize = formatter.calculateNodeSize(lowVolumeNode);
      
      expect(highSize).toBeGreaterThan(lowSize);
    });

    it('should handle missing metrics gracefully', () => {
      const node = { address: 'test' };
      const size = formatter.calculateNodeSize(node);
      
      expect(size).toBe(formatter.options.nodeSize.default);
    });

    it('should boost size for important node types', () => {
      const exchangeNode = { nodeType: 'exchange', degree: 10 };
      const regularNode = { nodeType: 'regular', degree: 10 };
      
      const exchangeSize = formatter.calculateNodeSize(exchangeNode);
      const regularSize = formatter.calculateNodeSize(regularNode);
      
      expect(exchangeSize).toBeGreaterThan(regularSize);
    });
  });

  describe('calculateNodeColor', () => {
    it('should color nodes based on risk score', () => {
      const highRiskNode = { riskScore: 85 };
      const mediumRiskNode = { riskScore: 50 };
      const lowRiskNode = { riskScore: 15 };
      
      expect(formatter.calculateNodeColor(highRiskNode)).toBe(formatter.options.colors.high);
      expect(formatter.calculateNodeColor(mediumRiskNode)).toBe(formatter.options.colors.medium);
      expect(formatter.calculateNodeColor(lowRiskNode)).toBe(formatter.options.colors.safe);
    });

    it('should color nodes based on type when no risk score', () => {
      const exchangeNode = { nodeType: 'exchange' };
      const validatorNode = { nodeType: 'validator' };
      const mixerNode = { nodeType: 'mixer' };
      
      expect(formatter.calculateNodeColor(exchangeNode)).toBe(formatter.options.colors.exchange);
      expect(formatter.calculateNodeColor(validatorNode)).toBe(formatter.options.colors.validator);
      expect(formatter.calculateNodeColor(mixerNode)).toBe(formatter.options.colors.mixer);
    });

    it('should use neutral color as fallback', () => {
      const unknownNode = { address: 'test' };
      
      expect(formatter.calculateNodeColor(unknownNode)).toBe(formatter.options.colors.neutral);
    });
  });

  describe('calculateEdgeWidth', () => {
    it('should calculate width based on volume', () => {
      const highVolumeEdge = { volume: '1000000000000000' }; // 1T
      const lowVolumeEdge = { volume: '10000000000000' }; // 10B
      
      const highWidth = formatter.calculateEdgeWidth(highVolumeEdge);
      const lowWidth = formatter.calculateEdgeWidth(lowVolumeEdge);
      
      expect(highWidth).toBeGreaterThan(lowWidth);
      expect(highWidth).toBeLessThanOrEqual(formatter.options.edgeWidth.max);
      expect(lowWidth).toBeGreaterThanOrEqual(formatter.options.edgeWidth.min);
    });

    it('should calculate width based on transaction count', () => {
      const highCountEdge = { count: 100 };
      const lowCountEdge = { count: 5 };
      
      const highWidth = formatter.calculateEdgeWidth(highCountEdge);
      const lowWidth = formatter.calculateEdgeWidth(lowCountEdge);
      
      expect(highWidth).toBeGreaterThan(lowWidth);
    });

    it('should use default width when no metrics available', () => {
      const edge = { source: 'a', target: 'b' };
      const width = formatter.calculateEdgeWidth(edge);
      
      expect(width).toBe(formatter.options.edgeWidth.default);
    });
  });

  describe('calculateNodeOpacity', () => {
    it('should calculate opacity based on recency', () => {
      const now = Date.now() / 1000;
      const recentNode = { lastActive: now - 3600 }; // 1 hour ago
      const oldNode = { lastActive: now - 86400 * 60 }; // 60 days ago
      
      const recentOpacity = formatter.calculateNodeOpacity(recentNode);
      const oldOpacity = formatter.calculateNodeOpacity(oldNode);
      
      expect(recentOpacity).toBeGreaterThan(oldOpacity);
    });

    it('should use default opacity when no activity data', () => {
      const node = { address: 'test' };
      const opacity = formatter.calculateNodeOpacity(node);
      
      expect(opacity).toBe(formatter.options.opacity.default);
    });
  });

  describe('calculateEdgeOpacity', () => {
    it('should calculate opacity based on transfer recency', () => {
      const now = Date.now() / 1000;
      const recentEdge = { lastTransfer: now - 3600 }; // 1 hour ago
      const oldEdge = { lastTransfer: now - 86400 * 60 }; // 60 days ago
      
      const recentOpacity = formatter.calculateEdgeOpacity(recentEdge);
      const oldOpacity = formatter.calculateEdgeOpacity(oldEdge);
      
      expect(recentOpacity).toBeGreaterThan(oldOpacity);
    });
  });

  describe('addLayoutHints', () => {
    it('should generate appropriate force parameters', () => {
      const graph = {
        nodes: Array.from({ length: 100 }, (_, i) => ({ id: `node_${i}`, size: 40 })),
        links: Array.from({ length: 150 }, (_, i) => ({ source: `node_${i % 50}`, target: `node_${(i + 1) % 50}` }))
      };

      const hints = formatter.addLayoutHints(graph);
      
      expect(hints.simulation.chargeStrength).toBeTypeOf('number');
      expect(hints.simulation.linkDistance).toBeTypeOf('number');
      expect(hints.simulation.collideRadius).toBeTypeOf('number');
      expect(hints.viewport.width).toBeTypeOf('number');
      expect(hints.viewport.height).toBeTypeOf('number');
    });

    it('should scale parameters based on graph size', () => {
      const smallGraph = {
        nodes: Array.from({ length: 10 }, (_, i) => ({ id: `node_${i}`, size: 40 })),
        links: []
      };
      
      const largeGraph = {
        nodes: Array.from({ length: 500 }, (_, i) => ({ id: `node_${i}`, size: 40 })),
        links: []
      };

      const smallHints = formatter.addLayoutHints(smallGraph);
      const largeHints = formatter.addLayoutHints(largeGraph);
      
      expect(Math.abs(largeHints.simulation.chargeStrength))
        .toBeGreaterThan(Math.abs(smallHints.simulation.chargeStrength));
    });
  });

  describe('formatHierarchicalGraph', () => {
    const rootNode = {
      address: 'root_address',
      nodeType: 'validator',
      totalVolume: '10000000000000000',
      children: [
        {
          address: 'child_1',
          nodeType: 'regular',
          totalVolume: '1000000000000000',
          children: [
            {
              address: 'grandchild_1',
              nodeType: 'regular',
              totalVolume: '100000000000000'
            }
          ]
        },
        {
          address: 'child_2',
          nodeType: 'exchange',
          totalVolume: '5000000000000000'
        }
      ]
    };

    it('should format hierarchical tree structure', () => {
      const result = formatter.formatHierarchicalGraph(rootNode);
      
      expect(result.id).toBe('root_address');
      expect(result.children).toHaveLength(2);
      expect(result.children[0].children).toHaveLength(1);
      expect(result.metadata.formatType).toBe('hierarchical');
    });

    it('should assign depth to nodes', () => {
      const result = formatter.formatHierarchicalGraph(rootNode);
      
      expect(result.depth).toBe(0);
      expect(result.children[0].depth).toBe(1);
      expect(result.children[0].children[0].depth).toBe(2);
    });

    it('should calculate tree metadata', () => {
      const result = formatter.formatHierarchicalGraph(rootNode);
      
      expect(result.metadata.maxDepth).toBe(2);
      expect(result.metadata.totalNodes).toBe(4);
    });
  });

  describe('formatSankeyDiagram', () => {
    const sampleFlows = [
      {
        source: 'address_1',
        target: 'address_2',
        volume: '1000000000000000',
        sourceName: 'Alice',
        targetName: 'Bob',
        sourceType: 'validator',
        targetType: 'exchange'
      },
      {
        source: 'address_2',
        target: 'address_3',
        volume: '500000000000000',
        sourceName: 'Bob',
        targetName: 'Charlie',
        sourceType: 'exchange',
        targetType: 'regular'
      }
    ];

    it('should format flows for Sankey diagram', () => {
      const result = formatter.formatSankeyDiagram(sampleFlows);
      
      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(2);
      expect(result.metadata.formatType).toBe('sankey');
    });

    it('should extract unique nodes from flows', () => {
      const result = formatter.formatSankeyDiagram(sampleFlows);
      
      const nodeIds = result.nodes.map(n => n.id);
      expect(nodeIds).toContain('address_1');
      expect(nodeIds).toContain('address_2');
      expect(nodeIds).toContain('address_3');
    });

    it('should format links with values', () => {
      const result = formatter.formatSankeyDiagram(sampleFlows);
      
      expect(result.links[0].source).toBe('address_1');
      expect(result.links[0].target).toBe('address_2');
      expect(result.links[0].value).toBeTypeOf('number');
      expect(result.links[0].value).toBeGreaterThan(0);
    });
  });

  describe('helper methods', () => {
    describe('getNodeLabel', () => {
      it('should prefer identity display name', () => {
        const node = {
          address: 'long_address',
          identity: { display: 'Alice' },
          subscanAccount: { display: 'Alice Account' }
        };
        
        expect(formatter.getNodeLabel(node)).toBe('Alice');
      });

      it('should fall back to subscan display', () => {
        const node = {
          address: 'long_address',
          subscanAccount: { display: 'Alice Account' }
        };
        
        expect(formatter.getNodeLabel(node)).toBe('Alice Account');
      });

      it('should shorten address as last resort', () => {
        const node = { address: '1234567890abcdefghijklmnop' };
        const label = formatter.getNodeLabel(node);
        
        expect(label).toContain('...');
        expect(label.length).toBeLessThan(node.address.length);
      });
    });

    describe('shortenAddress', () => {
      it('should shorten long addresses', () => {
        const address = '1234567890abcdefghijklmnop';
        const shortened = formatter.shortenAddress(address);
        
        expect(shortened).toBe('123456...mnop');
      });

      it('should not shorten short addresses', () => {
        const address = '12345';
        expect(formatter.shortenAddress(address)).toBe(address);
      });
    });

    describe('formatBalance', () => {
      it('should format balance in DOT', () => {
        const balance = '1000000000000000'; // 1000 DOT
        const formatted = formatter.formatBalance(balance);
        
        expect(formatted).toContain('1,000 DOT');
      });
    });

    describe('formatVolume', () => {
      it('should format large volumes with units', () => {
        const largeVolume = '1000000000000000000'; // 1M DOT
        const formatted = formatter.formatVolume(largeVolume);
        
        expect(formatted).toContain('M DOT');
      });

      it('should format medium volumes with K', () => {
        const mediumVolume = '1000000000000000'; // 1K DOT
        const formatted = formatter.formatVolume(mediumVolume);
        
        expect(formatted).toContain('K DOT');
      });

      it('should format small volumes without units', () => {
        const smallVolume = '100000000000000'; // 100 DOT
        const formatted = formatter.formatVolume(smallVolume);
        
        expect(formatted).toContain('100 DOT');
      });
    });

    describe('generateNodeTooltip', () => {
      it('should generate comprehensive tooltip', () => {
        const node = {
          address: 'long_address_here',
          identity: { display: 'Alice' },
          nodeType: 'validator',
          balance: { free: '1000000000000000' },
          degree: 25,
          totalVolume: '5000000000000000',
          riskScore: 15
        };
        
        const tooltip = formatter.generateNodeTooltip(node);
        
        expect(tooltip).toContain('Address:');
        expect(tooltip).toContain('Identity: Alice');
        expect(tooltip).toContain('Type: validator');
        expect(tooltip).toContain('Balance:');
        expect(tooltip).toContain('Connections: 25');
        expect(tooltip).toContain('Volume:');
        expect(tooltip).toContain('Risk Score: 15/100');
      });
    });

    describe('generateEdgeTooltip', () => {
      it('should generate edge tooltip with transfer info', () => {
        const edge = {
          source: 'address_1',
          target: 'address_2',
          count: 25,
          volume: '1000000000000000',
          firstTransfer: 1609459200,
          lastTransfer: 1701388800
        };
        
        const tooltip = formatter.generateEdgeTooltip(edge);
        
        expect(tooltip).toContain('From:');
        expect(tooltip).toContain('To:');
        expect(tooltip).toContain('Transactions: 25');
        expect(tooltip).toContain('Volume:');
        expect(tooltip).toContain('First:');
        expect(tooltip).toContain('Last:');
      });
    });
  });

  describe('error handling', () => {
    it('should handle malformed node data gracefully', () => {
      const badNodes = [{ /* missing required fields */ }];
      const badEdges = [{ /* missing required fields */ }];
      
      expect(() => {
        formatter.formatForceGraph(badNodes, badEdges);
      }).not.toThrow();
    });

    it('should handle BigInt conversion errors', () => {
      const nodeWithBadVolume = {
        address: 'test',
        totalVolume: 'not_a_number'
      };
      
      expect(() => {
        formatter.calculateNodeSize(nodeWithBadVolume);
      }).not.toThrow();
    });

    it('should handle missing properties in calculations', () => {
      const emptyNode = {};
      
      expect(() => {
        const size = formatter.calculateNodeSize(emptyNode);
        const color = formatter.calculateNodeColor(emptyNode);
        const opacity = formatter.calculateNodeOpacity(emptyNode);
        
        expect(size).toBeTypeOf('number');
        expect(color).toBeTypeOf('string');
        expect(opacity).toBeTypeOf('number');
      }).not.toThrow();
    });
  });
});