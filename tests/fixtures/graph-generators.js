/**
 * Graph structure generators for testing various graph topologies
 */

import { randomBytes } from 'crypto';

// Generate a valid Polkadot address-like string
export function generateAddress(seed = null) {
  const prefix = '5';
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address = prefix;
  
  const bytes = seed ? Buffer.from(seed) : randomBytes(32);
  for (let i = 0; i < 47; i++) {
    address += chars[bytes[i % bytes.length] % chars.length];
  }
  
  return address;
}

// Create account object
export function createAccount(address, options = {}) {
  return {
    address,
    identity_display: options.identity || `Account ${address.slice(0, 8)}`,
    balance: options.balance || '1000000000000', // 1 DOT default
    total_transfers_in: options.transfersIn || 0,
    total_transfers_out: options.transfersOut || 0,
    volume_in: options.volumeIn || '0',
    volume_out: options.volumeOut || '0',
    first_seen_block: options.firstBlock || 1000000,
    last_seen_block: options.lastBlock || 2000000,
    risk_score: options.riskScore || 0,
    created_at: options.createdAt || new Date().toISOString()
  };
}

// Create transfer object
export function createTransfer(from, to, options = {}) {
  return {
    hash: options.hash || `0x${randomBytes(32).toString('hex')}`,
    block_number: options.block || Math.floor(Math.random() * 1000000) + 1000000,
    timestamp: options.timestamp || new Date().toISOString(),
    from_address: from,
    to_address: to,
    value: options.value || '1000000000000', // 1 DOT default
    fee: options.fee || '125000000',
    success: options.success !== undefined ? options.success : true,
    method: options.method || 'transfer',
    section: options.section || 'balances'
  };
}

