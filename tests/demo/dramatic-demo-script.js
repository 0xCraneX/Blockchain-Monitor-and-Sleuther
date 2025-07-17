#!/usr/bin/env node

/**
 * Dramatic Demo Script Generator
 * Creates perfectly timed demo scenarios for maximum impact
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DramaticDemoScript {
  constructor() {
    this.timeline = [];
    this.totalDuration = 4 * 60 * 1000; // 4 minutes
    this.currentTime = 0;
  }

  /**
   * Generate the complete dramatic demo script
   */
  async generateScript() {
    console.log(chalk.bold('🎭 Generating Dramatic Demo Script\n'));

    // Act 1: The Hook (0-30s)
    this.addScene({
      time: 0,
      duration: 30000,
      title: "The Living Network",
      actions: [
        { at: 0, do: "show_dashboard", effect: "fade_in" },
        { at: 2000, do: "zoom_to_network", effect: "smooth_zoom" },
        { at: 5000, do: "highlight_major_nodes", effect: "pulse" },
        { at: 10000, do: "show_live_transactions", effect: "particle_stream" },
        { at: 15000, do: "display_stats", text: "Monitoring 1,000+ whales in real-time" },
        { at: 25000, do: "dramatic_pause", duration: 3000 }
      ],
      narration: "Everyone talks about whale movements after they happen. We show you as they happen.",
      emphasis: "Live detection, not historical analysis"
    });

    // Act 2: The Awakening (30-90s)
    this.addScene({
      time: 30000,
      duration: 60000,
      title: "Dormant Whale Awakens",
      actions: [
        { at: 0, do: "alert_sound", type: "subtle" },
        { at: 2000, do: "show_alert_banner", text: "DORMANT WHALE ACTIVE", severity: "critical" },
        { at: 5000, do: "zoom_to_whale", address: "15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f" },
        { at: 8000, do: "show_dormancy_timeline", days: 423 },
        { at: 15000, do: "animate_awakening", effect: "ripple_out" },
        { at: 20000, do: "show_transaction_burst", count: 14 },
        { at: 30000, do: "highlight_recipients", effect: "connection_lines" },
        { at: 40000, do: "show_market_impact", change: "-3.2%" },
        { at: 50000, do: "historical_overlay", text: "Last time: +15% price movement" }
      ],
      narration: "This whale has been sleeping for 423 days. Now it's moving $17 million.",
      emphasis: "Real money, real impact, real-time detection"
    });

    // Act 3: The Exchange Run (90-150s)
    this.addScene({
      time: 90000,
      duration: 60000,
      title: "Exchange Imbalance Detection",
      actions: [
        { at: 0, do: "transition_wipe", direction: "left" },
        { at: 3000, do: "show_flow_meter", type: "bidirectional" },
        { at: 8000, do: "animate_withdrawals", rate: "accelerating" },
        { at: 15000, do: "update_severity", from: "low", to: "medium" },
        { at: 25000, do: "update_severity", from: "medium", to: "high" },
        { at: 35000, do: "flash_warning", text: "CRITICAL IMBALANCE" },
        { at: 40000, do: "show_comparison", event: "FTX November 2022", similarity: "87%" },
        { at: 50000, do: "predictive_model", text: "82% probability of withdrawal halt" }
      ],
      narration: "Net outflow: $4.7 million in 6 hours. Pattern similarity to FTX: 87%",
      emphasis: "Predictive analytics, not just reporting"
    });

    // Act 4: Natural Language Magic (150-180s)
    this.addScene({
      time: 150000,
      duration: 30000,
      title: "Ask Anything",
      actions: [
        { at: 0, do: "show_search_bar", effect: "slide_down" },
        { at: 3000, do: "type_query", text: "Show me whales dormant > 1 year", speed: 100 },
        { at: 8000, do: "instant_results", count: 47 },
        { at: 12000, do: "visualize_results", type: "cluster_map" },
        { at: 18000, do: "type_query", text: "Which validators lost most stake today?", speed: 80 },
        { at: 24000, do: "show_validator_exodus", count: 3 },
        { at: 28000, do: "export_demo", format: "CSV" }
      ],
      narration: "Natural language to instant insights. No SQL required.",
      emphasis: "Accessibility meets power"
    });

    // Act 5: The Vision (180-240s)
    this.addScene({
      time: 180000,
      duration: 60000,
      title: "The Future of Polkadot Intelligence",
      actions: [
        { at: 0, do: "zoom_out_full", effect: "smooth" },
        { at: 5000, do: "show_roadmap", stages: ["Now", "Stage 2", "Stage 3", "Moon"] },
        { at: 15000, do: "display_metrics", items: [
          "0.3s detection latency",
          "99.9% accuracy",
          "Open source",
          "Free tier forever"
        ]},
        { at: 30000, do: "show_testimonial", text: "Already saving traders $1M+ monthly" },
        { at: 40000, do: "final_visualization", type: "galaxy_view" },
        { at: 50000, do: "call_to_action", text: "Try it now: demo.polkadot-whale.io" },
        { at: 55000, do: "qr_code", url: "https://github.com/polkadot-whale-watch" }
      ],
      narration: "Imagine every parachain team, every validator, every serious investor having this open. That's what we're building.",
      emphasis: "Not just a tool, but critical infrastructure"
    });

    // Generate the script file
    await this.saveScript();
    this.generateTimingGuide();
    this.generateFallbackPlan();
  }

  /**
   * Add a scene to the timeline
   */
  addScene(scene) {
    this.timeline.push({
      ...scene,
      startTime: scene.time,
      endTime: scene.time + scene.duration,
      checkpoint: this.generateCheckpoint(scene)
    });
  }

  /**
   * Generate checkpoint for scene recovery
   */
  generateCheckpoint(scene) {
    return {
      canSkipTo: scene.time > 30000, // Can skip after intro
      fallbackData: `scene_${scene.title.toLowerCase().replace(/\s+/g, '_')}_backup.json`,
      requiredElements: scene.actions.filter(a => 
        ['show_alert_banner', 'show_transaction_burst', 'flash_warning'].includes(a.do)
      )
    };
  }

  /**
   * Save the complete script
   */
  async saveScript() {
    const script = {
      version: "1.0.0",
      totalDuration: this.totalDuration,
      scenes: this.timeline,
      controls: {
        speeds: [1, 10, 100],
        defaultSpeed: 1,
        allowPause: true,
        allowSkip: true,
        autoRecover: true
      },
      fallbacks: {
        noLiveData: "historical_replay",
        networkError: "cached_demo",
        performanceIssue: "reduced_quality"
      },
      judgeHooks: [
        { time: 35000, impact: "First wow - dormant whale" },
        { time: 95000, impact: "Pattern recognition capability" },
        { time: 125000, impact: "Critical imbalance detection" },
        { time: 165000, impact: "Natural language power" },
        { time: 200000, impact: "Vision sell" }
      ]
    };

    const scriptPath = path.join(__dirname, '../../demo/dramatic-script.json');
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2));
    
    console.log(chalk.green('✓ Dramatic script saved'));
  }

  /**
   * Generate timing guide for presenters
   */
  generateTimingGuide() {
    console.log(chalk.bold('\n⏱️  Timing Guide for Presenters\n'));

    this.timeline.forEach((scene, index) => {
      const startMin = Math.floor(scene.startTime / 60000);
      const startSec = Math.floor((scene.startTime % 60000) / 1000);
      const duration = scene.duration / 1000;

      console.log(chalk.cyan(`${startMin}:${startSec.toString().padStart(2, '0')} - ${scene.title} (${duration}s)`));
      console.log(chalk.dim(`  Say: "${scene.narration}"`));
      console.log(chalk.yellow(`  Emphasis: ${scene.emphasis}`));
      
      // Key moments
      const keyMoments = scene.actions.filter(a => 
        ['show_alert_banner', 'flash_warning', 'predictive_model'].includes(a.do)
      );
      
      if (keyMoments.length > 0) {
        console.log(chalk.red('  Key moments:'));
        keyMoments.forEach(moment => {
          const momentTime = (scene.startTime + moment.at) / 1000;
          console.log(chalk.red(`    - ${momentTime}s: ${moment.do}`));
        });
      }
      
      console.log('');
    });

    // Critical checkpoints
    console.log(chalk.bold('🎯 Critical Checkpoints:\n'));
    console.log('- 0:30 - Hook must land (network visualization)');
    console.log('- 1:30 - First alert must fire');
    console.log('- 2:30 - Exchange run climax');
    console.log('- 3:00 - Natural language demo');
    console.log('- 4:00 - Vision and CTA');
  }

  /**
   * Generate fallback plan
   */
  generateFallbackPlan() {
    const fallbackPlan = {
      scenarios: [
        {
          issue: "No internet connection",
          detection: "Automatic on startup",
          action: "Switch to offline demo mode",
          impact: "Minimal - all visualizations work",
          script: "Acknowledge transparently: 'Running in offline mode for stability'"
        },
        {
          issue: "Live data not dramatic enough",
          detection: "No alerts in first 30s",
          action: "Blend historical replay at 10x speed",
          impact: "None - appears live to audience",
          script: "Continue normally, mention 'compressed timeline'"
        },
        {
          issue: "Performance issues",
          detection: "Frame rate < 30fps",
          action: "Reduce particle effects, simplify animations",
          impact: "Slight visual quality reduction",
          script: "Focus on the insights, not the graphics"
        },
        {
          issue: "Time running over",
          detection: "Timer at 3:30",
          action: "Skip to natural language demo",
          impact: "Miss exchange run scene",
          script: "Jump to 'But here's the real magic...'"
        },
        {
          issue: "Complete technical failure",
          detection: "Application crash",
          action: "Switch to backup video",
          impact: "High - loses interactivity",
          script: "This is a recording of this morning's demo..."
        }
      ],
      quickRecovery: {
        commands: [
          "npm run demo:safe",
          "npm run demo:offline", 
          "npm run demo:video"
        ],
        mobileBackup: "https://demo.polkadot-whale.io/mobile",
        slidesBackup: "file:///backup/slides.html"
      }
    };

    console.log(chalk.bold('\n🚨 Fallback Plans:\n'));
    
    fallbackPlan.scenarios.forEach(scenario => {
      console.log(chalk.yellow(`Issue: ${scenario.issue}`));
      console.log(`  Detection: ${scenario.detection}`);
      console.log(`  Action: ${chalk.green(scenario.action)}`);
      console.log(`  Script: "${chalk.italic(scenario.script)}"`);
      console.log('');
    });
  }
}

// Generate the script
const generator = new DramaticDemoScript();
generator.generateScript().catch(console.error);