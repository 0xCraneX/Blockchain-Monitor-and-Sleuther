/**
 * Polkadot Analysis Tool - Overlay Helper Functions
 * 
 * Utility functions for managing permanent graph overlays and their styling.
 * These functions work with the CSS classes defined in overlay-utils.css and style.css.
 */

class OverlayHelpers {
    constructor() {
        this.zoomThresholds = {
            small: 0.75,
            medium: 1.5,
            large: 2.5,
            xlarge: 4.0
        };
    }

    /**
     * Apply zoom-based CSS classes to the overlay container
     * @param {number} zoomLevel - Current zoom level
     * @param {d3.Selection} overlayContainer - D3 selection of overlay container
     */
    updateZoomClasses(zoomLevel, overlayContainer) {
        // Remove existing zoom classes
        overlayContainer.classed('zoom-small zoom-medium zoom-large zoom-xlarge', false);
        
        // Apply appropriate zoom class
        if (zoomLevel <= this.zoomThresholds.small) {
            overlayContainer.classed('zoom-small', true);
        } else if (zoomLevel <= this.zoomThresholds.medium) {
            overlayContainer.classed('zoom-medium', true);
        } else if (zoomLevel <= this.zoomThresholds.large) {
            overlayContainer.classed('zoom-large', true);
        } else {
            overlayContainer.classed('zoom-xlarge', true);
        }
    }

    /**
     * Create a permanent node label with background
     * @param {d3.Selection} container - Container to append to
     * @param {Object} nodeData - Node data object
     * @param {Object} options - Styling options
     * @returns {Object} Object containing background and text elements
     */
    createNodeLabel(container, nodeData, options = {}) {
        const {
            text = this.getNodeDisplayText(nodeData),
            x = 0,
            y = 0,
            offsetY = 25,
            priority = 'medium',
            nodeType = nodeData.nodeType,
            riskLevel = this.getRiskLevel(nodeData.riskScore),
            withBackground = true
        } = options;

        const labelGroup = container.append('g')
            .attr('class', 'permanent-node-label-group')
            .attr('transform', `translate(${x}, ${y + offsetY})`);

        let background, textElement;

        if (withBackground) {
            // Create background first
            background = labelGroup.append('rect')
                .attr('class', `permanent-node-label-bg label-priority-${priority}`)
                .attr('width', text.length * 7 + 8) // Approximate width
                .attr('height', 16)
                .attr('x', -(text.length * 7 + 8) / 2)
                .attr('y', -8);

            // Add background shape class
            background.classed('label-bg-rounded', true);
        }

        // Create text element
        textElement = labelGroup.append('text')
            .attr('class', `permanent-node-label label-priority-${priority} ${withBackground ? 'with-background' : ''}`)
            .attr('x', 0)
            .attr('y', 0)
            .text(text);

        // Apply node type styling
        if (nodeType) {
            textElement.classed(nodeType, true);
        }

        // Apply risk-based styling
        if (riskLevel) {
            textElement.classed(`risk-${riskLevel}`, true);
        }

        // Add fade-in animation
        labelGroup.classed('permanent-overlay-enter', true);

        return {
            group: labelGroup,
            background: background,
            text: textElement,
            updatePosition: (newX, newY) => {
                labelGroup.attr('transform', `translate(${newX}, ${newY + offsetY})`);
            },
            updateText: (newText) => {
                textElement.text(newText);
                if (background) {
                    background
                        .attr('width', newText.length * 7 + 8)
                        .attr('x', -(newText.length * 7 + 8) / 2);
                }
            },
            remove: () => {
                labelGroup.classed('permanent-overlay-exit', true);
                setTimeout(() => labelGroup.remove(), 300);
            }
        };
    }

    /**
     * Create a permanent edge label with background
     * @param {d3.Selection} container - Container to append to
     * @param {Object} edgeData - Edge data object
     * @param {Object} options - Styling options
     * @returns {Object} Object containing background and text elements
     */
    createEdgeLabel(container, edgeData, options = {}) {
        const {
            text = this.getEdgeDisplayText(edgeData),
            x = 0,
            y = 0,
            priority = 'medium',
            edgeType = this.getEdgeType(edgeData),
            withBackground = true
        } = options;

        const labelGroup = container.append('g')
            .attr('class', 'permanent-edge-label-group')
            .attr('transform', `translate(${x}, ${y})`);

        let background, textElement;

        if (withBackground) {
            // Create background first
            background = labelGroup.append('rect')
                .attr('class', `permanent-edge-label-bg label-priority-${priority}`)
                .attr('width', text.length * 6 + 6) // Approximate width
                .attr('height', 14)
                .attr('x', -(text.length * 6 + 6) / 2)
                .attr('y', -7);

            // Add background shape class
            background.classed('label-bg-pill', true);
        }

        // Create text element
        textElement = labelGroup.append('text')
            .attr('class', `permanent-edge-label label-priority-${priority} ${withBackground ? 'with-background' : ''}`)
            .attr('x', 0)
            .attr('y', 0)
            .text(text);

        // Apply edge type styling
        if (edgeType) {
            textElement.classed(edgeType, true);
        }

        // Add fade-in animation
        labelGroup.classed('permanent-overlay-enter', true);

        return {
            group: labelGroup,
            background: background,
            text: textElement,
            updatePosition: (newX, newY) => {
                labelGroup.attr('transform', `translate(${newX}, ${newY})`);
            },
            updateText: (newText) => {
                textElement.text(newText);
                if (background) {
                    background
                        .attr('width', newText.length * 6 + 6)
                        .attr('x', -(newText.length * 6 + 6) / 2);
                }
            },
            remove: () => {
                labelGroup.classed('permanent-overlay-exit', true);
                setTimeout(() => labelGroup.remove(), 300);
            }
        };
    }

