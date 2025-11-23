/**
 * Example: Using the auth system in your data collectors
 */

const { initAuth, getValidToken, stopAuth } = require('../auth/auth');

async function exampleCollector() {
  try {
    // Initialize auth system (schedules automatic token refresh)
    const hasValidToken = initAuth();
    
    if (!hasValidToken) {
      console.error('❌ No valid token found. Please run: node auth/authenticate.js <exchange_code>');
      process.exit(1);
    }
    
    console.log('\n🚀 Starting data collection...\n');
    
    // Simulate running collectors
    setInterval(async () => {
      try {
        // Get valid token (automatically refreshes if needed)
        const tokenData = await getValidToken();
        
        console.log(`✅ Collector tick at ${new Date().toISOString()}`);
        console.log(`   Using token: ${tokenData.access_token.substring(0, 20)}...`);
        console.log(`   Expires: ${tokenData.expires_at}`);
        
        // Use tokenData.access_token for API calls
        // Example: await makeApiCall(tokenData.access_token);
        
      } catch (error) {
        console.error('❌ Collector error:', error.message);
      }
    }, 60000); // Every minute
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n⏹️ Shutting down...');
      stopAuth();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run example if executed directly
if (require.main === module) {
  exampleCollector();
}

module.exports = exampleCollector;
