# Validation Approaches for Polkadot/Hydration Analysis Tool

## 1. Multi-Layer Validation Architecture

### 1.1 Input Validation Layer
```typescript
// src/validators/input.validator.ts
import { z } from 'zod';
import { isAddress, encodeAddress } from '@polkadot/util-crypto';

// Polkadot/Substrate address validation
export const PolkadotAddressSchema = z.string().refine(
  (address) => {
    try {
      return isAddress(address);
    } catch {
      return false;
    }
  },
  { message: 'Invalid Polkadot address format' }
);

// Hydration address validation (prefix 63)
export const HydrationAddressSchema = z.string().refine(
  (address) => {
    try {
      const encoded = encodeAddress(address, 63);
      return encoded.startsWith('7');
    } catch {
      return false;
    }
  },
  { message: 'Invalid Hydration address format' }
);

// Transaction hash validation
export const TransactionHashSchema = z.string().regex(
  /^0x[a-fA-F0-9]{64}$/,
  'Invalid transaction hash format'
);

// Amount validation (string to handle large numbers)
export const AmountSchema = z.string().refine(
  (amount) => {
    try {
      const value = BigInt(amount);
      return value >= 0n;
    } catch {
      return false;
    }
  },
  { message: 'Invalid amount format' }
);

// Complex query validation
export const GraphQuerySchema = z.object({
  addresses: z.array(PolkadotAddressSchema).min(1).max(10),
  depth: z.number().int().min(1).max(5).default(2),
  minAmount: AmountSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeXCM: z.boolean().default(true),
  transactionTypes: z.array(z.enum(['transfer', 'xcm', 'staking', 'governance'])).optional()
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'Start date must be before end date' }
);
```

### 1.2 Business Logic Validation
```typescript
// src/validators/business.validator.ts
export class BusinessValidator {
  // Validate transaction consistency
  async validateTransaction(tx: Transaction): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Check if sender has sufficient balance
    const senderBalance = await this.getBalance(tx.from);
    if (BigInt(senderBalance) < BigInt(tx.amount) + BigInt(tx.fee)) {
      errors.push({
        field: 'amount',
        message: 'Insufficient balance',
        context: { required: tx.amount + tx.fee, available: senderBalance }
      });
    }

    // Validate nonce sequence
    const expectedNonce = await this.getNextNonce(tx.from);
    if (tx.nonce !== expectedNonce) {
      errors.push({
        field: 'nonce',
        message: 'Invalid nonce',
        context: { expected: expectedNonce, provided: tx.nonce }
      });
    }

    // Check for duplicate transaction
    const existing = await this.findTransaction(tx.hash);
    if (existing) {
      errors.push({
        field: 'hash',
        message: 'Transaction already exists',
        context: { existingBlock: existing.blockNumber }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Validate address relationships
  async validateAddressRelationship(from: string, to: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Check if addresses are the same
    if (from === to) {
      errors.push({
        field: 'addresses',
        message: 'Self-transfers require special handling',
        context: { address: from }
      });
    }

    // Check if addresses are on the same chain
    const fromChain = this.getChainFromAddress(from);
    const toChain = this.getChainFromAddress(to);
    
    if (fromChain !== toChain && !this.isXCMEnabled(fromChain, toChain)) {
      errors.push({
        field: 'addresses',
        message: 'Cross-chain transfer not supported between these chains',
        context: { fromChain, toChain }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## 2. Data Integrity Validation

### 2.1 Blockchain Data Verification
```typescript
// src/validators/blockchain.validator.ts
export class BlockchainDataValidator {
  constructor(
    private chainClient: SubstrateClient,
    private db: Database
  ) {}

  // Verify transaction exists on-chain
  async verifyTransaction(txHash: string): Promise<VerificationResult> {
    const dbTx = await this.db.getTransaction(txHash);
    if (!dbTx) {
      return { verified: false, reason: 'Transaction not found in database' };
    }

    try {
      const chainTx = await this.chainClient.getTransaction(txHash);
      
      // Compare critical fields
      const matches = 
        chainTx.from === dbTx.from &&
        chainTx.to === dbTx.to &&
        chainTx.value === dbTx.amount &&
        chainTx.blockNumber === dbTx.blockNumber;

      if (!matches) {
        return {
          verified: false,
          reason: 'Transaction data mismatch',
          differences: this.compareTransactions(chainTx, dbTx)
        };
      }

      return { verified: true };
    } catch (error) {
      return {
        verified: false,
        reason: 'Failed to verify on-chain',
        error: error.message
      };
    }
  }

