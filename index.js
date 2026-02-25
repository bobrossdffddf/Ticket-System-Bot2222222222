import { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
import http from 'http';

// Dummy HTTP server to satisfy Replit's port 5000 requirement
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Discord bot is running!');
});
server.listen(5000, '0.0.0.0', () => {
  console.log('HTTP server listening on port 5000 (Required by Replit)');
});

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

let config = JSON.parse(readFileSync('./config.json', 'utf8'));
let ticketData = existsSync('./tickets.json') 
  ? JSON.parse(readFileSync('./tickets.json', 'utf8'))
  : { caseNumber: 1, activeTickets: {} };

function saveTicketData() {
  writeFileSync('./tickets.json', JSON.stringify(ticketData, null, 2));
}

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  
  client.application.commands.set([
    {
      name: 'setup',
      description: 'Setup the ticket system (Admin only)',
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      options: [
        {
          name: 'channel',
          description: 'Channel to send the ticket panel',
          type: 7,
          required: true,
          channel_types: [0]
        },
        {
          name: 'category',
          description: 'Category for ticket channels',
          type: 7,
          required: true,
          channel_types: [4]
        },
        {
          name: 'verification',
          description: 'Channel for verification system',
          type: 7,
          required: false,
          channel_types: [0]
        },
        {
          name: 'transcripts',
          description: 'Channel for ticket transcripts',
          type: 7,
          required: false,
          channel_types: [0]
        }
      ]
    },
    {
      name: 'client',
      description: 'Give the ticket creator the client role (Admin only)',
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    },
    {
      name: 'close',
      description: 'Close the current ticket and create a transcript',
    }
  ]);
});

