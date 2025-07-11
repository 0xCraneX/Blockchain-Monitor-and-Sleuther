# Graph API Specification

## Overview

This document specifies the complete API design for graph endpoints in the Polkadot Analysis Tool, ensuring full compatibility with D3.js visualization while providing advanced features beyond FollowTheDot.

## Base URL

```
https://api.polkadot-analysis.local/api/graph
```

## Authentication

```http
Authorization: Bearer <token>
X-API-Key: <api-key>
```

## Endpoints

### 1. Get Address Graph

Retrieves the graph data centered around a specific address.

#### Request

```http
GET /api/graph/:address
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | required | The center address (path parameter) |
| `depth` | integer | 1 | Graph traversal depth (1-5) |
| `maxNodes` | integer | 100 | Maximum nodes to return (1-1000) |
| `minVolume` | string | "0" | Minimum transfer volume filter |
| `minBalance` | string | "0" | Minimum account balance filter |
| `direction` | string | "both" | Transfer direction: `incoming`, `outgoing`, `both` |
| `layout` | string | "force" | Layout hint: `force`, `hierarchical`, `circular` |
| `includeRiskScores` | boolean | false | Include risk analysis data |
| `riskThreshold` | integer | null | Filter nodes above risk score (0-100) |
| `nodeTypes` | array | all | Filter by node types: `regular`, `exchange`, `validator`, `pool`, `parachain` |
| `startTime` | integer | null | Unix timestamp for time range start |
| `endTime` | integer | null | Unix timestamp for time range end |
| `enableClustering` | boolean | false | Enable community detection |
| `clusteringAlgorithm` | string | "louvain" | Algorithm: `louvain`, `label-propagation`, `connected-components` |

#### Response

```typescript
{
  "nodes": [
    {
      // Core properties
      "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
      
      // Identity data
      "identity": {
        "display": "Alice Validator",
        "email": "alice@example.com",
        "legal": "Alice Smith",
        "riot": "@alice:matrix.org",
        "twitter": "@alice_validator",
        "web": "https://alice.validator",
        "isConfirmed": true,
        "isInvalid": false
      },
      
      // Sub-identity (if applicable)
      "subIdentity": {
        "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
        "superAccountId": "13UVJyLnbVp9x3XkJDPHKn5kLQKNpQvvPc5k4j1tDBSPS5kE",
        "subDisplay": "Alice - Operations"
      },
      
      // Balance information
      "balance": {
        "free": "1000000000000000",
        "reserved": "500000000000",
        "frozen": "100000000000"
      },
      
      // Subscan enrichment
      "subscanAccount": {
        "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
        "display": "Alice Validator",
        "accountDisplay": {
          "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
          "display": "Alice Validator",
          "identity": true,
          "merkle": {
            "addressType": "validator",
            "tagType": "infrastructure",
            "tagSubtype": "validator",
            "tagName": "Top 100 Validator"
          }
        }
      },
      
      // Enhanced properties
      "nodeType": "validator",
      
      // Risk and importance scores
      "riskScore": 15,
      "riskFactors": ["high_volume", "new_connections"],
      "importanceScore": 85,
      
      // Graph metrics
      "degree": 45,
      "inDegree": 20,
      "outDegree": 25,
      "totalVolume": "50000000000000000",
      
      // Visual hints
      "suggestedSize": 120,
      "suggestedColor": "#4CAF50",
      
      // Temporal data
      "firstSeen": 1609459200,
      "lastActive": 1701388800,
      
      // Clustering
      "clusterId": "cluster_validators_1",
      "clusterRole": "center"
    }
  ],
  
  "edges": [
    {
      "id": 1,
      "source": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
      "target": "13UVJyLnbVp9x3XkJDPHKn5kLQKNpQvvPc5k4j1tDBSPS5kE",
      "count": 25,
      "volume": "10000000000000000",
      
      // Edge type
      "edgeType": "transfer",
      
      // Temporal data
      "firstTransfer": 1609459200,
      "lastTransfer": 1701388800,
      
      // Risk indicators
      "suspiciousPattern": false,
      "patternType": null,
      
      // Visual hints
      "suggestedWidth": 8,
      "suggestedColor": "#2196F3",
      "suggestedOpacity": 0.8,
      "animated": false,
      
      // Direction hints
      "bidirectional": true,
      "dominantDirection": "forward"
    }
  ],
  
  "metadata": {
    // Network statistics
    "totalNodes": 100,
    "totalEdges": 156,
    "networkDensity": 0.031,
    "averageClusteringCoefficient": 0.42,
    
    // Query metadata
    "centerNode": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
    "requestedDepth": 2,
    "actualDepth": 2,
    
    // Pagination info
    "hasMore": true,
    "nextCursor": "eyJkZXB0aCI6MiwibGFzdE5vZGUiOiIxM1VWSnlMbmJWcDl4M1hrSkRQSEtuNWtMUUtOcFF2dlBjNWs0ajF0REJTUVM1a0UifQ==",
    "nodesOmitted": 45,
    "edgesOmitted": 89,
    
    // Performance hints
    "renderingComplexity": "medium",
    "suggestedLayout": "force",
    
    // Risk summary
    "highRiskNodeCount": 3,
    "suspiciousEdgeCount": 1,
    
    // Time range
    "earliestTransfer": 1609459200,
    "latestTransfer": 1701388800
  },
  
  "layout": {
    // Force-directed parameters
    "forceParameters": {
      "chargeStrength": -5000,
      "linkDistance": 400,
      "linkStrength": 0.8,
      "centerX": 500,
      "centerY": 500
    },
    
    // Fixed positions for important nodes
    "fixedPositions": {
      "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW": {
        "x": 500,
        "y": 500,
        "fixed": true
      }
    }
  },
  
  "clusters": [
    {
      "clusterId": "cluster_validators_1",
      "nodes": [
        "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
        "13UVJyLnbVp9x3XkJDPHKn5kLQKNpQvvPc5k4j1tDBSPS5kE"
      ],
      "internalEdges": 5,
      "externalEdges": 12,
      "density": 0.8,
      "totalVolume": "25000000000000000",
      "clusterType": "validator_set",
      "riskLevel": "low",
      "suggestedColor": "#E8F5E9",
      "boundingBox": {
        "minX": 400,
        "minY": 400,
        "maxX": 600,
        "maxY": 600
      }
    }
  ]
}
```

### 2. Find Shortest Path

Finds the shortest path between two addresses.

#### Request

```http
GET /api/graph/path?from=:fromAddress&to=:toAddress
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `from` | string | required | Starting address |
| `to` | string | required | Target address |
| `maxDepth` | integer | 4 | Maximum path length |
| `algorithm` | string | "dijkstra" | Algorithm: `dijkstra`, `bfs`, `weighted` |
| `includeAlternatives` | boolean | false | Return multiple paths |