  // Verify account balance consistency
  async verifyAccountBalance(address: string): Promise<BalanceVerification> {
    const chainBalance = await this.chainClient.getBalance(address);
    const dbBalance = await this.calculateBalanceFromTransactions(address);
    
    const difference = BigInt(chainBalance.free) - BigInt(dbBalance);
    const percentDiff = Number(difference * 100n / BigInt(chainBalance.free));

    return {
      chainBalance: chainBalance.free,
      calculatedBalance: dbBalance,
      difference: difference.toString(),
      percentageDifference: percentDiff,
      isConsistent: Math.abs(percentDiff) < 0.1 // 0.1% tolerance
    };
  }

  // Verify block integrity
  async verifyBlockIntegrity(blockNumber: number): Promise<BlockVerification> {
    const dbBlock = await this.db.getBlock(blockNumber);
    const chainBlock = await this.chainClient.getBlock(blockNumber);

    const dbTxCount = await this.db.getBlockTransactionCount(blockNumber);
    const chainTxCount = chainBlock.extrinsics.filter(
      ext => ext.method.section === 'balances' && ext.method.method === 'transfer'
    ).length;

    return {
      blockNumber,
      hashMatch: dbBlock.hash === chainBlock.hash,
      parentHashMatch: dbBlock.parentHash === chainBlock.parentHash,
      transactionCountMatch: dbTxCount === chainTxCount,
      timestamp: new Date(chainBlock.timestamp)
    };
  }
}
```

### 2.2 Cross-Chain Validation
```typescript
// src/validators/xcm.validator.ts
export class XCMValidator {
  // Validate XCM transfer completion
  async validateXCMTransfer(messageHash: string): Promise<XCMValidation> {
    const sourceEvent = await this.findXCMSentEvent(messageHash);
    const destEvent = await this.findXCMReceivedEvent(messageHash);

    if (!sourceEvent) {
      return {
        valid: false,
        status: 'not_found',
        message: 'XCM sent event not found'
      };
    }

    if (!destEvent) {
      return {
        valid: false,
        status: 'pending',
        message: 'XCM not yet received on destination chain',
        sourceBlock: sourceEvent.blockNumber
      };
    }

    // Validate amounts match (accounting for fees)
    const sentAmount = BigInt(sourceEvent.amount);
    const receivedAmount = BigInt(destEvent.amount);
    const fees = sentAmount - receivedAmount;

    if (fees < 0n) {
      return {
        valid: false,
        status: 'invalid',
        message: 'Received amount exceeds sent amount',
        sentAmount: sentAmount.toString(),
        receivedAmount: receivedAmount.toString()
      };
    }

    // Check reasonable fee range (0.1% - 5%)
    const feePercent = Number(fees * 100n / sentAmount);
    if (feePercent > 5) {
      return {
        valid: false,
        status: 'suspicious',
        message: 'Unusually high XCM fees',
        feePercent
      };
    }

    return {
      valid: true,
      status: 'completed',
      sourceBlock: sourceEvent.blockNumber,
      destBlock: destEvent.blockNumber,
      fees: fees.toString(),
      feePercent
    };
  }
}
```

## 3. Pattern Validation

### 3.1 Suspicious Pattern Validation
```typescript
// src/validators/pattern.validator.ts
export class PatternValidator {
  // Validate detected patterns for false positives
  async validateLayeringPattern(pattern: LayeringPattern): Promise<PatternValidation> {
    const transactions = pattern.transactions;
    
    // Check time consistency
    const timeDiffs = transactions.slice(1).map((tx, i) => 
      tx.timestamp.getTime() - transactions[i].timestamp.getTime()
    );
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b) / timeDiffs.length;
    
    // Too regular timing might indicate automated behavior
    const timeVariance = this.calculateVariance(timeDiffs);
    const isTooRegular = timeVariance < avgTimeDiff * 0.1;

    // Check amount patterns
    const amounts = transactions.map(tx => BigInt(tx.amount));
    const amountDecreases = amounts.slice(1).map((amt, i) => 
      amounts[i] - amt
    );
    
    // Consistent decreases might indicate fees
    const avgDecrease = amountDecreases.reduce((a, b) => a + b) / BigInt(amountDecreases.length);
    const isConsistentDecrease = amountDecreases.every(
      dec => dec > avgDecrease * 8n / 10n && dec < avgDecrease * 12n / 10n
    );

