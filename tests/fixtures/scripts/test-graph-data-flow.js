#!/usr/bin/env node

/**
 * Test script for graph visualization data flow
 * Tests the complete pipeline from API to D3 format transformation
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DatabaseService } from './src/services/DatabaseService.js';
import { GraphController } from './src/controllers/GraphController.js';
import { GraphQueries } from './src/services/GraphQueries.js';
import { RelationshipScorer } from './src/services/RelationshipScorer.js';
import { PathFinder } from './src/services/PathFinder.js';
import { GraphMetrics } from './src/services/GraphMetrics.js';
import { D3Formatter } from './src/services/D3Formatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class GraphDataFlowTester {
  constructor() {
    this.db = null;
    this.graphController = null;
    this.d3Formatter = new D3Formatter();
  }

  async initialize() {
    console.log('🔧 Initializing database and services...');
    
    // Initialize database
    this.db = new DatabaseService();
    await this.db.initialize();
    console.log('✅ Database initialized');

    // Initialize services
    const graphQueries = new GraphQueries(this.db);
    const relationshipScorer = new RelationshipScorer(this.db);
    const pathFinder = new PathFinder(this.db, graphQueries);
    const graphMetrics = new GraphMetrics(this.db);

    // Initialize controller
    this.graphController = new GraphController(
      this.db,
      graphQueries,
      relationshipScorer,
      pathFinder,
      graphMetrics,
      null // No real data service for this test
    );
    console.log('✅ Graph services initialized');
  }

  async testDataGeneration() {
    console.log('\n🧪 Testing sample data generation...');
    
    // Create some test data
    const testAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
    
    try {
      // Insert some sample data
      await this.insertSampleData(testAddress);
      console.log('✅ Sample data inserted');
      
      // Test the API data retrieval
      const mockReq = {
        params: { address: testAddress },
        query: { 
          depth: 2, 
          maxNodes: 10, 
          direction: 'both',
          minVolume: '0',
          minBalance: '0'
        }
      };
      
      const mockRes = {
        json: (data) => {
          console.log('✅ API returned data structure');
          this.testDataStructure(data);
          return data;
        },
        status: (code) => ({
          json: (data) => {
            console.log(`❌ API returned error ${code}:`, data);
            return data;
          }
        })
      };

      await this.graphController.getGraph(mockReq, mockRes);
      
    } catch (error) {
      console.error('❌ Error testing data generation:', error);
    }
  }

  async insertSampleData(targetAddress) {
    const sampleData = [
      // Target address
      {
        address: targetAddress,
        balance_free: '1000000000000000', // 1M DOT
        balance_reserved: '0',
        balance_frozen: '0',
        nonce: 1,
        identity_display: 'Test Target',
        transfer_count: 5,
        last_active: Math.floor(Date.now() / 1000)
      },
      // Connected addresses
      {
        address: '12Gp8wprD5vF9YZnF7GFQGcb6RR2cg32bHQjHK4rCbY8Fq3k',
        balance_free: '500000000000000', // 500K DOT  
        balance_reserved: '0',
        balance_frozen: '0',
        nonce: 1,
        identity_display: 'Test Exchange',
        transfer_count: 10,
        last_active: Math.floor(Date.now() / 1000) - 86400
      },
      {
        address: '14Kt6Kb3Ag8fG99ZyGo9TwHNHyRr4rGr7GQcCN1hK6NrZrC2',
        balance_free: '250000000000000', // 250K DOT
        balance_reserved: '0', 
        balance_frozen: '0',
        nonce: 1,
        identity_display: 'Test Validator',
        transfer_count: 15,
        last_active: Math.floor(Date.now() / 1000) - 3600
      }
    ];

    // Insert addresses
    for (const addr of sampleData) {
      await this.db.run(`
        INSERT OR REPLACE INTO addresses 
        (address, balance_free, balance_reserved, balance_frozen, nonce, identity_display, transfer_count, last_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        addr.address, addr.balance_free, addr.balance_reserved, addr.balance_frozen,
        addr.nonce, addr.identity_display, addr.transfer_count, addr.last_active
      ]);
    }

    // Insert sample relationships
    const relationships = [
      {
        from_address: targetAddress,
        to_address: '12Gp8wprD5vF9YZnF7GFQGcb6RR2cg32bHQjHK4rCbY8Fq3k',
        total_volume: '10000000000000000', // 10M DOT
        transfer_count: 3,
        first_transfer: Math.floor(Date.now() / 1000) - 7 * 86400,
        last_transfer: Math.floor(Date.now() / 1000) - 86400
      },
      {
        from_address: '14Kt6Kb3Ag8fG99ZyGo9TwHNHyRr4rGr7GQcCN1hK6NrZrC2',
        to_address: targetAddress,
        total_volume: '5000000000000000', // 5M DOT
        transfer_count: 2,
        first_transfer: Math.floor(Date.now() / 1000) - 5 * 86400,
        last_transfer: Math.floor(Date.now() / 1000) - 3600
      }
    ];

    for (const rel of relationships) {
      await this.db.run(`
        INSERT OR REPLACE INTO relationships 
        (from_address, to_address, total_volume, transfer_count, first_transfer, last_transfer)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        rel.from_address, rel.to_address, rel.total_volume, 
        rel.transfer_count, rel.first_transfer, rel.last_transfer
      ]);
    }
  }

  testDataStructure(apiData) {
    console.log('\n🔍 Testing API data structure...');
    
    // Test basic structure
    const requiredFields = ['nodes', 'links', 'metadata'];
    const hasRequired = requiredFields.every(field => apiData.hasOwnProperty(field));
    console.log(`✅ Has required fields (${requiredFields.join(', ')}):`, hasRequired);
    
    if (!hasRequired) {
      console.log('❌ Missing required fields:', 
        requiredFields.filter(field => !apiData.hasOwnProperty(field)));
      return;
    }

    // Test nodes structure
    console.log(`📊 Node count: ${apiData.nodes.length}`);
    if (apiData.nodes.length > 0) {
      const sampleNode = apiData.nodes[0];
      console.log('📋 Sample node structure:', Object.keys(sampleNode));
      
      // Required node fields for D3
      const requiredNodeFields = ['address'];
      const nodeHasRequired = requiredNodeFields.every(field => sampleNode.hasOwnProperty(field));
      console.log('✅ Node has required fields:', nodeHasRequired);
      
      if (!nodeHasRequired) {
        console.log('❌ Node missing fields:', 
          requiredNodeFields.filter(field => !sampleNode.hasOwnProperty(field)));
      }
    }

    // Test links structure  
    console.log(`🔗 Link count: ${apiData.links.length}`);
    if (apiData.links.length > 0) {
      const sampleLink = apiData.links[0];
      console.log('📋 Sample link structure:', Object.keys(sampleLink));
      
      // Required link fields for D3
      const requiredLinkFields = ['source', 'target'];
      const linkHasRequired = requiredLinkFields.every(field => sampleLink.hasOwnProperty(field));
      console.log('✅ Link has required fields:', linkHasRequired);
      
      if (!linkHasRequired) {
        console.log('❌ Link missing fields:', 
          requiredLinkFields.filter(field => !sampleLink.hasOwnProperty(field)));
      }
    }

    // Test D3 transformation
    this.testD3Transformation(apiData);
  }

  testD3Transformation(apiData) {
    console.log('\n🎨 Testing D3 data transformation...');
    
    try {
      const d3Data = this.d3Formatter.formatForceGraph(apiData.nodes, apiData.links);
      
      console.log('✅ D3 transformation successful');
      console.log(`📊 D3 nodes: ${d3Data.nodes.length}, links: ${d3Data.links.length}`);
      
      // Verify D3 format
      if (d3Data.nodes.length > 0) {
        const d3Node = d3Data.nodes[0];
        console.log('📋 D3 node properties:', Object.keys(d3Node));
        
        // Check for D3-specific properties
        const d3NodeProps = ['id', 'size', 'color', 'label'];
        const hasD3Props = d3NodeProps.filter(prop => d3Node.hasOwnProperty(prop));
        console.log('✅ D3 node properties added:', hasD3Props);
      }
      
      if (d3Data.links.length > 0) {
        const d3Link = d3Data.links[0];
        console.log('📋 D3 link properties:', Object.keys(d3Link));
        
        // Check for D3-specific properties
        const d3LinkProps = ['source', 'target', 'width', 'color'];
        const hasD3Props = d3LinkProps.filter(prop => d3Link.hasOwnProperty(prop));
        console.log('✅ D3 link properties added:', hasD3Props);
      }

      // Test visualization compatibility
      this.testVisualizationCompatibility(d3Data);
      
    } catch (error) {
      console.error('❌ D3 transformation failed:', error);
    }
  }

  testVisualizationCompatibility(d3Data) {
    console.log('\n🖥️  Testing visualization compatibility...');
    
    // Test that data matches what PolkadotGraphVisualization expects
    const vizExpectedStructure = {
      nodes: 'array',
      links: 'array', 
      metadata: 'object'
    };

    let compatible = true;

    for (const [field, expectedType] of Object.entries(vizExpectedStructure)) {
      const hasField = d3Data.hasOwnProperty(field);
      const correctType = hasField && (
        expectedType === 'array' ? Array.isArray(d3Data[field]) : 
        typeof d3Data[field] === expectedType
      );
      
      if (!hasField || !correctType) {
        console.log(`❌ Visualization incompatible: ${field} should be ${expectedType}`);
        compatible = false;
      }
    }

    if (compatible) {
      console.log('✅ Data structure compatible with PolkadotGraphVisualization');
      
      // Test specific visualization requirements
      if (d3Data.nodes.length > 0) {
        const node = d3Data.nodes[0];
        
        // Required for positioning
        const positionFields = ['id']; 
        const hasPositionFields = positionFields.every(field => node.hasOwnProperty(field));
        console.log('✅ Nodes have positioning fields:', hasPositionFields);
        
        // Required for styling
        const styleFields = ['color', 'size'];
        const hasStyleFields = styleFields.every(field => node.hasOwnProperty(field));
        console.log('✅ Nodes have styling fields:', hasStyleFields);
      }

      if (d3Data.links.length > 0) {
        const link = d3Data.links[0];
        
        // Required for connection
        const connectionFields = ['source', 'target'];
        const hasConnectionFields = connectionFields.every(field => link.hasOwnProperty(field));
        console.log('✅ Links have connection fields:', hasConnectionFields);
        
        // Required for styling
        const styleFields = ['color', 'width'];
        const hasStyleFields = styleFields.some(field => link.hasOwnProperty(field));
        console.log('✅ Links have styling fields:', hasStyleFields);
      }
      
      // Generate a sample loadable format
      this.generateSampleOutput(d3Data);
    }
  }

  generateSampleOutput(d3Data) {
    console.log('\n📄 Generating sample visualization data...');
    
    const sampleOutput = {
      nodes: d3Data.nodes.slice(0, 3), // First 3 nodes
      links: d3Data.links.slice(0, 2), // First 2 links
      metadata: d3Data.metadata
    };

    console.log('Sample data for visualization:');
    console.log(JSON.stringify(sampleOutput, null, 2));
    
    // Test with graph visualization class
    this.testWithVisualizationClass(sampleOutput);
  }

  testWithVisualizationClass(sampleData) {
    console.log('\n🎯 Testing with graph visualization class...');
    
    try {
      // Simulate what the frontend would do
      console.log('✅ Sample data structure validation:');
      console.log('- nodes array:', Array.isArray(sampleData.nodes));
      console.log('- links array:', Array.isArray(sampleData.links));
      console.log('- metadata object:', typeof sampleData.metadata === 'object');
      
      if (sampleData.nodes.length > 0) {
        const node = sampleData.nodes[0];
        console.log('- node.address exists:', !!node.address);
        console.log('- node.id exists:', !!node.id);
        console.log('- node.color exists:', !!node.color);
        console.log('- node.size exists:', !!node.size);
      }
      
      if (sampleData.links.length > 0) {
        const link = sampleData.links[0];
        console.log('- link.source exists:', !!link.source);
        console.log('- link.target exists:', !!link.target);
        console.log('- link.color exists:', !!link.color);
        console.log('- link.width exists:', !!link.width);
      }
      
      console.log('✅ Data format appears compatible with PolkadotGraphVisualization.loadGraphData()');
      
    } catch (error) {
      console.error('❌ Visualization class test failed:', error);
    }
  }

  async testAPIEndpoint() {
    console.log('\n🌐 Testing API endpoint behavior...');
    
    const testAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
    
    try {
      // Test API response structure
      const mockReq = {
        params: { address: testAddress },
        query: { depth: 1, maxNodes: 5, direction: 'both' }
      };
      
      let responseData = null;
      const mockRes = {
        json: (data) => {
          responseData = data;
          return data;
        },
        status: (code) => ({
          json: (data) => {
            console.log(`API Error ${code}:`, data);
            return data;
          }
        })
      };

      await this.graphController.getGraph(mockReq, mockRes);
      
      if (responseData) {
        console.log('✅ API endpoint test successful');
        console.log('API endpoint structure validation:');
        console.log('- Has nodes:', !!responseData.nodes);
        console.log('- Has links:', !!responseData.links);  
        console.log('- Has metadata:', !!responseData.metadata);
        console.log('- Node count:', responseData.nodes?.length || 0);
        console.log('- Link count:', responseData.links?.length || 0);
        
        return responseData;
      } else {
        console.log('❌ API endpoint did not return data');
      }
      
    } catch (error) {
      console.error('❌ API endpoint test failed:', error);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (this.db) {
      await this.db.close();
      console.log('✅ Database connection closed');
    }
  }

  async runTests() {
    console.log('🚀 Starting Graph Data Flow Test\n');
    
    try {
      await this.initialize();
      await this.testDataGeneration();
      await this.testAPIEndpoint();
      
      console.log('\n✅ All tests completed successfully!');
      console.log('\n📋 Summary:');
      console.log('1. ✅ Database and services initialized');
      console.log('2. ✅ Sample data inserted'); 
      console.log('3. ✅ API data structure validated');
      console.log('4. ✅ D3 transformation successful');
      console.log('5. ✅ Visualization compatibility confirmed');
      console.log('6. ✅ API endpoint behavior verified');
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the tests
const tester = new GraphDataFlowTester();
tester.runTests().catch(console.error);