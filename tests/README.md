# Blockchain Monitoring Tool - Testing & Demo Strategy

## Overview
This comprehensive testing suite ensures the hackathon demo runs flawlessly within the critical 3-5 minute window. It includes unit tests, integration tests, performance benchmarks, and failsafe demo scenarios.

## Quick Start for Demo Day

```bash
# 1. Run all tests (30 seconds)
npm run test:all

# 2. Start demo in safe mode (with fallbacks)
npm run demo:safe

# 3. If live data available
npm run demo:live

# 4. Emergency offline mode
npm run demo:offline
```

## Testing Structure

### 1. Unit Tests (`/unit`)
- Core anomaly detection algorithms
- Pattern matching functions
- Data transformation utilities
- Mock Subscan API responses

### 2. Integration Tests (`/integration`)
- API integration with mock data
- Real-time data processing pipeline
- Alert generation system
- Historical data replay

### 3. Performance Tests (`/performance`)
- Sub-second detection benchmarks
- Parallel processing validation
- Memory usage under load
- Speed controls (1x, 10x, 100x)

### 4. Demo Tests (`/demo`)
- Scenario timing validation
- Fallback mechanism testing
- UI responsiveness checks
- Network failure simulation

## Demo Scenarios

### Primary Scenarios (with timing)
1. **Sleeping Giant Awakens** (45 seconds)
   - Show dormant period visualization
   - Trigger awakening animation
   - Display market impact

2. **Exchange Run Detection** (60 seconds)
   - Real-time flow meter
   - Progressive severity alerts
   - Historical comparison overlay

3. **Multi-Whale Convergence** (45 seconds)
   - Network graph animation
   - Connection discovery
   - Predictive cascade modeling

4. **Natural Language Query** (30 seconds)
   - "Show dormant whales > 1 year"
   - Instant visualization
   - Export functionality

5. **Validator Exodus Alert** (30 seconds)
   - Stake movement tracking
   - Network security implications
   - Governance impact

### Fallback Scenarios
- Pre-recorded data replays
- Synthetic pattern generation
- Historical event recreation
- Speed-controlled playback

## Performance Benchmarks

### Target Metrics
- Detection latency: < 0.5 seconds
- Query response: < 100ms
- Graph rendering: < 200ms
- Alert generation: < 300ms
- Concurrent monitoring: 1000+ addresses

### Stress Testing
- 10,000 transactions/second
- 100 concurrent WebSocket connections
- 1GB historical data processing
- Network partition recovery

## Demo Controls

### Speed Settings
- **1x**: Real-time (live or replay)
- **10x**: Compressed time (6 hours in 36 minutes)
- **100x**: Rapid demonstration (24 hours in 14 minutes)
- **Pause/Resume**: For Q&A moments

### Data Sources (Priority Order)
1. Live Polkadot network
2. Recent historical cache (last 48 hours)
3. Synthetic scenarios (realistic patterns)
4. Pre-recorded demonstrations

## Technical Safeguards

### Network Failures
- Automatic fallback to cached data
- Seamless transition messaging
- No interruption in visualization

### API Limits
- Request pooling and caching
- Rate limit detection
- Backup data sources

### Performance Issues
- Progressive data loading
- Resolution downsampling
- Feature degradation

## Judge-Focused Features

### "Wow" Moments
1. **0:30** - Living network visualization
2. **1:30** - Real-time anomaly detection
3. **2:30** - Natural language insights
4. **3:30** - Predictive analytics
5. **4:00** - Vision presentation

### Technical Excellence Display
- Clean architecture diagram (on screen)
- Performance metrics dashboard
- Open source repository QR code
- Live code walkthrough ready

### Backup Materials
- Video backup of best demo run
- Static screenshots of key moments
- Printed architecture diagrams
- Mobile-responsive backup site

## Emergency Procedures

### Complete Network Failure
1. Switch to offline mode
2. Use synthetic data
3. Focus on vision and potential

### Partial Data Issues
1. Use mixed mode (live + synthetic)
2. Acknowledge transparently
3. Emphasize working components

### Time Overrun
1. Skip to natural language demo
2. Show pre-made visualization
3. End with strong vision statement

## Post-Demo Resources
- Live demo URL (QR code)
- GitHub repository
- Technical documentation
- Contact information
- Follow-up meeting scheduler