export const GraphGenerators = {
  /**
   * Hub-and-spoke pattern (centralized)
   * One central node connected to many peripheral nodes
   */
  generateHubSpoke(hubAddress, spokeCount, transfersPerSpoke = 1) {
    const hub = createAccount(hubAddress || generateAddress(), {
      identity: 'Hub Node',
      balance: '1000000000000000' // 1000 DOT
    });
    
    const nodes = [hub];
    const edges = [];
    const relationships = [];
    
    for (let i = 0; i < spokeCount; i++) {
      const spokeAddress = generateAddress();
      const spoke = createAccount(spokeAddress, {
        identity: `Spoke ${i + 1}`,
        balance: String((i + 1) * 1000000000000)
      });
      nodes.push(spoke);
      
      // Create transfers between hub and spoke
      for (let j = 0; j < transfersPerSpoke; j++) {
        const isOutgoing = Math.random() > 0.5;
        const transfer = createTransfer(
          isOutgoing ? hub.address : spokeAddress,
          isOutgoing ? spokeAddress : hub.address,
          {
            block: 1000000 + i * 1000 + j,
            value: String((j + 1) * 1000000000000)
          }
        );
        edges.push(transfer);
      }
      
      // Create relationship
      relationships.push({
        from_address: hub.address,
        to_address: spokeAddress,
        transfer_count: transfersPerSpoke,
        total_volume: String(transfersPerSpoke * 1000000000000),
        first_transfer_block: 1000000 + i * 1000,
        last_transfer_block: 1000000 + i * 1000 + transfersPerSpoke - 1
      });
    }
    
    return { nodes, edges, relationships };
  },

  /**
   * Cluster pattern (communities)
   * Multiple dense clusters with sparse inter-cluster connections
   */
  generateClusters(clusterCount, nodesPerCluster, intraClusterDensity = 0.7, interClusterDensity = 0.1) {
    const nodes = [];
    const edges = [];
    const relationships = [];
    const clusters = [];
    
    // Generate clusters
    for (let c = 0; c < clusterCount; c++) {
      const cluster = [];
      
      for (let n = 0; n < nodesPerCluster; n++) {
        const address = generateAddress();
        const node = createAccount(address, {
          identity: `Cluster ${c + 1} Node ${n + 1}`,
          balance: String((c + 1) * (n + 1) * 1000000000000)
        });
        nodes.push(node);
        cluster.push(node);
      }
      
      clusters.push(cluster);
    }
    
    // Create intra-cluster connections
    clusters.forEach((cluster, clusterIndex) => {
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          if (Math.random() < intraClusterDensity) {
            const transfer = createTransfer(cluster[i].address, cluster[j].address, {
              block: 1000000 + clusterIndex * 10000 + i * 100 + j,
              value: String((i + 1) * (j + 1) * 100000000000)
            });
            edges.push(transfer);
            
            relationships.push({
              from_address: cluster[i].address,
              to_address: cluster[j].address,
              transfer_count: 1,
              total_volume: transfer.value,
              first_transfer_block: transfer.block_number,
              last_transfer_block: transfer.block_number
            });
          }
        }
      }
    });
    
    // Create inter-cluster connections
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (Math.random() < interClusterDensity) {
          const node1 = clusters[i][Math.floor(Math.random() * clusters[i].length)];
          const node2 = clusters[j][Math.floor(Math.random() * clusters[j].length)];
          
          const transfer = createTransfer(node1.address, node2.address, {
            block: 2000000 + i * 1000 + j,
            value: '10000000000000' // 10 DOT for inter-cluster
          });
          edges.push(transfer);
          
          relationships.push({
            from_address: node1.address,
            to_address: node2.address,
            transfer_count: 1,
            total_volume: transfer.value,
            first_transfer_block: transfer.block_number,
            last_transfer_block: transfer.block_number
          });
        }
      }
    }
    
    return { nodes, edges, relationships };
  },

  /**
   * Chain pattern (sequential)
   * Nodes connected in a linear chain
   */
  generateChain(length, transfersPerLink = 1, bidirectional = false) {
    const nodes = [];
    const edges = [];
    const relationships = [];
    
    // Create nodes
    for (let i = 0; i < length; i++) {
      const node = createAccount(generateAddress(), {
        identity: `Chain Node ${i + 1}`,
        balance: String((length - i) * 1000000000000)
      });
      nodes.push(node);
    }
    
    // Create chain connections
    for (let i = 0; i < length - 1; i++) {
      for (let t = 0; t < transfersPerLink; t++) {
        const transfer = createTransfer(nodes[i].address, nodes[i + 1].address, {
          block: 1000000 + i * 1000 + t,
          value: String((t + 1) * 1000000000000)
        });
        edges.push(transfer);
        
        if (bidirectional) {
          const reverseTransfer = createTransfer(nodes[i + 1].address, nodes[i].address, {
            block: 1000000 + i * 1000 + t + 500,
            value: String((t + 1) * 500000000000)
          });
          edges.push(reverseTransfer);
        }
      }
      
      relationships.push({
        from_address: nodes[i].address,
        to_address: nodes[i + 1].address,
        transfer_count: transfersPerLink,
        total_volume: String(transfersPerLink * 1000000000000),
        first_transfer_block: 1000000 + i * 1000,
        last_transfer_block: 1000000 + i * 1000 + transfersPerLink - 1
      });
      
      if (bidirectional) {
        relationships.push({
          from_address: nodes[i + 1].address,
          to_address: nodes[i].address,
          transfer_count: transfersPerLink,
          total_volume: String(transfersPerLink * 500000000000),
          first_transfer_block: 1000000 + i * 1000 + 500,
          last_transfer_block: 1000000 + i * 1000 + 500 + transfersPerLink - 1
        });
      }
    }
    
    return { nodes, edges, relationships };
  },

  /**
   * Random pattern (Erdős–Rényi)
   * Random connections between nodes
   */
  generateRandom(nodeCount, edgeProbability = 0.1, transfersPerEdge = 1) {
    const nodes = [];
    const edges = [];
    const relationships = [];
    
    // Create nodes
    for (let i = 0; i < nodeCount; i++) {
      const node = createAccount(generateAddress(), {
        identity: `Random Node ${i + 1}`,
        balance: String(Math.floor(Math.random() * 100 + 1) * 1000000000000)
      });
      nodes.push(node);
    }
    
    // Create random edges
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        if (Math.random() < edgeProbability) {
          const totalVolume = BigInt(0);
          
          for (let t = 0; t < transfersPerEdge; t++) {
            const value = String(Math.floor(Math.random() * 10 + 1) * 1000000000000);
            const transfer = createTransfer(nodes[i].address, nodes[j].address, {
              block: 1000000 + i * 1000 + j * 10 + t,
              value
            });
            edges.push(transfer);
          }
          
          relationships.push({
            from_address: nodes[i].address,
            to_address: nodes[j].address,
            transfer_count: transfersPerEdge,
            total_volume: String(transfersPerEdge * 1000000000000),
            first_transfer_block: 1000000 + i * 1000 + j * 10,
            last_transfer_block: 1000000 + i * 1000 + j * 10 + transfersPerEdge - 1
          });
        }
      }
    }
    
    return { nodes, edges, relationships };
  },

  /**
   * Scale-free pattern (Barabási–Albert)
   * Preferential attachment creates power-law degree distribution
   */
  generateScaleFree(nodeCount, attachmentCount = 2) {
    const nodes = [];
    const edges = [];
    const relationships = [];
    const degrees = new Map();
    
    // Start with a small complete graph
    const initialNodes = Math.min(attachmentCount + 1, nodeCount);
    for (let i = 0; i < initialNodes; i++) {
      const node = createAccount(generateAddress(), {
        identity: `Scale-Free Node ${i + 1}`,
        balance: String((nodeCount - i) * 1000000000000)
      });
      nodes.push(node);
      degrees.set(node.address, 0);
    }
    
    // Connect initial nodes
    for (let i = 0; i < initialNodes; i++) {
      for (let j = i + 1; j < initialNodes; j++) {
        const transfer = createTransfer(nodes[i].address, nodes[j].address, {
          block: 1000000 + i * 100 + j,
          value: '1000000000000'
        });
        edges.push(transfer);
        
        degrees.set(nodes[i].address, degrees.get(nodes[i].address) + 1);
        degrees.set(nodes[j].address, degrees.get(nodes[j].address) + 1);
        
        relationships.push({
          from_address: nodes[i].address,
          to_address: nodes[j].address,
          transfer_count: 1,
          total_volume: transfer.value,
          first_transfer_block: transfer.block_number,
          last_transfer_block: transfer.block_number
        });
      }
    }
    
    // Add remaining nodes with preferential attachment
    for (let i = initialNodes; i < nodeCount; i++) {
      const newNode = createAccount(generateAddress(), {
        identity: `Scale-Free Node ${i + 1}`,
        balance: String((nodeCount - i) * 1000000000000)
      });
      nodes.push(newNode);
      degrees.set(newNode.address, 0);
      
      // Select nodes to connect based on degree
      const targets = new Set();
      while (targets.size < attachmentCount && targets.size < i) {
        const totalDegree = Array.from(degrees.values()).reduce((a, b) => a + b, 0);
        let random = Math.random() * totalDegree;
        
        for (const [address, degree] of degrees.entries()) {
          random -= degree;
          if (random <= 0 && address !== newNode.address && !targets.has(address)) {
            targets.add(address);
            break;
          }
        }
      }
      
      // Create connections
      for (const targetAddress of targets) {
        const transfer = createTransfer(newNode.address, targetAddress, {
          block: 1000000 + i * 1000,
          value: String(Math.floor(Math.random() * 10 + 1) * 1000000000000)
        });
        edges.push(transfer);
        
        degrees.set(newNode.address, degrees.get(newNode.address) + 1);
        degrees.set(targetAddress, degrees.get(targetAddress) + 1);
        
        relationships.push({
          from_address: newNode.address,
          to_address: targetAddress,
          transfer_count: 1,
          total_volume: transfer.value,
          first_transfer_block: transfer.block_number,
          last_transfer_block: transfer.block_number
        });
      }
    }
    
    return { nodes, edges, relationships };
  },

  /**
   * Ring pattern
   * Nodes connected in a circular ring
   */
  generateRing(nodeCount, connectionsPerNode = 2) {
    const nodes = [];
    const edges = [];
    const relationships = [];
    
    // Create nodes
    for (let i = 0; i < nodeCount; i++) {
      const node = createAccount(generateAddress(), {
        identity: `Ring Node ${i + 1}`,
        balance: String((i + 1) * 1000000000000)
      });
      nodes.push(node);
    }
    
    // Create ring connections
    for (let i = 0; i < nodeCount; i++) {
      for (let j = 1; j <= Math.floor(connectionsPerNode / 2); j++) {
        const targetIndex = (i + j) % nodeCount;
        
        const transfer = createTransfer(nodes[i].address, nodes[targetIndex].address, {
          block: 1000000 + i * 100 + j,
          value: String(j * 1000000000000)
        });
        edges.push(transfer);
        
        relationships.push({
          from_address: nodes[i].address,
          to_address: nodes[targetIndex].address,
          transfer_count: 1,
          total_volume: transfer.value,
          first_transfer_block: transfer.block_number,
          last_transfer_block: transfer.block_number
        });
      }
    }
    
    return { nodes, edges, relationships };
  },

  /**
   * Tree pattern
   * Hierarchical tree structure
   */
  generateTree(depth, branchingFactor = 2) {
    const nodes = [];
    const edges = [];
    const relationships = [];
    
    function createSubtree(parentAddress, currentDepth, nodeIndex) {
      if (currentDepth >= depth) return nodeIndex;
      
      for (let i = 0; i < branchingFactor; i++) {
        const childAddress = generateAddress();
        const child = createAccount(childAddress, {
          identity: `Tree Node ${nodeIndex}`,
          balance: String((depth - currentDepth) * 1000000000000)
        });
        nodes.push(child);
        
        if (parentAddress) {
          const transfer = createTransfer(parentAddress, childAddress, {
            block: 1000000 + nodeIndex * 100,
            value: String((depth - currentDepth) * 1000000000000)
          });
          edges.push(transfer);
          
          relationships.push({
            from_address: parentAddress,
            to_address: childAddress,
            transfer_count: 1,
            total_volume: transfer.value,
            first_transfer_block: transfer.block_number,
            last_transfer_block: transfer.block_number
          });
        }
        
        nodeIndex = createSubtree(childAddress, currentDepth + 1, nodeIndex + 1);
      }
      
      return nodeIndex;
    }
    
    // Create root
    const root = createAccount(generateAddress(), {
      identity: 'Tree Root',
      balance: String(depth * 10 * 1000000000000)
    });
    nodes.push(root);
    
    createSubtree(root.address, 0, 1);
    
    return { nodes, edges, relationships };
  }
};

