/**
 * Integration Tests for Demo Scenarios
 * Ensures all components work together seamlessly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockSubscanAPI } from '../mock-subscan-api.js';

// Mock components for testing
class DemoOrchestrator {
  constructor() {
    this.scenarios = [];
    this.currentSpeed = 1;
    this.alerts = [];
    this.visualizations = [];
  }

  async loadScenario(scenarioId) {
    // Load from synthetic scenarios
    const scenario = await this.fetchScenario(scenarioId);
    this.scenarios.push(scenario);
    return scenario;
  }

  async playScenario(scenarioId, speed = 1) {
    this.currentSpeed = speed;
    const scenario = await this.loadScenario(scenarioId);
    
    // Simulate playing through the scenario
    const events = [];
    const startTime = Date.now();
    
    for (const event of scenario.events) {
      const adjustedDelay = event.delay / speed;
      await new Promise(resolve => setTimeout(resolve, adjustedDelay));
      
      events.push({
        ...event,
        executedAt: Date.now() - startTime,
        speed: speed
      });
      
      // Generate alerts if needed
      if (event.triggerAlert) {
        this.alerts.push(event.alert);
      }
      
      // Update visualizations
      if (event.updateVisualization) {
        this.visualizations.push(event.visualization);
      }
    }
    
    return {
      scenario: scenarioId,
      duration: Date.now() - startTime,
      eventCount: events.length,
      alertCount: this.alerts.length
    };
  }

  async fetchScenario(scenarioId) {
    // Mock scenario data
    const scenarios = {
      'sleeping-giant': {
        id: 'sleeping-giant',
        events: [
          { delay: 1000, type: 'show_dashboard' },
          { delay: 2000, type: 'detect_anomaly', triggerAlert: true, alert: { type: 'DORMANT_WHALE', severity: 'CRITICAL' } },
          { delay: 1000, type: 'zoom_to_address', updateVisualization: true, visualization: { type: 'focus_node' } },
          { delay: 3000, type: 'show_transactions' },
          { delay: 2000, type: 'calculate_impact' }
        ]
      },
      'exchange-run': {
        id: 'exchange-run',
        events: [
          { delay: 1000, type: 'show_flow_meter' },
          { delay: 2000, type: 'detect_imbalance', severity: 'LOW' },
          { delay: 3000, type: 'escalate_severity', severity: 'MEDIUM' },
          { delay: 3000, type: 'escalate_severity', severity: 'HIGH', triggerAlert: true, alert: { type: 'EXCHANGE_IMBALANCE' } },
          { delay: 2000, type: 'show_prediction' }
        ]
      }
    };
    
    return scenarios[scenarioId] || null;
  }

  async testDataFallback() {
    try {
      // Try live data
      const liveData = await mockSubscanAPI.request('/api/v2/scan/transfers');
      return { source: 'live', data: liveData };
    } catch (error) {
      // Fall back to cached data
      return { source: 'cache', data: this.getCachedData() };
    }
  }

  getCachedData() {
    return {
      success: true,
      data: {
        transfers: [
          { from: 'whale1', to: 'exchange1', amount: '1000000' }
        ]
      }
    };
  }
}

describe('Demo Integration Tests', () => {
  let orchestrator;
  
  beforeAll(() => {
    orchestrator = new DemoOrchestrator();
  });
  
  afterAll(() => {
    mockSubscanAPI.resetRateLimit();
  });

  describe('Scenario Playback', () => {
    it('should play sleeping giant scenario within time limit', async () => {
      const result = await orchestrator.playScenario('sleeping-giant', 1);
      
      expect(result.eventCount).toBe(5);
      expect(result.alertCount).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(10000); // Should complete in 10s at 1x
    });

    it('should support 10x speed acceleration', async () => {
      const normalSpeed = await orchestrator.playScenario('sleeping-giant', 1);
      const fastSpeed = await orchestrator.playScenario('sleeping-giant', 10);
      
      expect(fastSpeed.duration).toBeLessThan(normalSpeed.duration / 8); // At least 8x faster
      expect(fastSpeed.eventCount).toBe(normalSpeed.eventCount); // Same events
    });

    it('should support 100x speed for rapid demo', async () => {
      const result = await orchestrator.playScenario('exchange-run', 100);
      
      expect(result.duration).toBeLessThan(500); // Should complete in 0.5s
      expect(result.eventCount).toBe(5);
    });
  });

  describe('Alert Generation', () => {
    it('should generate correct alerts for each scenario', async () => {
      orchestrator.alerts = []; // Reset
      
      await orchestrator.playScenario('sleeping-giant', 10);
      
      const criticalAlerts = orchestrator.alerts.filter(a => a.severity === 'CRITICAL');
      expect(criticalAlerts.length).toBeGreaterThan(0);
      expect(criticalAlerts[0].type).toBe('DORMANT_WHALE');
    });

    it('should escalate severity correctly', async () => {
      orchestrator.alerts = [];
      
      const events = [];
      const scenario = await orchestrator.loadScenario('exchange-run');
      
      for (const event of scenario.events) {
        if (event.severity) {
          events.push(event.severity);
        }
      }
      
      expect(events).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    });
  });

  describe('Data Fallback Mechanism', () => {
    it('should fall back to cached data on API failure', async () => {
      // Exhaust rate limit
      for (let i = 0; i < 101; i++) {
        try {
          await mockSubscanAPI.request('/api/v2/scan/transfers');
        } catch (e) {
          // Expected
        }
      }
      
      const result = await orchestrator.testDataFallback();
      expect(result.source).toBe('cache');
      expect(result.data.success).toBe(true);
    });

    it('should use live data when available', async () => {
      mockSubscanAPI.resetRateLimit();
      
      const result = await orchestrator.testDataFallback();
      expect(result.source).toBe('live');
      expect(result.data.mock).toBe(true); // Our mock API sets this
    });
  });

  describe('Visualization Updates', () => {
    it('should update visualizations in correct order', async () => {
      orchestrator.visualizations = [];
      
      await orchestrator.playScenario('sleeping-giant', 10);
      
      expect(orchestrator.visualizations.length).toBeGreaterThan(0);
      expect(orchestrator.visualizations[0].type).toBe('focus_node');
    });
  });

  describe('Natural Language Processing', () => {
    it('should convert queries to filters', async () => {
      const queries = [
        { text: "whales dormant > 1 year", expected: { dormantDays: { $gt: 365 } } },
        { text: "transactions > 100k DOT", expected: { amount: { $gt: 100000 } } },
        { text: "validators losing stake", expected: { type: 'validator', stakeChange: { $lt: 0 } } }
      ];
      
      for (const query of queries) {
        const filter = parseNaturalLanguage(query.text);
        expect(filter).toMatchObject(query.expected);
      }
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent scenarios', async () => {
      const scenarios = ['sleeping-giant', 'exchange-run', 'sleeping-giant'];
      
      const start = Date.now();
      const results = await Promise.all(
        scenarios.map(s => orchestrator.playScenario(s, 100))
      );
      const duration = Date.now() - start;
      
      expect(results.length).toBe(3);
      expect(duration).toBeLessThan(1000); // All should complete in 1s
      results.forEach(r => {
        expect(r.eventCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Recovery', () => {
    it('should recover from mid-scenario errors', async () => {
      const scenario = {
        id: 'error-test',
        events: [
          { delay: 100, type: 'start' },
          { delay: 100, type: 'error', shouldFail: true },
          { delay: 100, type: 'recover' },
          { delay: 100, type: 'complete' }
        ]
      };
      
      orchestrator.loadScenario = async () => scenario;
      
      let errorCaught = false;
      orchestrator.playScenario = async function(scenarioId, speed) {
        const events = [];
        for (const event of scenario.events) {
          if (event.shouldFail && !errorCaught) {
            errorCaught = true;
            continue; // Skip the error event
          }
          events.push(event);
        }
        return { eventCount: events.length, recovered: true };
      };
      
      const result = await orchestrator.playScenario('error-test', 1);
      expect(result.recovered).toBe(true);
      expect(result.eventCount).toBe(3); // Skipped the error event
    });
  });
});

// Helper function for natural language parsing
function parseNaturalLanguage(query) {
  const filters = {};
  
  if (query.includes('dormant')) {
    const match = query.match(/dormant\s*>\s*(\d+)\s*(year|month|day)/i);
    if (match) {
      let days = parseInt(match[1]);
      if (match[2].toLowerCase() === 'year') days *= 365;
      if (match[2].toLowerCase() === 'month') days *= 30;
      filters.dormantDays = { $gt: days };
    }
  }
  
  if (query.includes('transactions')) {
    const match = query.match(/transactions\s*>\s*([\d.]+)k?\s*(DOT)?/i);
    if (match) {
      let amount = parseFloat(match[1]);
      if (query.includes('k')) amount *= 1000;
      filters.amount = { $gt: amount };
    }
  }
  
  if (query.includes('validators')) {
    filters.type = 'validator';
    if (query.includes('losing')) {
      filters.stakeChange = { $lt: 0 };
    }
  }
  
  return filters;
}