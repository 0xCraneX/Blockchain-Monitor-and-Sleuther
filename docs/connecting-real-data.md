# Connecting to Real Polkadot Data

## Current Status

The application is currently running with **demo/sample data** (`SKIP_BLOCKCHAIN=true`). This is why you're seeing the same addresses and relationships regardless of what you search for.

## How to Connect to Real Polkadot Network

### Option 1: Use Public RPC Endpoint (Easiest)

1. Update your `.env` file:
```env
SKIP_BLOCKCHAIN=false
RPC_ENDPOINT=wss://rpc.polkadot.io
CHAIN_ID=polkadot
```

2. Restart the server:
```bash
npm start
```

### Option 2: Use Other Networks

For Kusama:
```env
RPC_ENDPOINT=wss://kusama-rpc.polkadot.io
CHAIN_ID=kusama
```

For Westend (testnet):
```env
RPC_ENDPOINT=wss://westend-rpc.polkadot.io
CHAIN_ID=westend
```

### Option 3: Use Your Own Node

If you're running your own Polkadot node:
```env
RPC_ENDPOINT=ws://localhost:9944
CHAIN_ID=polkadot
```

## Important Considerations

### 1. **Initial Data Loading**
When connecting to real blockchain:
- The database needs to be populated with blockchain data
- This requires indexing transfers, which can take time
- Consider using an indexer service like SubQuery

### 2. **Performance**
Real-time blockchain queries can be slow:
- Fetching all transfers for an address requires scanning blocks
- Consider implementing caching strategies
- Use pagination for large result sets

### 3. **Rate Limits**
Public RPC endpoints have rate limits:
- wss://rpc.polkadot.io may throttle heavy usage
- Consider using multiple endpoints
- Implement retry logic

### 4. **Data Indexing Strategy**

The current implementation needs enhancement for real data:

```javascript
// Example: Fetch real transfers for an address
async getAddressTransfers(address) {
  const transfers = [];
  
  // This is inefficient - scanning all blocks
  // Better approach: Use an indexer or maintain local index
  
  // Option 1: Use SubQuery
  const response = await fetch(`https://api.subquery.network/sq/your-project/transfers?address=${address}`);
  
  // Option 2: Use local indexed database
  const results = await this.db.query(
    'SELECT * FROM transfers WHERE from_address = ? OR to_address = ?',
    [address, address]
  );
  
  return results;
}
```

## Recommended Architecture for Production

1. **Use an Indexer Service**
   - SubQuery: https://subquery.network/
   - Subsquid: https://subsquid.io/
   - The Graph: https://thegraph.com/

2. **Implement Background Indexing**
   ```javascript
   // Background service to index new blocks
   class IndexerService {
     async indexNewBlocks() {
       const lastBlock = await this.getLastIndexedBlock();
       const currentBlock = await this.api.rpc.chain.getHeader();
       
       for (let i = lastBlock + 1; i <= currentBlock.number; i++) {
         await this.indexBlock(i);
       }
     }
   }
   ```

3. **Cache Frequently Accessed Data**
   - Redis for hot data
   - Database indexes for common queries
   - Pre-compute relationship graphs

## Quick Test

To verify real data connection:

1. Set `SKIP_BLOCKCHAIN=false`
2. Restart server
3. Check logs for "Connected to blockchain"
4. Search for a known Polkadot address like:
   - `15kUt2i86LHRWCkE3D9Bg1HZAoc2smhn1fwPzDERTb1BXAkX` (Web3 Foundation)
   - `13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn` (Treasury)

## Current Limitations

The current codebase has some limitations for real data:

1. **Transfer Indexing**: Not implemented - needs to scan blockchain
2. **Identity Resolution**: Needs to query on-chain identity pallet
3. **Balance Queries**: Real-time but slow for multiple addresses
4. **Historical Data**: Requires full node archive

## Next Steps

1. Implement proper indexing service
2. Add background block scanner
3. Cache identity and balance data
4. Implement efficient relationship queries
5. Add data freshness indicators