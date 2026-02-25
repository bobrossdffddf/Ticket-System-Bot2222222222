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
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import dotenv from "dotenv";
import http from "http";
import { createCanvas, loadImage } from "canvas";

// Dummy HTTP server to satisfy Replit's port 5000 requirement
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
  ],
});

let config = JSON.parse(readFileSync("./config.json", "utf8"));
let ticketData = existsSync("./tickets.json")
  ? JSON.parse(readFileSync("./tickets.json", "utf8"))
  : { caseNumber: 1, activeTickets: {} };

function saveTicketData() {
  writeFileSync("./tickets.json", JSON.stringify(ticketData, null, 2));
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.guild === null && message.content.toLowerCase() === "done") {
    // Check if user has an active bill
    const userId = message.author.id;
    if (!ticketData.bills) ticketData.bills = {};
    if (!ticketData.bills[userId]) {
      ticketData.bills[userId] = [];
    }

    // If no active bill, create one for testing/demonstration or just find the latest
    let bill = ticketData.bills[userId].find(b => b.status === "Pending" || b.status === "Overdue");
    
    if (!bill) {
      // Create a default bill if none exists so the "done" command actually does something
      bill = {
        id: Date.now().toString(),
        status: "Pending",
        date: new Date().toLocaleDateString(),
        amount: "Variable"
      };
      ticketData.bills[userId].push(bill);
      saveTicketData();
    }

    const embed = new EmbedBuilder()
      .setTitle("Payment Confirmation")
      .setDescription("Please confirm your payment by clicking the button below.")
      .setColor("#D4AF37");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`paid_button_${bill.id}`)
        .setLabel("Paid")
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.once("ready", async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity(config.status || "Watching the law", { type: 3 });

  try {
    await client.application.commands.set([
      {
        name: "setup",
        description: "Setup the ticket system (Admin only)",
        default_member_permissions:
          PermissionFlagsBits.Administrator.toString(),
        options: [
          {
            name: "channel",
            description: "Channel to send the ticket panel",
            type: 7,
            required: true,
            channel_types: [0],
          },
          {
            name: "category",
            description: "Category for ticket channels",
            type: 7,
            required: true,
            channel_types: [4],
          },
          {
            name: "verification",
            description: "Channel for verification system",
            type: 7,
            required: false,
            channel_types: [0],
          },
          {
            name: "transcripts",
            description: "Channel for ticket transcripts",
            type: 7,
            required: false,
            channel_types: [0],
          },
          {
            name: "contracts",
            description: "Channel for signed contract logs",
            type: 7,
            required: false,
            channel_types: [0],
          },
        ],
      },
      {
        name: "client",
        description: "Give the ticket creator the client role (Admin only)",
        default_member_permissions:
          PermissionFlagsBits.Administrator.toString(),
      },
      {
        name: "close",
        description: "Close the current ticket and create a transcript",
      },
      {
        name: "contract",
        description: "Send a legal retainer agreement (Admin only)",
        default_member_permissions:
          PermissionFlagsBits.Administrator.toString(),
        options: [
          {
            name: "target",
            description:
              "User to send the contract to (optional, defaults to current channel)",
            type: 6,
            required: false,
          },
        ],
      },
      {
        name: "corporate",
        description: "Create a corporate category and channels (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
          {
            name: "create",
            description: "Create a new corporate setup",
            type: 1, // Subcommand
            options: [
              {
                name: "name",
                description: "Name of the corporation",
                type: 3,
                required: true,
              },
              {
                name: "users",
                description: "Users to add (mention them)",
                type: 3,
                required: true,
              },
              {
                name: "role",
                description: "Custom role name (optional)",
                type: 3,
                required: false,
              },
            ],
          },
        ],
      },
      {
        name: "bill",
        description: "Billing commands",
        options: [
          {
            name: "view",
            description: "View your current bill status",
            type: 1,
          },
        ],
      },
    ]);
    console.log("✅ Slash commands registered");
    
    // Simple daily reminder system
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 9 && now.getMinutes() === 0) { // Every day at 9 AM
        console.log("Checking for daily billing reminders...");
        if (ticketData.bills) {
          for (const [userId, bills] of Object.entries(ticketData.bills)) {
            const unpaidBill = bills.find(b => b.status === "Pending" || b.status === "Overdue");
            if (unpaidBill) {
              try {
                const user = await client.users.fetch(userId);
                const embed = new EmbedBuilder()
                  .setTitle("💳 Payment Reminder")
                  .setDescription(`Hello! This is a reminder regarding your outstanding bill from ${unpaidBill.date}.\n\nPlease press the button below once you have completed the payment.`)
                  .setColor("#D4AF37")
                  .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`paid_button_${unpaidBill.id}`)
                    .setLabel("Paid")
                    .setStyle(ButtonStyle.Success)
                );

                await user.send({ embeds: [embed], components: [row] });
                console.log(`Sent reminder to ${user.tag}`);
              } catch (err) {
                console.error(`Failed to send reminder to ${userId}:`, err);
              }
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
  const autoRoleId = config.roles.autoRoleId;
  if (autoRoleId) {
    const role = member.guild.roles.cache.get(autoRoleId);
    if (role) {
      try {
        await member.roles.add(role);
        console.log(`✅ Auto-role assigned to ${member.user.tag}`);
      } catch (err) {
        console.error(
          `❌ Failed to assign auto-role to ${member.user.tag}:`,
          err,
        );
      }
    }
  }

  // Welcome Message
  const welcomeChannelId = "1475540377762140311";
  const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
  if (welcomeChannel) {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle("Welcome to Goodman & Haller | Blackstone")
      .setDescription(
        `Welcome ${member} to Goodman & Haller | Blackstone. We are here to help.\n\n` +
        `If you have any questions about billing please go to <#1475674313867788420>.\n\n` +
        `If you have recently been arrested visit <#1475539923770802307> and then visit <#1475540091886895274> to acquire our services.\n\n` +
        `If you have any questions please ping <@848356730256883744> or <@705288047415001100>.`
      )
      .setColor("#D4AF37")
      .setTimestamp();

    welcomeChannel.send({
      content: `${member}`,
      embeds: [welcomeEmbed],
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  const timestamp = new Date().toLocaleString();
  const userTag = interaction.user.tag;
  const userId = interaction.user.id;

  if (interaction.isChatInputCommand()) {
    const { commandName, guild, channel } = interaction;
    console.log(
      `[${timestamp}] COMMAND: /${commandName} | User: ${userTag} (${userId}) | Guild: ${guild?.name} | Channel: ${channel?.name}`,
    );

    if (commandName === "setup") {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
      }

      const targetChannel = interaction.options.getChannel("channel");
      const category = interaction.options.getChannel("category");
      const verificationChannel =
        interaction.options.getChannel("verification");
      const transcriptChannel = interaction.options.getChannel("transcripts");
      const contractLogChannel = interaction.options.getChannel("contracts");

      if (!targetChannel || !category) {
        return interaction.reply({
          content: "❌ Invalid channel or category provided.",
          ephemeral: true,
        });
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

      const buttons = config.ticketPanel.buttons.map((btn) => {
        const button = new ButtonBuilder()
          .setCustomId(`ticket_${btn.id}`)
          .setLabel(btn.label)
          .setEmoji(btn.emoji);

        if (typeof btn.style === "string") {
          button.setStyle(
            ButtonStyle[
              btn.style.charAt(0).toUpperCase() +
                btn.style.slice(1).toLowerCase()
            ] || ButtonStyle.Primary,
          );
        } else {
          button.setStyle(btn.style || ButtonStyle.Primary);
        }

        return button;
      });

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(
          new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)),
        );
      }

      await targetChannel.send({ embeds: [embed], components: rows });

      // Send Verification Panel if verification channel is provided
      if (verificationChannel) {
        const verifyEmbed = new EmbedBuilder()
          .setTitle(config.verification.title)
          .setDescription(config.verification.description)
          .setColor(config.verification.color || "#5865F2")
          .setTimestamp();

        if (config.verification.image) {
          verifyEmbed.setImage(config.verification.image);
        }

        const verifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel(config.verification.buttonLabel)
            .setStyle(ButtonStyle.Success),
        );

        await verificationChannel.send({
          embeds: [verifyEmbed],
          components: [verifyRow],
        });
      }

      try {
        await interaction.reply({
          content: `✅ Setup complete!\nPanel: ${targetChannel}\nCategory: ${category.name}${verificationChannel ? `\nVerification: ${verificationChannel}` : ""}${transcriptChannel ? `\nTranscripts: ${transcriptChannel}` : ""}${contractLogChannel ? `\nContract Logs: ${contractLogChannel}` : ""}`,
          ephemeral: true,
        });
      } catch (err) {
        if (err.code !== 10062)
          console.error("Failed to reply to interaction:", err);
      }
    }

    if (commandName === "client") {
      const ticketId = ticketData.activeTickets[channel.id];
      if (!ticketId) {
        return interaction.reply({
          content: "❌ This command can only be used in ticket channels.",
          ephemeral: true,
        });
      }

      const ticketInfo = Object.values(ticketData.activeTickets).find(
        (t) => t.channelId === channel.id,
      );
      if (!ticketInfo) {
        return interaction.reply({
          content: "❌ Ticket data not found.",
          ephemeral: true,
        });
      }

      const clientRole = guild.roles.cache.find(
        (r) => r.name === config.roles.clientRoleName,
      );
      if (!clientRole) {
        return interaction.reply({
          content: `❌ Client role "${config.roles.clientRoleName}" not found. Please create it first.`,
          ephemeral: true,
        });
      }

      const ticketCreator = await guild.members.fetch(ticketInfo.userId);
      if (!ticketCreator) {
        return interaction.reply({
          content: "❌ Could not find the ticket creator.",
          ephemeral: true,
        });
      }

      await ticketCreator.roles.add(clientRole);
      await interaction.reply({
        content: `✅ ${ticketCreator} has been given the ${clientRole} role!`,
      });
    }

    if (commandName === "close") {
      const ticketInfo = Object.values(ticketData.activeTickets).find(
        (t) => t.channelId === channel.id,
      );
      if (!ticketInfo) {
        return interaction.reply({
          content: "❌ This command can only be used in ticket channels.",
          ephemeral: true,
        });
      }

      // Only allow the ticket creator or an administrator to close the ticket
      if (
        interaction.user.id !== ticketInfo.userId &&
        !member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content:
            "❌ Only the ticket creator or an administrator can close this ticket.",
          ephemeral: true,
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setTitle("⚠️ Close Ticket?")
        .setDescription(
          "Are you sure you want to close this ticket? A transcript will be created.",
        )
        .setColor("#FEE75C");

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_confirm")
          .setLabel("Yes, Close Ticket")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("close_cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [confirmRow],
        ephemeral: true,
      });
    }

    if (commandName === "contract") {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
      }

      const targetUser = interaction.options.getUser("target");

      try {
        const assetsDir = "./attached_assets";
        if (!existsSync(assetsDir)) {
          return interaction.reply({
            content: "❌ attached_assets directory not found.",
            ephemeral: true,
          });
        }
        const files = readdirSync(assetsDir).filter((f) => f.endsWith(".txt"));

        if (files.length === 0) {
          return interaction.reply({
            content: "❌ No contract templates found in attached_assets.",
            ephemeral: true,
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId("select_contract")
          .setPlaceholder("Select a contract to send")
          .addOptions(
            files.map((f) => ({
              label: f.replace(".txt", "").replace(/_/g, " ").slice(0, 100),
              value: f,
            })),
          );

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.reply({
          content: `Select which contract you would like to send${targetUser ? ` to ${targetUser}` : ""}:`,
          components: [row],
          ephemeral: true,
        });

        // Store target user if provided
        if (targetUser) {
          interaction.client.contractTargets =
            interaction.client.contractTargets || new Map();
          interaction.client.contractTargets.set(
            interaction.user.id,
            targetUser.id,
          );
        }
      } catch (err) {
        console.error("Error in contract command:", err);
        await interaction.reply({
          content: "❌ Failed to load contract templates.",
          ephemeral: true,
        });
      }
    }

    if (commandName === "corporate") {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "create") {
        const name = interaction.options.getString("name");
        const usersString = interaction.options.getString("users");
        const customRoleName = interaction.options.getString("role");

        await interaction.deferReply({ ephemeral: true });

        try {
          // Extract user IDs from mentions
          const userIds = [...usersString.matchAll(/<@!?(\d+)>/g)].map(m => m[1]);
          if (userIds.length === 0) {
            return interaction.editReply("❌ No valid users mentioned.");
          }

          let role;
          if (customRoleName) {
            role = await guild.roles.create({
              name: customRoleName,
              reason: `Corporate role for ${name}`,
            });
            for (const id of userIds) {
              try {
                const member = await guild.members.fetch(id);
                await member.roles.add(role);
              } catch (e) {
                console.error(`Failed to add role to ${id}:`, e);
              }
            }
          }

          const category = await guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
              ...userIds.map(id => ({
                id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
              })),
              ...(role ? [{
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
              }] : [])
            ],
          });

          const channels = [
            { name: `${name}-correspondence`, type: ChannelType.GuildText },
            { name: `${name}-announcements`, type: ChannelType.GuildText },
            { name: `${name}-meeting-room`, type: ChannelType.GuildVoice },
          ];

          for (const chan of channels) {
            await guild.channels.create({
              name: chan.name,
              type: chan.type,
              parent: category.id,
            });
          }

          await interaction.editReply(`✅ Corporate setup for **${name}** created successfully!`);
        } catch (error) {
          console.error("Error creating corporate setup:", error);
          await interaction.editReply(`❌ Error: ${error.message}`);
        }
      }
    }

    if (commandName === "bill") {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "view") {
        const userBills = ticketData.bills?.[interaction.user.id] || [];
        if (userBills.length === 0) {
          return interaction.reply({ content: "You have no active bills.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle("Your Bills")
          .setColor("#D4AF37")
          .setTimestamp();

        let desc = "";
        userBills.forEach((bill, index) => {
          desc += `**Bill #${index + 1}**\nStatus: ${bill.status}\nDate: ${bill.date}\n\n`;
        });
        embed.setDescription(desc);

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_contract") {
      const fileName = interaction.values[0];
      const targetUserId = interaction.client.contractTargets?.get(
        interaction.user.id,
      );
      const targetUser = targetUserId
        ? await interaction.guild.members.fetch(targetUserId)
        : null;

      try {
        const contractText = readFileSync(
          `./attached_assets/${fileName}`,
          "utf8",
        );
        const title = fileName
          .replace(".txt", "")
          .replace(/_/g, " ")
          .toUpperCase();

        const embed = new EmbedBuilder()
          .setTitle(`⚖️ ${title}`)
          .setDescription(contractText.slice(0, 4000))
          .setColor("#2C2F33")
          .setFooter({ text: "Goodman & Haller | Blackstone" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sign_contract_${fileName}`)
            .setLabel("Sign Agreement")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🖋️"),
        );

        const messagePayload = {
          content: targetUser ? `${targetUser}` : null,
          embeds: [embed],
          components: [row],
        };

        if (targetUser) {
          await interaction.channel.send(messagePayload);
          await interaction.update({
            content: `✅ Sent contract to ${targetUser}`,
            embeds: [],
            components: [],
          });
        } else {
          await interaction.update({
            content: null,
            embeds: [embed],
            components: [row],
          });
        }

        interaction.client.contractTargets?.delete(interaction.user.id);
      } catch (err) {
        console.error("Error sending contract:", err);
        await interaction.update({
          content: "❌ Failed to send the selected contract.",
          components: [],
        });
      }
    }
  }

  if (interaction.isButton()) {
    const { customId, guild, member, channel } = interaction;
    console.log(
      `[${timestamp}] BUTTON: ${customId} | User: ${userTag} (${userId}) | Guild: ${guild?.name} | Channel: ${channel?.name}`,
    );

    if (customId.startsWith("sign_contract_")) {
      const fileName = customId.replace("sign_contract_", "");
      const modal = new ModalBuilder()
        .setCustomId(`modal_contract_sign_${fileName}`)
        .setTitle("Sign Retainer Agreement");

      const nameInput = new TextInputBuilder()
        .setCustomId("client_name")
        .setLabel("Full Legal Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your full name")
        .setRequired(true);

      const dateInput = new TextInputBuilder()
        .setCustomId("sign_date")
        .setLabel("Date")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("MM/DD/YYYY")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(dateInput),
      );

      await interaction.showModal(modal);
    }

    if (customId.startsWith("ticket_")) {
      const buttonType = customId.replace("ticket_", "");
      const buttonConfig = config.ticketPanel.buttons.find(
        (b) => b.id === buttonType,
      );

      if (!buttonConfig) {
        return interaction.reply({
          content: "❌ Invalid ticket type.",
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_${buttonType}`)
        .setTitle(buttonConfig.formTitle);

      buttonConfig.formFields.forEach((field) => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(
            TextInputStyle[
              field.style.charAt(0).toUpperCase() +
                field.style.slice(1).toLowerCase()
            ] || TextInputStyle.Paragraph,
          )
          .setPlaceholder(field.placeholder || "")
          .setRequired(field.required)
          .setMaxLength(field.maxLength);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
      });

      await interaction.showModal(modal);
    }

    if (customId === "paid_button") {
      const userId = interaction.user.id;
      if (!ticketData.bills) ticketData.bills = {};
      if (!ticketData.bills[userId]) ticketData.bills[userId] = [];
      
      const billId = Date.now();
      ticketData.bills[userId].push({
        id: billId,
        status: "Reviewing",
        date: new Date().toLocaleDateString(),
      });
      saveTicketData();

      const staffChannelId = "1476251078382321836";
      const staffChannel = interaction.guild.channels.cache.get(staffChannelId);
      if (staffChannel) {
        const staffEmbed = new EmbedBuilder()
          .setTitle("Payment Review")
          .setDescription(`${interaction.user} paid their bill.`)
          .setColor("#D4AF37")
          .setTimestamp();

        const staffRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_payment_${userId}_${billId}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_payment_${userId}_${billId}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
        );

        staffChannel.send({ embeds: [staffEmbed], components: [staffRow] });
      }

      const replyEmbed = new EmbedBuilder()
        .setTitle("Payment Recorded")
        .setDescription("Hello! The record of you paything has been recorded and sent to our staff team for review and verification. Pleases type /bill view to see the status of your bill.")
        .setColor("#D4AF37")
        .setTimestamp();

      await interaction.reply({ embeds: [replyEmbed], ephemeral: true });
    }

    if (customId.startsWith("approve_payment_") || customId.startsWith("deny_payment_")) {
      const parts = customId.split("_");
      const action = parts[0];
      const targetUserId = parts[2];
      const billId = parts[3];

      const bills = ticketData.bills?.[targetUserId] || [];
      const bill = bills.find(b => b.id.toString() === billId);
      
      try {
        const targetUser = await client.users.fetch(targetUserId);
        if (action === "approve") {
          if (bill) bill.status = "Paid";
          await targetUser.send("Your bill has been considered paid! Thank you for your business.");
          await interaction.reply({ content: `✅ Approved payment for <@${targetUserId}>`, ephemeral: true });
        } else {
          if (bill) bill.status = "Denied";
          await targetUser.send("It seems like their was an issue with your bill and our staff team has considered it NOT PAID. If you belive it was a mistake please create a support ticket.");
          await interaction.reply({ content: `❌ Denied payment for <@${targetUserId}>`, ephemeral: true });
        }
        saveTicketData();
        
        // Disable buttons on the original message
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("approved").setLabel("Approved").setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId("denied").setLabel("Denied").setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        await interaction.message.edit({ components: [disabledRow] });
      } catch (err) {
        console.error("Error handling payment action:", err);
        await interaction.reply({ content: "❌ Failed to process action or send DM.", ephemeral: true });
      }
    }

    if (customId.startsWith("paid_button_")) {
      const billId = customId.replace("paid_button_", "");
      const userId = interaction.user.id;
      
      if (ticketData.bills && ticketData.bills[userId]) {
        const bill = ticketData.bills[userId].find(b => b.id === billId);
        if (bill) {
          bill.status = "Reviewing";
          saveTicketData();
        }
      }

      const responseEmbed = new EmbedBuilder()
        .setTitle("Payment Recorded")
        .setDescription("Hello! The record of you paything has been recorded and sent to our staff team for review and verification. Pleases type /bill view to see the status of your bill.")
        .setColor("#57F287")
        .setTimestamp();

      await interaction.reply({ embeds: [responseEmbed] });

      // Notify staff
      const supportRoleId = config.roles.supportRoleId;
      const staffChannelId = ticketData.transcriptChannelId; // Using transcript channel as a fallback log
      const staffChannel = guild?.channels.cache.get(staffChannelId) || (await client.channels.fetch(staffChannelId).catch(() => null));
      
      if (staffChannel) {
        const staffEmbed = new EmbedBuilder()
          .setTitle("💰 Payment for Review")
          .setDescription(`${interaction.user} paid their bill of ${bill ? bill.amount : "Variable"}\n**Bill ID:** ${billId}`)
          .setColor("#D4AF37")
          .setTimestamp();
        
        const staffRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_payment_${userId}_${billId}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_payment_${userId}_${billId}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
        );

        await staffChannel.send({ 
          content: supportRoleId ? `<@&${supportRoleId}>` : null, 
          embeds: [staffEmbed],
          components: [staffRow]
        });
      }
      return;
    }

    if (customId.startsWith("approve_payment_")) {
      const parts = customId.split("_");
      const targetUserId = parts[2];
      const billId = parts[3];

      if (ticketData.bills && ticketData.bills[targetUserId]) {
        const bill = ticketData.bills[targetUserId].find(b => b.id === billId);
        if (bill) {
          bill.status = "Paid";
          saveTicketData();
        }
      }

      try {
        const targetUser = await client.users.fetch(targetUserId);
        await targetUser.send("Your bill has been considered paid! Thank you for your business.");
      } catch (err) {
        console.error("Failed to send approval DM:", err);
      }

      await interaction.update({ 
        content: `✅ Payment approved for <@${targetUserId}>`,
        components: [] 
      });
      return;
    }

    if (customId.startsWith("deny_payment_")) {
      const parts = customId.split("_");
      const targetUserId = parts[2];
      const billId = parts[3];

      if (ticketData.bills && ticketData.bills[targetUserId]) {
        const bill = ticketData.bills[targetUserId].find(b => b.id === billId);
        if (bill) {
          bill.status = "Denied";
          saveTicketData();
        }
      }

      try {
        const targetUser = await client.users.fetch(targetUserId);
        await targetUser.send("It seems like there was an issue with your bill and our staff team has considered it NOT PAID. If you believe it was a mistake please create a support ticket.");
      } catch (err) {
        console.error("Failed to send denial DM:", err);
      }

      await interaction.update({ 
        content: `❌ Payment denied for <@${targetUserId}>`,
        components: [] 
      });
      return;
    }

    if (customId === "close_confirm") {
      const ticketInfo = Object.values(ticketData.activeTickets).find(
        (t) => t.channelId === channel.id,
      );
      if (!ticketInfo) {
        return interaction.update({
          content: "❌ Ticket data not found.",
          embeds: [],
          components: [],
        });
      }

      await interaction.update({
        content: "🔒 Closing ticket and creating transcript...",
        embeds: [],
        components: [],
      });

      const messages = await channel.messages.fetch({ limit: 100 });
      const transcript = Array.from(messages.values())
        .reverse()
        .map(
          (m) =>
            `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`,
        )
        .join("\n");

      const transcriptChannel = guild.channels.cache.get(
        ticketData.transcriptChannelId,
      );
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setTitle(`📝 Ticket Transcript - Case #${ticketInfo.caseNumber}`)
          .setDescription(
            `**Created by:** <@${ticketInfo.userId}>\n**Ticket Type:** ${ticketInfo.type}\n**Closed by:** <@${interaction.user.id}>`,
          )
          .setColor("#5865F2")
          .setTimestamp();

        if (config.transcriptEmbed && config.transcriptEmbed.image) {
          transcriptEmbed.setImage(config.transcriptEmbed.image);
        }

        try {
          const thread = await transcriptChannel.threads.create({
            name: `case-${ticketInfo.caseNumber}`,
            autoArchiveDuration: 60,
            reason: "Ticket closed - transcript created",
          });

          await thread.send({ embeds: [transcriptEmbed] });
          
          // Split transcript into chunks of 1900 characters to avoid Discord's 2000 character limit
          const chunks = transcript.match(/[\s\S]{1,1900}/g) || [];
          for (const chunk of chunks) {
            await thread.send({
              content: `\`\`\`\n${chunk}\n\`\`\``,
            });
          }
        } catch (error) {
          console.error("Failed to create transcript thread:", error);
        }
      }

      delete ticketData.activeTickets[channel.id];
      saveTicketData();

      setTimeout(() => channel.delete(), 5000);
    }

    if (customId === "close_cancel") {
      await interaction.update({
        content: "❌ Ticket closure cancelled.",
        embeds: [],
        components: [],
      });
    }

    if (customId === "verify_user") {
      const verifyRoleId = config.roles.verifyRoleId;
      const autoRoleId = config.roles.autoRoleId;

      if (!verifyRoleId) {
        return interaction.reply({
          content: "❌ Verification role is not configured.",
          ephemeral: true,
        });
      }

      const role = guild.roles.cache.get(verifyRoleId);
      if (!role) {
        return interaction.reply({
          content: "❌ Verification role not found in server.",
          ephemeral: true,
        });
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

        await interaction.reply({
          content: "✅ You have been verified!",
          ephemeral: true,
        });
      } catch (err) {
        console.error("Verification error:", err);
        await interaction.reply({
          content:
            "❌ Failed to assign verification role. Please contact an admin.",
          ephemeral: true,
        });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const { customId, fields, guild, user } = interaction;
    console.log(
      `[${timestamp}] MODAL: ${customId} | User: ${userTag} (${userId}) | Guild: ${guild?.name}`,
    );

    if (customId.startsWith("modal_contract_sign_")) {
      await interaction.deferReply();
      const fileName = customId.replace("modal_contract_sign_", "");
      const clientName = fields.getTextInputValue("client_name");
      const signDate = fields.getTextInputValue("sign_date");

      console.log(
        `[${timestamp}] Processing contract ${fileName} for: ${clientName} on ${signDate}`,
      );

      try {
        const imagePath = "./attached_assets/image_1771993360063.png";
        if (!existsSync(imagePath)) {
          console.error(`❌ Image not found at: ${imagePath}`);
          return interaction.editReply({
            content:
              "❌ Template image not found. Please contact an administrator.",
          });
        }

        const image = await loadImage(imagePath);

        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d");

        ctx.drawImage(image, 0, 0);

        // Use an italic font for the signature to make it look more like a real signature
        ctx.font = "italic 28px serif";
        ctx.fillStyle = "black";

        // Coordinates for image_1771993360063.png
        // Refined coordinates for underlining based on the new template
        ctx.fillText(clientName, 240, 742); // Client Name line

        ctx.font = "24px serif";
        ctx.fillText(signDate, 610, 742); // Client Date line
        ctx.fillText(signDate, 610, 816); // Attorney Date line

        const buffer = canvas.toBuffer("image/png");
        const attachment = new AttachmentBuilder(buffer, {
          name: "https://i.postimg.cc/7PjmwZtk/Untitled-design-(13).png",
        });

        const contractTitle = fileName
          .replace(".txt", "")
          .replace(/_/g, " ")
          .toUpperCase();

        const embed = new EmbedBuilder()
          .setTitle("✅ Contract Signed & Executed")
          .setDescription(
            `⸻\n\n**CLIENT ACKNOWLEDGMENT**\n\n⸻\n\nGoodman & Haller | Blackstone\nBy: Mickey Haller, Esq.\n\n\n**CLIENT NAME:** __${clientName}__                     **DATE:** __${signDate}__\n\n**ATTORNEY NAME:** __Saul Goodman__                                **DATE:** __${signDate}__`,
          )
          .setColor("#57F287")
          .setImage("https://i.postimg.cc/7PjmwZtk/Untitled-design-(13).png")
          .setTimestamp();

        // Send public message with embed only
        await interaction.editReply({ embeds: [embed] });

        // Log to contract channel with embed and image if configured
        if (ticketData.contractLogChannelId) {
          const logChannel = guild.channels.cache.get(
            ticketData.contractLogChannelId,
          );
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle(`📜 Signed: ${contractTitle}`)
              .setDescription(
                `**Client:** ${clientName}\n**Discord User:** ${user.tag} (${user.id})\n**Date:** ${signDate}`,
              )
              .setColor("#57F287")
              .setImage(
                "https://i.postimg.cc/7PjmwZtk/Untitled-design-(13).png",
              )
              .setTimestamp();

            await logChannel.send({
              embeds: [logEmbed],
              files: [
                new AttachmentBuilder(buffer, { name: "signed-contract.png" }),
              ],
            });
          }
        }
        console.log(
          `✅ Contract successfully generated and logged for ${clientName}`,
        );
      } catch (err) {
        console.error("❌ Error generating signed contract:", err);
        await interaction.editReply({
          content:
            "❌ There was an error generating your signed contract. Please try again or contact an administrator.",
        });
      }
      return;
    }

    if (customId.startsWith("modal_")) {
      const buttonType = customId.replace("modal_", "");
      const buttonConfig = config.ticketPanel.buttons.find(
        (b) => b.id === buttonType,
      );

      if (!buttonConfig) {
        return interaction.reply({
          content: "❌ Invalid ticket type.",
          ephemeral: true,
        });
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
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: supportRole?.id || guild.roles.everyone.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages,
            ],
          },
        ],
      });

      const formResponses = buttonConfig.formFields
        .map(
          (field) =>
            `**${field.label}:**\n${fields.getTextInputValue(field.id)}`,
        )
        .join("\n\n");

      const ticketEmbed = new EmbedBuilder()
        .setTitle(config.ticketEmbed.title)
        .setDescription(`${config.ticketEmbed.description}\n\n${formResponses}`)
        .setColor(config.ticketEmbed.color || "#57F287")
        .setFooter({ text: config.ticketEmbed.footer })
        .setTimestamp();

      if (config.ticketEmbed.image) {
        ticketEmbed.setImage(config.ticketEmbed.image);
      }

      await ticketChannel.send({
        content: `${user} ${supportRole ? supportRole : "@everyone"}`,
        embeds: [ticketEmbed],
      });

      ticketData.activeTickets[ticketChannel.id] = {
        caseNumber,
        userId: user.id,
        username: user.username,
        type: buttonType,
        channelId: ticketChannel.id,
      };

      if (!ticketData.transcriptChannelId) {
        const transcriptChannel = await guild.channels.create({
          name: "ticket-transcripts",
          type: ChannelType.GuildText,
          reason: "Transcript storage for closed tickets",
        });
        ticketData.transcriptChannelId = transcriptChannel.id;
      }

      saveTicketData();

      await interaction.editReply({
        content: `✅ Ticket created! ${ticketChannel}`,
      });
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const adminId = "848356730256883744";

  if (message.content === "$restart git" && message.author.id === adminId) {
    await message.reply("🔄 Pulling latest changes and restarting...");

    // Update version in status
    const status = config.status || "Watching the law v1.0";
    const versionMatch = status.match(/v(\d+)\.(\d+)/);
    let newStatus;
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]) + 1;
      newStatus = `Watching the law v${major}.${minor}`;
    } else {
      newStatus = "Watching the law v1.1";
    }
    
    config.status = newStatus;
    writeFileSync("./config.json", JSON.stringify(config, null, 2));

    const { exec } = await import("child_process");
    exec("git pull", (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        message.channel.send(`❌ Git Pull Error: ${error.message}`);
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
      process.exit(0);
    });
  }

  if (
    message.content === "$statclear ADMIN ONLY" &&
    message.author.id === adminId
  ) {
    config.status = "Watching the law v1.0";
    writeFileSync("./config.json", JSON.stringify(config, null, 2));
    client.user.setActivity(config.status, { type: 3 });
    await message.reply("✅ Status reset to 'Watching the law v1.0'");
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