// Helper functions for tests
export async function generateLinearGraph(db, nodeCount, startIndex = 0) {
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const address = `address_${startIndex + i}`;
    db.prepare(`INSERT INTO accounts (address, balance) VALUES (?, ?)`).run(
      address, '1000000000000');
  }
  
  // Create linear connections
  for (let i = 0; i < nodeCount - 1; i++) {
    const from = `address_${startIndex + i}`;
    const to = `address_${startIndex + i + 1}`;
    db.prepare(`INSERT INTO account_relationships 
      (from_address, to_address, total_volume, transfer_count, first_transfer_time, last_transfer_time) 
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      from, to, '1000000000', 1, Date.now() / 1000 - 3600, Date.now() / 1000);
  }
}

export async function generateCircularGraph(db, nodeCount, startIndex = 0) {
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const address = `address_${startIndex + i}`;
    db.prepare(`INSERT INTO accounts (address, balance) VALUES (?, ?)`).run(
      address, '1000000000000');
  }
  
  // Create circular connections
  for (let i = 0; i < nodeCount; i++) {
    const from = `address_${startIndex + i}`;
    const to = `address_${startIndex + ((i + 1) % nodeCount)}`;
    db.prepare(`INSERT INTO account_relationships 
      (from_address, to_address, total_volume, transfer_count, first_transfer_time, last_transfer_time) 
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      from, to, '1000000000', 1, Date.now() / 1000 - 3600, Date.now() / 1000);
  }
}

