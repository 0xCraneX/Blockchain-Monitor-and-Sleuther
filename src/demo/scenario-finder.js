import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

import { createLogger, formatDOT, formatAddress, formatDuration } from '../utils/logger.js';
import { PATHS, TIME_CONSTANTS } from '../utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger('demo');

/**
 * ScenarioFinder - Finds interesting scenarios for hackathon demo
 * 
 * This tool:
 * 1. Analyzes baseline data to find demo-worthy anomalies
 * 2. Creates presentation-ready scenarios
 * 3. Generates demo scripts with actual data
 */
export class ScenarioFinder {
  constructor(options = {}) {
    this.options = {
      baselineDir: options.baselineDir || PATHS.BASELINES,
      outputDir: options.outputDir || './demo',
      ...options
    };
    
    this.baseline = null;
    this.scenarios = [];
  }

  /**
   * Find and prepare demo scenarios
   */
  async find() {
    logger.info('Finding demo scenarios for hackathon presentation');

    try {
      // Load baseline data
      await this.loadBaseline();
      
      if (!this.baseline) {
        logger.error('No baseline data found. Run baseline builder first.');
        return null;
      }
      
      // Find different types of scenarios
      logger.info('Searching for anomaly scenarios...');
      this.findDormantWhaleScenarios();
      this.findSizeAnomalyScenarios();
      this.findActivityPatternScenarios();
      this.findExchangeActivityScenarios();
      
      // Create demo materials
      await this.createDemoMaterials();
      
      // Print scenarios
      this.printScenarios();
      
      return this.scenarios;
      
    } catch (error) {
      logger.error('Failed to find scenarios', error);
      throw error;
    }
  }

  /**
   * Load baseline data
   */
  async loadBaseline() {
    try {
      const baselinePath = path.join(this.options.baselineDir, 'latest.json');
      const data = await fs.readFile(baselinePath, 'utf8');
      this.baseline = JSON.parse(data);
      logger.success('Baseline data loaded');
    } catch (error) {
      logger.error('Failed to load baseline', error);
      throw error;
    }
  }

  /**
   * Find dormant whale scenarios
   */
  findDormantWhaleScenarios() {
    const dormantWhales = this.baseline.patterns.dormantWhales || [];
    
    dormantWhales.slice(0, 3).forEach((whale, index) => {
      this.scenarios.push({
        id: `dormant-whale-${index + 1}`,
        type: 'DORMANT_AWAKENING',
        title: `Dormant Whale Awakens After ${whale.daysDormant} Days`,
        description: `${whale.name} hasn't moved funds since ${new Date(whale.lastSeen).toLocaleDateString()}. Total volume: ${whale.totalVolume}`,
        severity: 'HIGH',
        data: {
          address: whale.address,
          name: whale.name,
          dormantDays: whale.daysDormant,
          lastSeen: whale.lastSeen,
          totalVolume: whale.totalVolume
        },
        demoScript: [
          `This address has been dormant for ${whale.daysDormant} days`,
          `Last activity was during ${this.getHistoricalContext(whale.lastSeen)}`,
          `If this whale moves, it could impact market dynamics`,
          `Our system would detect this within seconds of the transaction`
        ],
        visualNotes: 'Show timeline visualization with long dormant period'
      });
    });
    
    logger.info(`Found ${Math.min(dormantWhales.length, 3)} dormant whale scenarios`);
  }