#### Response

```json
{
  "paths": [
    {
      "path": [
        "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
        "13UVJyLnbVp9x3XkJDPHKn5kLQKNpQvvPc5k4j1tDBSPS5kE",
        "15cfSaBcTxNr6kJyCVpZbnUJQyb7zLjMKv4vM6j5X3VNHKHG"
      ],
      "length": 2,
      "totalVolume": "5000000000000000",
      "bottleneckVolume": "2000000000000000",
      "pathScore": 85.5
    }
  ],
  "metadata": {
    "searchTime": 145,
    "nodesExplored": 234,
    "pathsFound": 1
  }
}
```

### 3. Get Node Metrics

Retrieves detailed metrics for a specific node.

#### Request

```http
GET /api/graph/metrics/:address
```

#### Response

```json
{
  "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
  "metrics": {
    "degree": 45,
    "inDegree": 20,
    "outDegree": 25,
    "weightedDegree": 1250000000000000,
    "clusteringCoefficient": 0.34,
    "betweennessCentrality": 0.0234,
    "closenessCentrality": 0.0156,
    "eigenvectorCentrality": 0.0891,
    "pageRank": 0.00234
  },
  "rankings": {
    "degreeRank": 12,
    "volumeRank": 8,
    "betweennessRank": 34,
    "pageRankRank": 15
  },
  "comparisons": {
    "percentile": 95,
    "category": "hub",
    "influence": "high"
  }
}
```

