# GraphWebSocket Message Format Verification

This document verifies that the GraphWebSocket service message formats comply with the API specifications.

## Node Message Formats

### Node Updates
```json
{
  "type": "node_updated",
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "changes": {
    "balance": "1000000000000",
    "riskScore": 0.3,
    "nodeType": "suspicious"
  },
  "timestamp": 1641024000000
}
```

### Node Addition
```json
{
  "type": "node_added",
  "node": {
    "id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "identity": "Test Node",
    "balance": "2000000000000",
    "nodeType": "regular"
  },
  "timestamp": 1641024000000
}
```

### Node Removal
```json
{
  "type": "node_removed",
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "timestamp": 1641024000000
}
```

## Edge Message Formats

### Edge Updates
```json
{
  "type": "edge_updated",
  "edge": {
    "id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY->5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9",
    "source": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "target": "5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9"
  },
  "changes": {
    "volume": "5000000000000",
    "transferCount": 15
  },
  "timestamp": 1641024000000
}
```

### Edge Addition
```json
{
  "type": "edge_added",
  "edge": {
    "id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY->5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9",
    "source": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "target": "5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9",
    "volume": "1000000000000",
    "transferCount": 5
  },
  "timestamp": 1641024000000
}
```

### Edge Removal
```json
{
  "type": "edge_removed",
  "edge": {
    "id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY->5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9",
    "source": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "target": "5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9"
  },
  "timestamp": 1641024000000
}
```

## Pattern Alert Formats

### Pattern Detection
```json
{
  "type": "pattern_detected",
  "pattern": {
    "id": "pattern_123",
    "type": "money_laundering",
    "confidence": 0.85,
    "addresses": [
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "5FeyRQmjtdHoPH56ASFW76AJEP1yaQC1K9aEMvJTF9nzt9S9"
    ],
    "description": "Suspicious circular transaction pattern detected",
    "riskLevel": "high"
  },
  "timestamp": 1641024000000
}
```

### Risk Alert
```json
{
  "type": "risk_alert",
  "alert": {
    "id": "risk_789",
    "severity": "high",
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "riskType": "suspicious_volume",
    "description": "Abnormally high transaction volume detected",
    "score": 0.95
  },
  "timestamp": 1641024000000
}
```

## Streaming Messages

### Stream Start
```json
{
  "sessionId": "stream_1641024000000_abc123",
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "depth": 2,
  "timestamp": 1641024000000
}
```

### Stream Progress
```json
{
  "sessionId": "stream_1641024000000_abc123",
  "progress": {
    "currentDepth": 1,
    "totalDepth": 2,
    "phase": "Building depth 1",
    "percentage": 50
  },
  "timestamp": 1641024000000
}
```

### Stream Data
```json
{
  "sessionId": "stream_1641024000000_abc123",
  "batch": {
    "nodes": [
      {
        "id": "node_1_1",
        "address": "addr_1_1",
        "hopLevel": 1,
        "nodeType": "discovered"
      }
    ],
    "edges": [
      {
        "id": "edge_1_1",
        "source": "addr_0_1",
        "target": "addr_1_1",
        "volume": "1000000"
      }
    ],
    "depth": 1
  },
  "timestamp": 1641024000000
}
```

### Stream Completion
```json
{
  "sessionId": "stream_1641024000000_abc123",
  "summary": {
    "totalNodes": 2,
    "totalEdges": 1,
    "executionTime": 1500
  },
  "timestamp": 1641024000000
}
```

## Subscription Messages

### Subscription Confirmation
```json
{
  "type": "address",
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "filters": {},
  "room": "address:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "timestamp": 1641024000000
}
```

### Analytics Update
```json
{
  "type": "analytics_update",
  "analytics": {
    "totalNodes": 15000,
    "totalEdges": 45000,
    "avgDegree": 3.2,
    "networkDensity": 0.0002,
    "topRiskAddresses": ["5GrwvaEF...", "5FeyRQmj..."],
    "recentPatterns": 5
  },
  "timestamp": 1641024000000
}
```

## Compliance Verification

✅ **Node Messages**: All node message types (node_added, node_updated, node_removed) are implemented according to the specification.

✅ **Edge Messages**: All edge message types (edge_added, edge_updated, edge_removed) are implemented according to the specification.

✅ **Pattern Alerts**: Pattern detection and risk alert messages match the expected formats.

✅ **Room-based Broadcasting**: Efficient room management prevents unnecessary broadcasts to unsubscribed clients.

✅ **Error Handling**: Proper error messages are sent for invalid requests or system issues.

✅ **Timestamp Consistency**: All messages include timestamps for proper chronological ordering.

✅ **Address Validation**: Polkadot address format validation is consistent with API routes.

The GraphWebSocket service fully complies with the API message format specifications and provides efficient real-time graph update broadcasting.