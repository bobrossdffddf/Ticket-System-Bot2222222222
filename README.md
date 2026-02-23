# Discord Ticket Bot

A fully customizable Discord ticket system with modal forms, transcripts, and role management.

## Features

- **Admin Setup**: Use `/setup` to configure ticket panel channel and ticket category
- **Customizable Ticket Panel**: Edit `config.json` to customize:
  - Embed title, description, color, and image
  - Multiple ticket buttons with different forms
  - Form fields for each button type
  - Ticket channel prefixes
- **Modal Forms**: Each button opens a custom form that you can easily modify
- **Private Ticket Channels**: Automatically creates channels with proper permissions
- **Role Management**: `/client` command assigns client role to ticket creator
- **Ticket Closing**: `/close` command with confirmation, creates transcript in thread
- **Transcripts**: Automatically creates labeled threads with ticket history

## Setup

1. **Create a Discord Bot**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Enable "Message Content Intent" and "Server Members Intent"
   - Copy the bot token

2. **Configure Environment**:
   - Create a `.env` file (copy from `.env.example`)
   - Add your bot token: `DISCORD_BOT_TOKEN=your_token_here`

3. **Customize the Bot**:
   - Edit `config.json` to customize:
     - Ticket panel embed (title, description, color, image)
     - Buttons (label, emoji, style, prefix)
     - Form fields for each button
     - Role names

4. **Invite Bot to Server**:
   - Go to OAuth2 → URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Administrator` (or specific permissions)
   - Use generated URL to invite bot

5. **Run the Bot**:
   - Click "Run" button at the top
   - Bot will start and register slash commands

6. **Setup in Discord**:
   - Create a support role and add its ID to `config.json` under `roles.supportRoleId`
   - Use `/setup` command:
     - Select channel for ticket panel
     - Select category for ticket channels
   - Done! Users can now create tickets

## Commands

- `/setup [channel] [category]` - Setup ticket system (Admin only)
- `/client` - Give ticket creator the client role (use in ticket channels)
- `/close` - Close ticket and create transcript

## Customization

Everything is easily customizable in `config.json`:

- **Ticket Panel**: Change title, description, color, image
- **Buttons**: Add/remove buttons, change labels, emojis, colors, prefixes
- **Forms**: Customize questions for each ticket type
- **Roles**: Change role names

No code editing needed for basic customization!
# Ticket-System-Bot2222222222
# Ticket-System-Bot2222222222
# Ticket-System-Bot2222222222
