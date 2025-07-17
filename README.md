# 🐋 Polkadot Whale Monitor

A real-time monitoring tool for tracking the top 1000 Polkadot accounts and detecting suspicious patterns in whale movements.

## Features

- **Real-time Monitoring**: Tracks top 1000 Polkadot accounts hourly
- **Pattern Detection**: 6 sophisticated algorithms to detect suspicious activities
- **Beautiful Alerts**: Color-coded console output with severity levels
- **Snapshot System**: JSON-based storage with automatic rotation and compression
- **Rate Limiting**: Respects Subscan API limits (5 requests/second)
- **Demo Mode**: Test the system with realistic scenarios

## Pattern Detection Algorithms

1. **Dormant Awakening** 🚨
   - Detects accounts inactive for 30+ days that suddenly move funds
   - Critical alert for 180+ days dormancy

2. **Large Movements** 💸
   - Tracks transfers above configurable thresholds
   - Notable: 10,000 DOT | Important: 100,000 DOT | Critical: 1,000,000 DOT

3. **Unbonding Detection** ⏱️
   - Monitors the 28-day unbonding period
   - Alerts when large amounts enter unbonding

4. **New Whale Formation** 🆕
   - Identifies new addresses entering the top 1000
   - Tracks accounts dropping out of the list

5. **Coordination Detection** 🤝
   - Detects multiple whales moving funds within the same time window
   - Critical when 5+ whales coordinate

6. **Flow Patterns** 🌊
   - Consolidation: Large inflows to single addresses
   - Rapid Draining: "Death by 1000 cuts" patterns

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/polkadot-whale-monitor.git
cd blockchain-monitoring-tool

# Install dependencies (if you have npm access)
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your Subscan API key
nano .env
```

## Usage

### Help
```bash
node index.js help
```

### Demo Mode
```bash
node index.js demo
```

### Single Run
```bash
node index.js run
```

### Continuous Monitoring
```bash
node index.js start
```

### With Options
```bash
# Check every 30 minutes, monitor top 500 accounts
node index.js start --interval 30 --limit 500
```

## Configuration

Edit `.env` file:

```env
# Subscan API
SUBSCAN_API_KEY=your_api_key_here

# Monitoring
CHECK_INTERVAL_MINUTES=60
TOP_ACCOUNTS_LIMIT=1000

# Thresholds
DORMANT_DAYS_NOTABLE=30
DORMANT_DAYS_CRITICAL=180
LARGE_MOVEMENT_NOTABLE=10000
LARGE_MOVEMENT_IMPORTANT=100000
LARGE_MOVEMENT_CRITICAL=1000000
```

## Alert Severity Levels

- 🚨 **CRITICAL**: Immediate attention required (red)
- ⚠️ **IMPORTANT**: Significant activity detected (yellow)
- 📊 **NOTABLE**: Interesting but not urgent (cyan)

## File Structure

```
blockchain-monitoring-tool/
├── src/
│   ├── api/            # Subscan API client
│   ├── storage/        # JSON snapshot management
│   ├── patterns/       # Detection algorithms
│   ├── alerts/         # Alert formatting
│   ├── utils/          # Logger and helpers
│   └── monitor.js      # Main orchestrator
├── data/
│   ├── snapshots/      # Account snapshots
│   └── alerts/         # Alert history
├── logs/               # Daily log files
└── index.js           # CLI entry point
```

## Data Storage

- **Current Snapshot**: `data/snapshots/current.json`
- **Previous Snapshot**: `data/snapshots/previous.json`
- **Archives**: `data/snapshots/archive/` (compressed after 7 days)
- **Alerts**: `data/alerts/YYYY-MM-DD.json`

## Example Output

```
══════════════════════════════════════════════════════════════════════
                    ALERT SUMMARY
══════════════════════════════════════════════════════════════════════
Total Alerts: 4
🚨 Critical: 1 | ⚠️  Important: 2 | 📊 Notable: 1
══════════════════════════════════════════════════════════════════════

🚨 CRITICAL ALERTS:
──────────────────────────────────────────────────────────────────────
🚨 [CRITICAL] DORMANT_AWAKENING
   Address: 1FRMM8PE...yV24fg
   Amount: 500,000 DOT
   Dormant whale awakens after 365 days!
   Details: after 365 days
```

## Running Without npm

If you can't install npm packages, the tool includes mock implementations:

```bash
# The tool will automatically use mocks for:
# - axios (HTTP requests)
# - bottleneck (rate limiting)
# - lru-cache (caching)
# - p-retry (retry logic)
```

## Troubleshooting

### Permission Errors
```bash
# If you see npm permission errors
sudo chown -R $(whoami) ~/.npm
```

### API Key Issues
- Get a free API key from [Subscan.io](https://subscan.io)
- Add it to your `.env` file

### No Alerts on First Run
- First run creates a baseline snapshot
- Alerts only appear when comparing two snapshots

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Subscan.io for the excellent API
- Polkadot community for inspiration
- Built for the Polkadot Hackathon 2025