    return {
      pattern: 'layering',
      confidence: pattern.confidence,
      validationScore: this.calculateValidationScore({
        isTooRegular,
        isConsistentDecrease,
        transactionCount: transactions.length,
        uniqueAddresses: new Set(transactions.flatMap(tx => [tx.from, tx.to])).size
      }),
      flags: {
        automatedBehavior: isTooRegular,
        consistentFees: isConsistentDecrease,
        highVelocity: avgTimeDiff < 300000 // Less than 5 minutes
      }
    };
  }

  // Validate mixer detection
  async validateMixerPattern(address: string, pattern: MixerPattern): Promise<MixerValidation> {
    // Get transaction patterns
    const incomingTxs = await this.db.getIncomingTransactions(address, { limit: 1000 });
    const outgoingTxs = await this.db.getOutgoingTransactions(address, { limit: 1000 });

    // Check for mixing characteristics
    const inAmounts = incomingTxs.map(tx => BigInt(tx.amount));
    const outAmounts = outgoingTxs.map(tx => BigInt(tx.amount));

    // Calculate uniformity of output amounts
    const amountFrequency = new Map<string, number>();
    outAmounts.forEach(amt => {
      const key = amt.toString();
      amountFrequency.set(key, (amountFrequency.get(key) || 0) + 1);
    });

    const uniformityScore = this.calculateUniformityScore(amountFrequency);

    // Check timing patterns
    const timingPattern = this.analyzeTimingPattern(outgoingTxs);

    // Check address reuse
    const uniqueRecipients = new Set(outgoingTxs.map(tx => tx.to));
    const addressReuseRatio = uniqueRecipients.size / outgoingTxs.length;

    return {
      address,
      isMixer: pattern.isMixer,
      confidence: pattern.confidence,
      validation: {
        uniformOutputs: uniformityScore > 0.7,
        regularTiming: timingPattern.isRegular,
        lowAddressReuse: addressReuseRatio > 0.9,
        highVolume: incomingTxs.length > 100 && outgoingTxs.length > 100
      },
      metrics: {
        uniformityScore,
        addressReuseRatio,
        avgTimeBetweenOutputs: timingPattern.avgInterval,
        volumeRatio: outgoingTxs.length / incomingTxs.length
      }
    };
  }
}
```

## 4. Performance Validation

### 4.1 Query Performance Validation
```typescript
// src/validators/performance.validator.ts
export class PerformanceValidator {
  private metrics: Map<string, PerformanceMetric[]> = new Map();

  // Validate query performance against SLAs
  async validateQueryPerformance(
    queryName: string,
    executeFn: () => Promise<any>
  ): Promise<PerformanceValidation> {
    const start = performance.now();
    let result: any;
    let error: Error | null = null;

    try {
      result = await executeFn();
    } catch (e) {
      error = e as Error;
    }

    const duration = performance.now() - start;
    
    // Record metric
    this.recordMetric(queryName, {
      duration,
      timestamp: new Date(),
      success: !error
    });

    // Get SLA for this query type
    const sla = this.getSLA(queryName);
    
    // Calculate performance statistics
    const metrics = this.metrics.get(queryName) || [];
    const recentMetrics = metrics.slice(-100); // Last 100 executions
    
    const stats = {
      p50: this.calculatePercentile(recentMetrics, 50),
      p95: this.calculatePercentile(recentMetrics, 95),
      p99: this.calculatePercentile(recentMetrics, 99),
      errorRate: recentMetrics.filter(m => !m.success).length / recentMetrics.length
    };

    const validation = {
      queryName,
      duration,
      withinSLA: duration <= sla.maxDuration,
      sla,
      stats,
      degradation: this.checkForDegradation(queryName),
      result,
      error
    };

    // Alert if performance is degrading
    if (validation.degradation.isDegrading) {
      await this.sendPerformanceAlert(validation);
    }

    return validation;
  }

  // Check for performance degradation
  private checkForDegradation(queryName: string): DegradationCheck {
    const metrics = this.metrics.get(queryName) || [];
    if (metrics.length < 200) {
      return { isDegrading: false };
    }

    const recent = metrics.slice(-50);
    const historical = metrics.slice(-200, -50);

    const recentAvg = this.average(recent.map(m => m.duration));
    const historicalAvg = this.average(historical.map(m => m.duration));

    const degradationPercent = ((recentAvg - historicalAvg) / historicalAvg) * 100;

    return {
      isDegrading: degradationPercent > 20,
      degradationPercent,
      recentAverage: recentAvg,
      historicalAverage: historicalAvg
    };
  }
}
```

### 4.2 Resource Usage Validation
```typescript
// src/validators/resource.validator.ts
export class ResourceValidator {
  // Validate memory usage
  async validateMemoryUsage(): Promise<MemoryValidation> {
    const usage = process.memoryUsage();
    const limits = {
      heapUsed: 1024 * 1024 * 1024, // 1GB
      external: 512 * 1024 * 1024,   // 512MB
      rss: 2048 * 1024 * 1024        // 2GB
    };

    const validation = {
      current: {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss
      },
      limits,
      warnings: [] as string[],
      critical: [] as string[]
    };

    // Check against limits
    if (usage.heapUsed > limits.heapUsed * 0.8) {
      validation.warnings.push(`Heap usage at ${(usage.heapUsed / limits.heapUsed * 100).toFixed(1)}%`);
    }
    if (usage.heapUsed > limits.heapUsed) {
      validation.critical.push('Heap usage exceeds limit');
    }

    return validation;
  }

