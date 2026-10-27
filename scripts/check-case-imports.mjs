import fs from 'fs';
import path from 'path';

function checkDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        checkDirectory(fullPath);
      }
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      checkFile(fullPath);
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const importRegex = /(?:import|export)\s+(?:.*?from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), importPath);
      const dir = path.dirname(resolved);
      const base = path.basename(resolved);
      if (fs.existsSync(dir)) {
        const actualEntries = fs.readdirSync(dir);
        const matchExact = actualEntries.find(e => 
          e === base || 
          e === base + '.js' || 
          e === base + '.jsx' || 
          e === base + '.json' || 
          e === base + '.png' || 
          e === base + '.svg' ||
          e === base + '.jpg'
        );
        const matchCaseInsensitive = actualEntries.find(e => {
          const eLower = e.toLowerCase();
          return [base, base + '.js', base + '.jsx', base + '.json', base + '.png', base + '.svg', base + '.jpg']
            .some(candidate => candidate.toLowerCase() === eLower);
        });
        if (!matchExact && matchCaseInsensitive) {
          console.error(`Case mismatch in ${filePath}: "${importPath}" vs actual "${matchCaseInsensitive}"`);
        } else if (!matchExact) {
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            const indexMatch = fs.readdirSync(resolved).find(e => e === 'index.js' || e === 'index.jsx');
            if (!indexMatch) console.warn(`Missing index in ${filePath}: "${importPath}"`);
          } else {
            const foundWithExt = actualEntries.find(e => e.startsWith(base + '.'));
            if (!foundWithExt) {
              console.warn(`Cannot resolve import: "${importPath}" in ${filePath}`);
            }
          }
        }
      }
    }
  }
}

checkDirectory('./src');
console.log('Case sensitive import check completed.');
