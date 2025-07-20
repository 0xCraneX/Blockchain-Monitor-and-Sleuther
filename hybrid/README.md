# Hybrid RPC/Subscan Whale Monitor

## 🚧 DEVELOPMENT IN PROGRESS

This folder contains the next-generation hybrid architecture combining:
- **Direct Polkadot RPC** for real-time monitoring (no rate limits)
- **Subscan API** for enrichment and historical context (rate managed)
- **Local indexing** for reduced API dependency

## ⚠️ Important Notes

- **Production system is UNTOUCHED** - current monitoring continues in `/src`
- **Battle testing required** before any migration
- **Only switch when proven superior** and stable for 1+ week

## Development Status

- [ ] Phase 1: Foundation (Week 1-2)
- [ ] Phase 2: Data Integration (Week 3-4)  
- [ ] Phase 3: Performance Optimization (Week 5-6)
- [ ] Phase 4: Battle Testing (Week 7-8)
- [ ] Migration: Only if ALL success criteria met

## Quick Start

```bash
# Install additional dependencies
npm install @polkadot/api

# Run hybrid tests (when available)
npm run test:hybrid

# Start parallel monitoring (when ready)
npm run start:hybrid

# Compare with current system  
npm run compare:systems
```

## Architecture

```
hybrid/
├── core/              # Main hybrid orchestration
├── indexer/           # Local blockchain indexing  
├── cache/             # Multi-tier caching system
├── tests/             # Comprehensive testing suite
└── config/            # Hybrid-specific configuration
```

## Documentation

See `HYBRID_IMPLEMENTATION_PLAN.md` for complete technical specifications and migration strategy.