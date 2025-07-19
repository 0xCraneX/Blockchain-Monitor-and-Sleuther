# NPM Dependency Analysis

## Production Dependencies (from package.json)

### ✅ USED Dependencies

1. **@polkadot/api** (^16.4.1)
   - Used in: `src/services/BlockchainService.js`, scripts for blockchain connectivity
   - Purpose: Polkadot blockchain API integration

2. **better-sqlite3** (^9.4.0)
   - Used in: `src/services/DatabaseService.js` and multiple other services
   - Purpose: SQLite database operations

3. **compression** (^1.7.4)
   - Used in: `src/index.js`
   - Purpose: Express middleware for response compression

4. **cors** (^2.8.5)
   - Used in: `src/index.js`, `src/api/index.js`
   - Purpose: Cross-origin resource sharing support

5. **dotenv** (^16.3.1)
   - Used in: `src/index.js`
   - Purpose: Environment variable management

6. **express** (^4.18.2)
   - Used in: `src/index.js`, `src/api/index.js`, and route files
   - Purpose: Web framework

7. **express-rate-limit** (^7.1.5)
   - Used in: `src/middleware/rateLimiter.js`
   - Purpose: API rate limiting

8. **helmet** (^7.1.0)
   - Used in: `src/index.js`
   - Purpose: Security headers middleware

9. **node-fetch** (^3.3.2)
   - Used in: `src/services/SubscanService.js` and scripts
   - Purpose: HTTP client for API calls

10. **pino** (^8.17.2)
    - Used in: `src/utils/logger.js`
    - Purpose: High-performance logging

11. **socket.io** (^4.6.1)
    - Used in: `src/services/GraphWebSocket.js`
    - Purpose: WebSocket server for real-time updates

12. **zod** (^3.22.4)
    - Used in: `src/security/index.js` and validation logic
    - Purpose: Schema validation

13. **d3** (^7.9.0)
    - Used in: `public/js/modules/graph-visualizer.js` (client-side)
    - Purpose: Graph visualization library

### ❌ UNUSED Dependencies

1. **@polkadot/util-crypto** (^13.2.3)
   - Not found in any source files
   - Likely intended for: Cryptographic utilities for Polkadot addresses

2. **http-proxy-middleware** (^3.0.5)
   - Not found in any source files
   - Likely intended for: Proxy middleware (possibly replaced by webpack dev server proxy)

3. **isomorphic-dompurify** (^2.26.0)
   - Found commented out in: `src/security/index.js`
   - Status: Temporarily disabled, needs to be re-enabled or removed

## DevDependencies Analysis

### ✅ USED DevDependencies

1. **@babel/core** & **@babel/preset-env** - Used in webpack.config.js
2. **@playwright/test** & **playwright** - Used for E2E testing
3. **@types/** packages - TypeScript definitions (used indirectly)
4. **babel-loader** - Used in webpack.config.js
5. **chalk** - Used in scripts for colored output
6. **css-loader** & **style-loader** - Used in webpack.config.js
7. **eslint** - Used for linting (npm run lint)
8. **nodemon** - Used for development server (npm run dev)
9. **pino-pretty** - Used for log formatting in development
10. **socket.io-client** - Used in test files and public JS
11. **supertest** - Used in integration tests
12. **vitest** - Used for unit testing
13. **webpack** & **webpack-cli** - Used for bundling

### ❓ POTENTIALLY UNUSED DevDependencies

1. **uuid** (^11.1.0)
   - Only found in: `src/security/index.js` as part of zod validation
   - Could potentially be removed if UUID validation is not needed

## Recommendations

1. **Remove unused production dependencies:**
   ```bash
   npm uninstall @polkadot/util-crypto http-proxy-middleware
   ```

2. **Decision needed for isomorphic-dompurify:**
   - Either re-enable it in `src/security/index.js` or remove from dependencies

3. **Consider removing uuid from devDependencies:**
   - Only used for validation schema, not for generating UUIDs

4. **All other dependencies appear to be actively used**

## Summary

- **Total production dependencies:** 13
- **Used:** 11 (+ 1 client-side only)
- **Unused:** 2
- **Needs decision:** 1 (isomorphic-dompurify)

The codebase has relatively good dependency hygiene with only a few unused packages that can be safely removed.