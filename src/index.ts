#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMockTradeMcpServer } from './server.js';
import { loadLocalEnv } from './shared/env.js';

loadLocalEnv();

const server = createMockTradeMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
