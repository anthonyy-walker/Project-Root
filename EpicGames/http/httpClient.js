const axios = require('axios');

/**
 * HTTP Client wrapper for making API requests
 */
class HttpClient {
  /**
   * Create headers for Epic Games API requests
   */
  createHeaders(accessToken, additionalHeaders = {}) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...additionalHeaders
    };
  }

  /**
   * GET request
   */
  async get(url, config = {}) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * POST request
   */
  async post(url, data, config = {}) {
    try {
      return await axios.post(url, data, config);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Error handler
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error status
      console.error(`HTTP Error ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      // Request was made but no response
      console.error('No response received:', error.message);
    } else {
      // Error setting up request
      console.error('Request error:', error.message);
    }
  }
}

module.exports = new HttpClient();