    /**
     * Get display text for a node
     * @param {Object} nodeData - Node data object
     * @returns {string} Display text
     */
    getNodeDisplayText(nodeData) {
        if (nodeData.identity && nodeData.identity.display) {
            return nodeData.identity.display;
        }
        
        // Shorten address for display
        const addr = nodeData.address;
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }

    /**
     * Get display text for an edge
     * @param {Object} edgeData - Edge data object
     * @returns {string} Display text
     */
    getEdgeDisplayText(edgeData) {
        if (edgeData.volume && edgeData.volume !== '0') {
            try {
                const volume = Number(BigInt(edgeData.volume) / BigInt('1000000000000'));
                if (volume >= 1000000) {
                    return `${(volume / 1000000).toFixed(1)}M DOT`;
                } else if (volume >= 1000) {
                    return `${(volume / 1000).toFixed(1)}K DOT`;
                } else if (volume >= 1) {
                    return `${volume.toFixed(1)} DOT`;
                } else {
                    return `${volume.toFixed(3)} DOT`;
                }
            } catch (e) {
                console.warn('Error formatting volume:', e);
            }
        }
        
        if (edgeData.count) {
            return `${edgeData.count} tx`;
        }
        
        return 'Connection';
    }

    /**
     * Determine risk level from risk score
     * @param {number} riskScore - Risk score (0-100)
     * @returns {string} Risk level ('low', 'medium', 'high')
     */
    getRiskLevel(riskScore) {
        if (riskScore === undefined || riskScore === null) return null;
        
        if (riskScore >= 70) return 'high';
        if (riskScore >= 30) return 'medium';
        return 'low';
    }

    /**
     * Determine edge type from edge data
     * @param {Object} edgeData - Edge data object
     * @returns {string} Edge type
     */
    getEdgeType(edgeData) {
        if (edgeData.suspiciousPattern) return 'suspicious';
        
        if (edgeData.volume && edgeData.volume !== '0') {
            const volume = Number(BigInt(edgeData.volume) / BigInt('1000000000000'));
            if (volume >= 10000) return 'high-volume';
        }
        
        if (edgeData.count && edgeData.count >= 100) return 'frequent';
        
        return null;
    }

    /**
     * Apply highlight effect to a label
     * @param {d3.Selection} labelElement - Label element to highlight
     * @param {string} type - Type of highlight ('hover', 'selected', 'connected')
     */
    highlightLabel(labelElement, type = 'hover') {
        labelElement.classed('highlighted selected connected', false);
        labelElement.classed(type, true);

        // Apply background highlight if it exists
        const background = labelElement.select('.permanent-node-label-bg, .permanent-edge-label-bg');
        if (!background.empty()) {
            background.classed('highlighted selected connected', false);
            background.classed(type, true);
        }
    }

    /**
     * Remove highlight effect from a label
     * @param {d3.Selection} labelElement - Label element to unhighlight
     */
    unhighlightLabel(labelElement) {
        labelElement.classed('highlighted selected connected', false);

        // Remove background highlight if it exists
        const background = labelElement.select('.permanent-node-label-bg, .permanent-edge-label-bg');
        if (!background.empty()) {
            background.classed('highlighted selected connected', false);
        }
    }

    /**
     * Update label priority (visual importance)
     * @param {d3.Selection} labelElement - Label element to update
     * @param {string} priority - Priority level ('low', 'medium', 'high', 'critical')
     */
    updateLabelPriority(labelElement, priority) {
        labelElement.classed('label-priority-low label-priority-medium label-priority-high label-priority-critical', false);
        labelElement.classed(`label-priority-${priority}`, true);

        // Update background if it exists
        const background = labelElement.select('.permanent-node-label-bg, .permanent-edge-label-bg');
        if (!background.empty()) {
            background.classed('label-priority-low label-priority-medium label-priority-high label-priority-critical', false);
            background.classed(`label-priority-${priority}`, true);
        }
    }

