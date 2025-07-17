# Polkadot Governance Monitor - Technical Specification

## Quick Implementation Guide

### Core Architecture (Keep It Simple)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Polkadot Node  │────>│  Event Listener │────>│  Alert Engine   │
│  (WSS)          │     │  (Node.js)      │     │  (Workers)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                 │                        │
                                 v                        v
                        ┌─────────────────┐     ┌─────────────────┐
                        │   PostgreSQL    │     │  Notifications  │
                        │   (Events+Rules) │     │  (Multi-channel)│
                        └─────────────────┘     └─────────────────┘
```

### Database Schema (Minimal)

```sql
-- Core tables only
CREATE TABLE governance_proposals (
    id SERIAL PRIMARY KEY,
    chain TEXT NOT NULL,
    proposal_index INTEGER NOT NULL,
    proposal_type TEXT NOT NULL, -- 'treasury', 'democracy', 'council'
    proposer TEXT NOT NULL,
    value NUMERIC,
    beneficiary TEXT,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    voting_end TIMESTAMPTZ,
    UNIQUE(chain, proposal_type, proposal_index)
);

CREATE TABLE user_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL, -- 'treasury_spend', 'new_proposal', 'voting_ending'
    filters JSONB, -- {"min_value": 1000, "keywords": ["parachain"]}
    channels JSONB, -- {"email": true, "discord": "webhook_url"}
    active BOOLEAN DEFAULT true
);

CREATE TABLE alert_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    proposal_id INTEGER REFERENCES governance_proposals(id),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    channel TEXT,
    status TEXT -- 'sent', 'failed', 'clicked'
);
```

### Event Listener (Simple & Reliable)

```javascript
// governance-monitor.js
const { ApiPromise, WsProvider } = require('@polkadot/api');

class GovernanceMonitor {
  constructor(wsUrl, db) {
    this.wsUrl = wsUrl;
    this.db = db;
    this.reconnectAttempts = 0;
  }

  async start() {
    try {
      const provider = new WsProvider(this.wsUrl);
      this.api = await ApiPromise.create({ provider });
      
      // Subscribe to governance events
      this.api.query.system.events((events) => {
        events.forEach((record) => {
          const { event } = record;
          this.handleEvent(event);
        });
      });
      
      console.log('Governance monitor started');
    } catch (error) {
      console.error('Failed to start:', error);
      this.reconnect();
    }
  }

  handleEvent(event) {
    const handlers = {
      'treasury.Proposed': this.handleTreasuryProposal,
      'democracy.Proposed': this.handleDemocracyProposal,
      'democracy.Started': this.handleReferendumStarted,
      'council.Proposed': this.handleCouncilProposal
    };

    const handler = handlers[`${event.section}.${event.method}`];
    if (handler) {
      handler.call(this, event);
    }
  }

  async handleTreasuryProposal(event) {
    const [proposalIndex] = event.data;
    
    // Fetch proposal details
    const proposal = await this.api.query.treasury.proposals(proposalIndex);
    
    if (proposal.isSome) {
      const { proposer, value, beneficiary } = proposal.unwrap();
      
      await this.db.query(`
        INSERT INTO governance_proposals 
        (chain, proposal_type, proposal_index, proposer, value, beneficiary)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (chain, proposal_type, proposal_index) DO NOTHING
      `, ['polkadot', 'treasury', proposalIndex.toNumber(), proposer.toString(), 
          value.toString(), beneficiary.toString()]);
      
      // Trigger alerts
      await this.checkAlerts('treasury', proposal);
    }
  }

  async checkAlerts(type, proposal) {
    // Simple alert matching
    const alerts = await this.db.query(`
      SELECT * FROM user_alerts 
      WHERE alert_type = $1 AND active = true
    `, [`${type}_proposal`]);

    for (const alert of alerts.rows) {
      if (this.matchesFilter(proposal, alert.filters)) {
        await this.sendAlert(alert, proposal);
      }
    }
  }
}
```

### Alert Engine (Multi-channel)

```javascript
// alert-sender.js
class AlertSender {
  async send(alert, proposal, channel) {
    switch(channel) {
      case 'email':
        return this.sendEmail(alert, proposal);
      case 'discord':
        return this.sendDiscord(alert, proposal);
      case 'telegram':
        return this.sendTelegram(alert, proposal);
      case 'webhook':
        return this.sendWebhook(alert, proposal);
    }
  }

