import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  AttachmentBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import dotenv from "dotenv";
import http from "http";
import { createCanvas, loadImage } from "canvas";

const cooldowns = new Map();

function checkCooldown(userId, action, limit = 3000) {
  const key = `${userId}_${action}`;
  const now = Date.now();
  if (cooldowns.has(key)) {
    const lastTime = cooldowns.get(key);
    if (now - lastTime < limit) return false;
  }
  cooldowns.set(key, now);
  return true;
}

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Discord bot is running!");
});
server.listen(5000, "0.0.0.0", () => {
  console.log("HTTP server listening on port 5000 (Required by Replit)");
});

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

let config = JSON.parse(readFileSync("./config.json", "utf8"));
let ticketData = existsSync("./tickets.json")
  ? JSON.parse(readFileSync("./tickets.json", "utf8"))
  : { caseNumber: 1, activeTickets: {} };

function saveTicketData() {
  try {
    writeFileSync("./tickets.json", JSON.stringify(ticketData, null, 2));
    console.log(`[LOG] [${new Date().toISOString()}] Ticket data saved successfully.`);
  } catch (err) {
    console.error(`[ERROR] [${new Date().toISOString()}] Failed to save ticket data:`, err);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild === null && message.content.toLowerCase() === "done") {
    const userId = message.author.id;
    const userBills = ticketData.bills?.[userId] || [];
    const pendingBill = userBills.find(b => ["Pending", "Overdue", "Rejected"].includes(b.status));

    if (!pendingBill) return message.channel.send("❌ You don't have any pending bills to pay.");

    const embed = new EmbedBuilder()
      .setTitle("Payment Confirmation")
      .setDescription("Please confirm your payment by clicking the button below.")
      .setColor("#D4AF37");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`paid_button_${pendingBill.id}`)
        .setLabel("Paid")
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }

  const adminId = "848356730256883744";
  if (message.author.id === adminId) {
    if (message.content === "$restart git") {
      await message.reply("🔄 Pulling latest changes and restarting...");
      const { exec } = await import("child_process");
      exec("git pull", (err, stdout, stderr) => {
        if (err) {
          console.error(`Git pull error: ${err}`);
          return message.reply(`❌ Git pull failed: ${err.message}`).catch(() => {});
        }
        console.log(`Git pull output: ${stdout}`);
        process.exit(0);
      });
    } else if (message.content === "$git v") {
      const { exec } = await import("child_process");
      exec('git log -1 --pretty=format:"%h - %s (%cr)"', (error, stdout) => {
        if (error) return message.reply(`❌ Error: ${error.message}`);
        message.reply(`📦 **Current Version:**\n\`${stdout}\``);
      });
    }
  }
});

