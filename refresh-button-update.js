const fs = require('fs');

// Read the HTML file
let html = fs.readFileSync('frontend-real/index.html', 'utf8');

// Replace the refresh button event listener
const oldCode = `        document.getElementById('refresh-btn').addEventListener('click', () => {
            loadMonitoringData();
            // Animate refresh button
            const btn = document.getElementById('refresh-btn');
            btn.querySelector('i').classList.add('fa-spin');
            setTimeout(() => {
                btn.querySelector('i').classList.remove('fa-spin');
            }, 1000);
        });`;

const newCode = `        document.getElementById('refresh-btn').addEventListener('click', async () => {
            const btn = document.getElementById('refresh-btn');
            const icon = btn.querySelector('i');
            
            try {
                // Disable button and start spinning
                btn.disabled = true;
                icon.classList.add('fa-spin');
                btn.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i>Refreshing...';
                
                console.log('🔄 Triggering fresh data collection...');
                
                // Trigger fresh data collection
                const refreshResponse = await fetch('/api/refresh', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const refreshResult = await refreshResponse.json();
                console.log('Refresh triggered:', refreshResult);
                
                if (refreshResult.success) {
                    // Wait a bit for data to be collected, then reload
                    setTimeout(() => {
                        console.log('🔄 Loading fresh data...');
                        loadMonitoringData();
                        
                        // Re-enable button
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Refresh';
                    }, 3000); // Wait 3 seconds for data collection
                } else {
                    throw new Error(refreshResult.error || 'Refresh failed');
                }
                
            } catch (error) {
                console.error('Refresh error:', error);
                // Re-enable button on error
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Refresh';
                alert('Failed to refresh data: ' + error.message);
            }
        });`;

html = html.replace(oldCode, newCode);

// Write the updated file
fs.writeFileSync('frontend-real/index.html', html);
console.log('✅ Updated refresh button to trigger fresh data collection');
