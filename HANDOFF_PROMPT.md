# Handoff Prompt For New Conversation

你现在在 `C:\Projects\MockTrade_MCP`，这是从 `C:\Projects\MockTrade` 拆出来的全新 MCP 版项目。旧的 MockTrade web/SaaS repo 已经冻结，不要再改旧 repo。这个新 repo 的目标是做成开源的 AI Trading Agent Evaluation MCP，用来让 Codex、Claude、Cursor 等 agent 本地连接并测试交易策略是否遵守规则。

重要背景：
- 原 web repo 是 Express + Prisma + React + paid challenge 方向。
- 新 MCP repo 要保持干净，不要复制 web app、auth、payment、payout、Prisma/Postgres 依赖。
- 已经把旧项目中有用的核心代码复制到了 `reference/mocktrade-web-core/`，只作为参考，不要直接把它当生产结构。
- 主要参考内容包括 trading engine、evaluation engine、rules、market providers、PnL utility 和相关 tests。

请先阅读：
1. `README.md`
2. `docs/MCP_MIGRATION_PLAN.md`
3. `docs/TODO.md`
4. `reference/mocktrade-web-core/server/src/engines/trading.engine.ts`
5. `reference/mocktrade-web-core/server/src/engines/evaluation.engine.ts`
6. `reference/mocktrade-web-core/server/src/rules/*`

请帮我继续实现 MCP 版，要求：
- 使用 TypeScript。
- 使用官方 MCP TypeScript SDK。
- V1 使用 stdio transport。
- V1 使用 in-memory sandbox，不需要数据库、不需要 .env、不需要 API key。
- 默认 deterministic mock market data。
- 实现这些 tools：`list_symbols`, `get_price`, `get_bars`, `create_evaluation`, `place_order`, `get_evaluation_status`, `get_positions`, `get_trade_history`, `get_violations`, `reset_sandbox`。
- 先搭建干净 package 和 src 结构，再从 reference 里移植必要业务逻辑。
- 不要把旧 web 项目结构、client、Prisma、dist、auth、payout 搬进生产代码。

最终目标：用户可以将这个 MCP server 接到 Claude/Codex，用自然语言创建 evaluation、查行情、下模拟订单、查看仓位和 PASS/FAIL 规则状态。
