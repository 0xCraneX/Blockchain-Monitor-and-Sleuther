# Polkadot Analysis Tool

A focused blockchain investigation tool for exploring address relationships and transaction flows in the Polkadot ecosystem.

## 🚀 Features

- **Address Investigation**: Input any address and explore its connections
- **Multi-Degree Exploration**: See connections 2, 3, 4+ degrees out  
- **Interactive Visualization**: High-quality D3.js network graphs
- **Real-time Updates**: WebSocket support for live data
- **Manual Analysis Tools**: Powerful filters for your own investigation
  - Volume filters
  - Time range filters
  - Connection filters
  - Pattern detection
  - Data export (CSV/JSON)
- **Security**: Comprehensive input validation and rate limiting
- **Performance**: Handles graphs with 10,000+ nodes efficiently

## 📋 Current Status

**System Health: 72.3%** (See [COMPREHENSIVE_TEST_REPORT.md](./COMPREHENSIVE_TEST_REPORT.md))

- ✅ Core functionality operational
- ✅ Security measures implemented
- ✅ Database layer stable
- ⚠️ Some API endpoints need fixes
- ⚠️ Test data needs to be generated

## 🏃 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd polkadot-analysis-tool

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your settings

# Generate test data (recommended for development)
node scripts/generate-test-data.js

# Run development server
npm run dev

# Access the application
open http://localhost:3000
```

## 🧪 Testing

The project includes comprehensive test coverage across 8 domains with 850+ tests.

### Run All Tests
```bash
# Run all test suites
npm test

# Run with coverage report
npm test -- --coverage
```

### Run Specific Test Suites
```bash
# Backend unit tests
npm test -- tests/unit/services/

# API integration tests
npm test -- tests/integration/api.test.js

# Database tests
npm test -- tests/unit/services/DatabaseService.test.js

# Frontend tests
npm test -- tests/frontend/

# WebSocket tests
node tests/integration/websocket/run-all-tests.js

# Security tests
node run-security-tests.mjs

# Performance tests
./run-performance-tests.sh

# End-to-end tests
./run-workflow-tests.sh
```

### Test Coverage Summary
| Domain | Coverage | Status |
|--------|----------|--------|
| Backend Services | 81.8% | ✅ Good |
| API Endpoints | 40% | ⚠️ Needs work |
| Database | 88.9% | ✅ Excellent |
| Frontend | 95% | ✅ Excellent |
| WebSocket | 98% | ✅ Excellent |
| Security | 95% | ✅ Excellent |
| Performance | 85% | ✅ Good |
| E2E Workflows | 92% | ✅ Excellent |

## 🔧 Development

### Prerequisites
- Node.js 20.x LTS or higher
- npm 10.x or higher
- SQLite3

### Project Structure
```
polkadot-analysis-tool/
├── src/                    # Source code
│   ├── api/               # REST API routes
│   ├── services/          # Business logic
│   ├── database/          # Database schemas
│   └── security/          # Security middleware
├── public/                # Frontend assets
├── tests/                 # Test suites
├── docs/                  # Documentation
└── scripts/              # Utility scripts
```

### Available Scripts
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run test suite
npm run lint       # Run linter
npm run migrate    # Run database migrations
```

## 📚 Documentation

- [CLAUDE.md](./CLAUDE.md) - Project overview and status
- [COMPREHENSIVE_TEST_REPORT.md](./COMPREHENSIVE_TEST_REPORT.md) - Detailed test results
- [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md) - Quick fixes for common issues
- [IMPROVEMENT_ROADMAP.md](./IMPROVEMENT_ROADMAP.md) - Development roadmap
- [API Documentation](./docs/03-api-specification.md) - REST API reference
- [Architecture](./docs/05-system-architecture.md) - System design

## 🐛 Known Issues

See [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md) for solutions to common issues:

1. Empty database - Run `node scripts/generate-test-data.js`
2. Rate limiting too strict - Adjust settings in `.env`
3. Some Graph API endpoints failing - Fix in progress
4. High memory usage with large graphs - Optimization planned

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 🔒 Security

- All inputs are validated using Zod schemas
- SQL injection protection via parameterized queries
- XSS protection through DOMPurify
- Rate limiting on all endpoints
- See [PRODUCTION_SECURITY_CHECKLIST.md](./PRODUCTION_SECURITY_CHECKLIST.md)

## 📈 Performance

- Handles up to 500 requests/second
- Supports graphs with 10,000+ nodes
- Sub-50ms query response times
- WebSocket latency <10ms

## 📜 License

MIT License - see [LICENSE](./LICENSE) file

## 🙏 Acknowledgments

- Polkadot.js team for excellent blockchain libraries
- D3.js for visualization capabilities
- FollowTheDot for inspiration