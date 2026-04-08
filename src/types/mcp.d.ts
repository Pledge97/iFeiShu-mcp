declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export { McpServer } from '@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
  export { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js';
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export * from '@modelcontextprotocol/sdk/dist/esm/types.js';
  export function isInitializeRequest(request: unknown): boolean;
}
