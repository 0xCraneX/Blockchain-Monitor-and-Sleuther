"""
Relationship Strength Scoring System
Python implementation for calculating and visualizing relationship scores
"""

import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import networkx as nx
from dataclasses import dataclass
import json

@dataclass
class RelationshipScore:
    """Data class for storing relationship score components"""
    from_address: str
    to_address: str
    volume_score: float
    frequency_score: float
    temporal_score: float
    network_score: float
    risk_score: float
    total_score: float
    details: Dict

class RelationshipScorer:
    """Calculate relationship strength scores for Polkadot accounts"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()
        
    def calculate_volume_score(self, from_addr: str, to_addr: str) -> Tuple[float, Dict]:
        """Calculate volume-based score (0-100)"""
        cursor = self.conn.cursor()
        
        # Get relationship data
        cursor.execute("""
            SELECT 
                ar.total_volume,
                ar.transfer_count,
                a1.balance as sender_balance,
                a2.balance as receiver_balance
            FROM account_relationships ar
            LEFT JOIN accounts a1 ON ar.from_address = a1.address
            LEFT JOIN accounts a2 ON ar.to_address = a2.address
            WHERE ar.from_address = ? AND ar.to_address = ?
        """, (from_addr, to_addr))
        
        row = cursor.fetchone()
        if not row:
            return 0.0, {}
            
        total_volume = float(row['total_volume'] or 0)
        transfer_count = row['transfer_count'] or 0
        sender_balance = float(row['sender_balance'] or 0)
        
        # Calculate average transfer size
        avg_transfer_size = total_volume / max(transfer_count, 1)
        
        # Get percentiles
        cursor.execute("""
            SELECT 
                COUNT(*) as total_relationships,
                SUM(CASE WHEN CAST(total_volume AS REAL) < ? THEN 1 ELSE 0 END) as volume_rank,
                SUM(CASE WHEN CAST(total_volume AS REAL) / NULLIF(transfer_count, 0) < ? THEN 1 ELSE 0 END) as avg_size_rank
            FROM account_relationships
        """, (total_volume, avg_transfer_size))
        
        stats = cursor.fetchone()
        total_rel = max(stats['total_relationships'], 1)
        
        volume_percentile = stats['volume_rank'] / total_rel
        avg_size_percentile = stats['avg_size_rank'] / total_rel
        
        # Calculate components
        volume_component = min(40, volume_percentile * 40)
        avg_size_component = min(30, avg_size_percentile * 30)
        
        if sender_balance > 0:
            relative_volume_component = min(30, (total_volume / sender_balance) * 100)
        else:
            relative_volume_component = 15
            
        total_score = volume_component + avg_size_component + relative_volume_component
        
        details = {
            'total_volume': total_volume,
            'avg_transfer_size': avg_transfer_size,
            'volume_percentile': volume_percentile,
            'avg_size_percentile': avg_size_percentile,
            'volume_component': volume_component,
            'avg_size_component': avg_size_component,
            'relative_volume_component': relative_volume_component
        }
        
        return min(100, total_score), details
        
    def calculate_frequency_score(self, from_addr: str, to_addr: str) -> Tuple[float, Dict]:
        """Calculate frequency-based score (0-100)"""
        cursor = self.conn.cursor()
        
        # Get transfer statistics
        cursor.execute("""
            SELECT 
                ar.transfer_count,
                MIN(t.timestamp) as first_transfer,
                MAX(t.timestamp) as last_transfer,
                COUNT(DISTINCT DATE(t.timestamp)) as unique_days
            FROM account_relationships ar
            JOIN transfers t ON ar.from_address = t.from_address AND ar.to_address = t.to_address
            WHERE ar.from_address = ? AND ar.to_address = ?
            GROUP BY ar.from_address, ar.to_address
        """, (from_addr, to_addr))
        
        row = cursor.fetchone()
        if not row or row['transfer_count'] == 0:
            return 0.0, {}
            
        transfer_count = row['transfer_count']
        first_transfer = datetime.fromisoformat(row['first_transfer'])
        last_transfer = datetime.fromisoformat(row['last_transfer'])
        unique_days = row['unique_days']
        
        # Calculate days active
        days_active = max((last_transfer - first_transfer).days + 1, 1)
        transfers_per_day = transfer_count / days_active
        
        # Get percentiles
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN transfer_count < ? THEN 1 ELSE 0 END) as count_rank
            FROM account_relationships
        """, (transfer_count,))
        
        stats = cursor.fetchone()
        total_rel = max(stats['total'], 1)
        count_percentile = stats['count_rank'] / total_rel
        
        # Calculate frequency percentile (simplified)
        frequency_percentile = min(1.0, transfers_per_day / 10)  # Assume 10 transfers/day is 100th percentile
        
        # Calculate components
        count_component = min(40, count_percentile * 40)
        frequency_component = min(30, frequency_percentile * 30)
        consistency_component = min(30, (unique_days / days_active) * 30)
        
        total_score = count_component + frequency_component + consistency_component
        
        details = {
            'transfer_count': transfer_count,
            'days_active': days_active,
            'transfers_per_day': transfers_per_day,
            'unique_days': unique_days,
            'count_percentile': count_percentile,
            'frequency_percentile': frequency_percentile,
            'count_component': count_component,
            'frequency_component': frequency_component,
            'consistency_component': consistency_component
        }
        
        return min(100, total_score), details
        
    def calculate_temporal_score(self, from_addr: str, to_addr: str) -> Tuple[float, Dict]:
        """Calculate temporal score (0-100)"""
        cursor = self.conn.cursor()
        
        # Get temporal data
        cursor.execute("""
            SELECT 
                ar.transfer_count,
                MIN(t.timestamp) as first_transfer,
                MAX(t.timestamp) as last_transfer,
                COUNT(CASE WHEN datetime(t.timestamp) >= datetime('now', '-7 days') THEN 1 END) as transfers_last_week,
                COUNT(CASE WHEN datetime(t.timestamp) >= datetime('now', '-30 days') THEN 1 END) as transfers_last_month
            FROM account_relationships ar
            JOIN transfers t ON ar.from_address = t.from_address AND ar.to_address = t.to_address
            WHERE ar.from_address = ? AND ar.to_address = ?
            GROUP BY ar.from_address, ar.to_address
        """, (from_addr, to_addr))
        
        row = cursor.fetchone()
        if not row:
            return 0.0, {}
            
        last_transfer = datetime.fromisoformat(row['last_transfer'])
        first_transfer = datetime.fromisoformat(row['first_transfer'])
        days_since_last = (datetime.now() - last_transfer).days
        relationship_days = (last_transfer - first_transfer).days + 1
        
        # Recency component (exponential decay)
        if days_since_last <= 1:
            recency_component = 40
        elif days_since_last <= 7:
            recency_component = 35
        elif days_since_last <= 30:
            recency_component = 25
        elif days_since_last <= 90:
            recency_component = 15
        elif days_since_last <= 365:
            recency_component = 5
        else:
            recency_component = 0
            
        # Duration component
        duration_component = min(30, (relationship_days / 365) * 30)
        
        # Activity pattern component
        if row['transfer_count'] > 0:
            recent_week_ratio = row['transfers_last_week'] / row['transfer_count']
            recent_month_ratio = row['transfers_last_month'] / row['transfer_count']
            activity_component = min(30, recent_week_ratio * 15 + recent_month_ratio * 15)
        else:
            activity_component = 0
            
        total_score = recency_component + duration_component + activity_component
        
        details = {
            'days_since_last': days_since_last,
            'relationship_days': relationship_days,
            'transfers_last_week': row['transfers_last_week'],
            'transfers_last_month': row['transfers_last_month'],
            'recency_component': recency_component,
            'duration_component': duration_component,
            'activity_component': activity_component
        }
        
        return total_score, details
        
    def calculate_network_score(self, from_addr: str, to_addr: str) -> Tuple[float, Dict]:
        """Calculate network-based score (0-100)"""
        cursor = self.conn.cursor()
        
        # Get common connections
        cursor.execute("""
            SELECT COUNT(DISTINCT CASE 
                WHEN r1.to_address = r2.from_address THEN r1.to_address 
                WHEN r1.from_address = r2.to_address THEN r1.from_address 
            END) as common_connections
            FROM account_relationships r1, account_relationships r2
            WHERE r1.from_address = ? 
            AND r2.to_address = ?
            AND (r1.to_address = r2.from_address OR r1.from_address = r2.to_address)
        """, (from_addr, to_addr))
        
        common_connections = cursor.fetchone()['common_connections'] or 0
        
        # Get network metrics (if available)
        cursor.execute("""
            SELECT 
                nm1.degree_centrality as from_degree,
                nm2.degree_centrality as to_degree,
                nm1.pagerank as from_pagerank,
                nm2.pagerank as to_pagerank
            FROM (SELECT ?) as f
            LEFT JOIN account_network_metrics nm1 ON f.? = nm1.address
            LEFT JOIN account_network_metrics nm2 ON ? = nm2.address
        """, (from_addr, from_addr, to_addr))
        
        metrics = cursor.fetchone()
        
        from_degree = metrics['from_degree'] or 0
        to_degree = metrics['to_degree'] or 0
        from_pagerank = metrics['from_pagerank'] or 0
        to_pagerank = metrics['to_pagerank'] or 0
        
        # Calculate components
        common_connections_component = min(40, common_connections * 5)
        centrality_component = min(30, ((from_degree + to_degree) / 2) * 100)
        importance_component = min(30, ((from_pagerank + to_pagerank) / 2) * 1000)
        
        total_score = common_connections_component + centrality_component + importance_component
        
        details = {
            'common_connections': common_connections,
            'avg_degree_centrality': (from_degree + to_degree) / 2,
            'avg_pagerank': (from_pagerank + to_pagerank) / 2,
            'common_connections_component': common_connections_component,
            'centrality_component': centrality_component,
            'importance_component': importance_component
        }
        
        return min(100, total_score), details
        
    def calculate_risk_score(self, from_addr: str, to_addr: str) -> Tuple[float, Dict]:
        """Calculate risk indicators (0-100, higher = more risky)"""
        cursor = self.conn.cursor()
        
        # Get transfer count
        cursor.execute("""
            SELECT transfer_count, created_at
            FROM account_relationships
            WHERE from_address = ? AND to_address = ?
        """, (from_addr, to_addr))
        
        rel_data = cursor.fetchone()
        if not rel_data:
            return 0.0, {}
            
        transfer_count = rel_data['transfer_count']
        
        # Check rapid sequential transfers
        cursor.execute("""
            SELECT COUNT(*) as rapid_count
            FROM transfers t1
            JOIN transfers t2 ON t1.to_address = t2.from_address
            WHERE t1.from_address = ?
            AND t2.to_address = ?
            AND ABS(julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 < 5
        """, (from_addr, to_addr))
        
        rapid_transfers = cursor.fetchone()['rapid_count'] or 0
        
        # Check round numbers (amounts divisible by DOT units)
        cursor.execute("""
            SELECT COUNT(*) as round_count
            FROM transfers
            WHERE from_address = ? AND to_address = ?
            AND (
                CAST(value AS REAL) % 1000000000000 = 0 OR
                CAST(value AS REAL) % 10000000000000 = 0 OR
                CAST(value AS REAL) % 100000000000000 = 0
            )
        """, (from_addr, to_addr))
        
        round_numbers = cursor.fetchone()['round_count'] or 0
        
        # Check unusual time transfers
        cursor.execute("""
            SELECT COUNT(*) as unusual_count
            FROM transfers
            WHERE from_address = ? AND to_address = ?
            AND CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 2 AND 5
        """, (from_addr, to_addr))
        
        unusual_time = cursor.fetchone()['unusual_count'] or 0
        
        # Check if receiving account is new
        cursor.execute("""
            SELECT created_at
            FROM accounts
            WHERE address = ?
        """, (to_addr,))
        
        account_data = cursor.fetchone()
        if account_data and rel_data['created_at']:
            rel_created = datetime.fromisoformat(rel_data['created_at'])
            acc_created = datetime.fromisoformat(account_data['created_at'])
            new_account_flag = 1 if (rel_created - acc_created).days < 7 else 0
        else:
            new_account_flag = 0
            
        # Calculate risk components
        rapid_transfer_risk = min(30, (rapid_transfers / max(transfer_count, 1)) * 100)
        round_number_risk = min(25, (round_numbers / max(transfer_count, 1)) * 50)
        time_anomaly_risk = min(25, (unusual_time / max(transfer_count, 1)) * 50)
        new_account_risk = new_account_flag * 20
        
        total_risk = rapid_transfer_risk + round_number_risk + time_anomaly_risk + new_account_risk
        
        details = {
            'rapid_transfers': rapid_transfers,
            'round_numbers': round_numbers,
            'unusual_time_transfers': unusual_time,
            'new_account_interaction': bool(new_account_flag),
            'rapid_transfer_risk': rapid_transfer_risk,
            'round_number_risk': round_number_risk,
            'time_anomaly_risk': time_anomaly_risk,
            'new_account_risk': new_account_risk
        }
        
        return min(100, total_risk), details
        
    def calculate_total_score(self, from_addr: str, to_addr: str) -> RelationshipScore:
        """Calculate the total relationship strength score"""
        
        # Calculate all component scores
        volume_score, volume_details = self.calculate_volume_score(from_addr, to_addr)
        frequency_score, frequency_details = self.calculate_frequency_score(from_addr, to_addr)
        temporal_score, temporal_details = self.calculate_temporal_score(from_addr, to_addr)
        network_score, network_details = self.calculate_network_score(from_addr, to_addr)
        risk_score, risk_details = self.calculate_risk_score(from_addr, to_addr)
        
        # Apply weights and risk penalty
        weights = {
            'volume': 0.25,
            'frequency': 0.25,
            'temporal': 0.20,
            'network': 0.30
        }
        
        base_score = (
            volume_score * weights['volume'] +
            frequency_score * weights['frequency'] +
            temporal_score * weights['temporal'] +
            network_score * weights['network']
        )
        
        # Apply risk penalty (max 50% reduction)
        risk_multiplier = 1 - (risk_score / 200)
        total_score = round(base_score * risk_multiplier, 2)
        
        # Compile all details
        all_details = {
            'volume': volume_details,
            'frequency': frequency_details,
            'temporal': temporal_details,
            'network': network_details,
            'risk': risk_details,
            'weights': weights,
            'base_score': base_score,
            'risk_multiplier': risk_multiplier
        }
        
        return RelationshipScore(
            from_address=from_addr,
            to_address=to_addr,
            volume_score=volume_score,
            frequency_score=frequency_score,
            temporal_score=temporal_score,
            network_score=network_score,
            risk_score=risk_score,
            total_score=total_score,
            details=all_details
        )
        
    def update_network_metrics(self):
        """Update network centrality metrics for all accounts"""
        cursor = self.conn.cursor()
        
        # Build network graph
        G = nx.DiGraph()
        
        # Get all relationships
        cursor.execute("""
            SELECT from_address, to_address, total_volume, transfer_count
            FROM account_relationships
        """)
        
        for row in cursor.fetchall():
            G.add_edge(
                row['from_address'], 
                row['to_address'],
                weight=float(row['total_volume']),
                transfers=row['transfer_count']
            )
            
        # Calculate centrality metrics
        degree_centrality = nx.degree_centrality(G)
        betweenness_centrality = nx.betweenness_centrality(G, weight='weight')
        closeness_centrality = nx.closeness_centrality(G, distance='weight')
        pagerank = nx.pagerank(G, weight='weight')
        
        # Calculate clustering coefficient for undirected version
        G_undirected = G.to_undirected()
        clustering = nx.clustering(G_undirected, weight='weight')
        
        # Update database
        for node in G.nodes():
            # Calculate average common neighbors
            neighbors = set(G.neighbors(node)) | set(G.predecessors(node))
            common_neighbors_counts = []
            
            for neighbor in neighbors:
                neighbor_neighbors = set(G.neighbors(neighbor)) | set(G.predecessors(neighbor))
                common = len(neighbors & neighbor_neighbors)
                common_neighbors_counts.append(common)
                
            avg_common = np.mean(common_neighbors_counts) if common_neighbors_counts else 0
            
            # Insert or update metrics
            cursor.execute("""
                INSERT OR REPLACE INTO account_network_metrics
                (address, degree_centrality, betweenness_centrality, closeness_centrality, 
                 clustering_coefficient, pagerank, common_neighbors_avg, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                node,
                degree_centrality.get(node, 0),
                betweenness_centrality.get(node, 0),
                closeness_centrality.get(node, 0),
                clustering.get(node, 0),
                pagerank.get(node, 0),
                avg_common
            ))
            
        self.conn.commit()
        
    def get_top_relationships(self, limit: int = 100) -> List[Dict]:
        """Get top relationships by total score"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                ar.*,
                a1.identity_display as from_identity,
                a2.identity_display as to_identity
            FROM account_relationships ar
            LEFT JOIN accounts a1 ON ar.from_address = a1.address
            LEFT JOIN accounts a2 ON ar.to_address = a2.address
            ORDER BY ar.total_score DESC
            LIMIT ?
        """, (limit,))
        
        return [dict(row) for row in cursor.fetchall()]
        
    def find_suspicious_relationships(self, min_volume_score: float = 70, 
                                    min_risk_score: float = 30) -> List[Dict]:
        """Find relationships with high volume but also high risk"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                from_address,
                to_address,
                total_score,
                volume_score,
                risk_score,
                total_volume,
                transfer_count
            FROM account_relationships
            WHERE volume_score > ? AND risk_score > ?
            ORDER BY risk_score DESC
        """, (min_volume_score, min_risk_score))
        
        return [dict(row) for row in cursor.fetchall()]
        
    def export_scores_to_json(self, from_addr: str, to_addr: str, filepath: str):
        """Export detailed scores to JSON file"""
        score = self.calculate_total_score(from_addr, to_addr)
        
        export_data = {
            'relationship': {
                'from': from_addr,
                'to': to_addr
            },
            'scores': {
                'total': score.total_score,
                'volume': score.volume_score,
                'frequency': score.frequency_score,
                'temporal': score.temporal_score,
                'network': score.network_score,
                'risk': score.risk_score
            },
            'details': score.details,
            'interpretation': self._interpret_score(score.total_score),
            'timestamp': datetime.now().isoformat()
        }
        
        with open(filepath, 'w') as f:
            json.dump(export_data, f, indent=2)
            
    def _interpret_score(self, score: float) -> str:
        """Interpret the meaning of a score"""
        if score <= 20:
            return "Very weak relationship (minimal interaction)"
        elif score <= 40:
            return "Weak relationship (occasional interaction)"
        elif score <= 60:
            return "Moderate relationship (regular interaction)"
        elif score <= 80:
            return "Strong relationship (frequent, consistent interaction)"
        else:
            return "Very strong relationship (high volume, frequent, well-connected)"


# Example usage
if __name__ == "__main__":
    # Example of how to use the RelationshipScorer
    db_path = "/workspace/polkadot-analysis-tool/polkadot_analysis.db"
    
    with RelationshipScorer(db_path) as scorer:
        # Calculate score for a specific relationship
        from_address = "1YourFromAddressHere"
        to_address = "1YourToAddressHere"
        
        score = scorer.calculate_total_score(from_address, to_address)
        
        print(f"Relationship Score Analysis")
        print(f"From: {score.from_address}")
        print(f"To: {score.to_address}")
        print(f"\nComponent Scores:")
        print(f"  Volume Score: {score.volume_score:.2f}")
        print(f"  Frequency Score: {score.frequency_score:.2f}")
        print(f"  Temporal Score: {score.temporal_score:.2f}")
        print(f"  Network Score: {score.network_score:.2f}")
        print(f"  Risk Score: {score.risk_score:.2f}")
        print(f"\nTotal Strength Score: {score.total_score:.2f}")
        print(f"Interpretation: {scorer._interpret_score(score.total_score)}")
        
        # Export detailed analysis
        scorer.export_scores_to_json(from_address, to_address, "relationship_analysis.json")