### 4. Detect Patterns

Analyzes an address for suspicious patterns.

#### Request

```http
GET /api/graph/patterns/:address
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | integer | 2 | Analysis depth |
| `timeWindow` | integer | 86400 | Time window in seconds |
| `sensitivity` | string | "medium" | Detection sensitivity: `low`, `medium`, `high` |

#### Response

```json
{
  "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
  "patterns": [
    {
      "type": "rapid_sequential",
      "confidence": 0.85,
      "severity": "medium",
      "description": "Rapid sequential transfers detected",
      "evidence": {
        "transferCount": 5,
        "timeSpan": 300,
        "totalVolume": "5000000000000000",
        "addresses": ["13UV...", "15cf..."]
      },
      "timestamp": 1701388800
    },
    {
      "type": "circular_flow",
      "confidence": 0.92,
      "severity": "high",
      "description": "Funds returned to origin through 3 hops",
      "evidence": {
        "path": ["14rY...", "13UV...", "15cf...", "14rY..."],
        "volume": "2000000000000000",
        "timeElapsed": 3600
      },
      "timestamp": 1701385200
    }
  ],
  "riskAssessment": {
    "overallRisk": 72,
    "riskFactors": [
      "rapid_transfers",
      "circular_flows",
      "new_account_interactions"
    ],
    "recommendation": "flag_for_review"
  }
}
```

### 5. Progressive Graph Expansion

Expands an existing graph from a cursor position.

#### Request

```http
GET /api/graph/expand
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | required | Continuation cursor |
| `limit` | integer | 20 | Nodes to add |
| `direction` | string | "outward" | Expansion direction |

#### Response

```json
{
  "nodes": [...],  // New nodes to add
  "edges": [...],  // New edges to add
  "removals": {
    "nodes": [],   // Nodes to remove (if any)
    "edges": []    // Edges to remove (if any)
  },
  "metadata": {
    "addedNodes": 20,
    "addedEdges": 35,
    "hasMore": true,
    "nextCursor": "eyJkZXB0aCI6MywibGFzdE5vZGUiOiIxNGNmU2FCY1R4TnI2a0p5Q1ZwWmJuVUpReWI3ekxqTUtWNHZNNmo1WDNWTkhLSEcifQ=="
  }
}
```

### 6. Export Graph Data

Exports graph data in various formats.

#### Request

```http
POST /api/graph/export
```

#### Body

```json
{
  "nodes": ["14rY...", "13UV..."],
  "format": "gexf",
  "includeMetadata": true,
  "filters": {
    "minVolume": "1000000000000",
    "nodeTypes": ["validator", "exchange"]
  }
}
```

#### Response

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">
  <graph mode="static" defaultedgetype="directed">
    <nodes>
      <node id="14rY..." label="Alice Validator">
        <attvalues>
          <attvalue for="0" value="validator"/>
          <attvalue for="1" value="1000000000000000"/>
        </attvalues>
      </node>
    </nodes>
    <edges>
      <edge id="1" source="14rY..." target="13UV..." weight="10000000000000000"/>
    </edges>
  </graph>
</gexf>
```

### 7. WebSocket Real-time Updates

Subscribes to real-time graph updates.

#### Connection

```javascript
const ws = new WebSocket('wss://api.polkadot-analysis.local/ws');

