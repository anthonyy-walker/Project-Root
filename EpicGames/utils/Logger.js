/**
 * Simple Logger utility
 */
class Logger {
  constructor(context) {
    this.context = context;
  }

  static create(context) {
    return new Logger(context);
  }

  fn(functionName) {
    return {
      info: (message, ...args) => {
        console.log(`[${this.context}:${functionName}] ℹ️  ${message}`, ...args);
      },
      error: (message, error) => {
        console.error(`[${this.context}:${functionName}] ❌ ${message}`, error?.message || error);
      },
      warn: (message, ...args) => {
        console.warn(`[${this.context}:${functionName}] ⚠️  ${message}`, ...args);
      }
    };
  }

  info(message, ...args) {
    console.log(`[${this.context}] ℹ️  ${message}`, ...args);
  }

  error(message, error) {
    console.error(`[${this.context}] ❌ ${message}`, error?.message || error);
  }

  warn(message, ...args) {
    console.warn(`[${this.context}] ⚠️  ${message}`, ...args);
  }
}

module.exports = Logger;
