#!/bin/bash

# Performance Testing Suite for Polkadot Analysis Tool
# This script runs comprehensive performance tests and generates a detailed report

echo "🚀 Polkadot Analysis Tool - Performance Testing Suite"
echo "=================================================="
echo ""

# Create results directory
RESULTS_DIR="./performance-results-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Function to run a test and save results
run_test() {
    local test_name=$1
    local test_file=$2
    local timeout=${3:-120000}
    
    echo "Running $test_name..."
    
    # Run the test with JSON reporter and save output
    npm test -- "$test_file" --run --reporter=json > "$RESULTS_DIR/${test_name}.json" 2>&1
    
    # Also run with default reporter for console output
    echo "" >> "$RESULTS_DIR/${test_name}.log"
    echo "=== $test_name ===" >> "$RESULTS_DIR/${test_name}.log"
    echo "" >> "$RESULTS_DIR/${test_name}.log"
    npm test -- "$test_file" --run >> "$RESULTS_DIR/${test_name}.log" 2>&1
    
    echo "✅ $test_name completed"
    echo ""
}

# System information
echo "📊 System Information" | tee "$RESULTS_DIR/system-info.txt"
echo "===================" | tee -a "$RESULTS_DIR/system-info.txt"
echo "Date: $(date)" | tee -a "$RESULTS_DIR/system-info.txt"
echo "Node Version: $(node --version)" | tee -a "$RESULTS_DIR/system-info.txt"
echo "NPM Version: $(npm --version)" | tee -a "$RESULTS_DIR/system-info.txt"
echo "Platform: $(uname -a)" | tee -a "$RESULTS_DIR/system-info.txt"
echo "CPU Cores: $(nproc)" | tee -a "$RESULTS_DIR/system-info.txt"
echo "Total Memory: $(free -h | grep Mem | awk '{print $2}')" | tee -a "$RESULTS_DIR/system-info.txt"
echo "" | tee -a "$RESULTS_DIR/system-info.txt"

# Run performance tests
echo "🧪 Running Performance Tests"
echo "=========================="
echo ""

# 1. API Performance Tests
run_test "api-performance" "tests/performance/api-performance.test.js"

# 2. Database Performance Tests
run_test "database-performance" "tests/performance/database-performance.test.js" 180000

# 3. Graph Operations Tests
run_test "graph-operations" "tests/performance/graph-operations.test.js" 180000

# 4. Load Testing (if exists)
if [ -f "tests/performance/load-testing.test.js" ]; then
    run_test "load-testing" "tests/performance/load-testing.test.js" 300000
fi

# Generate summary report
echo "📝 Generating Performance Report"
echo "=============================="
echo ""

# Create summary report
cat > "$RESULTS_DIR/PERFORMANCE_SUMMARY.md" << EOF
# Performance Test Results Summary

Generated: $(date)

## Test Results

### API Performance
$(grep -E "(passed|failed|duration)" "$RESULTS_DIR/api-performance.log" | head -20)

### Database Performance
$(grep -E "(passed|failed|duration)" "$RESULTS_DIR/database-performance.log" | head -20)

### Graph Operations
$(grep -E "(passed|failed|duration)" "$RESULTS_DIR/graph-operations.log" | head -20)

### Load Testing
$(grep -E "(passed|failed|duration)" "$RESULTS_DIR/load-testing.log" | head -20)

## Key Metrics

### Response Times
- API endpoints: Check individual test logs for detailed timings
- Database queries: Check database-performance.log
- Graph operations: Check graph-operations.log

### Resource Usage
- Peak memory usage during tests
- CPU utilization patterns
- Concurrent connection handling

## Recommendations

Based on the test results, consider:
1. Implementing caching for frequently accessed data
2. Optimizing database queries with better indexes
3. Using connection pooling for better scalability
4. Implementing rate limiting for API endpoints
5. Adding monitoring for production performance

## Files Generated

- api-performance.json/log
- database-performance.json/log
- graph-operations.json/log
- load-testing.json/log
- system-info.txt

EOF

echo "✅ Performance testing complete!"
echo ""
echo "📂 Results saved in: $RESULTS_DIR"
echo ""
echo "📊 Key findings:"
echo "==============="

# Quick summary
echo "- Total tests run: $(find "$RESULTS_DIR" -name "*.log" -exec grep -h "Tests" {} \; | grep -oE "[0-9]+ (passed|failed)" | wc -l)"
echo "- Failed tests: $(find "$RESULTS_DIR" -name "*.log" -exec grep -h "failed" {} \; | wc -l)"
echo "- Test duration: Check individual logs for detailed timings"
echo ""
echo "View detailed results in: $RESULTS_DIR/PERFORMANCE_SUMMARY.md"