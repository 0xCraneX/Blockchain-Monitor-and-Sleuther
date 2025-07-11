"""
Relationship Score Visualization Module
Creates visual representations of relationship strength scores
"""

import matplotlib.pyplot as plt
import numpy as np
from typing import List, Dict, Tuple
import seaborn as sns
from matplotlib.patches import Circle
import matplotlib.patches as mpatches

class ScoreVisualizer:
    """Visualize relationship strength scores"""
    
    def __init__(self):
        # Set style
        plt.style.use('seaborn-v0_8-darkgrid')
        self.colors = {
            'volume': '#3498db',      # Blue
            'frequency': '#2ecc71',   # Green
            'temporal': '#f39c12',    # Orange
            'network': '#9b59b6',     # Purple
            'risk': '#e74c3c',        # Red
            'total': '#34495e'        # Dark gray
        }
        
    def create_radar_chart(self, scores: Dict[str, float], title: str = "Relationship Strength Analysis"):
        """Create a radar chart showing all score components"""
        
        # Prepare data
        categories = ['Volume', 'Frequency', 'Temporal', 'Network', 'Risk (inverted)']
        values = [
            scores.get('volume', 0),
            scores.get('frequency', 0),
            scores.get('temporal', 0),
            scores.get('network', 0),
            100 - scores.get('risk', 0)  # Invert risk for visual consistency
        ]
        
        # Number of variables
        num_vars = len(categories)
        
        # Compute angle for each axis
        angles = [n / float(num_vars) * 2 * np.pi for n in range(num_vars)]
        values += values[:1]
        angles += angles[:1]
        
        # Create figure
        fig, ax = plt.subplots(figsize=(10, 10), subplot_kw=dict(projection='polar'))
        
        # Draw the outline of our data
        ax.plot(angles, values, 'o-', linewidth=2, color=self.colors['total'])
        ax.fill(angles, values, alpha=0.25, color=self.colors['total'])
        
        # Fix axis to go in the right order and start at 12 o'clock
        ax.set_theta_offset(np.pi / 2)
        ax.set_theta_direction(-1)
        
        # Draw axis lines for each angle and label
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(categories, size=12)
        
        # Set y-axis limits and labels
        ax.set_ylim(0, 100)
        ax.set_yticks([20, 40, 60, 80, 100])
        ax.set_yticklabels(['20', '40', '60', '80', '100'], size=10)
        
        # Add grid
        ax.grid(True)
        
        # Add title and total score
        plt.title(title, size=16, y=1.08)
        total_score = scores.get('total', 0)
        plt.text(0.5, -0.1, f'Total Score: {total_score:.1f}/100', 
                transform=ax.transAxes, ha='center', size=14, weight='bold')
        
        return fig
        
    def create_component_breakdown(self, scores: Dict[str, float], details: Dict[str, Dict]):
        """Create a detailed breakdown of score components"""
        
        fig, axes = plt.subplots(2, 3, figsize=(18, 12))
        axes = axes.flatten()
        
        # Volume Score Breakdown
        if 'volume' in details:
            vol_details = details['volume']
            labels = ['Volume\nPercentile', 'Avg Size\nPercentile', 'Relative\nVolume']
            values = [
                vol_details.get('volume_component', 0),
                vol_details.get('avg_size_component', 0),
                vol_details.get('relative_volume_component', 0)
            ]
            max_values = [40, 30, 30]
            self._create_component_bar(axes[0], labels, values, max_values, 
                                     'Volume Score Breakdown', self.colors['volume'])
            
        # Frequency Score Breakdown
        if 'frequency' in details:
            freq_details = details['frequency']
            labels = ['Transfer\nCount', 'Daily\nFrequency', 'Consistency']
            values = [
                freq_details.get('count_component', 0),
                freq_details.get('frequency_component', 0),
                freq_details.get('consistency_component', 0)
            ]
            max_values = [40, 30, 30]
            self._create_component_bar(axes[1], labels, values, max_values,
                                     'Frequency Score Breakdown', self.colors['frequency'])
            
        # Temporal Score Breakdown
        if 'temporal' in details:
            temp_details = details['temporal']
            labels = ['Recency', 'Duration', 'Activity\nPattern']
            values = [
                temp_details.get('recency_component', 0),
                temp_details.get('duration_component', 0),
                temp_details.get('activity_component', 0)
            ]
            max_values = [40, 30, 30]
            self._create_component_bar(axes[2], labels, values, max_values,
                                     'Temporal Score Breakdown', self.colors['temporal'])
            
        # Network Score Breakdown
        if 'network' in details:
            net_details = details['network']
            labels = ['Common\nConnections', 'Centrality', 'Importance']
            values = [
                net_details.get('common_connections_component', 0),
                net_details.get('centrality_component', 0),
                net_details.get('importance_component', 0)
            ]
            max_values = [40, 30, 30]
            self._create_component_bar(axes[3], labels, values, max_values,
                                     'Network Score Breakdown', self.colors['network'])
            
        # Risk Score Breakdown
        if 'risk' in details:
            risk_details = details['risk']
            labels = ['Rapid\nTransfers', 'Round\nNumbers', 'Time\nAnomalies', 'New\nAccount']
            values = [
                risk_details.get('rapid_transfer_risk', 0),
                risk_details.get('round_number_risk', 0),
                risk_details.get('time_anomaly_risk', 0),
                risk_details.get('new_account_risk', 0)
            ]
            max_values = [30, 25, 25, 20]
            self._create_component_bar(axes[4], labels, values, max_values,
                                     'Risk Indicators', self.colors['risk'])
            
        # Overall Score Summary
        self._create_score_summary(axes[5], scores)
        
        plt.tight_layout()
        return fig
        
    def _create_component_bar(self, ax, labels, values, max_values, title, color):
        """Create a bar chart for component breakdown"""
        x = np.arange(len(labels))
        
        # Create bars
        bars = ax.bar(x, values, color=color, alpha=0.7, edgecolor='black', linewidth=1)
        
        # Add max value indicators
        for i, (val, max_val) in enumerate(zip(values, max_values)):
            ax.plot([i-0.4, i+0.4], [max_val, max_val], 'k--', alpha=0.5)
            ax.text(i, val + 1, f'{val:.1f}', ha='center', va='bottom', fontsize=10)
            ax.text(i, max_val + 1, f'/{max_val}', ha='center', va='bottom', fontsize=8, alpha=0.7)
            
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.set_ylabel('Points')
        ax.set_title(title, fontsize=12, weight='bold')
        ax.set_ylim(0, max(max_values) * 1.2)
        
    def _create_score_summary(self, ax, scores):
        """Create a summary visualization of all scores"""
        
        # Prepare data
        score_types = ['Volume', 'Frequency', 'Temporal', 'Network', 'Risk']
        score_values = [
            scores.get('volume', 0),
            scores.get('frequency', 0),
            scores.get('temporal', 0),
            scores.get('network', 0),
            scores.get('risk', 0)
        ]
        colors = [self.colors[k] for k in ['volume', 'frequency', 'temporal', 'network', 'risk']]
        
        # Create horizontal bar chart
        y_pos = np.arange(len(score_types))
        bars = ax.barh(y_pos, score_values, color=colors, alpha=0.7, edgecolor='black', linewidth=1)
        
        # Add value labels
        for i, (bar, value) in enumerate(zip(bars, score_values)):
            ax.text(value + 1, i, f'{value:.1f}', va='center', fontsize=10)
            
        # Add total score
        total_score = scores.get('total', 0)
        ax.text(0.5, -0.8, f'Total Strength Score: {total_score:.1f}/100',
                transform=ax.transAxes, ha='center', fontsize=14, weight='bold',
                bbox=dict(boxstyle='round,pad=0.5', facecolor='yellow', alpha=0.3))
        
        ax.set_yticks(y_pos)
        ax.set_yticklabels(score_types)
        ax.set_xlabel('Score')
        ax.set_xlim(0, 105)
        ax.set_title('Score Summary', fontsize=12, weight='bold')
        
        # Add interpretation
        interpretation = self._get_interpretation(total_score)
        ax.text(0.5, -0.95, interpretation, transform=ax.transAxes, ha='center', 
                fontsize=10, style='italic')
        
    def _get_interpretation(self, score: float) -> str:
        """Get interpretation of score"""
        if score <= 20:
            return "Very Weak Relationship"
        elif score <= 40:
            return "Weak Relationship"
        elif score <= 60:
            return "Moderate Relationship"
        elif score <= 80:
            return "Strong Relationship"
        else:
            return "Very Strong Relationship"
            
    def create_relationship_heatmap(self, relationships: List[Tuple[str, str, float]], 
                                  top_n: int = 20):
        """Create a heatmap of relationship strengths"""
        
        # Get unique addresses
        addresses = set()
        for from_addr, to_addr, _ in relationships[:top_n]:
            addresses.add(from_addr)
            addresses.add(to_addr)
        addresses = sorted(list(addresses))
        
        # Create matrix
        n = len(addresses)
        matrix = np.zeros((n, n))
        addr_to_idx = {addr: i for i, addr in enumerate(addresses)}
        
        for from_addr, to_addr, score in relationships[:top_n]:
            if from_addr in addr_to_idx and to_addr in addr_to_idx:
                i, j = addr_to_idx[from_addr], addr_to_idx[to_addr]
                matrix[i, j] = score
                
        # Create heatmap
        fig, ax = plt.subplots(figsize=(12, 10))
        
        # Use shortened addresses for labels
        labels = [addr[:8] + '...' + addr[-4:] for addr in addresses]
        
        im = ax.imshow(matrix, cmap='YlOrRd', aspect='auto', vmin=0, vmax=100)
        
        # Set ticks and labels
        ax.set_xticks(np.arange(n))
        ax.set_yticks(np.arange(n))
        ax.set_xticklabels(labels, rotation=45, ha='right')
        ax.set_yticklabels(labels)
        
        # Add colorbar
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('Relationship Strength Score', rotation=270, labelpad=20)
        
        # Add title
        ax.set_title('Relationship Strength Heatmap', fontsize=16, weight='bold', pad=20)
        ax.set_xlabel('To Address')
        ax.set_ylabel('From Address')
        
        plt.tight_layout()
        return fig
        
    def create_score_distribution(self, all_scores: List[float]):
        """Create distribution plot of relationship scores"""
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        # Histogram
        ax1.hist(all_scores, bins=20, color=self.colors['total'], alpha=0.7, 
                edgecolor='black', linewidth=1)
        ax1.axvline(np.mean(all_scores), color='red', linestyle='--', 
                   label=f'Mean: {np.mean(all_scores):.1f}')
        ax1.axvline(np.median(all_scores), color='green', linestyle='--',
                   label=f'Median: {np.median(all_scores):.1f}')
        ax1.set_xlabel('Relationship Strength Score')
        ax1.set_ylabel('Count')
        ax1.set_title('Distribution of Relationship Scores')
        ax1.legend()
        
        # Box plot with categories
        categories = []
        for score in all_scores:
            if score <= 20:
                categories.append('Very Weak\n(0-20)')
            elif score <= 40:
                categories.append('Weak\n(21-40)')
            elif score <= 60:
                categories.append('Moderate\n(41-60)')
            elif score <= 80:
                categories.append('Strong\n(61-80)')
            else:
                categories.append('Very Strong\n(81-100)')
                
        # Count by category
        from collections import Counter
        cat_counts = Counter(categories)
        cats = ['Very Weak\n(0-20)', 'Weak\n(21-40)', 'Moderate\n(41-60)', 
                'Strong\n(61-80)', 'Very Strong\n(81-100)']
        counts = [cat_counts[cat] for cat in cats]
        
        bars = ax2.bar(range(len(cats)), counts, color=['#e74c3c', '#f39c12', '#f1c40f', 
                                                        '#2ecc71', '#27ae60'], 
                       alpha=0.7, edgecolor='black', linewidth=1)
        
        # Add count labels
        for bar, count in zip(bars, counts):
            ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                    str(count), ha='center', va='bottom')
            
        ax2.set_xticks(range(len(cats)))
        ax2.set_xticklabels(cats)
        ax2.set_ylabel('Number of Relationships')
        ax2.set_title('Relationships by Strength Category')
        
        plt.tight_layout()
        return fig


