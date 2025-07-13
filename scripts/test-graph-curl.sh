#!/bin/bash

# Graph endpoint test script using curl
# This script tests various scenarios for the /api/graph/:address endpoint

API_URL=${API_URL:-"http://localhost:3001"}
TEST_ADDRESS="15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu"
TIMESTAMP=$(date +%s)
LOG_FILE="logs/debug-harness/curl-test-${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create log directory
mkdir -p logs/debug-harness

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Test function
test_endpoint() {
    local test_name="$1"
    local endpoint="$2"
    local expected_status="${3:-200}"
    
    echo -e "\n${YELLOW}Testing: ${test_name}${NC}"
    log "TEST: ${test_name}"
    log "URL: ${API_URL}${endpoint}"
    
    # Make request with full debugging
    response=$(curl -s -w "\n%{http_code}" -X GET \
        -H "Content-Type: application/json" \
        -H "User-Agent: GraphDebugCurl/1.0" \
        "${API_URL}${endpoint}" 2>&1)
    
    # Extract status code and body
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # Log full response
    log "STATUS: ${status_code}"
    log "RESPONSE: ${body}"
    
    # Check result
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ Passed (Status: ${status_code})${NC}"
        
        # Parse response for node/edge count if successful
        if [ "$status_code" = "200" ]; then
            node_count=$(echo "$body" | grep -o '"nodes":\s*\[' | wc -l)
            if [ $node_count -gt 0 ]; then
                nodes=$(echo "$body" | jq '.nodes | length' 2>/dev/null || echo "parse error")
                edges=$(echo "$body" | jq '.links | length' 2>/dev/null || echo "parse error")
                echo "  Nodes: ${nodes}, Edges: ${edges}"
            fi
        fi
    else
        echo -e "${RED}✗ Failed (Expected: ${expected_status}, Got: ${status_code})${NC}"
        echo "  Response: ${body:0:200}..."
    fi
}

# Header
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Graph Endpoint Test Harness (curl)${NC}"
echo -e "${BLUE}========================================${NC}"
echo "API URL: ${API_URL}"
echo "Log file: ${LOG_FILE}"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking server health...${NC}"
health_check=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/api/health")
if [ "$health_check" != "200" ]; then
    echo -e "${RED}✗ Server is not accessible at ${API_URL}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"

# Test scenarios
echo -e "\n${BLUE}Running test scenarios...${NC}"

# Basic tests
test_endpoint "Basic graph request" "/api/graph/${TEST_ADDRESS}"
test_endpoint "Graph with depth=1" "/api/graph/${TEST_ADDRESS}?depth=1"
test_endpoint "Graph with depth=5" "/api/graph/${TEST_ADDRESS}?depth=5"
test_endpoint "Graph with maxNodes=50" "/api/graph/${TEST_ADDRESS}?maxNodes=50"
test_endpoint "Graph with minVolume filter" "/api/graph/${TEST_ADDRESS}?minVolume=1000000000000"

# Direction tests
test_endpoint "Incoming only" "/api/graph/${TEST_ADDRESS}?direction=incoming"
test_endpoint "Outgoing only" "/api/graph/${TEST_ADDRESS}?direction=outgoing"
test_endpoint "Both directions" "/api/graph/${TEST_ADDRESS}?direction=both"

# Complex queries
test_endpoint "Multiple parameters" "/api/graph/${TEST_ADDRESS}?depth=3&maxNodes=75&minVolume=100000000000&direction=both&includeRiskScores=true"

# Error cases
test_endpoint "Invalid address" "/api/graph/invalid-address" "400"
test_endpoint "Excessive depth" "/api/graph/${TEST_ADDRESS}?depth=10" "400"
test_endpoint "Invalid direction" "/api/graph/${TEST_ADDRESS}?direction=invalid" "400"

# Other endpoints
test_endpoint "Node metrics" "/api/graph/metrics/${TEST_ADDRESS}"
test_endpoint "Pattern detection" "/api/graph/patterns/${TEST_ADDRESS}"
test_endpoint "Path finding" "/api/graph/path?from=${TEST_ADDRESS}&to=12H7nsDUrJUSCQQJrTKAFfyCWSactiSdjoVUixqcd9CZHTj"

# Performance test
echo -e "\n${BLUE}Performance test (5 concurrent requests)...${NC}"
log "PERFORMANCE TEST: Starting 5 concurrent requests"

start_time=$(date +%s.%N)
for i in {1..5}; do
    curl -s -o /dev/null "${API_URL}/api/graph/${TEST_ADDRESS}?depth=2" &
done
wait
end_time=$(date +%s.%N)
duration=$(echo "$end_time - $start_time" | bc)

echo -e "${GREEN}✓ Completed in ${duration} seconds${NC}"
log "PERFORMANCE TEST: Completed in ${duration} seconds"

# Environment comparison
echo -e "\n${BLUE}Testing with SKIP_BLOCKCHAIN environment variable...${NC}"

# Test with SKIP_BLOCKCHAIN=true
export SKIP_BLOCKCHAIN=true
echo -e "\n${YELLOW}With SKIP_BLOCKCHAIN=true:${NC}"
response1=$(curl -s "${API_URL}/api/graph/${TEST_ADDRESS}?depth=2")
nodes1=$(echo "$response1" | jq '.nodes | length' 2>/dev/null || echo "0")
source1=$(echo "$response1" | jq -r '.metadata.dataSource' 2>/dev/null || echo "unknown")
echo "  Nodes: ${nodes1}, Data source: ${source1}"

# Test without SKIP_BLOCKCHAIN
unset SKIP_BLOCKCHAIN
echo -e "\n${YELLOW}Without SKIP_BLOCKCHAIN:${NC}"
response2=$(curl -s "${API_URL}/api/graph/${TEST_ADDRESS}?depth=2")
nodes2=$(echo "$response2" | jq '.nodes | length' 2>/dev/null || echo "0")
source2=$(echo "$response2" | jq -r '.metadata.dataSource' 2>/dev/null || echo "unknown")
echo "  Nodes: ${nodes2}, Data source: ${source2}"

# State consistency test
echo -e "\n${BLUE}Testing state consistency (3 sequential requests)...${NC}"
for i in {1..3}; do
    echo -e "\n${YELLOW}Request ${i}:${NC}"
    response=$(curl -s "${API_URL}/api/graph/${TEST_ADDRESS}?depth=2&maxNodes=50")
    nodes=$(echo "$response" | jq '.nodes | length' 2>/dev/null || echo "0")
    edges=$(echo "$response" | jq '.links | length' 2>/dev/null || echo "0")
    echo "  Nodes: ${nodes}, Edges: ${edges}"
    sleep 1
done

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Test completed. Full logs at: ${LOG_FILE}${NC}"
echo -e "${BLUE}========================================${NC}"