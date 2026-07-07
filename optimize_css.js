const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === 'dist' || file === '.git') continue;
            processDir(fullPath);
        } else if (file.endsWith('.css')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const original = content;
            
            // Replace generic transition: all with targeted properties
            // We use standard GPU accelerated + color properties to prevent layout trashing
            const optimizedTransition = "transition: background-color $1, border-color $1, color $1, transform $1, box-shadow $1, opacity $1";
            
            // Matches "transition: all 0.2s" or "transition: all 0.2s ease"
            content = content.replace(/transition:\s*all\s+([^;]+)/g, optimizedTransition);
            
            if (content !== original) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Optimized: ${fullPath}`);
            }
        }
    }
}

const frontendPath = path.join(__dirname, 'printing-press-frontend', 'src');
const modulesPath = path.join(__dirname, 'modules');

console.log("Starting CSS Optimization...");
processDir(frontendPath);
processDir(modulesPath);
console.log("Done.");
