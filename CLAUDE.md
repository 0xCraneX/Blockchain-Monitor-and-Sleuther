# Claude Code Instructions for Polkadot Analysis Tool

## Documentation Requirements
- **ALWAYS** document every concept, decision, and scope agreement in writing
- Create clear stage definitions for any phased implementation
- Update this file with any new project conventions or decisions

## Project Scope - Stage 1

### Core Functionality
1. Fetch top 1000 Polkadot accounts from Subscan API
2. Update account balances every hour
3. Detect and analyze balance deltas (changes)
4. Track specific on-chain activities

### What We're Tracking
1. **Balance Changes**
   - Any increase/decrease in account balance
   - Threshold: Any change > 0

2. **Unbonding Periods**
   - 28-day unbonding cycle for staked DOT
   - Track when large amounts enter unbonding
   - Alert when unbonding period completes

3. **Token Movements**
   - Large transfers (>10,000 DOT)
   - Transfers between tracked accounts
   - Exchange deposits/withdrawals

4. **Dormant Account Awakening**
   - Accounts inactive >30 days that suddenly move funds
   - First transaction after long dormancy

5. **Staking Changes**
   - Validator changes
   - Nomination updates
   - Reward claims

## Technical Decisions
- Use JSON files for data storage (no database in Stage 1)
- Simple Node.js script with cron for hourly updates
- Basic console output for alerts

## Next Stages (To Be Defined)
- Stage 2: Web dashboard
- Stage 3: Real-time monitoring
- Stage 4: Advanced analytics