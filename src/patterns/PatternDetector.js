const { patternLogger } = require('../utils/simple-logger');

class PatternDetector {
  constructor() {
    // Load thresholds from environment or use defaults
    this.thresholds = {
      dormantDays: {
        notable: parseInt(process.env.DORMANT_DAYS_NOTABLE || '30'),
        critical: parseInt(process.env.DORMANT_DAYS_CRITICAL || '180')
      },
      largeMovement: {
        notable: parseFloat(process.env.LARGE_MOVEMENT_NOTABLE || '10000'),
        important: parseFloat(process.env.LARGE_MOVEMENT_IMPORTANT || '100000'),
        critical: parseFloat(process.env.LARGE_MOVEMENT_CRITICAL || '1000000')
      },
      coordinationWindow: parseInt(process.env.COORDINATION_WINDOW_MINUTES || '60') * 60 * 1000,
      minCoordinatedWhales: parseInt(process.env.MIN_COORDINATED_WHALES || '3')
    };
    
    patternLogger.info('PatternDetector initialized', {
      thresholds: this.thresholds
    });
  }

  // 1. Dormant Awakening Detection
  detectDormantAwakening(current, previous) {
    patternLogger.debug('Detecting dormant awakenings');
    const alerts = [];
    
    if (!current || !previous) {
      patternLogger.warn('Missing snapshot data for dormant detection');
      return alerts;
    }
    
    // Create lookup map for previous accounts
    const prevMap = new Map();
    previous.accounts.forEach(acc => prevMap.set(acc.address, acc));
    
    current.accounts.forEach(account => {
      const prevAccount = prevMap.get(account.address);
      if (!prevAccount) {
        patternLogger.debug(`New account detected: ${account.address.slice(0, 8)}...`);
        return;
      }
      
      // Check if balance changed
      const balanceChanged = Math.abs(account.balanceFloat - prevAccount.balanceFloat) > 0.01;
      
      if (balanceChanged) {
        // Calculate dormancy period
        const lastActiveDate = new Date(prevAccount.lastActive);
        const daysDormant = Math.floor((Date.now() - lastActiveDate) / (1000 * 60 * 60 * 24));
        
        if (daysDormant >= this.thresholds.dormantDays.notable) {
          const severity = daysDormant >= this.thresholds.dormantDays.critical ? 'CRITICAL' : 'IMPORTANT';
          
          alerts.push({
            severity,
            type: 'DORMANT_AWAKENING',
            message: `Dormant whale awakens after ${daysDormant} days!`,
            address: account.address,
            amount: Math.abs(account.balanceFloat - prevAccount.balanceFloat),
            daysDormant,
            lastActive: prevAccount.lastActive,
            timestamp: new Date().toISOString()
          });
          
          patternLogger.warn(`Dormant awakening detected: ${account.address.slice(0, 8)}... after ${daysDormant} days`);
        }
      }
    });
    
    patternLogger.info(`Dormant detection complete: ${alerts.length} alerts`);
    return alerts;
  }

  // 2. Large Movement Detection
  detectLargeMovements(current, previous) {
    patternLogger.debug('Detecting large movements');
    const alerts = [];
    
    if (!current || !previous) {
      patternLogger.warn('Missing snapshot data for movement detection');
      return alerts;
    }
    
    const prevMap = new Map();
    previous.accounts.forEach(acc => prevMap.set(acc.address, acc));
    
    current.accounts.forEach(account => {
      const prevAccount = prevMap.get(account.address);
      if (!prevAccount) return;
      
      const change = account.balanceFloat - prevAccount.balanceFloat;
      const absChange = Math.abs(change);
      
      if (absChange >= this.thresholds.largeMovement.notable) {
        let severity = 'NOTABLE';
        if (absChange >= this.thresholds.largeMovement.critical) {
          severity = 'CRITICAL';
        } else if (absChange >= this.thresholds.largeMovement.important) {
          severity = 'IMPORTANT';
        }
        
        const direction = change > 0 ? 'incoming' : 'outgoing';
        const percentChange = (absChange / prevAccount.balanceFloat * 100).toFixed(2);
        
        alerts.push({
          severity,
          type: 'LARGE_MOVEMENT',
          message: `Large ${direction} transfer detected: ${absChange.toFixed(2)} DOT (${percentChange}%)`,
          address: account.address,
          amount: absChange,
          direction,
          percentChange: parseFloat(percentChange),
          previousBalance: prevAccount.balanceFloat,
          currentBalance: account.balanceFloat,
          timestamp: new Date().toISOString()
        });
        
        patternLogger.warn(`Large movement: ${account.address.slice(0, 8)}... ${direction} ${absChange.toFixed(2)} DOT`);
      }
    });
    
    patternLogger.info(`Movement detection complete: ${alerts.length} alerts`);
    return alerts;
  }