    /**
     * Apply animation to a label
     * @param {d3.Selection} labelElement - Label element to animate
     * @param {string} animation - Animation type ('pulse', 'blink', 'glow')
     * @param {number} duration - Animation duration in seconds (optional)
     */
    animateLabel(labelElement, animation, duration = 0) {
        // Remove existing animation classes
        labelElement.classed('label-pulse label-pulse-fast label-pulse-slow label-blink label-glow-soft label-glow-medium label-glow-strong', false);
        
        switch (animation) {
            case 'pulse':
                labelElement.classed('label-pulse', true);
                break;
            case 'pulse-fast':
                labelElement.classed('label-pulse-fast', true);
                break;
            case 'pulse-slow':
                labelElement.classed('label-pulse-slow', true);
                break;
            case 'blink':
                labelElement.classed('label-blink', true);
                break;
            case 'glow':
                labelElement.classed('label-glow-medium', true);
                break;
        }

        // Remove animation after duration if specified
        if (duration > 0) {
            setTimeout(() => {
                this.stopAnimation(labelElement);
            }, duration * 1000);
        }
    }

    /**
     * Stop all animations on a label
     * @param {d3.Selection} labelElement - Label element to stop animating
     */
    stopAnimation(labelElement) {
        labelElement.classed('label-pulse label-pulse-fast label-pulse-slow label-blink label-glow-soft label-glow-medium label-glow-strong', false);
    }

    /**
     * Calculate optimal label positioning to avoid overlaps
     * @param {Array} existingLabels - Array of existing label positions
     * @param {number} x - Desired x position
     * @param {number} y - Desired y position
     * @param {number} width - Label width
     * @param {number} height - Label height
     * @returns {Object} Adjusted position {x, y}
     */
    calculateLabelPosition(existingLabels, x, y, width = 60, height = 16) {
        const padding = 4;
        let adjustedX = x;
        let adjustedY = y;
        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            let collision = false;
            
            for (const existing of existingLabels) {
                if (this.isOverlapping(
                    adjustedX - width/2, adjustedY - height/2, width, height,
                    existing.x - existing.width/2, existing.y - existing.height/2, existing.width, existing.height,
                    padding
                )) {
                    collision = true;
                    break;
                }
            }
            
            if (!collision) {
                break;
            }
            
            // Try different positions
            const angle = (attempts * 45) % 360;
            const radius = 20 + (Math.floor(attempts / 8) * 10);
            adjustedX = x + Math.cos(angle * Math.PI / 180) * radius;
            adjustedY = y + Math.sin(angle * Math.PI / 180) * radius;
            
            attempts++;
        }

        return { x: adjustedX, y: adjustedY };
    }

    /**
     * Check if two rectangles overlap
     * @param {number} x1 - First rectangle x
     * @param {number} y1 - First rectangle y
     * @param {number} w1 - First rectangle width
     * @param {number} h1 - First rectangle height
     * @param {number} x2 - Second rectangle x
     * @param {number} y2 - Second rectangle y
     * @param {number} w2 - Second rectangle width
     * @param {number} h2 - Second rectangle height
     * @param {number} padding - Additional padding
     * @returns {boolean} True if overlapping
     */
    isOverlapping(x1, y1, w1, h1, x2, y2, w2, h2, padding = 0) {
        return !(x1 + w1 + padding < x2 || 
                 x2 + w2 + padding < x1 || 
                 y1 + h1 + padding < y2 || 
                 y2 + h2 + padding < y1);
    }

    /**
     * Update label visibility based on zoom level and importance
     * @param {d3.Selection} overlayContainer - Container with all labels
     * @param {number} zoomLevel - Current zoom level
     * @param {Object} options - Visibility options
     */
    updateLabelVisibility(overlayContainer, zoomLevel, options = {}) {
        const {
            showNodeLabels = true,
            showEdgeLabels = zoomLevel > 1.2,
            minZoomForAll = 0.5,
            hideThreshold = 0.3
        } = options;

        // Hide all labels if zoomed out too far
        if (zoomLevel < hideThreshold) {
            overlayContainer.selectAll('.permanent-node-label-group, .permanent-edge-label-group')
                .classed('label-hidden', true);
            return;
        }

        // Show/hide node labels
        overlayContainer.selectAll('.permanent-node-label-group')
            .classed('label-hidden', !showNodeLabels);

        // Show/hide edge labels based on zoom and settings
        overlayContainer.selectAll('.permanent-edge-label-group')
            .classed('label-hidden', !showEdgeLabels);

        // Show only high priority labels when zoomed out
        if (zoomLevel < minZoomForAll) {
            overlayContainer.selectAll('.label-priority-low, .label-priority-medium')
                .classed('label-hidden', true);
        } else {
            overlayContainer.selectAll('.label-priority-low, .label-priority-medium')
                .classed('label-hidden', false);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OverlayHelpers;
} else if (typeof window !== 'undefined') {
    window.OverlayHelpers = OverlayHelpers;
}