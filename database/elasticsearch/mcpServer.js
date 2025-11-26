#!/usr/bin/env node

/**
 * Elasticsearch MCP Server (No Docker Required)
 * Provides MCP interface to local Elasticsearch instance
 */

const { Client } = require('@elastic/elasticsearch');
const readline = require('readline');

// Initialize Elasticsearch client
const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
  }
});

// MCP Protocol Handler
class ElasticsearchMCPServer {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
  }

  async handleRequest(request) {
    try {
      const { method, params } = request;

      switch (method) {
        case 'initialize':
          return {
            protocolVersion: '0.1.0',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'elasticsearch-mcp-server',
              version: '1.0.0'
            }
          };

        case 'tools/list':
          return {
            tools: [
              {
                name: 'search',
                description: 'Search Elasticsearch index',
                inputSchema: {
                  type: 'object',
                  properties: {
                    index: { type: 'string', description: 'Index name' },
                    query: { type: 'object', description: 'Query DSL' },
                    size: { type: 'number', description: 'Result size', default: 10 }
                  },
                  required: ['index', 'query']
                }
              },
              {
                name: 'get',
                description: 'Get document by ID',
                inputSchema: {
                  type: 'object',
                  properties: {
                    index: { type: 'string', description: 'Index name' },
                    id: { type: 'string', description: 'Document ID' }
                  },
                  required: ['index', 'id']
                }
              },
              {
                name: 'index',
                description: 'Index a document',
                inputSchema: {
                  type: 'object',
                  properties: {
                    index: { type: 'string', description: 'Index name' },
                    id: { type: 'string', description: 'Document ID (optional)' },
                    document: { type: 'object', description: 'Document to index' }
                  },
                  required: ['index', 'document']
                }
              },
              {
                name: 'list_indices',
                description: 'List all indices',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              }
            ]
          };

        case 'tools/call':
          return await this.handleToolCall(params);

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error) {
      return {
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
  }

  async handleToolCall(params) {
    const { name, arguments: args } = params;

    try {
      switch (name) {
        case 'search': {
          const result = await client.search({
            index: args.index,
            body: {
              query: args.query,
              size: args.size || 10
            }
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.hits, null, 2)
            }]
          };
        }

        case 'get': {
          const result = await client.get({
            index: args.index,
            id: args.id
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result._source, null, 2)
            }]
          };
        }

        case 'index': {
          const params = {
            index: args.index,
            body: args.document
          };
          if (args.id) {
            params.id = args.id;
          }
          const result = await client.index(params);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ result: result.result, id: result._id }, null, 2)
            }]
          };
        }

        case 'list_indices': {
          const result = await client.cat.indices({ format: 'json' });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }

  start() {
    this.rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        const response = await this.handleRequest(request);
        
        // Send response with proper JSON-RPC format
        const jsonrpcResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result: response
        };
        
        process.stdout.write(JSON.stringify(jsonrpcResponse) + '\n');
      } catch (error) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: request?.id || null,
          error: {
            code: -32700,
            message: 'Parse error: ' + error.message
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    // Send ready message to stderr (not stdout)
    process.stderr.write('Elasticsearch MCP Server ready\n');
  }
}

// Start server
const server = new ElasticsearchMCPServer();
server.start();
