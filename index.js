import { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, AttachmentBuilder, StringSelectMenuBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import dotenv from 'dotenv';
import http from 'http';
import { createCanvas, loadImage } from 'canvas';

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

client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  
  try {
    await client.application.commands.set([
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
          },
          {
            name: 'contracts',
            description: 'Channel for signed contract logs',
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
      },
      {
        name: 'contract',
        description: 'Send a legal retainer agreement (Admin only)',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
          {
            name: 'target',
            description: 'User to send the contract to (optional, defaults to current channel)',
            type: 6,
            required: false
          }
        ]
      }
    ]);
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }
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
  const timestamp = new Date().toLocaleString();
  const userTag = interaction.user.tag;
  const userId = interaction.user.id;

  if (interaction.isChatInputCommand()) {
    const { commandName, guild, channel } = interaction;
    console.log(`[${timestamp}] COMMAND: /${commandName} | User: ${userTag} (${userId}) | Guild: ${guild?.name} | Channel: ${channel?.name}`);

    if (commandName === 'setup') {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('channel');
      const category = interaction.options.getChannel('category');
      const verificationChannel = interaction.options.getChannel('verification');
      const transcriptChannel = interaction.options.getChannel('transcripts');
      const contractLogChannel = interaction.options.getChannel('contracts');

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

      if (contractLogChannel) {
        ticketData.contractLogChannelId = contractLogChannel.id;
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
        await interaction.reply({ content: `✅ Setup complete!\nPanel: ${targetChannel}\nCategory: ${category.name}${verificationChannel ? `\nVerification: ${verificationChannel}` : ''}${transcriptChannel ? `\nTranscripts: ${transcriptChannel}` : ''}${contractLogChannel ? `\nContract Logs: ${contractLogChannel}` : ''}`, ephemeral: true });
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

    if (commandName === 'contract') {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('target');
      
      try {
        const assetsDir = './attached_assets';
        if (!existsSync(assetsDir)) {
          return interaction.reply({ content: '❌ attached_assets directory not found.', ephemeral: true });
        }
        const files = readdirSync(assetsDir).filter(f => f.endsWith('.txt'));
        
        if (files.length === 0) {
          return interaction.reply({ content: '❌ No contract templates found in attached_assets.', ephemeral: true });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId('select_contract')
          .setPlaceholder('Select a contract to send')
          .addOptions(files.map(f => ({
            label: f.replace('.txt', '').replace(/_/g, ' ').slice(0, 100),
            value: f
          })));

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.reply({ 
          content: `Select which contract you would like to send${targetUser ? ` to ${targetUser}` : ''}:`, 
          components: [row], 
          ephemeral: true 
        });

        // Store target user if provided
        if (targetUser) {
          interaction.client.contractTargets = interaction.client.contractTargets || new Map();
          interaction.client.contractTargets.set(interaction.user.id, targetUser.id);
        }
      } catch (err) {
        console.error('Error in contract command:', err);
        await interaction.reply({ content: '❌ Failed to load contract templates.', ephemeral: true });
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_contract') {
      const fileName = interaction.values[0];
      const targetUserId = interaction.client.contractTargets?.get(interaction.user.id);
      const targetUser = targetUserId ? await interaction.guild.members.fetch(targetUserId) : null;
      
      try {
        const contractText = readFileSync(`./attached_assets/${fileName}`, 'utf8');
        const title = fileName.replace('.txt', '').replace(/_/g, ' ').toUpperCase();
        
        const embed = new EmbedBuilder()
          .setTitle(`⚖️ ${title}`)
          .setDescription(contractText.slice(0, 4000))
          .setColor('#2C2F33')
          .setFooter({ text: 'Goodman & Haller | Blackstone' });

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`sign_contract_${fileName}`)
              .setLabel('Sign Agreement')
              .setStyle(ButtonStyle.Success)
              .setEmoji('🖋️')
          );

        const messagePayload = { content: targetUser ? `${targetUser}` : null, embeds: [embed], components: [row] };
        
        if (targetUser) {
          await interaction.channel.send(messagePayload);
          await interaction.update({ content: `✅ Sent contract to ${targetUser}`, components: [] });
        } else {
          await interaction.channel.send(messagePayload);
          await interaction.update({ content: '✅ Sent contract to this channel', components: [] });
        }
        
        interaction.client.contractTargets?.delete(interaction.user.id);
      } catch (err) {
        console.error('Error sending contract:', err);
        await interaction.update({ content: '❌ Failed to send the selected contract.', components: [] });
      }
    }
  }

  if (interaction.isButton()) {
    const { customId, guild, member, channel } = interaction;
    console.log(`[${timestamp}] BUTTON: ${customId} | User: ${userTag} (${userId}) | Guild: ${guild?.name} | Channel: ${channel?.name}`);

    if (customId.startsWith('sign_contract_')) {
      const fileName = customId.replace('sign_contract_', '');
      const modal = new ModalBuilder()
        .setCustomId(`modal_contract_sign_${fileName}`)
        .setTitle('Sign Retainer Agreement');

      const nameInput = new TextInputBuilder()
        .setCustomId('client_name')
        .setLabel('Full Legal Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your full name')
        .setRequired(true);

      const dateInput = new TextInputBuilder()
        .setCustomId('sign_date')
        .setLabel('Date')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('MM/DD/YYYY')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(dateInput)
      );

      await interaction.showModal(modal);
    }

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
    console.log(`[${timestamp}] MODAL: ${customId} | User: ${userTag} (${userId}) | Guild: ${guild?.name}`);

    if (customId.startsWith('modal_contract_sign_')) {
      await interaction.deferReply();
      const fileName = customId.replace('modal_contract_sign_', '');
      const clientName = fields.getTextInputValue('client_name');
      const signDate = fields.getTextInputValue('sign_date');

      console.log(`[${timestamp}] Processing contract ${fileName} for: ${clientName} on ${signDate}`);

      try {
        const imagePath = './attached_assets/image_1771993360063.png';
        if (!existsSync(imagePath)) {
          console.error(`❌ Image not found at: ${imagePath}`);
          return interaction.editReply({ content: '❌ Template image not found. Please contact an administrator.' });
        }

        const image = await loadImage(imagePath);
        
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(image, 0, 0);
        
        // Use an italic font for the signature to make it look more like a real signature
        ctx.font = 'italic 28px serif';
        ctx.fillStyle = 'black';
        
        // Coordinates for image_1771993360063.png
        // Refined coordinates for underlining based on the new template
        ctx.fillText(clientName, 240, 742); // Client Name line
        
        ctx.font = '24px serif';
        ctx.fillText(signDate, 610, 742);   // Client Date line
        ctx.fillText(signDate, 610, 816);   // Attorney Date line

        const buffer = canvas.toBuffer('image/png');
        const attachment = new AttachmentBuilder(buffer, { name: 'signed-contract.png' });

        const contractTitle = fileName.replace('.txt', '').replace(/_/g, ' ').toUpperCase();
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Contract Signed & Executed')
          .setDescription(`The **${contractTitle}** between **Goodman & Haller | Blackstone** and **${clientName}** has been finalized.`)
          .setColor('#57F287')
          .setTimestamp();

        // Send public message with embed only
        await interaction.editReply({ embeds: [embed] });

        // Log to contract channel with embed and image if configured
        if (ticketData.contractLogChannelId) {
          const logChannel = guild.channels.cache.get(ticketData.contractLogChannelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle(`📜 Signed: ${contractTitle}`)
              .setDescription(`**Client:** ${clientName}\n**Discord User:** ${user.tag} (${user.id})\n**Date:** ${signDate}`)
              .setColor('#57F287')
              .setImage('attachment://signed-contract.png')
              .setTimestamp();
            
            await logChannel.send({ embeds: [logEmbed], files: [new AttachmentBuilder(buffer, { name: 'signed-contract.png' })] });
          }
        }
        console.log(`✅ Contract successfully generated and logged for ${clientName}`);
      } catch (err) {
        console.error('❌ Error generating signed contract:', err);
        await interaction.editReply({ content: '❌ There was an error generating your signed contract. Please try again or contact an administrator.' });
      }
      return;
    }

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
