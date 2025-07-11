# Polkadot Analysis Tool - Quick Fix Guide

## 🚨 Critical Issues (Fix Immediately)

### 1. Remove .env from Git Repository
```bash
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "fix: Remove .env from repository and add to gitignore"
```

### 2. Generate Test Data for Empty Database
```javascript
// Create file: scripts/generate-test-data.js
import { DatabaseService } from '../src/services/DatabaseService.js';

const db = new DatabaseService();
await db.initialize();

// Add test accounts
const testAddresses = [
  '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'
];

for (const address of testAddresses) {
  db.createAccount({
    address,
    publicKey: '0x' + '00'.repeat(32),
    identityDisplay: `Test Account ${address.slice(0, 8)}`,
    balance: '1000000000000',
    firstSeenBlock: 1000000
  });
}

// Add test transfers
for (let i = 0; i < 100; i++) {
  const from = testAddresses[i % 3];
  const to = testAddresses[(i + 1) % 3];
  
  db.createTransfer({
    blockNumber: 1000000 + i,
    blockHash: '0x' + i.toString(16).padStart(64, '0'),
    extrinsicHash: '0x' + (i * 2).toString(16).padStart(64, '0'),
    fromAddress: from,
    toAddress: to,
    amount: (1000000000000 * (i + 1)).toString(),
    success: true,
    timestamp: new Date(Date.now() - i * 3600000)
  });
}

console.log('Test data generated successfully!');
```

Run it:
```bash
node scripts/generate-test-data.js
```

### 3. Fix Graph API Service Initialization

The graph routes are already fixed in the latest commit. If still having issues:

```javascript
// Verify src/api/routes/graph.js has the getServices function
// This was already fixed in the code
```

### 4. Fix PatternDetector REGEXP Issue

Add to test setup:
```javascript
// In tests/setup.js (already fixed)
db.function('REGEXP', (pattern, text) => {
  try {
    return new RegExp(pattern).test(text) ? 1 : 0;
  } catch (e) {
    return 0;
  }
});
```

## ⚠️ High Priority Issues

### 5. Adjust Rate Limiting
Update `.env`:
```env
# Development settings
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
SEARCH_RATE_LIMIT_MAX=50
EXPENSIVE_RATE_LIMIT_MAX=20
```

### 6. Add Authentication Middleware
```javascript
// Create: src/middleware/auth.js
export const requireAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }
  
  next();
};

// Apply to sensitive routes in src/api/routes/stats.js
router.get('/', requireAuth, async (req, res) => {
  // ... existing code
});
```

### 7. Enable CSP in Production
Update `src/security/index.js`:
```javascript
contentSecurityPolicy: {
  directives: cspConfig,
  reportOnly: config.environment === 'development' // Only report in dev
}
```

## 🛠️ Quick Test Commands

### Run Specific Test Suites
```bash
# Backend services only
npm test -- tests/unit/services/

# API tests only  
npm test -- tests/integration/api.test.js

# Database tests
npm test -- tests/unit/services/DatabaseService.test.js

# Security scan
npm audit
node run-security-tests.mjs

# Performance check
node tests/performance/quick-benchmark.js
```

### Check System Health
```bash
# Start server and check
npm run dev

# In another terminal
curl http://localhost:3000/api/
curl http://localhost:3000/api/stats
```

## 📊 Performance Quick Wins

### 1. Database Index Optimization
```sql
-- Add these indexes if missing
CREATE INDEX IF NOT EXISTS idx_transfers_timestamp ON transfers(timestamp);
CREATE INDEX IF NOT EXISTS idx_relationships_volume ON account_relationships(total_volume DESC);
```

### 2. Memory Usage Reduction
```javascript
// In graph operations, limit default depth
const DEFAULT_DEPTH = 2; // Instead of 3
const MAX_NODES = 100; // Instead of 1000
```

### 3. Cache Headers
Add to API responses:
```javascript
res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
```

## 🔍 Debugging Tips

### Check Logs
```bash
# Server logs
tail -f logs/app.log

# Database queries (if debug enabled)
tail -f logs/sql.log
```

### Test Individual Services
```javascript
// Quick service test
import { DatabaseService } from './src/services/DatabaseService.js';
const db = new DatabaseService();
await db.initialize();
console.log(await db.getAccount('5Grw...'));
```

### Monitor Performance
```bash
# Watch memory usage
watch -n 1 'ps aux | grep node'

# Check port usage
lsof -i :3000
```

## ✅ Validation Checklist

After fixes, verify:
- [ ] `.env` removed from git history
- [ ] Test data present in database
- [ ] All API endpoints responding
- [ ] No security warnings from `npm audit`
- [ ] Server starts without errors
- [ ] WebSocket connections work
- [ ] Rate limiting reasonable
- [ ] Memory usage stable

## 🚀 Ready for Production Checklist

1. [ ] All critical issues fixed
2. [ ] Environment variables set properly
3. [ ] Database has indexes
4. [ ] Security headers enabled
5. [ ] Authentication implemented
6. [ ] Error logging configured
7. [ ] Performance optimized
8. [ ] Tests passing >90%

---

*Quick fix guide generated from comprehensive test results*
*For detailed information, see COMPREHENSIVE_TEST_REPORT.md*