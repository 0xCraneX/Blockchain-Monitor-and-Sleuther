#!/bin/bash

# API Test Script using curl
# This script tests all API endpoints with various scenarios

API_BASE="http://[::1]:3000/api"
VALID_ADDRESS="15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5"
INVALID_ADDRESS="invalid_address_123"

echo "=== Polkadot Analysis Tool API Tests ==="
echo "API Base: $API_BASE"
echo "Date: $(date)"
echo ""

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local expected=$3
    local data=$4
    local description=$5
    
    echo "Testing: $description"
    echo "Endpoint: $method $endpoint"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" "$API_BASE$endpoint")
    fi
    
    # Extract status code (last line)
    status=$(echo "$response" | tail -n1)
    # Extract body (all but last line)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status" = "$expected" ]; then
        echo "✅ Status: $status (Expected: $expected)"
    else
        echo "❌ Status: $status (Expected: $expected)"
    fi
    
    # Pretty print JSON if possible
    if command -v jq &> /dev/null && [ -n "$body" ]; then
        echo "Response:"
        echo "$body" | jq . 2>/dev/null || echo "$body"
    else
        echo "Response: $body"
    fi
    echo "---"
    echo ""
}

# Root API
echo "=== ROOT API TESTS ==="
test_endpoint "GET" "/" "200" "" "Get API info"

# Address API
echo "=== ADDRESS API TESTS ==="
test_endpoint "GET" "/addresses/search?q=test" "200" "" "Search addresses with query"
test_endpoint "GET" "/addresses/search?q=" "400" "" "Search with empty query"
test_endpoint "GET" "/addresses/search" "400" "" "Search without query param"
test_endpoint "GET" "/addresses/$VALID_ADDRESS" "404" "" "Get valid address details"
test_endpoint "GET" "/addresses/$INVALID_ADDRESS" "400" "" "Get invalid address details"
test_endpoint "GET" "/addresses/$VALID_ADDRESS/transfers" "200" "" "Get address transfers"
test_endpoint "GET" "/addresses/$VALID_ADDRESS/relationships" "200" "" "Get address relationships"
test_endpoint "GET" "/addresses/$VALID_ADDRESS/patterns" "200" "" "Get address patterns"

# Graph API
echo "=== GRAPH API TESTS ==="
test_endpoint "GET" "/graph/$VALID_ADDRESS" "404" "" "Get address graph (default depth)"
test_endpoint "GET" "/graph/$VALID_ADDRESS?depth=2" "404" "" "Get address graph (depth=2)"
test_endpoint "GET" "/graph/$VALID_ADDRESS?depth=0" "400" "" "Get address graph (invalid depth)"
test_endpoint "GET" "/graph/path?from=$VALID_ADDRESS&to=$VALID_ADDRESS" "200" "" "Find path between addresses"
test_endpoint "GET" "/graph/path?from=$VALID_ADDRESS" "400" "" "Find path (missing 'to' param)"
test_endpoint "GET" "/graph/metrics/$VALID_ADDRESS" "404" "" "Get graph metrics"
test_endpoint "GET" "/graph/patterns/$VALID_ADDRESS" "200" "" "Get graph patterns"
test_endpoint "GET" "/graph/expand" "200" "" "Expand graph"

# Relationships API
echo "=== RELATIONSHIPS API TESTS ==="
test_endpoint "GET" "/relationships/$VALID_ADDRESS/$VALID_ADDRESS/score" "200" "" "Get relationship score"
test_endpoint "GET" "/relationships/$INVALID_ADDRESS/$VALID_ADDRESS/score" "400" "" "Get score with invalid address"

# Investigations API
echo "=== INVESTIGATIONS API TESTS ==="
test_endpoint "POST" "/investigations" "201" '{"name":"Test Investigation","description":"Testing API","addresses":["'$VALID_ADDRESS'"]}' "Create investigation"
test_endpoint "POST" "/investigations" "400" '{"description":"Missing name"}' "Create investigation (missing field)"
test_endpoint "POST" "/investigations" "400" '{}' "Create investigation (empty body)"

# Stats API
echo "=== STATS API TESTS ==="
test_endpoint "GET" "/stats" "200" "" "Get statistics"

# Error Handling
echo "=== ERROR HANDLING TESTS ==="
test_endpoint "GET" "/nonexistent" "404" "" "Non-existent endpoint"
test_endpoint "POST" "/addresses" "404" "" "Unsupported method"

echo "=== TEST COMPLETE ==="
echo "Timestamp: $(date)"