# Polkadot Analysis Tool - JavaScript API Specification

## Overview

This document outlines the JavaScript API design for the Polkadot Analysis Tool, optimized based on the analysis of the followthedot-main codebase. The API provides both RESTful and GraphQL endpoints, with WebSocket support for real-time updates.

## Table of Contents

1. [API Architecture](#api-architecture)
2. [Authentication & Security](#authentication--security)
3. [REST API Endpoints](#rest-api-endpoints)
4. [GraphQL Schema](#graphql-schema)
5. [WebSocket API](#websocket-api)
6. [Data Formats](#data-formats)
7. [Error Handling](#error-handling)
8. [Performance & Caching](#performance--caching)

## API Architecture

### Base Configuration

```javascript
{
  "apiVersion": "v1",
  "baseUrl": "https://api.polkadot-analysis.com",
  "endpoints": {
    "rest": "/api/v1",
    "graphql": "/graphql",
    "websocket": "wss://api.polkadot-analysis.com/ws"
  },
  "rateLimit": {
    "requests": 1000,
    "window": "1h"
  }
}
```

### Client SDK Structure

```javascript
class PolkadotAnalysisClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.polkadot-analysis.com';
    this.timeout = config.timeout || 30000;
    this.retryAttempts = config.retryAttempts || 3;
    this.cache = new CacheManager(config.cache);
  }
}
```

## Authentication & Security

### API Key Authentication

```javascript
// Request Header
{
  "X-API-Key": "your-api-key-here",
  "Content-Type": "application/json"
}
```

### JWT Authentication (Alternative)

```javascript
// Login Request
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "secure-password"
}

// Response
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "refreshToken": "refresh-token-here"
}

// Authenticated Request
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
}
```

### Rate Limiting

```javascript
// Response Headers
{
  "X-RateLimit-Limit": "1000",
  "X-RateLimit-Remaining": "999",
  "X-RateLimit-Reset": "1640995200"
}
```

## REST API Endpoints

### 1. Account Search

**Endpoint:** `GET /api/v1/accounts/search`

**Query Parameters:**
- `query` (required): Search query for account address, identity, or sub-identity
- `limit` (optional): Maximum results (default: 20, max: 100)
- `includeBalances` (optional): Include current balances (default: true)
- `includeIdentities` (optional): Include identity information (default: true)

**Example Request:**
```bash
GET /api/v1/accounts/search?query=alice&limit=10&includeBalances=true
```

**Response:**
```json
{
  "data": [
    {
      "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "identity": {
        "display": "Alice",
        "legal": "Alice Smith",
        "web": "https://alice.example.com",
        "email": "alice@example.com",
        "twitter": "@alice"
      },
      "subIdentity": null,
      "superIdentity": null,
      "balance": {
        "free": "1000000000000",
        "reserved": "0",
        "frozen": "0",
        "flags": "170141183460469231731687303715884105728"
      },
      "subscanAccount": {
        "accountDisplay": {
          "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
          "display": "Alice",
          "judgements": [
            {
              "registrarIndex": 0,
              "judgement": "Reasonable"
            }
          ]
        },
        "merkle": {
          "addressMerkle": "0x...",
          "evmAddress": null
        }
      }
    }
  ],
  "meta": {
    "total": 1,
    "limit": 10,
    "query": "alice"
  }
}
```

### 2. Account Graph Data

**Endpoint:** `GET /api/v1/accounts/{address}/graph`

**Path Parameters:**
- `address`: The account address

**Query Parameters:**
- `depth` (optional): Graph traversal depth (default: 1, max: 3)
- `minVolume` (optional): Minimum transfer volume to include (default: 0)
- `limit` (optional): Maximum number of connections (default: 50, max: 200)

**Example Request:**
```bash
GET /api/v1/accounts/5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY/graph?depth=2&limit=100
```

**Response:**
```json
{
  "data": {
    "nodes": [
      {
        "id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "identity": {
          "display": "Alice"
        },
        "balance": {
          "free": "1000000000000"
        },
        "type": "account"
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "target": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        "transferVolume": {
          "count": 15,
          "totalAmount": "5000000000000",
          "lastTransfer": "2024-01-15T10:30:00Z"
        }
      }
    ]
  },
  "meta": {
    "nodeCount": 25,
    "edgeCount": 47,
    "depth": 2
  }
}
```

### 3. Transfer List

**Endpoint:** `GET /api/v1/transfers`

**Query Parameters:**
- `from` (optional): Sender address
- `to` (optional): Recipient address
- `startBlock` (optional): Starting block number
- `endBlock` (optional): Ending block number
- `startDate` (optional): Start date (ISO 8601)
- `endDate` (optional): End date (ISO 8601)
- `minAmount` (optional): Minimum transfer amount
- `maxAmount` (optional): Maximum transfer amount
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20, max: 100)
- `sort` (optional): Sort field (block, timestamp, amount)
- `order` (optional): Sort order (asc, desc)

**Example Request:**
```bash
GET /api/v1/transfers?from=5GrwvaEF...&to=5FHneW46...&limit=20&page=1
```

**Response:**
```json
{
  "data": [
    {
      "blockHash": "0x1234567890abcdef...",
      "blockNumber": 1000000,
      "timestamp": "2024-01-15T10:30:00Z",
      "extrinsicIndex": 2,
      "extrinsicEventIndex": 0,
      "eventIndex": 5,
      "fromAddress": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "toAddress": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      "amount": "1000000000000",
      "fee": "125000000",
      "success": true
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### 4. Account Balance History

**Endpoint:** `GET /api/v1/accounts/{address}/balance-history`

**Query Parameters:**
- `startDate` (optional): Start date
- `endDate` (optional): End date
- `interval` (optional): Data point interval (hour, day, week, month)
- `limit` (optional): Maximum data points (default: 100)

**Response:**
```json
{
  "data": [
    {
      "timestamp": "2024-01-15T00:00:00Z",
      "balance": {
        "free": "1000000000000",
        "reserved": "0",
        "total": "1000000000000"
      },
      "blockNumber": 1000000
    }
  ],
  "meta": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "interval": "day",
    "dataPoints": 30
  }
}
```

### 5. Batch Account Lookup

**Endpoint:** `POST /api/v1/accounts/batch`

**Request Body:**
```json
{
  "addresses": [
    "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
  ],
  "includeBalances": true,
  "includeIdentities": true,
  "includeTransferStats": true
}
```

**Response:**
```json
{
  "data": {
    "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY": {
      "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "identity": { "display": "Alice" },
      "balance": { "free": "1000000000000" },
      "transferStats": {
        "totalSent": "5000000000000",
        "totalReceived": "3000000000000",
        "transactionCount": 150
      }
    }
  },
  "meta": {
    "requested": 2,
    "found": 2
  }
}
```

## GraphQL Schema

### Schema Definition

```graphql
type Query {
  # Account queries
  account(address: String!): Account
  accounts(query: String!, limit: Int = 20): AccountSearchResult
  accountGraph(address: String!, depth: Int = 1, limit: Int = 50): GraphData
  
  # Transfer queries
  transfers(filter: TransferFilter, pagination: PaginationInput): TransferList
  transferVolume(from: String!, to: String!): TransferVolume
  
  # Analytics queries
  topAccounts(by: TopAccountsBy!, limit: Int = 100): [AccountWithStats]
  networkStats: NetworkStats
}

type Subscription {
  # Real-time subscriptions
  accountUpdates(address: String!): Account
  newTransfers(filter: TransferFilter): Transfer
  balanceChanges(addresses: [String!]!): BalanceUpdate
}

# Types
type Account {
  address: String!
  identity: Identity
  subIdentity: SubIdentity
  superIdentity: Identity
  balance: Balance
  subscanAccount: SubscanAccount
  transferStats: TransferStats
}

type Identity {
  display: String
  legal: String
  web: String
  email: String
  twitter: String
  riot: String
  image: String
}

type Balance {
  free: BigInt!
  reserved: BigInt!
  frozen: BigInt!
  flags: BigInt!
  total: BigInt!
}

type Transfer {
  blockHash: String!
  blockNumber: Int!
  timestamp: DateTime!
  extrinsicIndex: Int!
  eventIndex: Int!
  fromAddress: String!
  toAddress: String!
  amount: BigInt!
  fee: BigInt
  success: Boolean!
}

type GraphData {
  nodes: [GraphNode!]!
  edges: [GraphEdge!]!
  meta: GraphMeta!
}

type GraphNode {
  id: String!
  address: String!
  identity: Identity
  balance: Balance
  type: NodeType!
  metrics: NodeMetrics
}

type GraphEdge {
  id: String!
  source: String!
  target: String!
  transferVolume: TransferVolume!
  type: EdgeType!
}

# Input types
input TransferFilter {
  from: String
  to: String
  startBlock: Int
  endBlock: Int
  startDate: DateTime
  endDate: DateTime
  minAmount: BigInt
  maxAmount: BigInt
}

input PaginationInput {
  page: Int = 1
  limit: Int = 20
  sort: String
  order: SortOrder = DESC
}

# Enums
enum TopAccountsBy {
  BALANCE
  TRANSFER_COUNT
  TRANSFER_VOLUME
}

enum NodeType {
  ACCOUNT
  VALIDATOR
  NOMINATOR
  CONTRACT
}

enum EdgeType {
  TRANSFER
  NOMINATION
  DELEGATION
}

enum SortOrder {
  ASC
  DESC
}

# Custom scalars
scalar BigInt
scalar DateTime
```

### GraphQL Query Examples

```graphql
# Search accounts
query SearchAccounts {
  accounts(query: "alice", limit: 10) {
    data {
      address
      identity {
        display
        email
      }
      balance {
        free
        total
      }
    }
    meta {
      total
      query
    }
  }
}

# Get account graph
query GetAccountGraph {
  accountGraph(
    address: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
    depth: 2
    limit: 100
  ) {
    nodes {
      id
      address
      identity {
        display
      }
      balance {
        total
      }
    }
    edges {
      source
      target
      transferVolume {
        count
        totalAmount
      }
    }
  }
}

# Subscribe to transfers
subscription WatchTransfers {
  newTransfers(filter: {
    from: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
    minAmount: "1000000000000"
  }) {
    blockNumber
    timestamp
    fromAddress
    toAddress
    amount
  }
}
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://api.polkadot-analysis.com/ws');

ws.on('open', () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    apiKey: 'your-api-key'
  }));
});
```

### Subscription Messages

```javascript
// Subscribe to account updates
{
  "type": "subscribe",
  "channel": "account:updates",
  "params": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
  }
}

// Subscribe to new transfers
{
  "type": "subscribe",
  "channel": "transfers:new",
  "params": {
    "filter": {
      "minAmount": "1000000000000"
    }
  }
}

// Subscribe to balance changes
{
  "type": "subscribe",
  "channel": "balances:changes",
  "params": {
    "addresses": [
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
    ]
  }
}
```

### Event Messages

```javascript
// Account update event
{
  "type": "event",
  "channel": "account:updates",
  "data": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "balance": {
      "free": "1000000000000",
      "reserved": "0"
    },
    "blockNumber": 1000000,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// New transfer event
{
  "type": "event",
  "channel": "transfers:new",
  "data": {
    "blockNumber": 1000000,
    "fromAddress": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "toAddress": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    "amount": "1000000000000"
  }
}
```

## Data Formats

### BigInt Serialization

All large integers (balances, amounts) are serialized as strings to prevent JavaScript precision loss:

```json
{
  "balance": {
    "free": "1000000000000",  // String representation
    "reserved": "0",
    "frozen": "0",
    "flags": "170141183460469231731687303715884105728"
  }
}
```

### Timestamp Format

All timestamps use ISO 8601 format:
```json
{
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Address Format

All addresses use SS58 encoding:
```json
{
  "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
}
```

### Compression

For large datasets, responses support gzip compression:

```javascript
// Request Header
{
  "Accept-Encoding": "gzip, deflate"
}

// Response Header
{
  "Content-Encoding": "gzip"
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
      "address": "invalid-address-here",
      "expected": "SS58 encoded address"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123456"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_ADDRESS` | 400 | Invalid SS58 address format |
| `ACCOUNT_NOT_FOUND` | 404 | Account not found |
| `INVALID_PARAMS` | 400 | Invalid query parameters |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Client Error Handling

```javascript
class PolkadotAPIError extends Error {
  constructor(response) {
    super(response.error.message);
    this.code = response.error.code;
    this.details = response.error.details;
    this.requestId = response.meta.requestId;
  }
}

// Usage
try {
  const account = await client.getAccount(address);
} catch (error) {
  if (error.code === 'ACCOUNT_NOT_FOUND') {
    console.log('Account not found');
  } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
    await delay(error.details.retryAfter);
    // Retry request
  }
}
```

## Performance & Caching

### Cache Headers

```javascript
// Response Headers
{
  "Cache-Control": "public, max-age=60",
  "ETag": "\"33a64df551425fcc55e4d42a148795d9f25f89d4\"",
  "Last-Modified": "Wed, 15 Jan 2024 10:30:00 GMT"
}

// Conditional Request
{
  "If-None-Match": "\"33a64df551425fcc55e4d42a148795d9f25f89d4\"",
  "If-Modified-Since": "Wed, 15 Jan 2024 10:30:00 GMT"
}
```

### Client-Side Caching

```javascript
class CacheManager {
  constructor(options = {}) {
    this.ttl = options.ttl || 60000; // 1 minute default
    this.maxSize = options.maxSize || 1000;
    this.cache = new Map();
  }

  async get(key, fetcher) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.set(key, data);
    return data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

### Batch Request Optimization

```javascript
// Batch multiple account lookups
const batchRequest = {
  accounts: [
    { address: "5GrwvaEF...", fields: ["balance", "identity"] },
    { address: "5FHneW46...", fields: ["balance", "transfers"] }
  ]
};

// Response includes all requested data in one call
const response = await client.batchGetAccounts(batchRequest);
```

### Response Streaming

For large datasets, the API supports streaming responses:

```javascript
// Stream transfers
const stream = await client.streamTransfers({
  from: "5GrwvaEF...",
  startDate: "2024-01-01"
});

stream.on('data', (transfer) => {
  console.log('New transfer:', transfer);
});

stream.on('end', () => {
  console.log('Stream complete');
});
```

## SDK Usage Examples

### Initialize Client

```javascript
import { PolkadotAnalysisClient } from '@polkadot/analysis-sdk';

const client = new PolkadotAnalysisClient({
  apiKey: process.env.POLKADOT_API_KEY,
  cache: {
    ttl: 300000, // 5 minutes
    maxSize: 500
  }
});
```

### Search Accounts

```javascript
const accounts = await client.accounts.search('alice', {
  limit: 10,
  includeBalances: true
});

console.log(`Found ${accounts.meta.total} accounts`);
accounts.data.forEach(account => {
  console.log(`${account.address}: ${account.identity?.display}`);
});
```

### Get Account Graph

```javascript
const graph = await client.accounts.getGraph('5GrwvaEF...', {
  depth: 2,
  minVolume: 1000000000000n // 1 DOT
});

// Process nodes
graph.data.nodes.forEach(node => {
  console.log(`Node: ${node.address} (${node.identity?.display})`);
});

// Process edges
graph.data.edges.forEach(edge => {
  console.log(`Transfer: ${edge.source} -> ${edge.target}`);
  console.log(`Volume: ${edge.transferVolume.totalAmount}`);
});
```

### Real-time Updates

```javascript
// Subscribe to account updates
const subscription = await client.subscribe('account:updates', {
  address: '5GrwvaEF...'
});

subscription.on('update', (data) => {
  console.log('Balance changed:', data.balance.free);
});

// Unsubscribe
subscription.unsubscribe();
```

### GraphQL Client

```javascript
const query = `
  query GetAccountDetails($address: String!) {
    account(address: $address) {
      address
      identity {
        display
        email
      }
      balance {
        free
        total
      }
      transferStats {
        totalSent
        totalReceived
        transactionCount
      }
    }
  }
`;

const result = await client.graphql(query, {
  address: '5GrwvaEF...'
});
```

## Security Best Practices

1. **API Key Management**
   - Store API keys in environment variables
   - Rotate keys regularly
   - Use different keys for different environments

2. **Request Validation**
   - Validate all addresses using SS58 format
   - Sanitize search queries
   - Limit request sizes

3. **Rate Limiting**
   - Implement exponential backoff
   - Respect rate limit headers
   - Use caching to reduce requests

4. **Data Encryption**
   - Use HTTPS for all connections
   - Implement certificate pinning for mobile apps
   - Encrypt sensitive data in cache

5. **Error Handling**
   - Never expose internal errors
   - Log errors with request IDs
   - Implement proper error recovery

## Migration Guide

For users migrating from the followthedot-main API:

1. **Endpoint Changes**
   - `/account` → `/api/v1/accounts/search`
   - `/account/{address}/graph` → `/api/v1/accounts/{address}/graph`
   - `/transfer` → `/api/v1/transfers`

2. **Response Format Changes**
   - All responses now include `data` and `meta` fields
   - BigInt values are strings
   - Consistent error format

3. **New Features**
   - Batch API endpoints
   - GraphQL support
   - WebSocket subscriptions
   - Enhanced caching

4. **Deprecated Features**
   - Direct database access
   - Synchronous operations
   - XML response format

## Conclusion

This API specification provides a comprehensive, optimized interface for the Polkadot Analysis Tool. It improves upon the original followthedot-main API with:

- Better performance through batching and caching
- Real-time capabilities via WebSocket
- Flexible querying with GraphQL
- Robust error handling and security
- JavaScript-friendly data formats

The design prioritizes developer experience while maintaining compatibility with existing Polkadot ecosystem standards.