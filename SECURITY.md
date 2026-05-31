# Security Policy

## Supported Versions

MockTrade MCP is pre-1.0. Security fixes are handled on the latest mainline version unless a maintained release branch exists.

## Reporting a Vulnerability

Please report security issues privately through the repository security advisory flow if available. If that is not available, open a minimal issue that describes the affected area without exposing secrets, credentials, or exploit details.

## Secrets

Never commit:

- `.env` files
- API keys
- broker credentials
- real account data
- proprietary historical datasets

Use `.env.example` as a template only. The server can read local `.env` values for optional providers, but `.env` is ignored by Git.

## Trading Safety

MockTrade MCP is a simulation and evaluation tool. It does not execute real broker orders and should not be treated as investment advice.
