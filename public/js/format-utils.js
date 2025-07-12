/**
 * Format utilities for displaying DOT amounts
 * Based on FollowTheDot implementation
 */

class FormatUtils {
    /**
     * Format a bigint value to human-readable DOT amount
     * @param {bigint|string|number} value - Amount in planck (smallest unit)
     * @param {number} decimals - Decimal places for the chain (10 for Polkadot)
     * @param {number} formatDecimals - Decimal places to display (usually 2)
     * @param {string} ticker - Currency ticker (DOT, KSM, etc.)
     * @returns {string} Formatted amount like "1,234.56 DOT"
     */
    static formatNumber(value, decimals = 10, formatDecimals = 2, ticker = 'DOT') {
        // Convert to BigInt if not already
        // Handle decimal numbers by truncating to integer
        let processedValue = value;
        if (typeof value === 'number' && !Number.isInteger(value)) {
            processedValue = Math.floor(value);
        } else if (typeof value === 'string' && value.includes('.')) {
            processedValue = value.split('.')[0];
        }
        const bigValue = typeof processedValue === 'bigint' ? processedValue : BigInt(processedValue || 0);
        
        // Convert to string and pad with zeros
        let str = bigValue.toString();
        
        // Handle negative values
        const isNegative = str.startsWith('-');
        if (isNegative) str = str.substring(1);
        
        // Pad with zeros if needed
        while (str.length <= decimals) {
            str = '0' + str;
        }
        
        // Insert decimal point
        const integerPart = str.substring(0, str.length - decimals) || '0';
        const decimalPart = str.substring(str.length - decimals);
        
        // Format integer part with thousands separators
        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        
        // Truncate decimal part to desired places
        const truncatedDecimal = decimalPart.substring(0, formatDecimals);
        
        // Build result
        let result = formattedInteger;
        if (formatDecimals > 0 && truncatedDecimal !== '00') {
            result += '.' + truncatedDecimal;
        }
        
        // Add ticker
        if (ticker) {
            result += ' ' + ticker;
        }
        
        // Add negative sign back
        if (isNegative) {
            result = '-' + result;
        }
        
        return result;
    }
    
    /**
     * Format balance for display on nodes
     */
    static formatBalance(balance) {
        return this.formatNumber(balance, 10, 2, 'DOT');
    }
    
    /**
     * Format transfer amount for display on edges
     * Shows count and volume like "5 ⇆ 1,234.56 DOT"
     */
    static formatTransfer(count, volume) {
        const formattedVolume = this.formatNumber(volume, 10, 2, 'DOT');
        return `${count} ⇆ ${formattedVolume}`;
    }
    
    /**
     * Get scale value for visual representation (0-1)
     * Used for stroke width, opacity, etc.
     */
    static getVisualScale(value, min, max) {
        // Handle decimal numbers by truncating to integer
        const processValue = (v) => {
            if (typeof v === 'number' && !Number.isInteger(v)) {
                return Math.floor(v);
            } else if (typeof v === 'string' && v.includes('.')) {
                return v.split('.')[0];
            }
            return v;
        };
        
        const bigValue = typeof value === 'bigint' ? value : BigInt(processValue(value) || 0);
        const bigMin = typeof min === 'bigint' ? min : BigInt(processValue(min) || 0);
        const bigMax = typeof max === 'bigint' ? max : BigInt(processValue(max) || 1);
        
        if (bigValue <= bigMin) return 0;
        if (bigValue >= bigMax) return 1;
        
        // Scale logarithmically for better visual distribution
        const logValue = Math.log10(Number(bigValue - bigMin) + 1);
        const logMax = Math.log10(Number(bigMax - bigMin) + 1);
        
        return logValue / logMax;
    }
}

// Make available globally
window.FormatUtils = FormatUtils;