client.once("clientReady", async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity(config.status || "Watching the law", { type: 3 });

  try {
    await client.application.commands.set([
      {
        name: "setup",
        description: "Setup the ticket system (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
          { name: "channel", description: "Channel to send the ticket panel", type: 7, required: true, channel_types: [0] },
          { name: "category", description: "Category for ticket channels", type: 7, required: true, channel_types: [4] },
          { name: "verification", description: "Channel for verification system", type: 7, required: false, channel_types: [0] },
          { name: "transcripts", description: "Channel for ticket transcripts", type: 7, required: false, channel_types: [0] },
          { name: "contracts", description: "Channel for signed contract logs", type: 7, required: false, channel_types: [0] },
        ],
      },
      {
        name: "client",
        description: "Give the ticket creator the client role (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      },
      {
        name: "close",
        description: "Close the current ticket and create a transcript",
      },
      {
        name: "contract",
        description: "Send a legal agreement (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      },
      {
        name: "corporation",
        description: "Create a corporation role and category (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
          { name: "name", description: "Name of the corporation", type: 3, required: true },
          { name: "users", description: "Users to add (mention them)", type: 3, required: true },
          { name: "color", description: "Role color (Hex code, e.g. #FF0000)", type: 3, required: true }
        ]
      },
      {
        name: "bill",
        description: "Billing commands",
        options: [
          { name: "view", description: "View your current bill status", type: 1 },
          { name: "admin", description: "View all active bills (Admin only)", type: 1 },
          {
            name: "create",
            description: "Create a bill for a user (Admin only)",
            type: 1,
            options: [
              { name: "user", description: "User to bill", type: 6, required: true },
              {
                name: "type",
                description: "Billing type",
                type: 3,
                required: true,
                choices: [
                  { name: "One time", value: "One time" },
                  { name: "Weekly", value: "Weekly" },
                  { name: "Monthly", value: "Monthly" },
                  { name: "Yearly", value: "Yearly" }
                ]
              },
              { name: "amount", description: "Amount to bill", type: 10, required: true },
              { name: "date", description: "First bill date (MM/DD/YYYY HH:MM)", type: 3, required: true }
            ]
          },
          {
            name: "delete",
            description: "Delete a bill (Admin only)",
            type: 1,
            options: [
              { name: "user", description: "User whose bill to delete", type: 6, required: true },
              { name: "id", description: "Bill ID", type: 3, required: true }
            ]
          }
        ],
      },
    ]);
    console.log("✅ Slash commands registered");

    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 9 && now.getMinutes() === 0) {
        if (ticketData.bills) {
          for (const [userId, bills] of Object.entries(ticketData.bills)) {
            const unpaidBill = bills.find(b => ["Pending", "Overdue", "Rejected"].includes(b.status));
            if (unpaidBill) {
              try {
                const user = await client.users.fetch(userId);
                const embed = new EmbedBuilder()
                  .setTitle("💳 Payment Reminder")
                  .setDescription(`Hello! This is a reminder regarding your outstanding bill (${unpaidBill.type}) of ${unpaidBill.amount} from ${unpaidBill.date}.\n\nPlease press the button below once you have completed the payment.`)
                  .setColor("#D4AF37");
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`paid_button_${unpaidBill.id}`).setLabel("Paid").setStyle(ButtonStyle.Success)
                );
                await user.send({ embeds: [embed], components: [row] });
              } catch (err) {}
            }
          }
        }
      }
    }, 60000);
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }
});

client.on("guildMemberAdd", async (member) => {
  console.log(`[LOG] [${new Date().toISOString()}] Member joined: ${member.user.tag}`);
  
  const welcomeChannelId = config.channels?.welcomeChannelId || "1475538356942016625";
  const welcomeChannel = await client.channels.fetch(welcomeChannelId).catch(() => null);
  
  if (welcomeChannel) {
    try {
      const canvas = createCanvas(700, 250);
      const ctx = canvas.getContext("2d");
      
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const avatarURL = member.user.displayAvatarURL({ extension: "png", size: 256 });
      const avatar = await loadImage(avatarURL).catch(() => null);
      
      if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(125, 125, 100, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 25, 25, 200, 200);
        ctx.restore();
      }
      
      ctx.fillStyle = "#ffffff";
      ctx.font = "35px sans-serif";
      ctx.fillText("Welcome!", 250, 80);
      ctx.font = "45px sans-serif";
      ctx.fillText(member.user.username, 250, 150);
      ctx.font = "25px sans-serif";
      ctx.fillText(`Member #${member.guild.memberCount}`, 250, 200);
      
      const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "welcome.png" });
      
      const welcomeEmbed = new EmbedBuilder()
        .setTitle("Welcome to Goodman & Haller | Blackstone")
        .setDescription(`Welcome ${member} to Goodman & Haller | Blackstone. We are here to help.\nIf you have any questions about billing please go to <#1475538562723090492>.\nIf you have recently been arrested visit <#1475538517206372433> and then visit <#1475538536831651841> to acquire our services.\nIf you have any questions please ping <@848356730256883744> or <@1475538961731158056>.`)
        .setColor("#D4AF37")
        .setImage("attachment://welcome.png");
        
      await welcomeChannel.send({ embeds: [welcomeEmbed], files: [attachment] }).catch(err => console.error("Failed to send welcome message:", err));
    } catch (err) {
      console.error("Welcome canvas error:", err);
    }
  }

  const autoRoleId = config.roles?.autoRoleId;
  if (autoRoleId) {
    let role = member.guild.roles.cache.get(autoRoleId);
    if (!role) role = await member.guild.roles.fetch(autoRoleId).catch(() => null);
    if (role) await member.roles.add(role).catch(err => console.error(`Failed to add auto role: ${err}`));
  }
});