  // 3. Unbonding Detection (28-day cycle)
  detectUnbonding(current, previous) {
    patternLogger.debug('Detecting unbonding activity');
    const alerts = [];
    
    if (!current || !previous) return alerts;
    
    const prevMap = new Map();
    previous.accounts.forEach(acc => prevMap.set(acc.address, acc));
    
    current.accounts.forEach(account => {
      const prevAccount = prevMap.get(account.address);
      if (!prevAccount) return;
      
      // Detect significant balance decrease (potential unbonding)
      const decrease = prevAccount.balanceFloat - account.balanceFloat;
      
      if (decrease > 1000) { // At least 1000 DOT decrease
        alerts.push({
          severity: decrease > 100000 ? 'IMPORTANT' : 'NOTABLE',
          type: 'UNBONDING_DETECTED',
          message: `Potential unbonding detected: ${decrease.toFixed(2)} DOT`,
          address: account.address,
          amount: decrease,
          unbondingCompleteDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
          timestamp: new Date().toISOString()
        });
        
        patternLogger.info(`Unbonding detected: ${account.address.slice(0, 8)}... ${decrease.toFixed(2)} DOT`);
      }
    });
    
    return alerts;
  }

  // 4. New Whale Formation
  detectNewWhales(current, previous) {
    patternLogger.debug('Detecting new whale formation');
    const alerts = [];
    
    if (!current) return alerts;
    
    // If no previous snapshot, all are new
    const prevAddresses = new Set();
    if (previous) {
      previous.accounts.forEach(acc => prevAddresses.add(acc.address));
    }
    
    current.accounts.forEach(account => {
      if (!prevAddresses.has(account.address)) {
        alerts.push({
          severity: account.balanceFloat > 1000000 ? 'IMPORTANT' : 'NOTABLE',
          type: 'NEW_WHALE',
          message: `New whale entered top ${current.accounts.length}: ${account.balanceFloat.toFixed(2)} DOT`,
          address: account.address,
          amount: account.balanceFloat,
          rank: current.accounts.indexOf(account) + 1,
          timestamp: new Date().toISOString()
        });
        
        patternLogger.info(`New whale: ${account.address.slice(0, 8)}... with ${account.balanceFloat.toFixed(2)} DOT`);
      }
    });
    
    // Also check for accounts that dropped out
    if (previous) {
      const currentAddresses = new Set(current.accounts.map(acc => acc.address));
      
      previous.accounts.forEach(account => {
        if (!currentAddresses.has(account.address)) {
          alerts.push({
            severity: 'NOTABLE',
            type: 'WHALE_EXIT',
            message: `Whale dropped out of top ${current.accounts.length}`,
            address: account.address,
            amount: account.balanceFloat,
            timestamp: new Date().toISOString()
          });
          
          patternLogger.info(`Whale exit: ${account.address.slice(0, 8)}... dropped from top list`);
        }
      });
    }
    
    return alerts;
  }

