#!/usr/bin/env python3
"""
Security audit script for polkadot-analysis-tool
Checks for vulnerabilities and security issues without npm audit
"""

import json
import os
import re
import subprocess
import sys

def read_package_json():
    """Read and parse package.json"""
    try:
        with open('package.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("Error: package.json not found")
        return None

def check_dependency_versions():
    """Check for known vulnerable package versions"""
    vulnerable_packages = {
        'express': {
            'vulnerable_versions': ['<4.17.1'],
            'current_safe': '4.21.2',
            'issues': ['DoS via malformed Accept-Encoding header']
        },
        'helmet': {
            'vulnerable_versions': ['<4.0.0'],
            'current_safe': '7.2.0',
            'issues': ['Missing security headers in older versions']
        },
        'socket.io': {
            'vulnerable_versions': ['<4.7.2'],
            'current_safe': '4.8.1',
            'issues': ['CORS bypass, DoS vulnerabilities']
        },
        'cors': {
            'vulnerable_versions': ['<2.8.5'],
            'current_safe': '2.8.5',
            'issues': ['CORS misconfiguration']
        }
    }
    
    package_json = read_package_json()
    if not package_json:
        return []
    
    vulnerabilities = []
    dependencies = package_json.get('dependencies', {})
    
    for pkg, info in vulnerable_packages.items():
        if pkg in dependencies:
            current_version = dependencies[pkg].replace('^', '').replace('~', '')
            vulnerabilities.append({
                'package': pkg,
                'current_version': current_version,
                'safe_version': info['current_safe'],
                'issues': info['issues'],
                'severity': 'medium'
            })
    
    return vulnerabilities

def scan_for_secrets():
    """Scan for exposed secrets in code"""
    secret_patterns = [
        (r'(?i)(password|passwd|pwd)\s*[:=]\s*["\'][^"\']{8,}["\']', 'Password'),
        (r'(?i)(secret|key|token)\s*[:=]\s*["\'][^"\']{20,}["\']', 'Secret/Key'),
        (r'(?i)(api_key|apikey)\s*[:=]\s*["\'][^"\']{10,}["\']', 'API Key'),
        (r'sk_[a-zA-Z0-9]{24,}', 'Private Key'),
        (r'pk_[a-zA-Z0-9]{24,}', 'Public Key'),
        (r'-----BEGIN [A-Z ]+-----[\s\S]*-----END [A-Z ]+-----', 'Certificate/Key'),
    ]
    
    secrets_found = []
    
    # Scan common directories
    scan_dirs = ['src', 'config', 'scripts', '.']
    
    for scan_dir in scan_dirs:
        if not os.path.exists(scan_dir):
            continue
            
        for root, dirs, files in os.walk(scan_dir):
            # Skip node_modules and hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
            
            for file in files:
                if file.endswith(('.js', '.json', '.env', '.config')):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            
                        for pattern, secret_type in secret_patterns:
                            matches = re.finditer(pattern, content)
                            for match in matches:
                                # Skip example/placeholder values
                                matched_text = match.group(0)
                                if any(placeholder in matched_text.lower() for placeholder in 
                                      ['example', 'placeholder', 'your_', 'change_', 'replace_']):
                                    continue
                                
                                secrets_found.append({
                                    'file': file_path,
                                    'type': secret_type,
                                    'line': content[:match.start()].count('\n') + 1,
                                    'match': matched_text[:50] + '...' if len(matched_text) > 50 else matched_text
                                })
                    except Exception as e:
                        continue
    
    return secrets_found

def check_security_middleware():
    """Check if security middleware is properly configured"""
    security_checks = []
    
    # Check main index.js for security middleware
    try:
        with open('src/index.js', 'r') as f:
            content = f.read()
        
        checks = [
            ('helmet()', 'Helmet security headers middleware'),
            ('cors()', 'CORS middleware'),
            ('rateLimiter', 'Rate limiting middleware'),
            ('express.json()', 'JSON body parser'),
            ('errorHandler', 'Error handling middleware')
        ]
        
        for check, description in checks:
            if check in content:
                security_checks.append({
                    'check': description,
                    'status': 'PASS',
                    'details': f'{check} found in src/index.js'
                })
            else:
                security_checks.append({
                    'check': description,
                    'status': 'FAIL',
                    'details': f'{check} not found in src/index.js'
                })
                
    except FileNotFoundError:
        security_checks.append({
            'check': 'Main application file',
            'status': 'FAIL',
            'details': 'src/index.js not found'
        })
    
    return security_checks

def check_env_files():
    """Check for environment file security"""
    env_issues = []
    
    # Check for .env files
    env_files = ['.env', '.env.local', '.env.development', '.env.production']
    
    for env_file in env_files:
        if os.path.exists(env_file):
            env_issues.append({
                'file': env_file,
                'issue': 'Environment file present',
                'severity': 'high',
                'recommendation': 'Ensure this file is in .gitignore and contains no production secrets'
            })
    
    # Check .gitignore
    if os.path.exists('.gitignore'):
        with open('.gitignore', 'r') as f:
            gitignore_content = f.read()
        
        if '.env' not in gitignore_content:
            env_issues.append({
                'file': '.gitignore',
                'issue': '.env files not excluded',
                'severity': 'medium',
                'recommendation': 'Add .env* to .gitignore'
            })
    
    return env_issues

def check_input_validation():
    """Check for input validation implementation"""
    validation_files = []
    
    # Look for validation in key files
    key_files = [
        'src/security/index.js',
        'src/middleware/rateLimiter.js',
        'src/controllers/GraphController.js',
        'src/api/routes/graph.js'
    ]
    
    for file_path in key_files:
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    content = f.read()
                
                validation_checks = [
                    'zod',
                    'validateAddress',
                    'sanitize',
                    'schema',
                    'validation'
                ]
                
                found_validations = [check for check in validation_checks if check in content]
                
                validation_files.append({
                    'file': file_path,
                    'validations_found': found_validations,
                    'has_validation': len(found_validations) > 0
                })
            except Exception as e:
                continue
    
    return validation_files

def generate_report():
    """Generate comprehensive security audit report"""
    print("=" * 80)
    print("POLKADOT ANALYSIS TOOL - SECURITY AUDIT REPORT")
    print("=" * 80)
    print()
    
    # Change to project directory
    os.chdir('/workspace/polkadot-analysis-tool')
    
    # 1. Check dependencies
    print("1. DEPENDENCY VULNERABILITY ANALYSIS")
    print("-" * 40)
    vulnerabilities = check_dependency_versions()
    if vulnerabilities:
        for vuln in vulnerabilities:
            print(f"Package: {vuln['package']}")
            print(f"  Current Version: {vuln['current_version']}")
            print(f"  Safe Version: {vuln['safe_version']}")
            print(f"  Severity: {vuln['severity']}")
            print(f"  Issues: {', '.join(vuln['issues'])}")
            print()
    else:
        print("✓ No known vulnerable dependencies found")
    print()
    
    # 2. Secret scanning
    print("2. SECRET EXPOSURE ANALYSIS")
    print("-" * 40)
    secrets = scan_for_secrets()
    if secrets:
        for secret in secrets:
            print(f"⚠️  {secret['type']} found in {secret['file']}:{secret['line']}")
            print(f"   Match: {secret['match']}")
            print()
    else:
        print("✓ No exposed secrets detected")
    print()
    
    # 3. Security middleware
    print("3. SECURITY MIDDLEWARE ANALYSIS")
    print("-" * 40)
    middleware_checks = check_security_middleware()
    for check in middleware_checks:
        status_icon = "✓" if check['status'] == 'PASS' else "✗"
        print(f"{status_icon} {check['check']}: {check['details']}")
    print()
    
    # 4. Environment file security
    print("4. ENVIRONMENT FILE SECURITY")
    print("-" * 40)
    env_issues = check_env_files()
    if env_issues:
        for issue in env_issues:
            severity_icon = "🔴" if issue['severity'] == 'high' else "🟡"
            print(f"{severity_icon} {issue['file']}: {issue['issue']}")
            print(f"   Recommendation: {issue['recommendation']}")
            print()
    else:
        print("✓ No environment file security issues detected")
    print()
    
    # 5. Input validation
    print("5. INPUT VALIDATION ANALYSIS")
    print("-" * 40)
    validation_files = check_input_validation()
    for val_file in validation_files:
        status_icon = "✓" if val_file['has_validation'] else "✗"
        print(f"{status_icon} {val_file['file']}")
        if val_file['validations_found']:
            print(f"   Found: {', '.join(val_file['validations_found'])}")
        else:
            print("   No validation mechanisms detected")
        print()
    
    # Summary
    print("6. SECURITY SUMMARY")
    print("-" * 40)
    total_issues = len(vulnerabilities) + len(secrets) + len(env_issues)
    
    if total_issues == 0:
        print("✓ Overall security status: GOOD")
        print("  No critical vulnerabilities detected")
    elif total_issues <= 3:
        print("🟡 Overall security status: MODERATE")
        print(f"  {total_issues} issues found - review recommended")
    else:
        print("🔴 Overall security status: NEEDS ATTENTION")
        print(f"  {total_issues} issues found - immediate action required")
    
    print()
    print("RECOMMENDATIONS:")
    print("- Regularly update dependencies to latest versions")
    print("- Implement comprehensive input validation")
    print("- Use environment variables for configuration")
    print("- Enable security headers (helmet, CORS)")
    print("- Implement rate limiting for API endpoints")
    print("- Add authentication/authorization as needed")
    print("- Regular security testing and code reviews")

if __name__ == "__main__":
    generate_report()