// Subscribe to address
ws.send(JSON.stringify({
  action: 'subscribe',
  address: '14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW',
  depth: 2
}));
```

#### Messages

```json
// New node added
{
  "type": "node_added",
  "data": {
    "address": "15cfSaBcTxNr6kJyCVpZbnUJQyb7zLjMKv4vM6j5X3VNHKHG",
    "nodeType": "regular",
    "connection": {
      "from": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
      "volume": "1000000000000"
    }
  },
  "timestamp": 1701388800
}

// Edge updated
{
  "type": "edge_updated",
  "data": {
    "id": 1,
    "source": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
    "target": "13UVJyLnbVp9x3XkJDPHKn5kLQKNpQvvPc5k4j1tDBSPS5kE",
    "oldVolume": "10000000000000000",
    "newVolume": "11000000000000000",
    "count": 26
  },
  "timestamp": 1701388900
}

// Risk alert
{
  "type": "risk_alert",
  "data": {
    "address": "14rYAtXA1aBcYW9TCoYDCFnQXJDPHKn5kLQKNpQvvPcKPEXW",
    "pattern": "rapid_sequential",
    "severity": "high",
    "details": {...}
  },
  "timestamp": 1701389000
}
```

## Error Responses

### Standard Error Format

```json
{
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "The provided address is not a valid Substrate address",
    "status": 400,
    "details": {
      "address": "invalid-address-here",
      "expected": "SS58 encoded address"
    }
  }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_ADDRESS` | 400 | Invalid Substrate address format |
| `ADDRESS_NOT_FOUND` | 404 | Address not found in database |
| `DEPTH_LIMIT_EXCEEDED` | 400 | Requested depth exceeds maximum |
| `QUERY_TIMEOUT` | 504 | Query took too long to complete |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INSUFFICIENT_PERMISSIONS` | 403 | Not authorized for this operation |
| `INTERNAL_ERROR` | 500 | Server error |

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Graph generation | 20 req | 1 minute |
| Path finding | 10 req | 1 minute |
| Pattern detection | 5 req | 1 minute |
| Export | 5 req | 5 minutes |
| WebSocket | 100 msg | 1 minute |

## Performance Guarantees

| Operation | Target | Maximum |
|-----------|--------|---------|
| 1-hop graph | 100ms | 500ms |
| 2-hop graph | 500ms | 2s |
| 3-hop graph | 1s | 5s |
| Path finding | 200ms | 3s |
| Pattern detection | 500ms | 5s |

## SDK Examples

### JavaScript/TypeScript

```typescript
import { PolkadotGraphClient } from '@polkadot-analysis/sdk';

const client = new PolkadotGraphClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.polkadot-analysis.local'
});

// Get graph
const graph = await client.getGraph('14rY...', {
  depth: 2,
  maxNodes: 200,
  includeRiskScores: true
});

// Find path
const paths = await client.findPath('14rY...', '13UV...', {
  maxDepth: 4,
  includeAlternatives: true
});

// Subscribe to updates
const subscription = client.subscribe('14rY...', (update) => {
  console.log('Graph update:', update);
});
```

### Python

```python
from polkadot_analysis import GraphClient

client = GraphClient(
    api_key='your-api-key',
    base_url='https://api.polkadot-analysis.local'
)

# Get graph
graph = client.get_graph('14rY...', depth=2, max_nodes=200)

# Detect patterns
patterns = client.detect_patterns('14rY...', sensitivity='high')

# Export graph
gexf_data = client.export_graph(
    nodes=['14rY...', '13UV...'],
    format='gexf'
)
```

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial release |
| 1.1.0 | 2024-02-01 | Added clustering support |
| 1.2.0 | 2024-02-15 | Added pattern detection |
| 1.3.0 | 2024-03-01 | Added WebSocket support |

This API specification provides a complete interface for graph analysis functionality, ensuring compatibility with D3.js visualization while offering advanced features for comprehensive blockchain analysis.