client.on('guildMemberAdd', async member => {
  const autoRoleId = config.roles.autoRoleId;
  if (autoRoleId) {
    const role = member.guild.roles.cache.get(autoRoleId);
    if (role) {
      try {
        await member.roles.add(role);
        console.log(`✅ Auto-role assigned to ${member.user.tag}`);
      } catch (err) {
        console.error(`❌ Failed to assign auto-role to ${member.user.tag}:`, err);
      }
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, member, guild, channel } = interaction;

    if (commandName === 'setup') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('channel');
      const category = interaction.options.getChannel('category');
      const verificationChannel = interaction.options.getChannel('verification');
      const transcriptChannel = interaction.options.getChannel('transcripts');

      if (!targetChannel || !category) {
        return interaction.reply({ content: '❌ Invalid channel or category provided.', ephemeral: true });
      }

      ticketData.panelChannelId = targetChannel.id;
      ticketData.categoryId = category.id;
      
      if (verificationChannel) {
        ticketData.verificationChannelId = verificationChannel.id;
      }
      
      if (transcriptChannel) {
        ticketData.transcriptChannelId = transcriptChannel.id;
      } else if (!ticketData.transcriptChannelId) {
        ticketData.transcriptChannelId = targetChannel.id;
      }
      
      saveTicketData();

      // Send Ticket Panel
      const embed = new EmbedBuilder()
        .setTitle(config.ticketPanel.title)
        .setDescription(config.ticketPanel.description)
        .setColor(config.ticketPanel.color)
        .setImage(config.ticketPanel.image)
        .setTimestamp();

      const buttons = config.ticketPanel.buttons.map(btn => {
        const button = new ButtonBuilder()
          .setCustomId(`ticket_${btn.id}`)
          .setLabel(btn.label)
          .setEmoji(btn.emoji);
        
        if (typeof btn.style === 'string') {
          button.setStyle(ButtonStyle[btn.style.charAt(0).toUpperCase() + btn.style.slice(1).toLowerCase()] || ButtonStyle.Primary);
        } else {
          button.setStyle(btn.style || ButtonStyle.Primary);
        }
        
        return button;
      });

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      await targetChannel.send({ embeds: [embed], components: rows });

      // Send Verification Panel if verification channel is provided
      if (verificationChannel) {
        const verifyEmbed = new EmbedBuilder()
          .setTitle(config.verification.title)
          .setDescription(config.verification.description)
          .setColor(config.verification.color || '#5865F2')
          .setTimestamp();

        if (config.verification.image) {
          verifyEmbed.setImage(config.verification.image);
        }

        const verifyRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('verify_user')
              .setLabel(config.verification.buttonLabel)
              .setStyle(ButtonStyle.Success)
          );

        await verificationChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });
      }

      try {
        await interaction.reply({ content: `✅ Setup complete!\nPanel: ${targetChannel}\nCategory: ${category.name}${verificationChannel ? `\nVerification: ${verificationChannel}` : ''}${transcriptChannel ? `\nTranscripts: ${transcriptChannel}` : ''}`, ephemeral: true });
      } catch (err) {
        if (err.code !== 10062) console.error('Failed to reply to interaction:', err);
      }
    }

    if (commandName === 'client') {
      const ticketId = ticketData.activeTickets[channel.id];
      if (!ticketId) {
        return interaction.reply({ content: '❌ This command can only be used in ticket channels.', ephemeral: true });
      }

      const ticketInfo = Object.values(ticketData.activeTickets).find(t => t.channelId === channel.id);
      if (!ticketInfo) {
        return interaction.reply({ content: '❌ Ticket data not found.', ephemeral: true });
      }

      const clientRole = guild.roles.cache.find(r => r.name === config.roles.clientRoleName);
      if (!clientRole) {
        return interaction.reply({ content: `❌ Client role "${config.roles.clientRoleName}" not found. Please create it first.`, ephemeral: true });
      }

      const ticketCreator = await guild.members.fetch(ticketInfo.userId);
      if (!ticketCreator) {
        return interaction.reply({ content: '❌ Could not find the ticket creator.', ephemeral: true });
      }

      await ticketCreator.roles.add(clientRole);
      await interaction.reply({ content: `✅ ${ticketCreator} has been given the ${clientRole} role!` });
    }

    if (commandName === 'close') {
      const ticketInfo = Object.values(ticketData.activeTickets).find(t => t.channelId === channel.id);
      if (!ticketInfo) {
        return interaction.reply({ content: '❌ This command can only be used in ticket channels.', ephemeral: true });
      }

      // Only allow the ticket creator or an administrator to close the ticket
      if (interaction.user.id !== ticketInfo.userId && !member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only the ticket creator or an administrator can close this ticket.', ephemeral: true });
      }

      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Close Ticket?')
        .setDescription('Are you sure you want to close this ticket? A transcript will be created.')
        .setColor('#FEE75C');

      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('close_confirm')
            .setLabel('Yes, Close Ticket')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('close_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    const { customId, guild, member, channel } = interaction;

    if (customId.startsWith('ticket_')) {
      const buttonType = customId.replace('ticket_', '');
      const buttonConfig = config.ticketPanel.buttons.find(b => b.id === buttonType);

      if (!buttonConfig) {
        return interaction.reply({ content: '❌ Invalid ticket type.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_${buttonType}`)
        .setTitle(buttonConfig.formTitle);

      buttonConfig.formFields.forEach(field => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(TextInputStyle[field.style.charAt(0).toUpperCase() + field.style.slice(1).toLowerCase()] || TextInputStyle.Paragraph)
          .setPlaceholder(field.placeholder || '')
          .setRequired(field.required)
          .setMaxLength(field.maxLength);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
      });

      await interaction.showModal(modal);
    }

    if (customId === 'close_confirm') {
      const ticketInfo = Object.values(ticketData.activeTickets).find(t => t.channelId === channel.id);
      if (!ticketInfo) {
        return interaction.update({ content: '❌ Ticket data not found.', embeds: [], components: [] });
      }

      await interaction.update({ content: '🔒 Closing ticket and creating transcript...', embeds: [], components: [] });

      const messages = await channel.messages.fetch({ limit: 100 });
      const transcript = messages.reverse().map(m => 
        `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`
      ).join('\n');

      const transcriptChannel = guild.channels.cache.get(ticketData.transcriptChannelId);
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setTitle(`📝 Ticket Transcript - Case #${ticketInfo.caseNumber}`)
          .setDescription(`**Created by:** <@${ticketInfo.userId}>\n**Ticket Type:** ${ticketInfo.type}\n**Closed by:** <@${interaction.user.id}>`)
          .setColor('#5865F2')
          .setTimestamp();

        if (config.transcriptEmbed && config.transcriptEmbed.image) {
          transcriptEmbed.setImage(config.transcriptEmbed.image);
        }

        try {
          const thread = await transcriptChannel.threads.create({
            name: `case-${ticketInfo.caseNumber}`,
            autoArchiveDuration: 60,
            reason: 'Ticket closed - transcript created'
          });

          await thread.send({ embeds: [transcriptEmbed] });
          await thread.send({ content: `\`\`\`\n${transcript.slice(0, 1900)}\n\`\`\`` });
        } catch (error) {
          console.error('Failed to create transcript thread:', error);
        }
      }

      delete ticketData.activeTickets[channel.id];
      saveTicketData();

      setTimeout(() => channel.delete(), 5000);
    }

    if (customId === 'close_cancel') {
      await interaction.update({ content: '❌ Ticket closure cancelled.', embeds: [], components: [] });
    }

    if (customId === 'verify_user') {
      const verifyRoleId = config.roles.verifyRoleId;
      const autoRoleId = config.roles.autoRoleId;

      if (!verifyRoleId) {
        return interaction.reply({ content: '❌ Verification role is not configured.', ephemeral: true });
      }

      const role = guild.roles.cache.get(verifyRoleId);
      if (!role) {
        return interaction.reply({ content: '❌ Verification role not found in server.', ephemeral: true });
      }

      try {
        await member.roles.add(role);

        // Remove auto-role if it exists
        if (autoRoleId) {
          const autoRole = guild.roles.cache.get(autoRoleId);
          if (autoRole && member.roles.cache.has(autoRoleId)) {
            await member.roles.remove(autoRole);
          }
        }

        await interaction.reply({ content: '✅ You have been verified!', ephemeral: true });
      } catch (err) {
        console.error('Verification error:', err);
        await interaction.reply({ content: '❌ Failed to assign verification role. Please contact an admin.', ephemeral: true });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const { customId, fields, guild, user } = interaction;

    if (customId.startsWith('modal_')) {
      const buttonType = customId.replace('modal_', '');
      const buttonConfig = config.ticketPanel.buttons.find(b => b.id === buttonType);

      if (!buttonConfig) {
        return interaction.reply({ content: '❌ Invalid ticket type.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const caseNumber = ticketData.caseNumber++;
      const channelName = `${buttonConfig.prefix}-${caseNumber}`;

      const supportRole = guild.roles.cache.get(config.roles.supportRoleId);
      
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketData.categoryId,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: supportRole?.id || guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
          }
        ]
      });

      const formResponses = buttonConfig.formFields
        .map(field => `**${field.label}:**\n${fields.getTextInputValue(field.id)}`)
        .join('\n\n');

      const ticketEmbed = new EmbedBuilder()
        .setTitle(config.ticketEmbed.title)
        .setDescription(`${config.ticketEmbed.description}\n\n${formResponses}`)
        .setColor(config.ticketEmbed.color || '#57F287')
        .setFooter({ text: config.ticketEmbed.footer })
        .setTimestamp();

      if (config.ticketEmbed.image) {
        ticketEmbed.setImage(config.ticketEmbed.image);
      }

      await ticketChannel.send({ 
        content: `${user} ${supportRole ? supportRole : '@everyone'}`,
        embeds: [ticketEmbed] 
      });

      ticketData.activeTickets[ticketChannel.id] = {
        caseNumber,
        userId: user.id,
        username: user.username,
        type: buttonType,
        channelId: ticketChannel.id
      };

      if (!ticketData.transcriptChannelId) {
        const transcriptChannel = await guild.channels.create({
          name: 'ticket-transcripts',
          type: ChannelType.GuildText,
          reason: 'Transcript storage for closed tickets'
        });
        ticketData.transcriptChannelId = transcriptChannel.id;
      }

      saveTicketData();

      await interaction.editReply({ content: `✅ Ticket created! ${ticketChannel}` });
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content === '$restart git' && message.author.id === '848356730256883744') {
    await message.reply('🔄 Pulling latest changes and restarting...');

    const { exec } = await import('child_process');
    exec('git pull && pm2 restart ticket-bot', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        message.channel.send(`❌ Error: ${error.message}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
