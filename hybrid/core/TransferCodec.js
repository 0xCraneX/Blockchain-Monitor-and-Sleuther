import { u8aToHex, hexToU8a, u8aToString } from '@polkadot/util';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { TypeRegistry } from '@polkadot/types';

export class TransferCodec {
  constructor(config = {}) {
    this.config = {
      ss58Format: config.ss58Format || 0, // Polkadot format
      decimalPlaces: config.decimalPlaces || 10, // DOT has 10 decimal places
      ...config
    };
    
    // Initialize type registry for proper decoding
    this.registry = new TypeRegistry();
    
    // Known event signatures for transfer parsing
    this.eventSignatures = {
      'balances.Transfer': {
        fields: ['AccountId', 'AccountId', 'Balance'],
        names: ['from', 'to', 'amount']
      },
      'balances.Deposit': {
        fields: ['AccountId', 'Balance'],
        names: ['who', 'amount']
      },
      'balances.Withdraw': {
        fields: ['AccountId', 'Balance'],
        names: ['who', 'amount']
      }
    };
    
    console.log('[CODEC] TransferCodec initialized', {
      ss58Format: this.config.ss58Format,
      decimalPlaces: this.config.decimalPlaces
    });
  }
  
  parseTransferEvent(event) {
    try {
      const eventKey = `${event.section}.${event.method}`;
      const signature = this.eventSignatures[eventKey];
      
      if (!signature) {
        console.warn(`[CODEC] Unknown event type: ${eventKey}`);
        return null;
      }
      
      const parsedData = this.decodeEventData(event.data, signature);
      
      if (!parsedData) {
        console.warn(`[CODEC] Failed to decode event data for ${eventKey}`);
        return null;
      }
      
      return {
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        section: event.section,
        method: event.method,
        ...parsedData,
        timestamp: event.timestamp,
        hash: this.generateEventHash(event),
        success: true,
        raw: event
      };
      
    } catch (error) {
      console.error('[CODEC] Error parsing transfer event:', error.message);
      return null;
    }
  }
  
  decodeEventData(eventData, signature) {
    try {
      // Handle different data formats
      let data = eventData;
      
      if (typeof eventData === 'string') {
        // If it's a hex string, convert to array
        if (eventData.startsWith('0x')) {
          data = Array.from(hexToU8a(eventData));
        } else {
          // Try to parse as JSON
          try {
            data = JSON.parse(eventData);
          } catch {
            // If parsing fails, try comma-separated parsing
            data = eventData.split(',').map(item => item.trim());
          }
        }
      }
      
      if (!Array.isArray(data)) {
        console.warn('[CODEC] Event data is not in expected format');
        return null;
      }
      
      const result = {};
      
      for (let i = 0; i < signature.fields.length && i < data.length; i++) {
        const fieldType = signature.fields[i];
        const fieldName = signature.names[i];
        const rawValue = data[i];
        
        result[fieldName] = this.decodeField(rawValue, fieldType);
      }
      
      // Additional processing for specific event types
      if (signature.names.includes('amount')) {
        result.amountDOT = this.formatDOTAmount(result.amount);
      }
      
      return result;
      
    } catch (error) {
      console.error('[CODEC] Error decoding event data:', error.message);
      return null;
    }
  }
  
  decodeField(value, fieldType) {
    try {
      switch (fieldType) {
        case 'AccountId':
          return this.decodeAccountId(value);
          
        case 'Balance':
          return this.decodeBalance(value);
          
        case 'u32':
        case 'u64':
        case 'u128':
          return this.decodeInteger(value);
          
        case 'BlockNumber':
          return this.decodeInteger(value);
          
        default:
          // Try to decode as string if unknown type
          return this.decodeGeneric(value);
      }
    } catch (error) {
      console.error(`[CODEC] Error decoding field type ${fieldType}:`, error.message);
      return value; // Return raw value if decoding fails
    }
  }
  
  decodeAccountId(value) {
    try {
      // Handle different AccountId formats
      if (typeof value === 'string') {
        if (value.length === 48 || value.length === 47) {
          // Already in SS58 format
          return value;
        }
        
        if (value.startsWith('0x')) {
          // Hex format - decode to SS58
          const publicKey = hexToU8a(value);
          return encodeAddress(publicKey, this.config.ss58Format);
        }
      }
      
      if (value instanceof Uint8Array || Array.isArray(value)) {
        // Byte array format
        return encodeAddress(value, this.config.ss58Format);
      }
      
      // If it has a toString method (like codec types)
      if (value && typeof value.toString === 'function') {
        const stringValue = value.toString();
        if (stringValue.length >= 47) {
          return stringValue;
        }
      }
      
      console.warn('[CODEC] Could not decode AccountId:', value);
      return null;
      
    } catch (error) {
      console.error('[CODEC] AccountId decoding error:', error.message);
      return null;
    }
  }
  
  decodeBalance(value) {
    try {
      // Handle different balance formats
      if (typeof value === 'number') {
        return value;
      }
      
      if (typeof value === 'string') {
        // Remove any formatting
        const cleaned = value.replace(/[,_]/g, '');
        return parseInt(cleaned, 10);
      }
      
      if (typeof value === 'bigint') {
        return Number(value);
      }
      
      // If it has toString/toBn methods (like codec types)
      if (value && typeof value.toString === 'function') {
        const stringValue = value.toString();
        return parseInt(stringValue, 10);
      }
      
      if (value && typeof value.toBn === 'function') {
        return value.toBn().toNumber();
      }
      
      console.warn('[CODEC] Could not decode balance:', value);
      return 0;
      
    } catch (error) {
      console.error('[CODEC] Balance decoding error:', error.message);
      return 0;
    }
  }
  
