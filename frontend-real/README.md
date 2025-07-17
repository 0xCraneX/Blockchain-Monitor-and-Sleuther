# Polkadot Whale Monitor - Web Dashboard

A real-time web dashboard for monitoring whale activity on the Polkadot blockchain.

## Features

### 📊 Real-time Monitoring
- Live alerts for whale movements
- Pattern detection visualization
- 24-hour volume charts
- Top movers tracking

### 🚨 Alert Types
1. **Dormant Whale Awakening** (Critical)
   - Accounts inactive for 30+ days that suddenly move funds
   - Highlighted with red alerts and pulse animations

2. **Large Transfers** (High)
   - Movements exceeding 10,000 DOT
   - Orange alerts with transfer details

3. **Coordinated Movements** (Medium)
   - Multiple related addresses moving funds within short timeframes
   - Yellow alerts for pattern detection

4. **Exchange Activity** (Low)
   - Deposits/withdrawals from known exchanges
   - Green alerts for tracking

### 📈 Visualizations
- **Volume Chart**: 24-hour DOT movement timeline
- **Pattern Distribution**: Pie chart showing alert type breakdown
- **Top Movers**: Real-time leaderboard of active whales
- **Quick Stats**: Key metrics at a glance

## Getting Started

### Option 1: Run with the Web Server

```bash
# In the blockchain-monitoring-tool directory
node server.js
```

Then open: http://localhost:3002

### Option 2: Run with the Main Monitor

The monitoring tool can serve the frontend directly:

```bash
# Start the monitor with web interface
npm start --web
```

### Option 3: Static File

Open `frontend/index.html` directly in your browser (limited functionality without API).

## Architecture

```
frontend/
├── index.html          # Main dashboard
├── README.md          # This file
└── assets/            # Future: icons, images

server.js              # Express server for frontend
```

## API Endpoints

The frontend connects to these API endpoints:

- `GET /api/current` - Current monitoring snapshot
- `GET /api/alerts` - Today's alerts
- `GET /api/historical/:address` - Historical data for an address

## Customization

### Alert Thresholds
Edit the settings modal in the dashboard to adjust:
- Check interval (15min, 30min, 1hr)
- Alert threshold (minimum DOT amount)
- Pattern sensitivity (1-5 scale)

### Visual Theme
The dashboard uses Tailwind CSS with custom Polkadot colors:
- Primary: `#e6007a` (Polkadot pink)
- Secondary: `#552bbf` (Purple)
- Dark backgrounds with glass morphism effects

## Integration

The dashboard automatically connects to the monitoring tool's data directory:
- Reads from `data/snapshots/current.json`
- Loads alerts from `data/alerts/[date].json`
- Fetches historical data from `data/historical/`

## Development

### Adding New Alert Types

1. Add to the `alertTypes` array in the script section
2. Define severity, color, and description template
3. The system will automatically render new alerts

### Modifying Charts

Charts use Chart.js v3. Update the chart configurations:
- `volumeChart` - Line chart for volume over time
- `patternChart` - Doughnut chart for pattern distribution

### Real-time Updates

The dashboard uses polling (every 10 seconds) to fetch new data. For true real-time updates, WebSocket support can be added to the monitoring tool.

## Performance

- Lightweight: No build process, runs directly in browser
- Responsive: Optimized for desktop and tablet viewing
- Efficient: Only keeps latest 10 alerts in DOM
- Fast: CDN-hosted dependencies for quick loading

## Future Enhancements

1. **WebSocket Integration** - True real-time updates
2. **Address Deep Dive** - Click any address for detailed analysis
3. **Historical Playback** - Review past whale movements
4. **Export Features** - Download alerts and reports
5. **Mobile App** - React Native companion app
6. **Notifications** - Browser/email/Telegram alerts
7. **AI Insights** - ML-powered pattern predictions

## Troubleshooting

### No Data Showing
- Ensure the monitoring tool is running
- Check that data files exist in `data/` directory
- Verify server is running on correct port

### Alerts Not Updating
- Check browser console for errors
- Ensure API endpoints are accessible
- Verify data file permissions

### Chart Issues
- Clear browser cache
- Check Chart.js CDN is accessible
- Verify data format matches expected structure