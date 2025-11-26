#!/usr/bin/env node

/**
 * Remove all emojis from worker files except error indicator (!)
 */

const fs = require('fs');
const path = require('path');

// Emojis to remove (keep ❌ for errors)
const emojisToRemove = [
  '🔄', '✅', '📊', '⏱️', '⚠️', '🆕', '📍', '🔍', '⏳', '🧹', 
  '🎯', '⚡', '📈', '📝', '🗺️', '➕', '🚀', '🧪', '📄', '🔑', 
  '💾', '👤', '╔', '╗', '║', '╚', '╝', '═'
];

const workersDir = path.join(__dirname, '../workers');

function removeEmojis(content) {
  let cleaned = content;
  
  for (const emoji of emojisToRemove) {
    cleaned = cleaned.replace(new RegExp(emoji, 'g'), '');
  }
  
  // Remove empty box drawing around headers
  cleaned = cleaned.replace(/\n\s*console\.log\('\\n[═║╔╗╚╝]+.*?[═║╔╗╚╝]+\\n'\);/g, '');
  cleaned = cleaned.replace(/console\.log\('[═║╔╗╚╝\s]+'\);/g, '');
  
  // Clean up multiple spaces and trailing spaces
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
  
  return cleaned;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const cleaned = removeEmojis(content);
  
  if (content !== cleaned) {
    fs.writeFileSync(filePath, cleaned, 'utf8');
    console.log(`Cleaned: ${path.basename(filePath)}`);
    return 1;
  }
  return 0;
}

function processDirectory(dir) {
  let count = 0;
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      count += processDirectory(fullPath);
    } else if (item.endsWith('.js')) {
      count += processFile(fullPath);
    }
  }
  
  return count;
}

console.log('Removing emojis from worker files...\n');
const count = processDirectory(workersDir);
console.log(`\n! Cleaned ${count} files`);