client.on("interactionCreate", async (interaction) => {
  console.log(`[LOG] [${new Date().toISOString()}] Interaction: ${interaction.type} (ID: ${interaction.id}) by ${interaction.user.tag}`);
  
  try {
    if (interaction.isChatInputCommand()) {
      if (!checkCooldown(interaction.user.id, "command")) {
        return interaction.reply({ content: "⚠️ You are doing that too fast! Please wait a few seconds.", ephemeral: true });
      }
      const { commandName, options, member, guild } = interaction;

      if (commandName === "bill") {
        const subcommand = options.getSubcommand();
        if (subcommand === "create") {
          if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
          const targetUser = options.getUser("user");
          const type = options.getString("type");
          const amount = options.getNumber("amount");
          const date = options.getString("date");

          if (!ticketData.bills) ticketData.bills = {};
          if (!ticketData.bills[targetUser.id]) ticketData.bills[targetUser.id] = [];

          const newBill = { id: Date.now().toString(), status: "Pending", type, amount, date };
          ticketData.bills[targetUser.id].push(newBill);
          saveTicketData();

          const dmEmbed = new EmbedBuilder()
            .setTitle("💳 New Bill Generated")
            .setDescription(`Type: ${type}\nAmount: ${amount}\nFirst Bill: ${date}\n\nHello! You are required to pay your bill to continue your services with Goodman & Haller. To pay your bill please go to https://discord.gg/udcFKabMG3 and type the command Pay @Justawacko_ ${amount/2} and @whoaxis ${amount/2}. Please respond DONE when you pay both accounts.`)
            .setColor("#D4AF37");

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`paid_button_${newBill.id}`).setLabel("Paid").setStyle(ButtonStyle.Success)
          );

          try {
            await targetUser.send({ embeds: [dmEmbed], components: [row] });
            await interaction.reply({ content: `✅ Bill created and sent to ${targetUser.tag}`, ephemeral: true });
          } catch {
            await interaction.reply({ content: `✅ Bill created, but failed to DM ${targetUser.tag}.`, ephemeral: true });
          }
        } else if (subcommand === "delete") {
          if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
          const targetUser = options.getUser("user");
          const id = options.getString("id");
          if (ticketData.bills?.[targetUser.id]) {
            ticketData.bills[targetUser.id] = ticketData.bills[targetUser.id].filter(b => b.id !== id);
            saveTicketData();
            await interaction.reply({ content: `✅ Bill ${id} deleted.`, ephemeral: true });
          } else {
            await interaction.reply({ content: "❌ No bills found.", ephemeral: true });
          }
        } else if (subcommand === "view") {
          const bills = ticketData.bills?.[interaction.user.id] || [];
          const embed = new EmbedBuilder().setTitle("Your Bills").setColor("#D4AF37");
          let desc = bills.map(b => `**ID:** ${b.id}\n**Type:** ${b.type}\n**Amount:** ${b.amount}\n**Status:** ${b.status}\n**Date:** ${b.date}`).join("\n\n") || "No bills found.";
          embed.setDescription(desc);
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (subcommand === "admin") {
          if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
          const embed = new EmbedBuilder().setTitle("All Active Bills").setColor("#D4AF37");
          let desc = "";
          if (ticketData.bills) {
            for (const [userId, bills] of Object.entries(ticketData.bills)) {
              bills.forEach(b => {
                desc += `**User:** <@${userId}>\n**ID:** ${b.id}\n**Type:** ${b.type}\n**Amount:** ${b.amount}\n**Status:** ${b.status}\n**Date:** ${b.date}\n\n`;
              });
            }
          }
          embed.setDescription(desc || "No active bills found.");
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } else if (commandName === "client") {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
        const channel = interaction.channel;
        const topicParts = channel.name.split("-");
        
        // Check if we are in a ticket category or if name matches ticket pattern
        if (topicParts.length < 2 || !channel.parent || channel.parent.id !== ticketData.categoryId) {
            return interaction.reply({ content: "❌ This command can only be used in ticket channels.", ephemeral: true });
        }
        
        const overwrites = channel.permissionOverwrites.cache;
        let targetId = null;
        for (const [id] of overwrites) {
          if (id !== guild.id && id !== config.roles.supportRoleId) {
            targetId = id;
            break;
          }
        }

        if (!targetId) return interaction.reply({ content: "❌ Could not identify ticket creator.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "❌ Ticket creator not found in server.", ephemeral: true });

        const role = guild.roles.cache.find(r => r.name === config.roles.clientRoleName);
        if (!role) return interaction.reply({ content: `❌ Role "${config.roles.clientRoleName}" not found.`, ephemeral: true });

        await targetMember.roles.add(role);
        await interaction.reply({ content: `✅ ${targetMember} has been given the ${role.name} role.` });
      } else if (commandName === "close") {
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: 100 });
        let transcript = `Transcript for ${channel.name}\n\n`;
        messages.reverse().forEach(m => {
          transcript += `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}\n`;
        });

        const buffer = Buffer.from(transcript, "utf-8");
        const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });

        if (ticketData.transcriptChannelId) {
          const transcriptChannel = await client.channels.fetch(ticketData.transcriptChannelId).catch(() => null);
          if (transcriptChannel) await transcriptChannel.send({ content: `Transcript for ${channel.name}`, files: [attachment] });
        }

        await interaction.reply({ content: "✅ Ticket closed. Channel will be deleted in 5 seconds." });
        setTimeout(() => channel.delete().catch(() => {}), 5000);
      } else if (commandName === "contract") {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
        
        const files = readdirSync("./contracts").filter(f => f.endsWith(".txt"));
        if (files.length === 0) return interaction.reply({ content: "❌ No contracts found in the contracts folder.", ephemeral: true });

        const options = files.map(f => ({
          label: f.replace(".txt", ""),
          value: f
        }));

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("select_contract")
            .setPlaceholder("Choose a contract to send")
            .addOptions(options)
        );

        await interaction.reply({ content: "Select a contract to display in this channel:", components: [row], ephemeral: true });
      } else if (commandName === "corporation") {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
        
        const corpName = options.getString("name");
        const usersInput = options.getString("users");
        const roleColor = options.getString("color");

        await interaction.deferReply({ ephemeral: true });

        try {
          // Create Role
          const role = await guild.roles.create({
            name: corpName,
            color: roleColor,
            reason: `Corporation ${corpName} creation`
          });

          // Extract User IDs and Add Role
          const userIds = [...usersInput.matchAll(/<@!?(\d+)>/g)].map(match => match[1]);
          const addedUsers = [];
          for (const id of userIds) {
            const m = await guild.members.fetch(id).catch(() => null);
            if (m) {
              await m.roles.add(role);
              addedUsers.push(m.user.tag);
            }
          }

          // Create Category
          const category = await guild.channels.create({
            name: corpName,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
              { id: config.roles.supportRoleId, allow: [PermissionFlagsBits.ViewChannel] }
            ]
          });

          // Create Channels
          const channels = ["💬-Correspondence", "👤 client communications", "🎤 Meetingroom"];
          for (const name of channels) {
            await guild.channels.create({
              name: name,
              type: ChannelType.GuildText,
              parent: category.id
            });
          }

          await interaction.editReply({ content: `✅ Corporation **${corpName}** created successfully.\nRole: ${role}\nUsers added: ${addedUsers.join(", ") || "None found"}` });
        } catch (err) {
          console.error("Corporation create error:", err);
          await interaction.editReply({ content: `❌ Error creating corporation: ${err.message}` });
        }
      } else if (commandName === "setup") {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
        const targetChannel = options.getChannel("channel");
        const category = options.getChannel("category");
        const verificationChannel = options.getChannel("verification");
        const transcriptChannel = options.getChannel("transcripts");
        const contractChannel = options.getChannel("contracts");

        ticketData.panelChannelId = targetChannel.id;
        ticketData.categoryId = category.id;
        if (verificationChannel) ticketData.verificationChannelId = verificationChannel.id;
        if (transcriptChannel) ticketData.transcriptChannelId = transcriptChannel.id;
        if (contractChannel) ticketData.contractChannelId = contractChannel.id;
        saveTicketData();

        const ticketEmbed = new EmbedBuilder()
          .setTitle(config.ticketPanel.title)
          .setDescription(config.ticketPanel.description)
          .setColor(config.ticketPanel.color)
          .setImage(config.ticketPanel.image);

        const ticketRow = new ActionRowBuilder();
        config.ticketPanel.buttons.forEach(btn => {
          ticketRow.addComponents(
            new ButtonBuilder().setCustomId(`ticket_${btn.id}`).setLabel(btn.label).setEmoji(btn.emoji).setStyle(ButtonStyle[btn.style] || ButtonStyle.Primary)
          );
        });

        await targetChannel.send({ embeds: [ticketEmbed], components: [ticketRow] });

        if (verificationChannel) {
          const verifyEmbed = new EmbedBuilder()
            .setTitle(config.verification.title)
            .setDescription(config.verification.description)
            .setColor(config.verification.color)
            .setImage(config.verification.image);

          const verifyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("verify_user").setLabel(config.verification.buttonLabel).setStyle(ButtonStyle.Success)
          );

          await verificationChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });
        }

        await interaction.reply({ content: "✅ Setup complete. Panels have been sent.", ephemeral: true });
      }
    } else if (interaction.isButton()) {
      if (!checkCooldown(interaction.user.id, "button", 2000)) {
        return interaction.reply({ content: "⚠️ You are clicking buttons too fast!", ephemeral: true });
      }
      const { customId: custom_id, user, guild, message, member } = interaction;

      if (custom_id === "verify_user") {
        try {
          await interaction.deferReply({ ephemeral: true });
          const roleId = config.roles?.verifyRoleId;
          const autoRoleId = config.roles?.autoRoleId;
          if (!roleId) return interaction.editReply({ content: "❌ Verification role ID not configured." });
          
          let role = guild.roles.cache.get(roleId);
          if (!role) {
            role = await guild.roles.fetch(roleId).catch(() => null);
          }
          if (!role) return interaction.editReply({ content: "❌ Verification role not found. Please contact an admin." });

          if (member.roles.cache.has(roleId)) return interaction.editReply({ content: "ℹ️ You are already verified!" });

          await member.roles.add(role);
          
          if (autoRoleId && member.roles.cache.has(autoRoleId)) {
            await member.roles.remove(autoRoleId).catch(err => console.error("Failed to remove auto role:", err));
          }
          
          await interaction.editReply({ content: "✅ You have been verified and granted access!" });
        } catch (err) {
          console.error("Verification error:", err);
          try {
            if (interaction.deferred) await interaction.editReply({ content: "❌ Failed to assign verification role. Make sure the bot's role is above the verification role." });
            else await interaction.reply({ content: "❌ Failed to assign verification role.", ephemeral: true });
          } catch {}
        }
      } else if (custom_id.startsWith("ticket_")) {
        const typeId = custom_id.replace("ticket_", "");
        const buttonConfig = config.ticketPanel.buttons.find(b => b.id === typeId);
        if (!buttonConfig) return interaction.reply({ content: "❌ Invalid ticket type.", ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`modal_${typeId}`).setTitle(buttonConfig.formTitle);
        buttonConfig.formFields.forEach(field => {
          const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setStyle(TextInputStyle[field.style] || TextInputStyle.Short)
            .setPlaceholder(field.placeholder || "")
            .setRequired(field.required || false)
            .setMaxLength(field.maxLength || 1000);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });
        await interaction.showModal(modal);
      } else if (custom_id.startsWith("sign_contract_init_")) {
        const contractType = custom_id.replace("sign_contract_init_", "");
        const modal = new ModalBuilder()
          .setCustomId(`sign_modal_${contractType}`)
          .setTitle(`Sign ${contractType}`);

        const nameInput = new TextInputBuilder()
          .setCustomId("signer_name")
          .setLabel("Full Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const dateInput = new TextInputBuilder()
          .setCustomId("sign_date")
          .setLabel("Date (MM/DD/YYYY)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(dateInput)
        );

        await interaction.showModal(modal);
      } else if (custom_id.startsWith("paid_button_")) {
        const billId = custom_id.replace("paid_button_", "");
        const bill = ticketData.bills?.[user.id]?.find(b => b.id === billId);
        if (bill) {
          bill.status = "Reviewing";
          saveTicketData();
          await interaction.reply({ content: "Hello! Your payment has been recorded and sent for review.", ephemeral: true });
          try { await message.edit({ components: [] }); } catch {}

          const staffChannel = await client.channels.fetch("1476251078382321836").catch(() => null);
          if (staffChannel) {
            const embed = new EmbedBuilder().setTitle("💰 Payment Review").setDescription(`${user} paid ${bill.amount}`).setColor("#FFFF00");
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`verify_pay_green_${user.id}_${billId}`).setLabel("Verify").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`verify_pay_red_${user.id}_${billId}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
            );
            await staffChannel.send({ embeds: [embed], components: [row] });
          }
        }
      } else if (custom_id.startsWith("verify_pay_")) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.editReply({ content: "❌ Admin only." });
        const [, , color, targetId, billId] = custom_id.split("_");
        const bill = ticketData.bills?.[targetId]?.find(b => b.id === billId);
        const targetUser = await client.users.fetch(targetId).catch(() => null);

        if (color === "green") {
          if (bill) bill.status = "Paid";
          if (targetUser) {
            const embed = new EmbedBuilder().setTitle("✅ Payment Confirmed").setDescription("Your bill has been marked as paid.").setColor("#00FF00");
            await targetUser.send({ embeds: [embed] }).catch(() => {});
          }
          await interaction.editReply({ content: "✅ Verified." });
        } else {
          if (bill) bill.status = "Rejected";
          if (targetUser) {
            const embed = new EmbedBuilder().setTitle("❌ Payment Rejected").setDescription("Your payment was rejected. Create a support ticket if this is an error.").setColor("#FF0000");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`paid_button_${billId}`).setLabel("Paid").setStyle(ButtonStyle.Success));
            await targetUser.send({ embeds: [embed], components: [row] }).catch(() => {});
          }
          await interaction.editReply({ content: "❌ Denied." });
        }
        saveTicketData();
        try { await message.edit({ components: [] }); } catch {}
      } else if (custom_id.startsWith("sign_contract_")) {
        const targetId = custom_id.replace("sign_contract_", "");
        if (user.id !== targetId) return interaction.reply({ content: "❌ You cannot sign this.", ephemeral: true });
        await interaction.deferUpdate();
        const embed = new EmbedBuilder().setTitle("✅ Agreement Signed").setDescription("You have signed the retainer agreement.").setColor("#00FF00").setTimestamp();
        await interaction.editReply({ embeds: [embed], components: [] });
        if (ticketData.contractChannelId) {
          const log = await client.channels.fetch(ticketData.contractChannelId).catch(() => null);
          if (log) {
            const logEmbed = new EmbedBuilder().setTitle("📄 Contract Signed").setDescription(`${user} signed the agreement.`).setColor("#00FF00").setTimestamp();
            await log.send({ embeds: [logEmbed] });
          }
        }
      } else if (custom_id === "close_ticket") {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: 100 });
        let transcript = `Transcript for ${channel.name}\n\n`;
        messages.reverse().forEach(m => {
          transcript += `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}\n`;
          m.embeds.forEach(e => transcript += `[EMBED] ${e.title || "No Title"} - ${e.description || "No Description"}\n`);
        });
        const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf-8"), { name: `transcript-${channel.name}.txt` });
        if (ticketData.transcriptChannelId) {
          const tc = await client.channels.fetch(ticketData.transcriptChannelId).catch(() => null);
          if (tc) await tc.send({ content: `Transcript for ${channel.name}`, files: [attachment] });
        }
        await interaction.editReply({ content: "✅ Ticket closed. Deleting in 5 seconds." });
        setTimeout(() => channel.delete().catch(() => {}), 5000);
      } else if (interaction.isStringSelectMenu()) {
        if (custom_id === "select_contract") {
          const fileName = interaction.values[0];
          const contractType = fileName.replace(".txt", "");
          
          try {
            const contractText = readFileSync(`./contracts/${fileName}`, "utf8");
            const chunks = [];
            for (let i = 0; i < contractText.length; i += 3000) {
              chunks.push(contractText.substring(i, i + 3000));
            }

            await interaction.deferReply();

            for (let i = 0; i < chunks.length; i++) {
              const embed = new EmbedBuilder()
                .setTitle(i === 0 ? contractType : `${contractType} (Cont.)`)
                .setDescription(chunks[i])
                .setColor("#D4AF37");
              
              if (i === chunks.length - 1) {
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`sign_contract_init_${contractType}`)
                    .setLabel("Sign")
                    .setEmoji("🖋️")
                    .setStyle(ButtonStyle.Success)
                );
                await interaction.followUp({ embeds: [embed], components: [row] });
              } else {
                await interaction.followUp({ embeds: [embed] });
              }
            }
          } catch (err) {
            console.error("Contract select error:", err);
            await interaction.followUp({ content: "❌ Error: Could not read contract file.", ephemeral: true });
          }
        }
      }
    } else if (interaction.isModalSubmit()) {
      const { customId: custom_id, fields, guild, user, channel } = interaction;
      
      if (custom_id.startsWith("sign_modal_")) {
        const contractType = custom_id.replace("sign_modal_", "");
        const name = fields.getTextInputValue("signer_name");
        const date = fields.getTextInputValue("sign_date");

        const signEmbed = new EmbedBuilder()
          .setTitle("🏛️ OFFICIAL LEGAL FILING")
          .setAuthor({ name: "Goodman & Haller | Blackstone", iconURL: "https://i.postimg.cc/15j6MgxY/Untitled-design-(6).png" })
          .setDescription(`This document serves as an official record of legal agreement between **Goodman & Haller | Blackstone** and the undersigned party.\n\n**CONTRACT:** ${contractType}\n\n**STATUS:** SIGNED & VERIFIED`)
          .addFields(
            { name: "👤 Client Name", value: `\`${name}\``, inline: true },
            { name: "📅 Execution Date", value: `\`${date}\``, inline: true },
            { name: "⚖️ Authorized Representative", value: "Saul Goodman & Mickey Haller", inline: false }
          )
          .setColor("#D4AF37")
          .setThumbnail("https://i.postimg.cc/15j6MgxY/Untitled-design-(6).png")
          .setFooter({ text: "Confidential Legal Document | Goodman & Haller", iconURL: guild.iconURL() })
          .setTimestamp();

        // Update original message
        await interaction.update({ components: [] });
        await channel.send({ embeds: [signEmbed] });

        // Send to setup contract channel
        if (ticketData.contractChannelId) {
          const logChannel = await guild.channels.fetch(ticketData.contractChannelId).catch(() => null);
          if (logChannel) {
            await logChannel.send({ content: `📄 **New Signed Contract: ${contractType}**\nExecuted by ${user} in ${channel}`, embeds: [signEmbed] });
          }
        }
        return;
      }

      if (custom_id.startsWith("modal_")) {
        const typeId = custom_id.replace("modal_", "");
        const buttonConfig = config.ticketPanel.buttons.find(b => b.id === typeId);
        const caseId = ticketData.caseNumber++;
        saveTicketData();
        const channel = await guild.channels.create({
          name: `${buttonConfig.prefix.toLowerCase()}-${caseId}`,
          type: ChannelType.GuildText,
          parent: ticketData.categoryId,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
            { id: config.roles.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
          ],
        });
        const embed = new EmbedBuilder().setTitle(config.ticketEmbed.title).setDescription(config.ticketEmbed.description).setColor(config.ticketEmbed.color).setImage(config.ticketEmbed.image).setFooter({ text: config.ticketEmbed.footer });
        let fieldData = "";
        buttonConfig.formFields.forEach(f => fieldData += `**${f.label}:** ${fields.getTextInputValue(f.id)}\n`);
        embed.addFields({ name: "Form Details", value: fieldData });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket").setLabel("Close").setStyle(ButtonStyle.Danger));
        await channel.send({ content: `${user} <@&${config.roles.supportRoleId}>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error(`[ERROR] [${new Date().toISOString()}] Interaction error:`, err);
    try {
      if (interaction.deferred) await interaction.editReply({ content: "❌ Internal error." });
      else if (!interaction.replied) await interaction.reply({ content: "❌ Internal error.", ephemeral: true });
    } catch {}
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