  async sendDiscord(alert, proposal) {
    const webhook = alert.channels.discord;
    const embed = {
      title: "🏛️ New Governance Proposal",
      color: 0xE6007A, // Polkadot pink
      fields: [
        {
          name: "Type",
          value: proposal.type,
          inline: true
        },
        {
          name: "Value",
          value: `${(proposal.value / 10**10).toFixed(2)} DOT`,
          inline: true
        },
        {
          name: "Proposer",
          value: `${proposal.proposer.slice(0,8)}...`,
          inline: true
        }
      ],
      footer: {
        text: "Polkadot Governance Monitor"
      },
      timestamp: new Date()
    };

    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  }
}
```

### API Endpoints (Minimal)

```javascript
// api.js
const express = require('express');
const app = express();

// Get active proposals
app.get('/api/proposals', async (req, res) => {
  const { type, min_value, status = 'active' } = req.query;
  
  let query = 'SELECT * FROM governance_proposals WHERE status = $1';
  const params = [status];
  
  if (type) {
    query += ' AND proposal_type = $2';
    params.push(type);
  }
  
  if (min_value) {
    query += ` AND value >= $${params.length + 1}`;
    params.push(min_value);
  }
  
  const result = await db.query(query, params);
  res.json(result.rows);
});

// Create alert rule
app.post('/api/alerts', authenticate, async (req, res) => {
  const { alert_type, filters, channels } = req.body;
  
  const result = await db.query(`
    INSERT INTO user_alerts (user_id, alert_type, filters, channels)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [req.user.id, alert_type, filters, channels]);
  
  res.json({ id: result.rows[0].id });
});

// Webhook for testing
app.post('/api/test-alert', authenticate, async (req, res) => {
  const mockProposal = {
    type: 'treasury',
    value: '10000000000000', // 1000 DOT
    proposer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
  };
  
  await alertSender.send(req.user.alerts[0], mockProposal, 'discord');
  res.json({ status: 'sent' });
});
```

### Quick Start Script

```bash
#!/bin/bash
# setup.sh

# Create database
createdb governance_monitor

# Run migrations
psql governance_monitor < schema.sql

# Install dependencies
npm init -y
npm install @polkadot/api express pg node-cron dotenv

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://localhost/governance_monitor
WS_ENDPOINT=wss://rpc.polkadot.io
PORT=3000
EOF

# Create basic structure
mkdir -p src/{services,routes,utils}

echo "✅ Setup complete. Run 'npm start' to begin monitoring."
```

### Deployment (Single VPS)

```yaml
# docker-compose.yml
version: '3.8'
services:
  monitor:
    build: .
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/governance
      - WS_ENDPOINT=wss://rpc.polkadot.io
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=governance
    volumes:
      - postgres_data:/var/lib/postgresql/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl

volumes:
  postgres_data:
```

### Monitoring & Maintenance

```javascript
// health-check.js
const checks = {
  database: async () => {
    const result = await db.query('SELECT 1');
    return result.rows.length === 1;
  },
  
  blockchain: async () => {
    const blockNumber = await api.rpc.chain.getBlockNumber();
    return blockNumber.toNumber() > 0;
  },
  
  alerts: async () => {
    const pending = await db.query(
      'SELECT COUNT(*) FROM alert_queue WHERE status = $1',
      ['pending']
    );
    return pending.rows[0].count < 1000; // Alert if backlog
  }
};

// Run checks every minute
setInterval(async () => {
  for (const [name, check] of Object.entries(checks)) {
    try {
      const healthy = await check();
      if (!healthy) {
        console.error(`Health check failed: ${name}`);
        // Send alert to ops team
      }
    } catch (error) {
      console.error(`Health check error ${name}:`, error);
    }
  }
}, 60000);
```

### MVP Feature Checklist

- [ ] Subscribe to governance events
- [ ] Store proposals in database
- [ ] Basic alert matching (value threshold)
- [ ] Email notifications
- [ ] Discord webhook support
- [ ] Simple web API
- [ ] Health monitoring
- [ ] Basic web dashboard (optional)

### Performance Targets

- Event processing: < 100ms
- Alert delivery: < 5 seconds
- API response: < 200ms
- Uptime: 99.9%

### Total Development Time: 4 Weeks

1. **Week 1**: Core event monitoring
2. **Week 2**: Alert system
3. **Week 3**: API and notifications  
4. **Week 4**: Testing and deployment

---

**Remember**: Ship fast, iterate based on feedback. Don't over-engineer the MVP.