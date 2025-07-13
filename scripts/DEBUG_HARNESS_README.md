# Graph Endpoint Debug Harness

This directory contains test harness scripts to help debug and analyze the `/api/graph/:address` endpoint behavior.

## Available Scripts

### 1. `debug-graph-endpoint.js`
A comprehensive Node.js test harness that:
- Makes HTTP requests with full request/response logging
- Tests various query parameter combinations
- Performs stress testing with concurrent requests
- Compares behavior with/without SKIP_BLOCKCHAIN environment variable
- Logs all interactions to timestamped JSON files
- Provides performance analysis

**Usage:**
```bash
# Default (uses http://localhost:3001)
node scripts/debug-graph-endpoint.js

# Custom API URL
API_URL=http://localhost:3000 node scripts/debug-graph-endpoint.js
```

**Features:**
- Colored console output for easy reading
- Request/response interceptors for detailed logging
- Automatic retry on failures
- Performance metrics calculation
- Environment variable impact testing

### 2. `test-graph-curl.sh`
A bash script using curl for quick testing:
- Tests basic functionality with different parameters
- Error case validation
- Performance testing with concurrent requests
- Environment variable comparison
- State consistency checks

**Usage:**
```bash
# Make executable (if not already)
chmod +x scripts/test-graph-curl.sh

# Run with default settings
./scripts/test-graph-curl.sh

# Custom API URL
API_URL=http://localhost:3000 ./scripts/test-graph-curl.sh
```

**Requirements:**
- `curl`
- `jq` (for JSON parsing)
- `bc` (for calculations)

### 3. `debug-graph-detailed.py`
A Python-based test harness with advanced features:
- Detailed request/response analysis
- Concurrency testing with threading
- State consistency verification
- Performance outlier detection
- Comprehensive JSON log output

**Usage:**
```bash
# Default settings
python3 scripts/debug-graph-detailed.py

# Custom options
python3 scripts/debug-graph-detailed.py --url http://localhost:3000 --concurrency 20 --consistency 10
```

**Requirements:**
- Python 3.6+
- `requests` library (`pip install requests`)

## Test Scenarios Covered

All scripts test the following scenarios:

1. **Basic Functionality**
   - Default parameters
   - Various depth values (1-5)
   - Node limiting (maxNodes)
   - Volume filtering (minVolume)
   - Direction filtering (incoming/outgoing/both)
   - Risk score inclusion

2. **Error Handling**
   - Invalid address formats
   - Out-of-range parameters
   - Invalid enum values
   - Non-existent endpoints

3. **Performance Testing**
   - Concurrent request handling
   - Response time analysis
   - Resource usage patterns
   - Scalability limits

4. **State Consistency**
   - Multiple sequential requests
   - Response comparison
   - Data integrity verification

5. **Environment Impact**
   - SKIP_BLOCKCHAIN flag behavior
   - Data source detection
   - Fallback mechanism testing

## Log Files

All scripts create detailed logs in the `logs/debug-harness/` directory:

- **Node.js harness**: `graph-debug-{timestamp}.log` (JSON format)
- **Curl script**: `curl-test-{timestamp}.log` (text format)
- **Python harness**: `detailed_debug_{timestamp}.json` (structured JSON)

## Interpreting Results

### Success Indicators:
- Status code 200 for valid requests
- Consistent node/edge counts across requests
- Response times under 1000ms for typical queries
- Proper error codes (400) for invalid inputs

### Warning Signs:
- Inconsistent results between requests
- Response times over 2000ms
- Unexpected error codes
- Missing or malformed response data
- Different behavior with/without SKIP_BLOCKCHAIN

### Critical Issues:
- Server crashes or timeouts
- Memory leaks (increasing response times)
- Data corruption
- Race conditions in concurrent requests

## Debugging Workflow

1. **Start the server** with appropriate environment variables:
   ```bash
   # With blockchain integration
   npm start
   
   # Without blockchain (mock data only)
   SKIP_BLOCKCHAIN=true npm start
   ```

2. **Run quick test** to verify basic functionality:
   ```bash
   ./scripts/test-graph-curl.sh
   ```

3. **Run comprehensive test** for detailed analysis:
   ```bash
   node scripts/debug-graph-endpoint.js
   ```

4. **Analyze logs** for patterns and issues:
   ```bash
   # View latest log
   ls -t logs/debug-harness/*.log | head -1 | xargs cat
   
   # Search for errors
   grep -i error logs/debug-harness/*.log
   ```

5. **Test specific scenarios** based on findings:
   ```bash
   # Test specific address
   curl "http://localhost:3001/api/graph/YOUR_ADDRESS?depth=2"
   
   # Test with specific parameters
   curl "http://localhost:3001/api/graph/YOUR_ADDRESS?depth=3&minVolume=1000000000000&includeRiskScores=true"
   ```

## Common Issues and Solutions

### Issue: Inconsistent node/edge counts
- Check if RealDataService is properly initialized
- Verify database state between requests
- Look for caching issues

### Issue: Slow response times
- Check depth and maxNodes parameters
- Monitor database query performance
- Verify index usage in database

### Issue: Different results with SKIP_BLOCKCHAIN
- Ensure proper fallback to mock data
- Check service initialization order
- Verify environment variable handling

### Issue: Concurrent request failures
- Check rate limiting configuration
- Monitor connection pool usage
- Look for database locking issues