export async function generateHubSpokeGraph(db, nodeCount, startIndex = 0) {
  // Create hub
  const hub = `address_${startIndex}`;
  db.prepare(`INSERT INTO accounts (address, balance) VALUES (?, ?)`).run(
    hub, '10000000000000');
  
  // Create spokes
  for (let i = 1; i < nodeCount; i++) {
    const spoke = `address_${startIndex + i}`;
    db.prepare(`INSERT INTO accounts (address, balance) VALUES (?, ?)`).run(
      spoke, '1000000000000');
    
    // Connect hub to spoke
    db.prepare(`INSERT INTO account_relationships 
      (from_address, to_address, total_volume, transfer_count, first_transfer_time, last_transfer_time) 
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      hub, spoke, '1000000000', 1, Date.now() / 1000 - 3600, Date.now() / 1000);
  }
}

export async function generateCompleteGraph(db, nodeCount, startIndex = 0) {
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const address = `address_${startIndex + i}`;
    db.prepare(`INSERT INTO accounts (address, balance) VALUES (?, ?)`).run(
      address, '1000000000000');
  }
  
  // Create complete connections (all nodes connected to all others)
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < nodeCount; j++) {
      if (i !== j) {
        const from = `address_${startIndex + i}`;
        const to = `address_${startIndex + j}`;
        db.prepare(`INSERT INTO account_relationships 
          (from_address, to_address, total_volume, transfer_count, first_transfer_time, last_transfer_time) 
          VALUES (?, ?, ?, ?, ?, ?)`).run(
          from, to, '1000000000', 1, Date.now() / 1000 - 3600, Date.now() / 1000);
      }
    }
  }
}