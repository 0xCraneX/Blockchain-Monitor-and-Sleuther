# Security Test Report

**Generated:** 2025-07-11T16:54:53.953Z
**Target:** http://[::1]:3000

## Executive Summary

- **Total Vulnerabilities Found:** 8
- **Critical:** 1
- **High:** 2
- **Medium:** 1
- **Low:** 1

## Critical Findings

### 1. Environment File
- **Endpoint:** N/A
- **Details:** {
  "type": "Environment File",
  "file": ".env",
  "vulnerable": true,
  "note": ".env file exists - should not be in repository"
}

## Recommendations

### 1. [CRITICAL] Input validation vulnerabilities found
Implement proper input validation and parameterized queries. Use the existing QueryValidator class consistently across all endpoints.

### 2. [HIGH] Missing security headers
Ensure all security headers are properly configured, especially in production. Enable HSTS, CSP, and other headers.

### 3. [HIGH] Authentication/authorization issues
Implement proper authentication mechanisms. Consider using JWT with proper validation or API keys for sensitive endpoints.

### 4. [MEDIUM] Rate limiting may be insufficient
Review and strengthen rate limiting configurations, especially for expensive operations like graph queries.

## Detailed Test Results

### Input Validation Tests

Found 0 vulnerabilities

### Authentication Tests

Found 1 vulnerabilities

### Rate Limiting Tests

Found 1 vulnerabilities

### Security Headers

| Header | Present | Value |
|--------|---------|-------|
| HSTS | ✓ | max-age=15552000; includeSubDomains |
| X-Content-Type-Options | ✓ | nosniff |
| X-Frame-Options | ✓ | DENY |
| X-XSS-Protection | ✓ | 1; mode=block |
| CSP | ✗ | Not set |
| Referrer-Policy | ✓ | strict-origin-when-cross-origin |
| Permissions-Policy | ✓ | accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), usb=(), web-share=(), xr-spatial-tracking=() |

### Dependency Vulnerabilities

- Critical: 0
- High: 0
- Moderate: 0
- Low: 0

