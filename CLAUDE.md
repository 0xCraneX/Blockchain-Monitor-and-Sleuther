# CLAUDE.md - Polkadot Analysis Tool

## Project Overview

The Polkadot Analysis Tool is a focused blockchain investigation tool for exploring address relationships and transaction flows in the Polkadot ecosystem. Built with JavaScript/TypeScript, it provides powerful manual analysis capabilities through interactive visualizations and filtering tools, allowing investigators to identify patterns and connections themselves.

## Architecture

This project follows a monolithic architecture with modular components:
- **Backend**: Node.js with Express.js
- **Database**: SQLite (single-file, zero-configuration)
- **Frontend**: Vanilla JavaScript with D3.js visualization
- **Blockchain**: Polkadot.js API integration

## Documentation Structure

### 1. [Database Design](./docs/01-database-design.md)
Complete SQLite schema design adapted from FollowTheDot's PostgreSQL + Neo4j architecture. Includes:
- Core tables for accounts, transfers, patterns, and statistics
- Optimized indexes for common queries
- Migration strategy from existing systems
- Performance considerations for single-user desktop application

### 2. [Frontend Architecture](./docs/02-frontend-architecture.md)
Frontend implementation guide featuring:
- D3.js network graph visualization component
- Address search with autocomplete
- Control panel for filtering and analysis
- State management patterns
- Mobile-responsive design considerations

### 3. [API Specification](./docs/03-api-specification.md)
RESTful API design with:
- Core endpoints for address search, graph generation, and pattern detection
- WebSocket support for real-time updates
- Authentication and rate limiting
- SDK examples in JavaScript and Python
- Comprehensive error handling

### 4. [Core Algorithms](./docs/04-algorithms.md)
JavaScript implementations of:
- Identity resolution from on-chain data
- Graph building from transfer relationships
- Suspicious pattern detection (rapid movement, circular flows, mixing behavior)
- Efficient search with fuzzy matching
- Data processing pipeline with state management

### 5. [System Architecture](./docs/05-system-architecture.md)
Complete architectural blueprint including:
- High-level component design
- Technology stack decisions
- Module structure and dependencies
- Service layer implementation
- Deployment strategies (web, desktop, CLI)

### 6. [Testing Strategy](./docs/06-testing-strategy.md)
Comprehensive testing approach:
- Test infrastructure setup with Vitest
- Unit, integration, and E2E test examples
- Real blockchain data testing
- Performance benchmarks
- CI/CD pipeline configuration

### 7. [Security & Performance](./docs/07-security-performance.md)
Security hardening and optimization guide:
- Input validation and sanitization
- SQL injection prevention
- API security (rate limiting, CORS, authentication)
- Database query optimization
- Caching strategies
- Memory management

### 8. [Integration & Extensibility](./docs/08-integration-extensibility.md)
Framework for extending functionality:
- Multi-chain blockchain support
- External API integrations (Subscan, price services)
- Plugin architecture
- Export/import capabilities
- Future enhancements (ML, real-time monitoring, collaboration)

## Quick Start

### Prerequisites
- Node.js 20.x LTS
- npm 10.x

### Installation
```bash
# Clone the repository
git clone https://github.com/your-org/polkadot-analysis-tool.git
cd polkadot-analysis-tool

# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Basic Usage
```javascript
// Search for an address
const results = await client.search('5Grw');

// Get address graph
const graph = await client.getAddressGraph('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', {
  depth: 3,
  minVolume: '1000000000000'
});

// Detect patterns
const patterns = await client.detectPatterns('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
```

## Key Features

1. **Address Analysis**
   - Search by address or identity
   - View transaction history and relationships
   - Identity resolution with on-chain data

2. **Graph Visualization**
   - High-quality interactive D3.js network graphs (matching FollowTheDot quality)
   - Configurable depth (see connections multiple degrees out)
   - Smooth animations and clear relationship indicators
   - Real-time updates via WebSocket

3. **Manual Investigation Tools**
   - **Volume Filters**: Show only transfers above/below certain amounts
   - **Time Range Filters**: Focus on specific time periods
   - **Connection Filters**: Show/hide addresses based on connection count
   - **Address Highlighting**: Mark specific addresses of interest
   - **Relationship Filters**: Show only certain types of connections
   - **Data Export**: Export filtered data for external analysis

4. **Multi-Chain Support**
   - Polkadot
   - Kusama
   - Hydration (with Omnipool integration)
   - Asset Hub

5. **Export Capabilities**
   - CSV format for spreadsheet analysis
   - JSON format for programmatic processing
   - Filtered data export
   - Full graph export

## Development Commands

```bash
# Run tests
npm test                 # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e        # End-to-end tests

# Code quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix linting issues
npm run format          # Format with Prettier

# Build
npm run build           # Build for production
npm run build:desktop   # Build Electron app
npm run build:docker    # Build Docker image

# Database
npm run migrate         # Run migrations
npm run migrate:rollback # Rollback last migration
npm run db:seed         # Seed test data
```

## Configuration

### Environment Variables
```env
# Node environment
NODE_ENV=development

# Server
PORT=3000
HOST=localhost

# Database
DATABASE_PATH=./data/analysis.db

# Blockchain
RPC_ENDPOINT=wss://rpc.polkadot.io
CHAIN_ID=polkadot

# External APIs
SUBSCAN_API_KEY=your_key_here
COINGECKO_API_KEY=your_key_here

# Security
JWT_SECRET=your_secret_here
API_KEY=your_api_key_here
```

### Configuration Files
- `config/default.json` - Default configuration
- `config/production.json` - Production overrides
- `config/chains.json` - Blockchain configurations

## Testing with Real Data

The project includes fixtures for testing with real Polkadot addresses:

```javascript
// Treasury address
const TREASURY = '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn';

// Known validators
const VALIDATORS = [
  '14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2',
  '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu'
];
```

## Architecture Decisions

1. **SQLite over PostgreSQL + Neo4j**
   - Zero configuration required
   - Perfect for single-user desktop applications
   - Sufficient performance for millions of transactions

2. **Monolithic over Microservices**
   - Simplified deployment
   - Easier maintenance
   - Lower resource requirements

3. **JavaScript/TypeScript only**
   - Single language for full stack
   - Large ecosystem of packages
   - Easier to find developers

## Performance Targets

- Address search: < 100ms
- Graph generation (100 nodes): < 500ms
- Pattern detection: < 1 second
- Database queries: < 50ms (p95)

## Security Considerations

- All inputs are validated using Zod schemas
- SQL queries use parameterized statements
- API endpoints have rate limiting
- Authentication via JWT or API keys
- HTTPS only in production

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues:
- Open an issue on GitHub
- Check the documentation in `/docs`
- Join our Discord community

## Acknowledgments

- FollowTheDot for the original inspiration
- Polkadot.js team for the excellent blockchain libraries
- D3.js community for visualization tools