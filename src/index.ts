#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMockTradeMcpServer } from './server.js';

const server = createMockTradeMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
