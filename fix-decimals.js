const fs = require("fs");
const path = require("path");

console.log("🔧 Fixing decimal numbers in existing alert descriptions...");

const alertsDir = path.join(__dirname, "data/alerts");
const files = fs.readdirSync(alertsDir).filter(f => f.endsWith(".json")).sort();

let totalFixed = 0;

files.forEach(file => {
    const filepath = path.join(alertsDir, file);
    const alerts = JSON.parse(fs.readFileSync(filepath, "utf8"));
    let fileFixed = 0;
    
    alerts.forEach(alert => {
        if (alert.description) {
            const original = alert.description;
            
            // Remove decimals from descriptions like "12,327.984 DOT" -> "12,327 DOT"
            alert.description = alert.description.replace(/(\d+),(\d+)\.(\d+)/g, "$1,$2");
            
            // Remove standalone decimals like "527,388.32" -> "527,388"
            alert.description = alert.description.replace(/(\d+)\.(\d+)/g, "$1");
            
            if (original \!== alert.description) {
                fileFixed++;
            }
        }
    });
    
    if (fileFixed > 0) {
        fs.writeFileSync(filepath, JSON.stringify(alerts, null, 2));
        console.log(`✅ ${file}: Fixed ${fileFixed} descriptions`);
        totalFixed += fileFixed;
    } else {
        console.log(`✓  ${file}: No decimals found`);
    }
});

console.log(`\n✅ Total fixed: ${totalFixed} alert descriptions`);
EOF < /dev/null