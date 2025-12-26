/**
 * Progress Bar Utility for Workers
 * 
 * Provides clean, space-efficient progress tracking using console overwrite
 * instead of flooding logs with individual status lines
 */

class ProgressBar {
  constructor(taskName, total) {
    this.taskName = taskName;
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastUpdateTime = Date.now();
    this.updateInterval = 500; // Update every 500ms minimum
    this.errors = 0;
    this.warnings = 0;
    this.stats = {};
    this.lastPercentLogged = -1; // Track last logged percentage for PM2
  }

  /**
   * Update progress
   */
  update(current, stats = {}) {
    this.current = current;
    this.stats = { ...this.stats, ...stats };
    
    // Only update display if enough time has passed
    const now = Date.now();
    if (now - this.lastUpdateTime >= this.updateInterval || current === this.total) {
      this.lastUpdateTime = now;
      this.render();
    }
  }

  /**
   * Increment progress by 1
   */
  increment(stats = {}) {
    this.update(this.current + 1, stats);
  }

  /**
   * Add error count
   */
  addError(count = 1) {
    this.errors += count;
  }

  /**
   * Add warning count
   */
  addWarning(count = 1) {
    this.warnings += count;
  }

  /**
   * Render progress bar
   */
  render() {
    const percentage = Math.floor((this.current / this.total) * 100);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const rate = this.current / elapsed;
    const remaining = rate > 0 ? Math.floor((this.total - this.current) / rate) : 0;
    
    // Build stats string
    const statsStr = Object.entries(this.stats)
      .map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toLocaleString() : value}`)
      .join(' | ');
    
    // Build status line - simple and PM2-friendly
    let status = `[${this.current.toLocaleString()}/${this.total.toLocaleString()}] ${percentage}%`;
    status += ` | ⏱️  ${this.formatTime(elapsed)}`;
    
    if (this.current < this.total && rate > 0) {
      status += ` | ETA: ${this.formatTime(remaining)}`;
    }
    
    if (statsStr) {
      status += ` | ${statsStr}`;
    }
    
    if (this.errors > 0) {
      status += ` | ❌ ${this.errors}`;
    }
    
    if (this.warnings > 0) {
      status += ` | ⚠️  ${this.warnings}`;
    }
    
    // ALWAYS use simple console.log for PM2 compatibility
    // Log every 5% or at completion
    const percentComplete = Math.floor(percentage / 5) * 5;
    
    if (!this.lastPercentLogged) {
      this.lastPercentLogged = -1;
    }
    
    if (this.current === this.total || percentComplete > this.lastPercentLogged) {
      console.log(`📊 ${this.taskName}: ${status}`);
      this.lastPercentLogged = percentComplete;
      
      if (this.current === this.total) {
        this.logSummary();
      }
    }
  }

  /**
   * Format time in human-readable format
   */
  formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  /**
   * Finish progress bar (force completion)
   */
  finish() {
    if (this.current < this.total) {
      this.update(this.total);
    } else {
      // Just ensure we show final render
      this.render();
    }
  }

  /**
   * Log final summary
   */
  logSummary() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const rate = this.current / elapsed;
    
    console.log(`✅ ${this.taskName} complete!`);
    console.log(`   Processed: ${this.current}/${this.total}`);
    console.log(`   Duration: ${this.formatTime(elapsed)}`);
    console.log(`   Rate: ${rate.toFixed(1)} items/sec`);
    
    if (Object.keys(this.stats).length > 0) {
      console.log('   Stats:');
      Object.entries(this.stats).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
    }
    
    if (this.errors > 0) {
      console.log(`   ❌ Errors: ${this.errors}`);
    }
    
    if (this.warnings > 0) {
      console.log(`   ⚠️  Warnings: ${this.warnings}`);
    }
  }

  /**
   * Force complete and show summary
   */
  complete() {
    this.current = this.total;
    this.render();
  }
}

/**
 * Batch Progress Tracker
 * For tracking progress across multiple batches
 */
class BatchProgress {
  constructor(taskName, totalItems, batchSize) {
    this.taskName = taskName;
    this.totalItems = totalItems;
    this.batchSize = batchSize;
    this.totalBatches = Math.ceil(totalItems / batchSize);
    this.currentBatch = 0;
    this.processedItems = 0;
    this.startTime = Date.now();
    this.stats = {};
  }

  /**
   * Update after batch completion
   */
  updateBatch(itemsProcessed, stats = {}) {
    this.currentBatch++;
    this.processedItems += itemsProcessed;
    this.stats = { ...this.stats, ...stats };
    this.render();
  }

  /**
   * Render progress
   */
  render() {
    const percentage = Math.floor((this.processedItems / this.totalItems) * 100);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    
    // Progress bar
    const barLength = 20;
    const filled = Math.floor((this.processedItems / this.totalItems) * barLength);
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    // Stats
    const statsStr = Object.entries(this.stats)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    let status = `[${bar}] Batch ${this.currentBatch}/${this.totalBatches}`;
    status += ` | ${this.processedItems}/${this.totalItems} items (${percentage}%)`;
    status += ` | ${this.formatTime(elapsed)}`;
    
    if (statsStr) {
      status += ` | ${statsStr}`;
    }
    
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${this.taskName}: ${status}`);
    
    if (this.processedItems >= this.totalItems) {
      console.log('');
    }
  }

  formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  /**
   * Complete the progress
   */
  complete() {
    console.log('');
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    console.log(`✅ ${this.taskName} complete! ${this.processedItems} items in ${this.formatTime(elapsed)}`);
  }
}

module.exports = {
  ProgressBar,
  BatchProgress
};