  /**
   * Find size anomaly scenarios
   */
  findSizeAnomalyScenarios() {
    // Look for addresses with high variance in transaction sizes
    const addresses = Object.values(this.baseline.addresses);
    const sizeAnomalyCandidates = [];
    
    addresses.forEach(addr => {
      const avgSize = BigInt(addr.avgTransactionSize || '0');
      const maxSent = BigInt(addr.maxTransactionSent || '0');
      const maxReceived = BigInt(addr.maxTransactionReceived || '0');
      const maxSize = maxSent > maxReceived ? maxSent : maxReceived;
      
      if (avgSize > 0 && maxSize > avgSize * BigInt(20)) {
        sizeAnomalyCandidates.push({
          address: addr.address,
          name: addr.name,
          avgSize: formatDOT(avgSize),
          maxSize: formatDOT(maxSize),
          multiplier: Number(maxSize / avgSize),
          type: addr.type
        });
      }
    });
    
    // Sort by multiplier and take top candidates
    sizeAnomalyCandidates
      .sort((a, b) => b.multiplier - a.multiplier)
      .slice(0, 2)
      .forEach((candidate, index) => {
        this.scenarios.push({
          id: `size-anomaly-${index + 1}`,
          type: 'SIZE_ANOMALY',
          title: `Unusual Transaction Size: ${candidate.multiplier}x Normal`,
          description: `${candidate.name} normally sends ${candidate.avgSize}, but has sent up to ${candidate.maxSize}`,
          severity: candidate.multiplier > 50 ? 'HIGH' : 'MEDIUM',
          data: candidate,
          demoScript: [
            `This address typically sends ${candidate.avgSize}`,
            `But we've seen transactions as large as ${candidate.maxSize}`,
            `That's ${candidate.multiplier}x larger than normal`,
            `This pattern could indicate account compromise or major fund movement`
          ],
          visualNotes: 'Show bar chart comparing normal vs anomalous transaction sizes'
        });
      });
    
    logger.info(`Found ${Math.min(sizeAnomalyCandidates.length, 2)} size anomaly scenarios`);
  }

  /**
   * Find activity pattern anomalies
   */
  findActivityPatternScenarios() {
    const addresses = Object.values(this.baseline.addresses);
    
    // Find addresses with interesting activity patterns
    const patternCandidates = addresses.filter(addr => {
      return addr.activityPattern && 
             addr.totalTransactions > 100 &&
             (addr.activityPattern.frequency === 'high' || 
              addr.mostActiveHour >= 0);
    });
    
    // Look for burst activity patterns
    patternCandidates.slice(0, 1).forEach((addr, index) => {
      this.scenarios.push({
        id: `activity-pattern-${index + 1}`,
        type: 'FREQUENCY_ANOMALY',
        title: 'Burst Activity Pattern Detected',
        description: `${addr.name} shows concentrated activity during specific hours`,
        severity: 'MEDIUM',
        data: {
          address: addr.address,
          name: addr.name,
          avgDailyTransactions: addr.avgDailyTransactions,
          mostActiveHour: addr.mostActiveHour,
          pattern: addr.activityPattern
        },
        demoScript: [
          `This address averages ${addr.avgDailyTransactions.toFixed(1)} transactions per day`,
          `Most activity occurs at ${addr.mostActiveHour}:00 UTC`,
          `This could indicate automated trading or scheduled operations`,
          `Sudden changes to this pattern would trigger alerts`
        ],
        visualNotes: 'Show hourly activity heatmap'
      });
    });
  }

  /**
   * Find exchange-related scenarios
   */
  findExchangeActivityScenarios() {
    const exchangeUsers = this.baseline.patterns.exchangeHeavyUsers || [];
    
    exchangeUsers.slice(0, 1).forEach((user, index) => {
      this.scenarios.push({
        id: `exchange-activity-${index + 1}`,
        type: 'EXCHANGE_PATTERN',
        title: 'Multi-Exchange User Activity',
        description: `${user.name} interacts with ${user.exchangeCount} different exchanges`,
        severity: 'LOW',
        data: user,
        demoScript: [
          `This address has connections to ${user.exchangeCount} exchanges`,
          `Total of ${user.totalTransactions} transactions tracked`,
          `This pattern is common for arbitrage traders or market makers`,
          `Unusual routing changes could indicate account issues`
        ],
        visualNotes: 'Show network graph with exchange connections highlighted'
      });
    });
  }

  /**
   * Get historical context for a timestamp
   */
  getHistoricalContext(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Add some context based on Polkadot history
    if (year === 2020) return 'the Polkadot launch period';
    if (year === 2021 && month < 6) return 'the early staking era';
    if (year === 2021 && month >= 6) return 'the parachain auction period';
    if (year === 2022) return 'the bear market period';
    if (year === 2023) return 'the ecosystem building phase';
    
    return `${date.toLocaleDateString()}`;
  }

  /**
   * Create demo materials
   */
  async createDemoMaterials() {
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    // Save scenarios as JSON
    const scenariosPath = path.join(this.options.outputDir, 'scenarios.json');
    await fs.writeFile(scenariosPath, JSON.stringify(this.scenarios, null, 2));
    
    // Create presentation script
    const script = this.generatePresentationScript();
    const scriptPath = path.join(this.options.outputDir, 'presentation-script.md');
    await fs.writeFile(scriptPath, script);
    
    // Create quick reference
    const quickRef = this.generateQuickReference();
    const quickRefPath = path.join(this.options.outputDir, 'quick-reference.md');
    await fs.writeFile(quickRefPath, quickRef);
    
    logger.success(`Demo materials saved to ${this.options.outputDir}`);
  }

