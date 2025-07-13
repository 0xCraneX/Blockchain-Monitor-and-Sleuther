#!/usr/bin/env python3

import requests
import json
import time
import os
import sys
from datetime import datetime
from collections import defaultdict
import threading
import argparse

class GraphEndpointDebugger:
    def __init__(self, base_url="http://localhost:3001", log_dir="logs/debug-harness"):
        self.base_url = base_url
        self.log_dir = log_dir
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'GraphDebugger/1.0'
        })
        
        # Create log directory
        os.makedirs(log_dir, exist_ok=True)
        
        # Log file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.log_file = os.path.join(log_dir, f"detailed_debug_{timestamp}.json")
        self.logs = []
        
        # Test results
        self.results = defaultdict(list)
        
    def log(self, entry_type, data):
        """Log entry to file and console"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "type": entry_type,
            "data": data
        }
        self.logs.append(entry)
        
        # Console output
        if entry_type == "ERROR":
            print(f"\033[91m[{entry_type}]\033[0m {data.get('message', data)}")
        elif entry_type == "SUCCESS":
            print(f"\033[92m[{entry_type}]\033[0m {data.get('message', data)}")
        elif entry_type == "INFO":
            print(f"\033[94m[{entry_type}]\033[0m {data.get('message', data)}")
        else:
            print(f"[{entry_type}] {data}")
    
    def save_logs(self):
        """Save all logs to file"""
        with open(self.log_file, 'w') as f:
            json.dump(self.logs, f, indent=2)
        print(f"\n\033[93mLogs saved to: {self.log_file}\033[0m")
    
    def make_request(self, endpoint, params=None, method="GET"):
        """Make HTTP request with detailed logging"""
        url = f"{self.base_url}{endpoint}"
        
        request_data = {
            "url": url,
            "method": method,
            "params": params,
            "headers": dict(self.session.headers)
        }
        
        self.log("REQUEST", request_data)
        
        start_time = time.time()
        try:
            if method == "GET":
                response = self.session.get(url, params=params, timeout=30)
            else:
                response = self.session.request(method, url, json=params, timeout=30)
            
            duration = (time.time() - start_time) * 1000  # Convert to ms
            
            response_data = {
                "status_code": response.status_code,
                "duration_ms": round(duration, 2),
                "headers": dict(response.headers),
                "size_bytes": len(response.content)
            }
            
            try:
                response_data["body"] = response.json()
            except:
                response_data["body"] = response.text[:1000]  # First 1000 chars if not JSON
            
            self.log("RESPONSE", response_data)
            
            return response, duration
            
        except Exception as e:
            duration = (time.time() - start_time) * 1000
            error_data = {
                "error": str(e),
                "type": type(e).__name__,
                "duration_ms": round(duration, 2)
            }
            self.log("ERROR", error_data)
            return None, duration
    
    def test_basic_functionality(self):
        """Test basic graph endpoint functionality"""
        print("\n\033[96m=== Testing Basic Functionality ===\033[0m")
        
        test_address = "15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu"
        
        tests = [
            ("Default parameters", f"/api/graph/{test_address}", {}),
            ("Depth 1", f"/api/graph/{test_address}", {"depth": 1}),
            ("Depth 5", f"/api/graph/{test_address}", {"depth": 5}),
            ("Max nodes 50", f"/api/graph/{test_address}", {"maxNodes": 50}),
            ("Min volume filter", f"/api/graph/{test_address}", {"minVolume": "1000000000000"}),
            ("Direction incoming", f"/api/graph/{test_address}", {"direction": "incoming"}),
            ("Direction outgoing", f"/api/graph/{test_address}", {"direction": "outgoing"}),
            ("Include risk scores", f"/api/graph/{test_address}", {"includeRiskScores": "true"}),
            ("Complex query", f"/api/graph/{test_address}", {
                "depth": 3,
                "maxNodes": 75,
                "minVolume": "100000000000",
                "direction": "both",
                "includeRiskScores": "true"
            })
        ]
        
        for test_name, endpoint, params in tests:
            print(f"\n\033[93mTest: {test_name}\033[0m")
            response, duration = self.make_request(endpoint, params)
            
            if response and response.status_code == 200:
                data = response.json()
                nodes = len(data.get("nodes", []))
                edges = len(data.get("links", []))
                self.log("SUCCESS", {
                    "test": test_name,
                    "nodes": nodes,
                    "edges": edges,
                    "duration_ms": duration
                })
                print(f"  ✓ Nodes: {nodes}, Edges: {edges}, Time: {duration:.2f}ms")
            else:
                self.log("FAILURE", {"test": test_name})
                print(f"  ✗ Failed")
    
    def test_error_handling(self):
        """Test error handling and validation"""
        print("\n\033[96m=== Testing Error Handling ===\033[0m")
        
        error_tests = [
            ("Invalid address", "/api/graph/invalid-address", {}, 400),
            ("Excessive depth", "/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu", {"depth": 10}, 400),
            ("Invalid direction", "/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu", {"direction": "invalid"}, 400),
            ("Non-existent endpoint", "/api/graph/foo/bar/baz", {}, 404)
        ]
        
        for test_name, endpoint, params, expected_status in error_tests:
            print(f"\n\033[93mTest: {test_name}\033[0m")
            response, duration = self.make_request(endpoint, params)
            
            if response and response.status_code == expected_status:
                self.log("SUCCESS", {"test": test_name, "expected_error": True})
                print(f"  ✓ Got expected error status: {expected_status}")
            else:
                actual_status = response.status_code if response else "No response"
                self.log("FAILURE", {"test": test_name, "expected": expected_status, "actual": actual_status})
                print(f"  ✗ Expected {expected_status}, got {actual_status}")
    
    def test_concurrency(self, num_requests=10):
        """Test concurrent requests"""
        print(f"\n\033[96m=== Testing Concurrency ({num_requests} requests) ===\033[0m")
        
        test_address = "15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu"
        endpoint = f"/api/graph/{test_address}"
        params = {"depth": 2, "maxNodes": 50}
        
        results = []
        threads = []
        
        def make_concurrent_request(index):
            response, duration = self.make_request(endpoint, params)
            results.append({
                "index": index,
                "success": response is not None and response.status_code == 200,
                "duration": duration,
                "status": response.status_code if response else None
            })
        
        start_time = time.time()
        
        # Start threads
        for i in range(num_requests):
            thread = threading.Thread(target=make_concurrent_request, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join()
        
        total_duration = (time.time() - start_time) * 1000
        
        # Analyze results
        successful = sum(1 for r in results if r["success"])
        avg_duration = sum(r["duration"] for r in results) / len(results)
        
        self.log("CONCURRENCY_TEST", {
            "total_requests": num_requests,
            "successful": successful,
            "failed": num_requests - successful,
            "total_duration_ms": round(total_duration, 2),
            "avg_duration_ms": round(avg_duration, 2),
            "results": results
        })
        
        print(f"\n  Total time: {total_duration:.2f}ms")
        print(f"  Successful: {successful}/{num_requests}")
        print(f"  Average response time: {avg_duration:.2f}ms")
    
    def test_state_consistency(self, num_iterations=5):
        """Test if responses are consistent across multiple requests"""
        print(f"\n\033[96m=== Testing State Consistency ({num_iterations} iterations) ===\033[0m")
        
        test_address = "15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu"
        endpoint = f"/api/graph/{test_address}"
        params = {"depth": 2, "maxNodes": 50}
        
        responses = []
        
        for i in range(num_iterations):
            print(f"\n\033[93mIteration {i+1}/{num_iterations}\033[0m")
            response, duration = self.make_request(endpoint, params)
            
            if response and response.status_code == 200:
                data = response.json()
                response_summary = {
                    "iteration": i + 1,
                    "nodes": len(data.get("nodes", [])),
                    "edges": len(data.get("links", [])),
                    "node_ids": sorted([n.get("id") for n in data.get("nodes", [])]),
                    "duration": duration
                }
                responses.append(response_summary)
                print(f"  Nodes: {response_summary['nodes']}, Edges: {response_summary['edges']}")
            
            time.sleep(1)  # Small delay between requests
        
        # Check consistency
        if len(responses) > 1:
            node_counts = [r["nodes"] for r in responses]
            edge_counts = [r["edges"] for r in responses]
            
            consistent_nodes = len(set(node_counts)) == 1
            consistent_edges = len(set(edge_counts)) == 1
            
            self.log("CONSISTENCY_TEST", {
                "iterations": num_iterations,
                "consistent_nodes": consistent_nodes,
                "consistent_edges": consistent_edges,
                "node_counts": node_counts,
                "edge_counts": edge_counts
            })
            
            print(f"\n  Node count consistency: {'✓' if consistent_nodes else '✗'}")
            print(f"  Edge count consistency: {'✓' if consistent_edges else '✗'}")
            
            if not consistent_nodes or not consistent_edges:
                print(f"  \033[91mWarning: Inconsistent results detected!\033[0m")
                print(f"  Node counts: {node_counts}")
                print(f"  Edge counts: {edge_counts}")
    
    def test_environment_impact(self):
        """Test impact of SKIP_BLOCKCHAIN environment variable"""
        print("\n\033[96m=== Testing Environment Impact ===\033[0m")
        
        test_address = "15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu"
        endpoint = f"/api/graph/{test_address}"
        params = {"depth": 2}
        
        # Note: This assumes the server respects the SKIP_BLOCKCHAIN env var
        # In a real test, you'd need to restart the server with different env settings
        
        print("\n\033[93mNote: This test requires server restart with different SKIP_BLOCKCHAIN values\033[0m")
        print("Current test will just make requests and log the data source from metadata")
        
        response, duration = self.make_request(endpoint, params)
        if response and response.status_code == 200:
            data = response.json()
            metadata = data.get("metadata", {})
            data_source = metadata.get("dataSource", "unknown")
            
            print(f"  Data source: {data_source}")
            print(f"  Nodes: {len(data.get('nodes', []))}")
            print(f"  Has blockchain data: {metadata.get('hasBlockchainData', 'unknown')}")
    
    def analyze_performance(self):
        """Analyze performance metrics from all tests"""
        print("\n\033[96m=== Performance Analysis ===\033[0m")
        
        # Extract all response times from logs
        response_times = []
        for log in self.logs:
            if log["type"] == "RESPONSE" and "duration_ms" in log["data"]:
                response_times.append(log["data"]["duration_ms"])
        
        if response_times:
            avg_time = sum(response_times) / len(response_times)
            min_time = min(response_times)
            max_time = max(response_times)
            
            print(f"\n  Total requests: {len(response_times)}")
            print(f"  Average response time: {avg_time:.2f}ms")
            print(f"  Min response time: {min_time:.2f}ms")
            print(f"  Max response time: {max_time:.2f}ms")
            
            # Check for outliers
            outlier_threshold = avg_time * 2
            outliers = [t for t in response_times if t > outlier_threshold]
            if outliers:
                print(f"  \033[91mOutliers detected: {len(outliers)} requests took > {outlier_threshold:.2f}ms\033[0m")
    
    def run_all_tests(self):
        """Run all test suites"""
        print("\033[95m" + "="*50)
        print("   GRAPH ENDPOINT DETAILED DEBUG HARNESS")
        print("="*50 + "\033[0m")
        print(f"API URL: {self.base_url}")
        print(f"Started at: {datetime.now().isoformat()}")
        
        # Check server health
        print("\n\033[94mChecking server health...\033[0m")
        response, _ = self.make_request("/api/health")
        if not response or response.status_code != 200:
            print("\033[91m✗ Server is not accessible!\033[0m")
            return
        print("\033[92m✓ Server is running\033[0m")
        
        # Run test suites
        try:
            self.test_basic_functionality()
            self.test_error_handling()
            self.test_concurrency()
            self.test_state_consistency()
            self.test_environment_impact()
            self.analyze_performance()
        finally:
            # Save logs
            self.save_logs()
            print("\n\033[95mDebug harness completed!\033[0m")

def main():
    parser = argparse.ArgumentParser(description='Debug harness for graph endpoint')
    parser.add_argument('--url', default='http://localhost:3001', help='API base URL')
    parser.add_argument('--concurrency', type=int, default=10, help='Number of concurrent requests')
    parser.add_argument('--consistency', type=int, default=5, help='Number of consistency test iterations')
    
    args = parser.parse_args()
    
    debugger = GraphEndpointDebugger(base_url=args.url)
    debugger.run_all_tests()

if __name__ == "__main__":
    main()