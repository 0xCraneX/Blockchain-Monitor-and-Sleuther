# API Specification

## Overview

This document specifies the RESTful API for the Polkadot Analysis Tool, providing endpoints for address search, graph data retrieval, pattern detection, and more. The API is designed to be simple, efficient, and optimized for JavaScript clients.

## Base Configuration

### Base URL
```
Development: http://localhost:3000/api
Production: https://api.yourdomain.com/api
```

### Headers
```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token> (if authentication enabled)
```

### Rate Limiting
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640995200
```

## Core Endpoints

### 1. Address Search
Search for addresses by partial match, identity, or full address.

#### Endpoint
```http
GET /api/search
```

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | Yes | Search query (min 3 chars) |
| limit | integer | No | Max results (default: 50, max: 100) |
| offset | integer | No | Pagination offset (default: 0) |
| type | string | No | Filter by type: 'address', 'identity', 'all' (default: 'all') |

#### Response
```json
{
  "results": [
    {
      "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "display_name": "Alice",
      "legal_name": "Alice Smith",
      "verified": true,
      "balance": "1000000000000",
      "type": "identity"
    },
    {
      "address": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      "display_name": null,
      "legal_name": null,
      "verified": false,
      "balance": "500000000000",
      "type": "address"
    }
  ],
  "total": 2,
  "has_more": false
}
```

### 2. Address Graph
Get the network graph for a specific address.

#### Endpoint
```http
GET /api/address/{address}/graph
```

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| address | string | Yes | The address to analyze (URL param) |
| depth | integer | No | Graph expansion depth (default: 2, max: 5) |
| limit | integer | No | Max nodes per level (default: 50, max: 200) |
| min_volume | string | No | Minimum transfer volume (BigInt as string) |
| time_range | string | No | Time filter: 'all', 'year', 'month', 'week' |
| include_patterns | boolean | No | Include pattern detection (default: false) |

#### Response
```json
{
  "accounts": [
    {
      "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "display_name": "Alice",
      "balance": "1000000000000",
      "risk_score": 15,
      "first_seen": 1609459200,
      "last_seen": 1640995200,
      "total_sent": "5000000000000",
      "total_received": "6000000000000",
      "unique_connections": 25
    }
  ],
  "connections": [
    {
      "from": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "to": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      "volume": "1500000000000",
      "count": 10,
      "first_transfer": 1609459200,
      "last_transfer": 1640995200,
      "average_amount": "150000000000"
    }
  ],
  "metadata": {
    "center_address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "total_nodes": 15,
    "total_edges": 22,
    "max_depth_reached": 2,
    "filters_applied": {
      "min_volume": "100000000000",
      "time_range": "year"
    }
  }
}
```

### 3. Transfer History
Get transfer history between addresses.

#### Endpoint
```http
GET /api/transfers
```

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| from | string | No | Source address |
| to | string | No | Destination address |
| address | string | No | Any address (from or to) |
| asset_id | string | No | Filter by asset (default: all) |
| start_time | integer | No | Unix timestamp start |
| end_time | integer | No | Unix timestamp end |
| limit | integer | No | Results per page (default: 100) |
| cursor | string | No | Pagination cursor |

#### Response
```json
{
  "transfers": [
    {
      "id": "12345",
      "from": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "to": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      "amount": "100000000000",
      "asset_id": "DOT",
      "fee": "1000000",
      "block_number": 1234567,
      "timestamp": 1640995200,
      "hash": "0x1234567890abcdef..."
    }
  ],
  "next_cursor": "eyJpZCI6MTIzNDZ9",
  "has_more": true,
  "total_volume": "1000000000000",
  "transfer_count": 42
}
```

### 4. Pattern Detection
Detect suspicious patterns for an address.

#### Endpoint
```http
GET /api/address/{address}/patterns
```

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| address | string | Yes | The address to analyze |
| pattern_types | array | No | Specific patterns to check |
| time_window | integer | No | Analysis window in seconds |
| include_details | boolean | No | Include detailed findings |

#### Response
```json
{
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "risk_score": 75,
  "patterns": [
    {
      "type": "RAPID_MOVEMENT",
      "severity": 80,
      "confidence": 0.95,
      "description": "Rapid fund movement detected",
      "details": {
        "transaction_count": 50,
        "time_window": 3600,
        "volume_moved": "10000000000000",
        "unique_addresses": 15
      }
    },
    {
      "type": "CIRCULAR_FLOW",
      "severity": 60,
      "confidence": 0.8,
      "description": "Circular transaction pattern detected",
      "details": {
        "cycle_length": 4,
        "addresses_involved": ["0x123...", "0x456...", "0x789...", "0xabc..."],
        "total_volume": "5000000000000"
      }
    }
  ],
  "recommendations": [
    "Monitor for continued rapid movements",
    "Investigate circular flow participants"
  ],
  "analyzed_at": 1640995200
}
```

### 5. Account Details
Get detailed information about a specific account.

#### Endpoint
```http
GET /api/account/{address}
```

#### Response
```json
{
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "identity": {
    "display_name": "Alice",
    "legal_name": "Alice Smith",
    "email": "alice@example.com",
    "web": "https://alice.example.com",
    "twitter": "@alice",
    "verified": true,
    "verification_date": 1609459200
  },
  "balance": {
    "free": "1000000000000",
    "reserved": "100000000000",
    "total": "1100000000000"
  },
  "statistics": {
    "first_seen": 1609459200,
    "last_seen": 1640995200,
    "total_sent": "50000000000000",
    "total_received": "51000000000000",
    "transaction_count": 1250,
    "unique_senders": 150,
    "unique_receivers": 200,
    "average_transaction": "40000000000"
  },
  "risk_indicators": {
    "score": 25,
    "flags": ["HIGH_VOLUME", "MANY_CONNECTIONS"],
    "last_evaluated": 1640995200
  },
  "tags": ["exchange", "verified", "high_volume"]
}
```

### 6. Batch Operations
Process multiple requests in a single call.

#### Endpoint
```http
POST /api/batch
```

#### Request Body
```json
{
  "operations": [
    {
      "id": "op1",
      "method": "GET",
      "path": "/account/5Grw.../graph",
      "params": { "depth": 1 }
    },
    {
      "id": "op2",
      "method": "GET",
      "path": "/account/5FHn.../patterns"
    }
  ]
}
```

#### Response
```json
{
  "results": [
    {
      "id": "op1",
      "status": 200,
      "data": { /* graph data */ }
    },
    {
      "id": "op2",
      "status": 200,
      "data": { /* pattern data */ }
    }
  ]
}
```

### 7. Export Data
Export analysis results in various formats.

#### Endpoint
```http
POST /api/export
```

#### Request Body
```json
{
  "format": "csv",
  "data_type": "graph",
  "filters": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "depth": 2,
    "time_range": "month"
  },
  "include_metadata": true
}
```

#### Response
```json
{
  "export_id": "exp_123456",
  "status": "processing",
  "format": "csv",
  "estimated_size": 1048576,
  "download_url": "/api/export/exp_123456/download",
  "expires_at": 1641081600
}
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

