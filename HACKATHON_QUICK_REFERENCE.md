# 🚀 Hackathon Quick Reference Card

## Core Command Sequence
```bash
# 1. Start project (2 min)
git clone [repo] && cd polkadot-whale-monitor
npm install
cp .env.example .env  # Add Subscan API key

# 2. Run monitor (instant)
npm start             # Normal mode
npm run demo         # Demo mode
npm run demo:fast    # Accelerated demo

# 3. Emergency commands
npm run offline      # No internet fallback
npm run reset        # Clear bad data
npm run benchmark    # Performance test
```

## Key Files to Edit
1. `.env` - API keys and config
2. `config/thresholds.json` - Adjust sensitivity
3. `data/demo/scenarios.json` - Demo scripts

## Pattern Detection Priorities
1. **Dormant Awakening** ⭐⭐⭐ (Most dramatic)
2. **Large Movements** ⭐⭐⭐ (Easy to explain)
3. **Coordination** ⭐⭐ (Visually compelling)
4. **Unbonding** ⭐⭐ (Polkadot-specific)
5. **New Whales** ⭐ (If time permits)
6. **Flow Patterns** ⭐ (Advanced)

## Demo Talk Track (3 min)
- **0:00** "Real-time whale intelligence for Polkadot"
- **0:30** Show live alert (dormant whale)
- **1:00** Explain pattern detection
- **1:30** Show coordination graph
- **2:00** Demonstrate query: "Show me exchange flows"
- **2:30** Vision: "This is just the beginning..."
- **3:00** "Questions?"

## Alert Severity Quick Guide
- 🔴 **CRITICAL**: >180 days dormant OR >1M DOT
- 🟡 **IMPORTANT**: >30 days dormant OR >100k DOT
- 🟢 **NOTABLE**: Any interesting pattern

## Performance Targets
- ✅ <5 min full cycle
- ✅ <100MB RAM
- ✅ <2s pattern detection
- ✅ 1000 accounts monitored

## Troubleshooting
| Problem | Solution |
|---------|----------|
| API rate limit | Increase cache TTL |
| No alerts | Lower thresholds, use demo mode |
| Slow performance | Reduce account count to 500 |
| Memory issues | Enable streaming mode |
| Network error | Switch to offline mode |

## Judge Questions & Answers
**Q: How is this different from Nansen?**
A: Polkadot-native, real-time focus, open source

**Q: What's the business model?**
A: Freemium - Free tier (100 accounts), Pro ($50/mo), Enterprise ($500/mo)

**Q: Can it scale?**
A: Yes - parallel processing, efficient algorithms, database-ready

**Q: What about privacy?**
A: All data is public on-chain, we just make it accessible

## Last Minute Checklist
- [ ] API key in .env
- [ ] Demo data ready
- [ ] Offline mode tested
- [ ] Laptop plugged in
- [ ] Console font size increased
- [ ] Background apps closed
- [ ] Do not disturb mode on

## Remember
- **Show, don't tell** - Let the alerts speak
- **Keep it simple** - Don't over-explain
- **Stay calm** - Technical issues are normal
- **Have fun** - Enthusiasm is contagious

## Emergency Contacts
- Team chat: [Your channel]
- Subscan API status: https://subscan.io/status
- Backup demo: http://localhost:3000/demo