  // 5. Coordination Detection
  detectCoordination(current, previous) {
    patternLogger.debug('Detecting coordinated movements');
    const alerts = [];
    
    if (!current || !previous) return alerts;
    
    const prevMap = new Map();
    previous.accounts.forEach(acc => prevMap.set(acc.address, acc));
    
    // Find all accounts with significant movements
    const movements = [];
    
    current.accounts.forEach(account => {
      const prevAccount = prevMap.get(account.address);
      if (!prevAccount) return;
      
      const change = Math.abs(account.balanceFloat - prevAccount.balanceFloat);
      
      if (change > 10000) { // Significant movement
        movements.push({
          address: account.address,
          change,
          direction: account.balanceFloat > prevAccount.balanceFloat ? 'in' : 'out',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Check if multiple whales moved within coordination window
    if (movements.length >= this.thresholds.minCoordinatedWhales) {
      const totalVolume = movements.reduce((sum, m) => sum + m.change, 0);
      
      alerts.push({
        severity: movements.length >= 5 ? 'CRITICAL' : 'IMPORTANT',
        type: 'COORDINATION_DETECTED',
        message: `${movements.length} whales moved within ${this.thresholds.coordinationWindow / 60000} minutes`,
        whaleCount: movements.length,
        totalVolume,
        movements: movements.map(m => ({
          address: m.address.slice(0, 8) + '...' + m.address.slice(-6),
          amount: m.change,
          direction: m.direction
        })),
        timestamp: new Date().toISOString()
      });
      
      patternLogger.warn(`Coordination detected: ${movements.length} whales moved ${totalVolume.toFixed(2)} DOT`);
    }
    
    return alerts;
  }

  // 6. Flow Patterns (Death by 1000 cuts, consolidation)
  detectFlowPatterns(current, previous) {
    patternLogger.debug('Detecting flow patterns');
    const alerts = [];
    
    if (!current || !previous) return alerts;
    
    const prevMap = new Map();
    previous.accounts.forEach(acc => prevMap.set(acc.address, acc));
    
    current.accounts.forEach(account => {
      const prevAccount = prevMap.get(account.address);
      if (!prevAccount) return;
      
      const change = account.balanceFloat - prevAccount.balanceFloat;
      const percentChange = Math.abs(change / prevAccount.balanceFloat * 100);
      
      // Detect rapid draining (death by 1000 cuts)
      if (change < -1000 && percentChange > 10) {
        // This would need transaction data to be more accurate
        alerts.push({
          severity: percentChange > 50 ? 'IMPORTANT' : 'NOTABLE',
          type: 'RAPID_DRAINING',
          message: `Account draining detected: ${percentChange.toFixed(2)}% decrease`,
          address: account.address,
          amount: Math.abs(change),
          percentChange,
          pattern: 'death_by_thousand_cuts',
          timestamp: new Date().toISOString()
        });
        
        patternLogger.warn(`Rapid draining: ${account.address.slice(0, 8)}... lost ${percentChange.toFixed(2)}%`);
      }
      
      // Detect consolidation (large inflows)
      if (change > 50000 && percentChange > 20) {
        alerts.push({
          severity: change > 500000 ? 'IMPORTANT' : 'NOTABLE',
          type: 'CONSOLIDATION',
          message: `Consolidation pattern detected: ${percentChange.toFixed(2)}% increase`,
          address: account.address,
          amount: change,
          percentChange,
          pattern: 'accumulation',
          timestamp: new Date().toISOString()
        });
        
        patternLogger.info(`Consolidation: ${account.address.slice(0, 8)}... gained ${percentChange.toFixed(2)}%`);
      }
    });
    
    return alerts;
  }

  // Main detection method that runs all patterns
  async detectAllPatterns(currentSnapshot, previousSnapshot) {
    patternLogger.section('Running Pattern Detection');
    
    const startTime = Date.now();
    const allAlerts = [];
    
    try {
      // Run all detection algorithms
      const detectors = [
        { name: 'Dormant Awakening', method: this.detectDormantAwakening.bind(this) },
        { name: 'Large Movements', method: this.detectLargeMovements.bind(this) },
        { name: 'Unbonding', method: this.detectUnbonding.bind(this) },
        { name: 'New Whales', method: this.detectNewWhales.bind(this) },
        { name: 'Coordination', method: this.detectCoordination.bind(this) },
        { name: 'Flow Patterns', method: this.detectFlowPatterns.bind(this) }
      ];
      
      for (const detector of detectors) {
        patternLogger.debug(`Running ${detector.name} detection...`);
        
        try {
          const alerts = detector.method(currentSnapshot, previousSnapshot);
          allAlerts.push(...alerts);
          
          if (alerts.length > 0) {
            patternLogger.success(`${detector.name}: Found ${alerts.length} patterns`);
          }
        } catch (error) {
          patternLogger.error(`Error in ${detector.name} detection`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      patternLogger.success('Pattern detection complete', {
        totalAlerts: allAlerts.length,
        duration: `${duration}ms`,
        breakdown: {
          critical: allAlerts.filter(a => a.severity === 'CRITICAL').length,
          important: allAlerts.filter(a => a.severity === 'IMPORTANT').length,
          notable: allAlerts.filter(a => a.severity === 'NOTABLE').length
        }
      });
      
      return allAlerts;
      
    } catch (error) {
      patternLogger.error('Pattern detection failed', error);
      return allAlerts;
    }
  }
}

module.exports = PatternDetector;