const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Mock data
const mockGraphData = {
  nodes: [
    {
      id: "13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk",
      address: "13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk",
      balance: "1000000000000",
      nodeType: "target",
      label: "Target Address",
      group: 1
    },
    {
      id: "12bNCQ5RbDiUpG7PYhfXhDabsV2BKYDCGJgV2P1Wh5XTY7Q",
      address: "12bNCQ5RbDiUpG7PYhfXhDabsV2BKYDCGJgV2P1Wh5XTY7Q",
      balance: "500000000000",
      nodeType: "exchange",
      label: "Exchange Address",
      group: 2
    },
    {
      id: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5",
      address: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5",
      balance: "250000000000",
      nodeType: "validator",
      label: "Validator",
      group: 3
    }
  ],
  edges: [
    {
      id: "1",
      source: "13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk",
      target: "12bNCQ5RbDiUpG7PYhfXhDabsV2BKYDCGJgV2P1Wh5XTY7Q",
      amount: "100000000000",
      timestamp: "2025-07-12T10:00:00Z",
      type: "transfer"
    },
    {
      id: "2", 
      source: "13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk",
      target: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5",
      amount: "50000000000",
      timestamp: "2025-07-12T09:30:00Z",
      type: "transfer"
    }
  ],
  metadata: {
    totalNodes: 3,
    totalEdges: 2,
    maxDepth: 1,
    totalVolume: "150000000000"
  }
};

const mockAccountData = {
  address: "13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk",
  balance: "1000000000000",
  identity: {
    display: "Target Account",
    judgements: []
  },
  transactions: [],
  nodeType: "target"
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/graph/:address', (req, res) => {
  console.log(`API: Graph requested for ${req.params.address}`);
  res.json(mockGraphData);
});

app.get('/api/accounts/:address', (req, res) => {
  console.log(`API: Account requested for ${req.params.address}`);
  res.json(mockAccountData);
});

app.get('/api/investigations', (req, res) => {
  console.log('API: Investigations requested');
  res.json([]);
});

app.get('/api/relationships/:address', (req, res) => {
  console.log(`API: Relationships requested for ${req.params.address}`);
  res.json({
    relationships: mockGraphData.edges,
    total: mockGraphData.edges.length
  });
});

app.get('/api/stats/:address', (req, res) => {
  console.log(`API: Stats requested for ${req.params.address}`);
  res.json({
    nodeCount: mockGraphData.nodes.length,
    edgeCount: mockGraphData.edges.length,
    totalVolume: mockGraphData.metadata.totalVolume
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock server with APIs running at http://0.0.0.0:${PORT}`);
});