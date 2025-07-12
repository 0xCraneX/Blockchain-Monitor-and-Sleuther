const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Generate realistic blockchain data
function generateRealisticData(centerAddress) {
  const nodes = [];
  const edges = [];
  
  // Add center node (target address)
  nodes.push({
    id: centerAddress,
    address: centerAddress,
    balance: "150000000000000", // 15,000 DOT
    nodeType: "target",
    label: "Target Address",
    group: 1,
    identity: {
      display: "Investigation Target",
      judgements: []
    }
  });
  
  // Common exchange addresses
  const exchanges = [
    { address: "14rYLbZdPYV5fP1qMkXYZBBfcTBZmR4FcJvmVYZBELWQnXU1", name: "Binance", balance: "500000000000000" },
    { address: "16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yNMAXcJRNYb", name: "Kraken", balance: "300000000000000" },
    { address: "13mAjuMrXq9L8YvJNYpXFvGqPJxY5z8HkMPXVkMWXJMvARxY", name: "Coinbase", balance: "450000000000000" }
  ];
  
  // Validators
  const validators = [
    { address: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5", name: "Validator 1", balance: "80000000000000" },
    { address: "14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2", name: "Validator 2", balance: "120000000000000" },
    { address: "13xPE9rWKjFNJPqFb8iYZt3btJAv8cKJ9nsGFvXYYGJyziJf", name: "Validator 3", balance: "95000000000000" }
  ];
  
  // Regular accounts
  const regularAccounts = [];
  for (let i = 0; i < 15; i++) {
    regularAccounts.push({
      address: `1${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      name: `Account ${i + 1}`,
      balance: Math.floor(Math.random() * 50000000000000).toString() // 0-5000 DOT
    });
  }
  
  // Add exchanges
  exchanges.forEach((ex, idx) => {
    nodes.push({
      id: ex.address,
      address: ex.address,
      balance: ex.balance,
      nodeType: "exchange",
      label: ex.name,
      group: 2,
      identity: {
        display: ex.name,
        judgements: ["reasonable"]
      }
    });
    
    // Create transfers between target and exchanges
    const transferCount = Math.floor(Math.random() * 10) + 1;
    const volume = Math.floor(Math.random() * 100000000000000).toString(); // 0-10000 DOT
    
    edges.push({
      id: `edge-target-ex-${idx}`,
      source: centerAddress,
      target: ex.address,
      amount: volume,
      count: transferCount,
      volume: volume,
      timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      type: "transfer"
    });
  });
  
  // Add validators
  validators.forEach((val, idx) => {
    nodes.push({
      id: val.address,
      address: val.address,
      balance: val.balance,
      nodeType: "validator",
      label: val.name,
      group: 3,
      identity: {
        display: val.name,
        judgements: ["knownGood"]
      }
    });
    
    // Some validators interact with target
    if (Math.random() > 0.5) {
      const transferCount = Math.floor(Math.random() * 5) + 1;
      const volume = Math.floor(Math.random() * 50000000000000).toString(); // 0-5000 DOT
      
      edges.push({
        id: `edge-target-val-${idx}`,
        source: centerAddress,
        target: val.address,
        amount: volume,
        count: transferCount,
        volume: volume,
        timestamp: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
        type: "transfer"
      });
    }
  });
  
  // Add regular accounts
  regularAccounts.forEach((acc, idx) => {
    nodes.push({
      id: acc.address,
      address: acc.address,
      balance: acc.balance,
      nodeType: "regular",
      label: acc.name,
      group: 4,
      identity: null
    });
    
    // Create various connection patterns
    if (idx < 5) {
      // Direct connections to target
      const transferCount = Math.floor(Math.random() * 3) + 1;
      const volume = Math.floor(Math.random() * 10000000000000).toString(); // 0-1000 DOT
      
      edges.push({
        id: `edge-target-acc-${idx}`,
        source: Math.random() > 0.5 ? centerAddress : acc.address,
        target: Math.random() > 0.5 ? acc.address : centerAddress,
        amount: volume,
        count: transferCount,
        volume: volume,
        timestamp: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
        type: "transfer"
      });
    } else if (idx < 10) {
      // Connections to exchanges
      const exchangeIdx = Math.floor(Math.random() * exchanges.length);
      const transferCount = Math.floor(Math.random() * 5) + 1;
      const volume = Math.floor(Math.random() * 20000000000000).toString(); // 0-2000 DOT
      
      edges.push({
        id: `edge-ex-acc-${idx}`,
        source: exchanges[exchangeIdx].address,
        target: acc.address,
        amount: volume,
        count: transferCount,
        volume: volume,
        timestamp: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
        type: "transfer"
      });
    }
    
    // Some inter-account transfers
    if (idx > 0 && Math.random() > 0.7) {
      const targetIdx = Math.floor(Math.random() * idx);
      const transferCount = Math.floor(Math.random() * 2) + 1;
      const volume = Math.floor(Math.random() * 5000000000000).toString(); // 0-500 DOT
      
      edges.push({
        id: `edge-acc-acc-${idx}`,
        source: acc.address,
        target: regularAccounts[targetIdx].address,
        amount: volume,
        count: transferCount,
        volume: volume,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        type: "transfer"
      });
    }
  });
  
  // Calculate total volume
  const totalVolume = edges.reduce((sum, edge) => {
    return sum + BigInt(edge.volume);
  }, BigInt(0));
  
  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxDepth: 1,
      totalVolume: totalVolume.toString(),
      timestamp: new Date().toISOString()
    }
  };
}

// Cache for graph data
const graphCache = new Map();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/graph/:address', (req, res) => {
  console.log(`API: Graph requested for ${req.params.address}`);
  
  // Check if we have cached data
  let graphData = graphCache.get(req.params.address);
  
  if (!graphData) {
    // Generate new data
    graphData = generateRealisticData(req.params.address);
    graphCache.set(req.params.address, graphData);
  }
  
  // Apply filters from query params
  const depth = parseInt(req.query.depth) || 1;
  const minVolume = BigInt(req.query.minVolume || 0);
  
  // Filter edges by volume
  const filteredEdges = graphData.edges.filter(edge => {
    return BigInt(edge.volume) >= minVolume;
  });
  
  // Get connected nodes
  const connectedNodeIds = new Set([req.params.address]);
  filteredEdges.forEach(edge => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });
  
  // Filter nodes
  const filteredNodes = graphData.nodes.filter(node => 
    connectedNodeIds.has(node.id)
  );
  
  res.json({
    nodes: filteredNodes,
    edges: filteredEdges,
    metadata: {
      ...graphData.metadata,
      filteredNodes: filteredNodes.length,
      filteredEdges: filteredEdges.length
    }
  });
});

app.get('/api/accounts/:address', (req, res) => {
  console.log(`API: Account requested for ${req.params.address}`);
  
  // Find account in cached data or generate mock
  const graphData = graphCache.get("13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk") || generateRealisticData("13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk");
  const node = graphData.nodes.find(n => n.address === req.params.address);
  
  if (node) {
    res.json({
      address: node.address,
      balance: node.balance,
      identity: node.identity,
      nodeType: node.nodeType,
      transactions: []
    });
  } else {
    res.json({
      address: req.params.address,
      balance: Math.floor(Math.random() * 100000000000000).toString(),
      identity: null,
      nodeType: "regular",
      transactions: []
    });
  }
});

app.get('/api/investigations', (req, res) => {
  console.log('API: Investigations requested');
  res.json([]);
});

app.get('/api/relationships/:address', (req, res) => {
  console.log(`API: Relationships requested for ${req.params.address}`);
  
  const graphData = graphCache.get(req.params.address) || generateRealisticData(req.params.address);
  const relationships = graphData.edges.filter(edge => 
    edge.source === req.params.address || edge.target === req.params.address
  );
  
  res.json({
    relationships,
    total: relationships.length
  });
});

app.get('/api/stats/:address', (req, res) => {
  console.log(`API: Stats requested for ${req.params.address}`);
  
  const graphData = graphCache.get(req.params.address) || generateRealisticData(req.params.address);
  
  res.json({
    nodeCount: graphData.nodes.length,
    edgeCount: graphData.edges.length,
    totalVolume: graphData.metadata.totalVolume
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Realistic mock server running at http://0.0.0.0:${PORT}`);
  console.log(`Graph now shows:`);
  console.log(`- Target address with balance`);
  console.log(`- Multiple exchanges, validators, and regular accounts`);
  console.log(`- Transfer amounts on edges`);
  console.log(`- Realistic DOT amounts`);
});