# Example usage
if __name__ == "__main__":
    # Example scores and details
    example_scores = {
        'volume': 75.0,
        'frequency': 70.5,
        'temporal': 53.55,
        'network': 67.5,
        'risk': 17.0,
        'total': 61.61
    }
    
    example_details = {
        'volume': {
            'volume_component': 34,
            'avg_size_component': 21,
            'relative_volume_component': 20
        },
        'frequency': {
            'count_component': 36,
            'frequency_component': 22.5,
            'consistency_component': 12
        },
        'temporal': {
            'recency_component': 35,
            'duration_component': 14.8,
            'activity_component': 3.75
        },
        'network': {
            'common_connections_component': 30,
            'centrality_component': 17.5,
            'importance_component': 20
        },
        'risk': {
            'rapid_transfer_risk': 4,
            'round_number_risk': 10,
            'time_anomaly_risk': 3,
            'new_account_risk': 0
        }
    }
    
    # Create visualizer
    viz = ScoreVisualizer()
    
    # Create radar chart
    radar_fig = viz.create_radar_chart(example_scores)
    plt.savefig('relationship_radar_chart.png', dpi=300, bbox_inches='tight')
    
    # Create component breakdown
    breakdown_fig = viz.create_component_breakdown(example_scores, example_details)
    plt.savefig('relationship_score_breakdown.png', dpi=300, bbox_inches='tight')
    
    plt.show()