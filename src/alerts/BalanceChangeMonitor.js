const { monitorLogger } = require('../utils/logger');

class BalanceChangeMonitor {
  constructor(config = {}) {
    this.config = {
      minChangeAmount: config.minChangeAmount || 1000, // 1k DOT minimum change
      minChangePercent: config.minChangePercent || 0.01, // 1% minimum change
      ...config
    };
  }

  async detectBalanceChanges(currentSnapshot, previousSnapshot) {
    monitorLogger.section('Detecting Real Balance Changes');
    
    if (!previousSnapshot || !currentSnapshot) {
      monitorLogger.warn('Missing snapshot data for balance comparison');
      return [];
    }
    
    const alerts = [];
    const previousAccounts = new Map(
      previousSnapshot.accounts.map(acc => [acc.address, acc])
    );
    
    // Check each current account for balance changes
    for (const currentAccount of currentSnapshot.accounts) {
      const previousAccount = previousAccounts.get(currentAccount.address);
      
      if (!previousAccount) {
        // New account in top list
        alerts.push(this.createNewAccountAlert(currentAccount));
        continue;
      }
      
      // Calculate balance change
      const balanceChange = currentAccount.balanceFloat - previousAccount.balanceFloat;
      const percentChange = Math.abs(balanceChange / previousAccount.balanceFloat);
      
      // Check if change is significant
      if (Math.abs(balanceChange) >= this.config.minChangeAmount || 
          percentChange >= this.config.minChangePercent) {
        
        // Check for dormant awakening
        if (!previousAccount.isActive && currentAccount.isActive && balanceChange < 0) {
          alerts.push(this.createDormantAwakeningAlert(currentAccount, previousAccount, balanceChange));
        }
        // Check for large balance changes
        else if (Math.abs(balanceChange) > 10000) {
          alerts.push(this.createBalanceChangeAlert(currentAccount, previousAccount, balanceChange));
        }
      }
      
      // Check for significant locked/reserved changes (unbonding)
      const lockedChange = (parseFloat(currentAccount.locked) || 0) - (parseFloat(previousAccount.locked) || 0);
      if (Math.abs(lockedChange) > 10000) {
        alerts.push(this.createUnbondingAlert(currentAccount, lockedChange));
      }
    }
    
    // Check for coordinated movements
    const coordinatedAlerts = this.detectCoordinatedMovements(currentSnapshot, previousSnapshot);
    alerts.push(...coordinatedAlerts);
    
    monitorLogger.info(`Detected ${alerts.length} balance change alerts`);
    return alerts;
  }

  createBalanceChangeAlert(current, previous, change) {
    const isIncrease = change > 0;
    const changePercent = Math.abs(change / previous.balanceFloat * 100);
    
    return {
      id: `balance_${current.address}_${Date.now()}`,
      type: 'balance_change',
      pattern: isIncrease ? 'balance_increase' : 'balance_decrease',
      severity: Math.abs(change) > 100000 ? 'high' : 'medium',
      title: `Significant Balance ${isIncrease ? 'Increase' : 'Decrease'}`,
      description: `${current.identity || 'Account'} ${isIncrease ? 'gained' : 'lost'} ${Math.abs(change).toLocaleString()} DOT (${changePercent.toFixed(1)}%)`,
      message: `Real balance change detected from snapshot comparison`,
      timestamp: new Date().toISOString(),
      address: current.address,
      amount: Math.abs(Math.floor(change)),
      metadata: {
        previousBalance: previous.balanceFloat,
        currentBalance: current.balanceFloat,
        changeAmount: change,
        changePercent: changePercent,
        identity: current.identity,
        accountType: current.accountType
      }
    };
  }