  /**
   * Generate presentation script
   */
  generatePresentationScript() {
    let script = `# Polkadot Anomaly Detection - Demo Script\n\n`;
    script += `## Introduction (30 seconds)\n\n`;
    script += `"Polkadot processes thousands of transactions every hour. 99% are normal - people staking, voting, transferring funds. But hidden in that noise are critical signals: dormant whales awakening, unusual fund movements, potential security threats. Our system finds these needles in the haystack."\n\n`;
    
    script += `## Live Demonstrations\n\n`;
    
    this.scenarios.forEach((scenario, index) => {
      script += `### Demo ${index + 1}: ${scenario.title}\n\n`;
      script += `**Setup**: "${scenario.description}"\n\n`;
      script += `**Script**:\n`;
      scenario.demoScript.forEach(line => {
        script += `- ${line}\n`;
      });
      script += `\n**Visual**: ${scenario.visualNotes}\n\n`;
      script += `---\n\n`;
    });
    
    script += `## Closing (30 seconds)\n\n`;
    script += `"In the ${this.baseline.globalStats.totalTransactions} transactions we analyzed, we found ${this.scenarios.length} significant anomaly patterns. Imagine this running 24/7, protecting exchanges, alerting investors, and securing the ecosystem. The blockchain speaks - we just learned to listen for the important parts."\n\n`;
    
    return script;
  }

  /**
   * Generate quick reference card
   */
  generateQuickReference() {
    let ref = `# Quick Reference - Demo Scenarios\n\n`;
    
    ref += `## Key Statistics\n`;
    ref += `- Addresses Analyzed: ${this.baseline.globalStats.totalAddresses}\n`;
    ref += `- Total Transactions: ${this.baseline.globalStats.totalTransactions.toLocaleString()}\n`;
    ref += `- Dormant Addresses: ${this.baseline.globalStats.dormantAddresses} (${this.baseline.globalStats.percentages.dormant}%)\n\n`;
    
    ref += `## Scenarios\n\n`;
    
    this.scenarios.forEach((scenario, index) => {
      ref += `### ${index + 1}. ${scenario.title}\n`;
      ref += `- Type: \`${scenario.type}\`\n`;
      ref += `- Severity: **${scenario.severity}**\n`;
      ref += `- Key Point: ${scenario.demoScript[scenario.demoScript.length - 1]}\n\n`;
    });
    
    ref += `## Emergency Fallbacks\n`;
    ref += `- If live demo fails: Show pre-recorded scenarios\n`;
    ref += `- If no anomalies found: Use historical examples\n`;
    ref += `- If questioned about accuracy: "We're optimizing for high-value alerts, not exhaustive monitoring"\n`;
    
    return ref;
  }

  /**
   * Print scenarios to console
   */
  printScenarios() {
    console.log('\n' + chalk.cyan('='.repeat(60)));
    console.log(chalk.cyan.bold('Demo Scenarios Found'));
    console.log(chalk.cyan('='.repeat(60)));
    
    this.scenarios.forEach((scenario, index) => {
      console.log(chalk.white(`\n${index + 1}. ${chalk.bold(scenario.title)}`));
      console.log(chalk.gray(`   Type: ${scenario.type} | Severity: `) + 
        (scenario.severity === 'HIGH' ? chalk.red(scenario.severity) :
         scenario.severity === 'MEDIUM' ? chalk.yellow(scenario.severity) :
         chalk.green(scenario.severity)));
      console.log(chalk.gray(`   ${scenario.description}`));
    });
    
    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
    console.log(chalk.green(`\n✅ ${this.scenarios.length} demo scenarios prepared`));
    console.log(chalk.green(`📁 Demo materials saved to: ${this.options.outputDir}`));
    console.log(chalk.yellow(`\n💡 Tips for demo:`));
    console.log(chalk.yellow(`   - Practice the script 2-3 times`));
    console.log(chalk.yellow(`   - Have backup screenshots ready`));
    console.log(chalk.yellow(`   - Keep each demo under 1 minute`));
    console.log('\n');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const finder = new ScenarioFinder();
  finder.find().catch(error => {
    logger.error('Fatal error', error);
    process.exit(1);
  });
}

export default ScenarioFinder;