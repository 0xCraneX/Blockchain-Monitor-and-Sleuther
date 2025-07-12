const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle all routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Simple server running at http://0.0.0.0:${PORT}`);
});