  createDormantAwakeningAlert(current, previous, change) {
    const dormantDays = Math.floor((Date.now() - new Date(previous.lastActive).getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      id: `dormant_${current.address}_${Date.now()}`,
      type: 'dormant_awakening',
      pattern: 'dormant_awakening',
      severity: 'critical',
      title: 'Dormant Whale Awakening',
      description: `Account dormant for ${dormantDays} days moved ${Math.abs(change).toLocaleString()} DOT`,
      message: `Previously inactive account has become active`,
      timestamp: new Date().toISOString(),
      address: current.address,
      amount: Math.abs(Math.floor(change)),
      metadata: {
        dormantDays,
        lastActiveDate: previous.lastActive,
        identity: current.identity,
        accountType: current.accountType,
        previousBalance: previous.balanceFloat,
        currentBalance: current.balanceFloat
      }
    };
  }

  createUnbondingAlert(account, lockedChange) {
    const isUnbonding = lockedChange < 0;
    
    return {
      id: `unbonding_${account.address}_${Date.now()}`,
      type: 'staking_change',
      pattern: isUnbonding ? 'unbonding_started' : 'bonding_increased',
      severity: Math.abs(lockedChange) > 100000 ? 'high' : 'medium',
      title: isUnbonding ? 'Large Unbonding Started' : 'Staking Increased',
      description: `${account.identity || 'Account'} ${isUnbonding ? 'started unbonding' : 'increased stake by'} ${Math.abs(lockedChange).toLocaleString()} DOT`,
      message: `Significant staking position change detected`,
      timestamp: new Date().toISOString(),
      address: account.address,
      amount: Math.abs(Math.floor(lockedChange)),
      metadata: {
        lockedAmount: parseFloat(account.locked) || 0,
        changeAmount: lockedChange,
        identity: account.identity,
        accountType: account.accountType,
        unbondingPeriod: isUnbonding ? '28 days' : null
      }
    };
  }

  createNewAccountAlert(account) {
    return {
      id: `new_whale_${account.address}_${Date.now()}`,
      type: 'new_whale',
      pattern: 'new_top_account',
      severity: 'medium',
      title: 'New Whale Detected',
      description: `${account.identity || 'New account'} entered top accounts with ${account.balanceFloat.toLocaleString()} DOT`,
      message: `New account detected in top holders`,
      timestamp: new Date().toISOString(),
      address: account.address,
      amount: Math.floor(account.balanceFloat),
      metadata: {
        identity: account.identity,
        accountType: account.accountType,
        balance: account.balanceFloat
      }
    };
  }

  detectCoordinatedMovements(current, previous) {
    const alerts = [];
    const timeWindow = 30 * 60 * 1000; // 30 minutes
    
    // Group accounts by similar balance changes
    const movements = [];
    const previousMap = new Map(previous.accounts.map(acc => [acc.address, acc]));
    
    for (const currentAcc of current.accounts) {
      const previousAcc = previousMap.get(currentAcc.address);
      if (!previousAcc) continue;
      
      const change = currentAcc.balanceFloat - previousAcc.balanceFloat;
      const percentChange = Math.abs(change / previousAcc.balanceFloat);
      
      if (Math.abs(change) > 10000 && percentChange > 0.01) {
        movements.push({
          address: currentAcc.address,
          identity: currentAcc.identity,
          accountType: currentAcc.accountType,
          change,
          percentChange,
          timestamp: new Date(currentAcc.lastActive)
        });
      }
    }
    
    // Find groups of accounts with similar movements
    const groups = this.groupCoordinatedMovements(movements, timeWindow);
    
    for (const group of groups) {
      if (group.length >= 3) {
        const totalMovement = group.reduce((sum, m) => sum + Math.abs(m.change), 0);
        const avgChange = totalMovement / group.length;
        
        alerts.push({
          id: `coordinated_${Date.now()}_${group[0].address.slice(0,8)}`,
          type: 'coordinated_movement',
          pattern: 'coordinated_movement',
          severity: group.length >= 5 ? 'high' : 'medium',
          title: 'Coordinated Movement Pattern',
          description: `${group.length} accounts moved funds within ${timeWindow/60000} minutes`,
          message: `Possible coordinated activity detected`,
          timestamp: new Date().toISOString(),
          address: group[0].address, // Primary address
          amount: Math.floor(avgChange),
          metadata: {
            accountCount: group.length,
            addresses: group.map(g => g.address),
            totalMovement: Math.floor(totalMovement),
            timeWindow: `${timeWindow/60000} minutes`,
            movements: group.map(g => ({
              address: g.address,
              identity: g.identity,
              change: g.change
            }))
          }
        });
      }
    }
    
    return alerts;
  }

  groupCoordinatedMovements(movements, timeWindow) {
    const groups = [];
    const used = new Set();
    
    for (let i = 0; i < movements.length; i++) {
      if (used.has(i)) continue;
      
      const group = [movements[i]];
      used.add(i);
      
      for (let j = i + 1; j < movements.length; j++) {
        if (used.has(j)) continue;
        
        // Check if movements are within time window
        const timeDiff = Math.abs(movements[i].timestamp - movements[j].timestamp);
        if (timeDiff <= timeWindow) {
          // Check if movements are in same direction and similar magnitude
          const sameDirection = Math.sign(movements[i].change) === Math.sign(movements[j].change);
          const similarMagnitude = Math.abs(movements[i].percentChange - movements[j].percentChange) < 0.1;
          
          if (sameDirection && similarMagnitude) {
            group.push(movements[j]);
            used.add(j);
          }
        }
      }
      
      if (group.length >= 3) {
        groups.push(group);
      }
    }
    
    return groups;
  }
}

module.exports = BalanceChangeMonitor;