  decodeInteger(value) {
    try {
      if (typeof value === 'number') {
        return value;
      }
      
      if (typeof value === 'string') {
        return parseInt(value, 10);
      }
      
      if (typeof value === 'bigint') {
        return Number(value);
      }
      
      if (value && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      
      if (value && typeof value.toString === 'function') {
        return parseInt(value.toString(), 10);
      }
      
      return 0;
      
    } catch (error) {
      console.error('[CODEC] Integer decoding error:', error.message);
      return 0;
    }
  }
  
  decodeGeneric(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    
    if (typeof value.toString === 'function') {
      return value.toString();
    }
    
    return String(value);
  }
  
  formatDOTAmount(rawAmount) {
    try {
      const amount = typeof rawAmount === 'number' ? rawAmount : parseInt(rawAmount, 10);
      
      if (isNaN(amount)) {
        return 0;
      }
      
      // Convert from Planck to DOT (divide by 10^10)
      const dotAmount = amount / Math.pow(10, this.config.decimalPlaces);
      
      return Math.floor(dotAmount); // Remove decimals as requested
      
    } catch (error) {
      console.error('[CODEC] Error formatting DOT amount:', error.message);
      return 0;
    }
  }
  
  generateEventHash(event) {
    // Create a unique hash for the event
    const hashInput = `${event.blockHash}-${event.section}-${event.method}-${event.phase}`;
    
    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `event-${Math.abs(hash)}-${Date.now()}`;
  }
  
  // Enhanced parsing with codec registry
  parseWithRegistry(api, event) {
    try {
      // Use the API's registry to properly decode events
      if (!api || !api.events) {
        return this.parseTransferEvent(event);
      }
      
      const eventRecord = api.events[event.section][event.method];
      if (!eventRecord) {
        return this.parseTransferEvent(event);
      }
      
      // Create a proper event from the raw data
      const eventType = eventRecord.meta;
      
      // This would be the proper way to decode with full codec support
      // For now, fall back to our manual parsing
      return this.parseTransferEvent(event);
      
    } catch (error) {
      console.error('[CODEC] Registry parsing failed:', error.message);
      return this.parseTransferEvent(event);
    }
  }
  
  // Validation methods
  isValidTransfer(parsedTransfer) {
    if (!parsedTransfer) return false;
    
    // Check required fields
    const requiredFields = ['from', 'to', 'amount'];
    for (const field of requiredFields) {
      if (!parsedTransfer[field]) {
        return false;
      }
    }
    
    // Validate addresses
    if (!this.isValidAddress(parsedTransfer.from) || 
        !this.isValidAddress(parsedTransfer.to)) {
      return false;
    }
    
    // Validate amount
    if (typeof parsedTransfer.amount !== 'number' || 
        parsedTransfer.amount <= 0) {
      return false;
    }
    
    return true;
  }
  
  isValidAddress(address) {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    try {
      // Try to decode the address
      decodeAddress(address);
      return true;
    } catch {
      return false;
    }
  }
  
  // Utility methods
  formatTransferForDisplay(transfer) {
    if (!transfer) return null;
    
    return {
      from: this.formatAddress(transfer.from),
      to: this.formatAddress(transfer.to),
      amount: transfer.amountDOT || transfer.amount,
      amountFormatted: this.formatAmount(transfer.amountDOT || transfer.amount),
      blockNumber: transfer.blockNumber,
      timestamp: transfer.timestamp,
      hash: transfer.hash
    };
  }
  
  formatAddress(address) {
    if (!address) return 'Unknown';
    
    if (address.length > 16) {
      return `${address.slice(0, 8)}...${address.slice(-8)}`;
    }
    
    return address;
  }
  
  formatAmount(amount) {
    if (!amount || amount === 0) return '0 DOT';
    
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M DOT`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K DOT`;
    } else {
      return `${amount.toLocaleString()} DOT`;
    }
  }
  
  // Batch processing
  parseMultipleEvents(events) {
    const results = {
      parsed: [],
      failed: [],
      transfers: [],
      deposits: [],
      withdrawals: []
    };
    
    for (const event of events) {
      try {
        const parsed = this.parseTransferEvent(event);
        
        if (parsed && this.isValidTransfer(parsed)) {
          results.parsed.push(parsed);
          
          // Categorize by type
          switch (parsed.method) {
            case 'Transfer':
              results.transfers.push(parsed);
              break;
            case 'Deposit':
              results.deposits.push(parsed);
              break;
            case 'Withdraw':
              results.withdrawals.push(parsed);
              break;
          }
        } else {
          results.failed.push({
            event,
            reason: 'Invalid transfer data'
          });
        }
      } catch (error) {
        results.failed.push({
          event,
          reason: error.message
        });
      }
    }
    
    return results;
  }
  
  getStats() {
    // Would track parsing statistics in a real implementation
    return {
      totalParsed: 0,
      successRate: '100%',
      averageParseTime: 0,
      supportedEvents: Object.keys(this.eventSignatures)
    };
  }
}