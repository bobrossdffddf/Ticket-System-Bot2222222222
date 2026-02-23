# Replit.md

## Overview

This is a Discord Ticket Bot built with Node.js and discord.js v14. It provides a fully customizable ticket system for Discord servers, featuring modal forms, automatic transcript generation, and role management. Server admins can set up a ticket panel with configurable embed messages and buttons. When users click a button, a modal form opens to collect information, and a private ticket channel is created. The bot supports closing tickets with transcripts saved as threads.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Runtime & Entry Point
- **Runtime**: Node.js with ES modules (`"type": "module"` in package.json)
- **Entry Point**: `index.js` — contains the entire bot logic in a single file
- **No build step required** — runs directly with `node index.js`

### Core Design Decisions

**Single-file architecture**: The entire bot lives in `index.js`. This keeps things simple for a focused Discord bot. All event handlers, command registration, and interaction logic are in one place.

**Configuration-driven customization**: `config.json` holds all customizable aspects of the bot — embed appearance, button definitions, form fields, role names, and channel prefixes. This lets server admins customize the bot without touching code.

**File-based data persistence**: Ticket state (case numbers, active tickets) is stored in `tickets.json` using simple JSON read/write operations. No database is used or needed.
- Pros: Zero setup, no external dependencies for storage
- Cons: Not suitable for high-volume servers, no concurrent write safety
- This is intentional — the bot is designed for simplicity

**HTTP server on port 5000**: A minimal HTTP server runs alongside the bot to satisfy Replit's requirement for a listening port. It simply returns a "bot is running" message.

### Discord.js Patterns
- **Slash commands**: Registered via `client.application.commands.set()` on bot ready
  - `/setup` — Configure ticket panel channel and ticket category (admin only)
  - `/close` — Close a ticket with confirmation, generates transcript
  - `/client` — Assign client role to the ticket creator
- **Button interactions**: Ticket panel uses `ActionRowBuilder` + `ButtonBuilder` for creating ticket buttons, defined in config
- **Modal forms**: Each button type opens a `ModalBuilder` with `TextInputBuilder` fields, all configurable via `config.json`
- **Channel management**: Creates private channels with permission overrides using Discord.js permission flags
- **Intents**: Guilds, GuildMessages, MessageContent, GuildMembers

### Key Files
| File | Purpose |
|------|---------|
| `index.js` | Main bot logic — event handlers, commands, interactions |
| `config.json` | All customization — embeds, buttons, forms, roles |
| `tickets.json` | Runtime data — case numbers, active ticket tracking (auto-created) |
| `.env` | Bot token storage (`DISCORD_BOT_TOKEN`) |
| `package.json` | Dependencies and scripts |

### Important Notes
- The `package-lock.json` contains many unrelated dependencies (React, Radix UI, Drizzle, etc.) that are **not used** by this project. The actual dependencies are only `discord.js` and `dotenv` as specified in `package.json`.
- The bot requires Discord bot intents: Message Content Intent and Server Members Intent must be enabled in the Discord Developer Portal.
- Bot needs Administrator permission (or specific channel/role management permissions) in the Discord server.

## External Dependencies

### NPM Packages
- **discord.js v14** — Discord API wrapper for bot interactions, slash commands, embeds, modals, and channel management
- **dotenv v17** — Loads environment variables from `.env` file

### External Services
- **Discord API** — The bot connects to Discord's gateway and REST API. Requires a bot token from the [Discord Developer Portal](https://discord.com/developers/applications).

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `DISCORD_BOT_TOKEN` | Discord bot authentication token (required) |

### Configuration Requirements
- `config.json` must include a `roles.supportRoleId` field with the Discord role ID for support staff
- The Discord bot must have Message Content Intent and Server Members Intent enabled in the developer portal