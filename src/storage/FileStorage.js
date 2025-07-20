const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { storageLogger } = require('../utils/logger');

class FileStorage {
  constructor(basePath = './data') {
    this.basePath = basePath;
    this.paths = {
      current: path.join(basePath, 'snapshots', 'current.json'),
      previous: path.join(basePath, 'snapshots', 'previous.json'),
      archive: path.join(basePath, 'snapshots', 'archive'),
      alerts: path.join(basePath, 'alerts'),
      config: path.join(basePath, 'config')
    };
    
    storageLogger.info('FileStorage initialized', {
      basePath: this.basePath,
      paths: this.paths
    });
    
    this._ensureDirectories();
  }

  _ensureDirectories() {
    storageLogger.debug('Ensuring directory structure exists');
    
    Object.values(this.paths).forEach(dirPath => {
      const dir = dirPath.endsWith('.json') ? path.dirname(dirPath) : dirPath;
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        storageLogger.debug(`Created directory: ${dir}`);
      }
    });
    
    storageLogger.success('Directory structure verified');
  }

  async saveSnapshot(accounts) {
    storageLogger.section('Saving Account Snapshot');
    
    const timestamp = new Date().toISOString();
    const snapshot = {
      timestamp,
      count: accounts.length,
      totalBalance: accounts.reduce((sum, acc) => sum + acc.balanceFloat, 0),
      accounts: accounts
    };
    
    storageLogger.info('Preparing snapshot', {
      timestamp,
      accountCount: accounts.length,
      totalBalance: `${snapshot.totalBalance.toFixed(2)} DOT`,
      dataSize: `${JSON.stringify(snapshot).length / 1024} KB`
    });
    
    try {
      // Rotate snapshots: current -> previous
      if (fs.existsSync(this.paths.current)) {
        storageLogger.debug('Rotating current snapshot to previous');
        
        // First check if we need to archive the previous
        if (fs.existsSync(this.paths.previous)) {
          await this._archivePreviousSnapshot();
        }
        
        fs.renameSync(this.paths.current, this.paths.previous);
        storageLogger.debug('Rotation complete');
      }
      
      // Write new current snapshot with atomic write
      const tempFile = `${this.paths.current}.tmp`;
      storageLogger.debug(`Writing to temporary file: ${tempFile}`);
      
      fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2));
      fs.renameSync(tempFile, this.paths.current);
      
      storageLogger.success('Snapshot saved successfully', {
        file: this.paths.current,
        size: `${fs.statSync(this.paths.current).size / 1024} KB`
      });
      
      // Also create a compressed archive
      await this._createArchive(snapshot);
      
      // Clean old archives
      await this._cleanOldArchives();
      
      return true;
      
    } catch (error) {
      storageLogger.error('Failed to save snapshot', error);
      throw error;
    }
  }

  async loadCurrentSnapshot() {
    storageLogger.info('Loading current snapshot');
    
    if (!fs.existsSync(this.paths.current)) {
      storageLogger.warn('No current snapshot found');
      return null;
    }
    
    try {
      const data = fs.readFileSync(this.paths.current, 'utf8');
      const snapshot = JSON.parse(data);
      
      storageLogger.success('Current snapshot loaded', {
        timestamp: snapshot.timestamp,
        accountCount: snapshot.count,
        age: this._getAge(snapshot.timestamp)
      });
      
      return snapshot;
      
    } catch (error) {
      storageLogger.error('Failed to load current snapshot', error);
      return null;
    }
  }

  async loadPreviousSnapshot() {
    storageLogger.info('Loading previous snapshot');
    
    if (!fs.existsSync(this.paths.previous)) {
      storageLogger.warn('No previous snapshot found');
      return null;
    }
    
    try {
      const data = fs.readFileSync(this.paths.previous, 'utf8');
      const snapshot = JSON.parse(data);
      
      storageLogger.success('Previous snapshot loaded', {
        timestamp: snapshot.timestamp,
        accountCount: snapshot.count,
        age: this._getAge(snapshot.timestamp)
      });
      
      return snapshot;
      
    } catch (error) {
      storageLogger.error('Failed to load previous snapshot', error);
      return null;
    }
  }

  async _archivePreviousSnapshot() {
    storageLogger.debug('Archiving previous snapshot');
    
    try {
      const data = fs.readFileSync(this.paths.previous, 'utf8');
      const snapshot = JSON.parse(data);
      
      // Use date from snapshot for archive name
      const date = new Date(snapshot.timestamp);
      const archiveName = `${date.toISOString().split('T')[0]}_${date.getHours()}.json.gz`;
      const archivePath = path.join(this.paths.archive, archiveName);
      
      // Compress and save
      const compressed = zlib.gzipSync(data);
      fs.writeFileSync(archivePath, compressed);
      
      storageLogger.debug('Previous snapshot archived', {
        file: archiveName,
        originalSize: `${data.length / 1024} KB`,
        compressedSize: `${compressed.length / 1024} KB`,
        compressionRatio: `${Math.round((1 - compressed.length / data.length) * 100)}%`
      });
      
    } catch (error) {
      storageLogger.error('Failed to archive previous snapshot', error);
    }
  }

  async _createArchive(snapshot) {
    storageLogger.debug('Creating compressed archive');
    
    const date = new Date(snapshot.timestamp);
    const archiveName = `${date.toISOString().split('.')[0].replace(/:/g, '-')}.json.gz`;
    const archivePath = path.join(this.paths.archive, archiveName);
    
    const data = JSON.stringify(snapshot);
    const compressed = zlib.gzipSync(data);
    
    fs.writeFileSync(archivePath, compressed);
    
    storageLogger.debug('Archive created', {
      file: archiveName,
      compressionRatio: `${Math.round((1 - compressed.length / data.length) * 100)}%`
    });
  }

  async _cleanOldArchives() {
    const maxArchiveDays = parseInt(process.env.MAX_ARCHIVE_DAYS || '7');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxArchiveDays);
    
    storageLogger.debug(`Cleaning archives older than ${maxArchiveDays} days`);
    
    try {
      const files = fs.readdirSync(this.paths.archive);
      let deletedCount = 0;
      
      files.forEach(file => {
        if (!file.endsWith('.json.gz')) return;
        
        const filePath = path.join(this.paths.archive, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedCount++;
          storageLogger.debug(`Deleted old archive: ${file}`);
        }
      });
      
      if (deletedCount > 0) {
        storageLogger.info(`Cleaned ${deletedCount} old archive files`);
      }
      
    } catch (error) {
      storageLogger.error('Failed to clean old archives', error);
    }
  }

  async saveAlert(alert) {
    const date = new Date().toISOString().split('T')[0];
    const alertFile = path.join(this.paths.alerts, `${date}.json`);
    
    storageLogger.debug('Saving alert', {
      severity: alert.severity,
      type: alert.type,
      file: alertFile
    });
    
    try {
      let alerts = [];
      
      if (fs.existsSync(alertFile)) {
        const data = fs.readFileSync(alertFile, 'utf8');
        alerts = JSON.parse(data);
      }
      
      // Handle both single alert and array of alerts
      const alertsToAdd = Array.isArray(alert) ? alert : [alert];
      const timestamp = new Date().toISOString();
      
      // Create a Set of existing IDs to prevent duplicates
      const existingIds = new Set(alerts.map(a => a.id).filter(id => id));
      
      // Add each alert individually with duplicate check
      alertsToAdd.forEach(a => {
        if (a.id && !existingIds.has(a.id)) {
          alerts.push({
            ...a,
            savedAt: timestamp
          });
          existingIds.add(a.id);
        }
      });
      
      fs.writeFileSync(alertFile, JSON.stringify(alerts, null, 2));
      
      storageLogger.debug('Alert saved successfully');
      
    } catch (error) {
      storageLogger.error('Failed to save alert', error);
    }
  }

  async loadAlerts(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const alertFile = path.join(this.paths.alerts, `${targetDate}.json`);
    
    storageLogger.debug(`Loading alerts for ${targetDate}`);
    
    if (!fs.existsSync(alertFile)) {
      storageLogger.debug('No alerts found for date');
      return [];
    }
    
    try {
      const data = fs.readFileSync(alertFile, 'utf8');
      const alerts = JSON.parse(data);
      
      storageLogger.info(`Loaded ${alerts.length} alerts for ${targetDate}`);
      
      return alerts;
      
    } catch (error) {
      storageLogger.error('Failed to load alerts', error);
      return [];
    }
  }

  getStats() {
    const stats = {
      snapshots: {
        current: null,
        previous: null,
        archiveCount: 0,
        totalSize: 0
      },
      alerts: {
        todayCount: 0,
        totalFiles: 0
      }
    };
    
    try {
      // Snapshot stats
      if (fs.existsSync(this.paths.current)) {
        const currentStats = fs.statSync(this.paths.current);
        stats.snapshots.current = {
          size: `${(currentStats.size / 1024).toFixed(2)} KB`,
          modified: currentStats.mtime
        };
      }
      
      if (fs.existsSync(this.paths.previous)) {
        const prevStats = fs.statSync(this.paths.previous);
        stats.snapshots.previous = {
          size: `${(prevStats.size / 1024).toFixed(2)} KB`,
          modified: prevStats.mtime
        };
      }
      
      // Archive stats
      if (fs.existsSync(this.paths.archive)) {
        const archives = fs.readdirSync(this.paths.archive);
        stats.snapshots.archiveCount = archives.length;
        stats.snapshots.totalSize = archives.reduce((sum, file) => {
          const filePath = path.join(this.paths.archive, file);
          return sum + fs.statSync(filePath).size;
        }, 0);
      }
      
      // Alert stats
      if (fs.existsSync(this.paths.alerts)) {
        const alertFiles = fs.readdirSync(this.paths.alerts);
        stats.alerts.totalFiles = alertFiles.length;
        
        const todayAlerts = this.loadAlerts();
        stats.alerts.todayCount = todayAlerts.length;
      }
      
    } catch (error) {
      storageLogger.error('Failed to get storage stats', error);
    }
    
    return stats;
  }

  _getAge(timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(age / 60000);
    
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours`;
    const days = Math.floor(hours / 24);
    return `${days} days`;
  }

  // Methods for tracking processed transfers
  async loadProcessedTransfers() {
    const filePath = path.join(this.paths.data, 'processed-transfers.json');
    
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      storageLogger.error('Failed to load processed transfers', error);
    }
    
    return { transfers: [], lastUpdate: null };
  }

  async saveProcessedTransfers(data) {
    const filePath = path.join(this.paths.data, 'processed-transfers.json');
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      storageLogger.debug('Saved processed transfers', {
        count: data.transfers?.length || 0
      });
    } catch (error) {
      storageLogger.error('Failed to save processed transfers', error);
      throw error;
    }
  }
}

module.exports = FileStorage;