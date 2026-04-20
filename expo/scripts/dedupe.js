const fs = require('fs');
const path = require('path');

// Packages to deduplicate
const packagesToDedupe = [
  'expo-constants',
  'expo-file-system',
  'expo-location'
];

function removeNestedDependency(packageName, parentDir) {
  const nestedPath = path.join(parentDir, 'node_modules', packageName);
  if (fs.existsSync(nestedPath)) {
    console.log(`Removing nested ${packageName} from ${parentDir}`);
    fs.rmSync(nestedPath, { recursive: true, force: true });
  }
}

function scanAndClean(nodeModulesPath) {
  if (!fs.existsSync(nodeModulesPath)) {
    return;
  }

  const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(nodeModulesPath, entry.name);
      
      // Check if this directory has nested node_modules
      const nestedNodeModules = path.join(fullPath, 'node_modules');
      if (fs.existsSync(nestedNodeModules)) {
        // Remove nested duplicates
        for (const pkg of packagesToDedupe) {
          removeNestedDependency(pkg, fullPath);
        }
        
        // Recursively scan nested node_modules
        scanAndClean(nestedNodeModules);
      }
    }
  }
}

/* eslint-disable no-undef */
const rootNodeModules = path.join(__dirname, '..', 'node_modules');
console.log('Deduplicating nested dependencies...');
scanAndClean(rootNodeModules);
console.log('Done!');