### Subscribe to Address Updates
```json
{
  "type": "subscribe",
  "channel": "address",
  "params": {
    "addresses": ["5Grw...", "5FHn..."]
  }
}
```

### Real-time Events
```json
{
  "type": "transfer",
  "data": {
    "from": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "to": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    "amount": "100000000000",
    "timestamp": 1640995200
  }
}
```

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "The provided address is not a valid SS58 address",
    "details": {
      "address": "invalid_address_here",
      "expected_format": "SS58"
    }
  },
  "request_id": "req_123456"
}
```

### Common Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_ADDRESS | 400 | Invalid blockchain address format |
| ADDRESS_NOT_FOUND | 404 | Address not found in database |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INVALID_PARAMETERS | 400 | Invalid query parameters |
| INTERNAL_ERROR | 500 | Server error |
| TIMEOUT | 504 | Request timeout |

## Authentication

### API Key Authentication
```http
GET /api/account/5Grw...
Authorization: Bearer your-api-key-here
```

### JWT Authentication
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "secure_password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "refresh_token": "refresh_token_here"
}
```

## SDK Examples

### JavaScript/TypeScript
```javascript
import { PolkadotAnalysisClient } from '@polkadot-analysis/sdk';

const client = new PolkadotAnalysisClient({
  baseUrl: 'https://api.yourdomain.com',
  apiKey: 'your-api-key'
});

// Search addresses
const results = await client.search('alice');

// Get address graph
const graph = await client.getAddressGraph('5Grw...', {
  depth: 3,
  minVolume: '1000000000000'
});

// Detect patterns
const patterns = await client.detectPatterns('5Grw...');

// Subscribe to real-time updates
client.subscribe('address', ['5Grw...'], (event) => {
  console.log('New transfer:', event);
});
```

### Python
```python
from polkadot_analysis import Client

client = Client(
    base_url='https://api.yourdomain.com',
    api_key='your-api-key'
)

# Search addresses
results = client.search('alice')

# Get address graph
graph = client.get_address_graph('5Grw...', depth=3)

# Detect patterns
patterns = client.detect_patterns('5Grw...')
```

## Performance Considerations

1. **Pagination**: Always use cursor-based pagination for large datasets
2. **Caching**: Responses include cache headers; respect them
3. **Compression**: All responses are gzip compressed
4. **Field Selection**: Use `fields` parameter to request only needed data
5. **Batch Requests**: Use batch endpoint for multiple operations

## Versioning

The API uses URL versioning:
- Current version: `/api/v1`
- Legacy support: Minimum 6 months notice before deprecation
- Version header: `X-API-Version: 1.0`

## Change Log

### Version 1.0 (Current)
- Initial release
- Core endpoints for address analysis
- Pattern detection
- WebSocket support
- Batch operations