  // Validate database connection pool
  async validateConnectionPool(): Promise<PoolValidation> {
    const pool = this.db.getPool();
    const stats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };

    const validation = {
      stats,
      healthy: stats.waiting === 0 && stats.idle > 0,
      warnings: [] as string[]
    };

    if (stats.waiting > 0) {
      validation.warnings.push(`${stats.waiting} queries waiting for connection`);
    }
    if (stats.idle === 0) {
      validation.warnings.push('No idle connections available');
    }
    if (stats.total === pool.max) {
      validation.warnings.push('Connection pool at maximum capacity');
    }

    return validation;
  }
}
```

## 5. Continuous Validation Monitoring

### 5.1 Validation Dashboard Metrics
```typescript
// src/monitoring/validation.metrics.ts
export class ValidationMetrics {
  private prometheus = new PrometheusClient();

  // Record validation results
  recordValidation(type: string, result: ValidationResult) {
    this.prometheus.counter('validation_total', {
      type,
      status: result.valid ? 'success' : 'failure'
    }).inc();

    if (!result.valid) {
      result.errors.forEach(error => {
        this.prometheus.counter('validation_errors', {
          type,
          field: error.field,
          reason: error.message
        }).inc();
      });
    }
  }

  // Track validation performance
  recordValidationDuration(type: string, duration: number) {
    this.prometheus.histogram('validation_duration_ms', {
      type
    }).observe(duration);
  }

  // Monitor data quality
  recordDataQuality(metrics: DataQualityMetrics) {
    this.prometheus.gauge('data_completeness_ratio', {
      entity: 'addresses'
    }).set(metrics.addressCompleteness);

    this.prometheus.gauge('data_accuracy_ratio', {
      entity: 'transactions'
    }).set(metrics.transactionAccuracy);

    this.prometheus.gauge('data_consistency_ratio', {
      entity: 'balances'
    }).set(metrics.balanceConsistency);
  }
}
```

### 5.2 Automated Validation Pipeline
```typescript
// src/validation/pipeline.ts
export class ValidationPipeline {
  async runDailyValidation(): Promise<ValidationReport> {
    const report: ValidationReport = {
      timestamp: new Date(),
      results: []
    };

    // 1. Validate recent transactions
    const recentTxs = await this.getRecentTransactions(24); // Last 24 hours
    for (const tx of recentTxs) {
      const result = await this.blockchainValidator.verifyTransaction(tx.hash);
      report.results.push({
        type: 'transaction',
        id: tx.hash,
        ...result
      });
    }

    // 2. Validate account balances
    const activeAccounts = await this.getActiveAccounts(7); // Active in last 7 days
    for (const account of activeAccounts) {
      const result = await this.blockchainValidator.verifyAccountBalance(account);
      report.results.push({
        type: 'balance',
        id: account,
        ...result
      });
    }

    // 3. Validate detected patterns
    const patterns = await this.getRecentPatterns(24);
    for (const pattern of patterns) {
      const result = await this.patternValidator.validate(pattern);
      report.results.push({
        type: 'pattern',
        id: pattern.id,
        ...result
      });
    }

    // 4. Generate summary
    report.summary = this.generateSummary(report.results);

    // 5. Alert on critical issues
    const criticalIssues = report.results.filter(r => r.severity === 'critical');
    if (criticalIssues.length > 0) {
      await this.alerting.sendCriticalAlert(criticalIssues);
    }

    return report;
  }
}
```

## Summary

This comprehensive validation approach ensures:

1. **Input Integrity**: All data entering the system is validated at the edge
2. **Business Logic Consistency**: Core business rules are enforced throughout
3. **Data Accuracy**: Continuous verification against blockchain source of truth
4. **Pattern Reliability**: Suspicious pattern detection is validated to reduce false positives
5. **Performance Assurance**: System performance is continuously monitored and validated
6. **Automated Monitoring**: Daily validation runs ensure ongoing data quality

The multi-layer validation architecture provides defense in depth, catching issues at multiple stages and ensuring the reliability and accuracy of the Polkadot/Hydration analysis tool.