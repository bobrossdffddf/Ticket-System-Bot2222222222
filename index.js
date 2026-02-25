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
  console.log(`[LOG] [${new Date().toISOString()}] Message from ${message.author.tag} in ${message.guild ? message.guild.name : "DMs"}: ${message.content}`);

  if (message.guild === null && message.content.toLowerCase() === "done") {
    const userId = message.author.id;
    const userBills = ticketData.bills?.[userId] || [];
    const pendingBill = userBills.find(b => b.status === "Pending" || b.status === "Overdue" || b.status === "Rejected");

    if (!pendingBill) {
      return message.channel.send("❌ You don't have any pending bills to pay.");
    }

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
      exec("git pull", (error, stdout, stderr) => {
        process.exit(0);
      });
    } else if (message.content === "$git v") {
      const { exec } = await import("child_process");
      exec('git log -1 --pretty=format:"%h - %s (%cr)"', (error, stdout, stderr) => {
        if (error) return message.reply(`❌ Error: ${error.message}`);
        message.reply(`📦 **Current Version:**\n\`${stdout}\``);
      });
    }
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
        description: "Send a legal retainer agreement (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
          { name: "target", description: "User to send the contract to", type: 6, required: false },
        ],
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

client.on("interactionCreate", async (interaction) => {
  console.log(`[LOG] [${new Date().toISOString()}] Interaction: ${interaction.type} by ${interaction.user.tag}`);
  if (interaction.isChatInputCommand()) {
    if (!checkCooldown(interaction.user.id, "command")) {
      return interaction.reply({ content: "⚠️ You are doing that too fast! Please wait a few seconds.", ephemeral: true });
    }
    const { commandName, options, member, guild, channel } = interaction;

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
    } else if (commandName === "setup") {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
      const targetChannel = options.getChannel("channel");
      const category = options.getChannel("category");
      ticketData.panelChannelId = targetChannel.id;
      ticketData.categoryId = category.id;
      saveTicketData();
      await interaction.reply({ content: "✅ Setup complete.", ephemeral: true });
    }
  } else if (interaction.isButton()) {
    if (!checkCooldown(interaction.user.id, "button", 2000)) {
      return interaction.reply({ content: "⚠️ You are clicking buttons too fast!", ephemeral: true });
    }
    const { customId: custom_id, user, guild, message } = interaction;

    if (custom_id.startsWith("paid_button_")) {
      const billId = custom_id.replace("paid_button_", "");
      const bill = ticketData.bills?.[user.id]?.find(b => b.id === billId);
      if (bill) {
        bill.status = "Reviewing";
        saveTicketData();

        await interaction.reply({ content: "Hello! The record of you paying has been recorded and sent to our staff team for review and verification. Please type `/bill view` to see the status of your bill.", ephemeral: true }).catch(console.error);

        // Remove button from user's DM
        try {
          await message.edit({ components: [] });
        } catch (err) {
          console.error("Failed to remove button from user DM:", err);
        }

        const staffChannel = await client.channels.fetch("1476251078382321836").catch(() => null);
        if (staffChannel) {
          const embed = new EmbedBuilder().setTitle("💰 Payment Review").setDescription(`${user} paid their bill of ${bill.amount}`).setColor("#FFFF00");
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`verify_pay_green_${user.id}_${billId}`).setLabel("Verify").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`verify_pay_red_${user.id}_${billId}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
          );
          await staffChannel.send({ embeds: [embed], components: [row] }).catch(console.error);
        }
      }
    } else if (custom_id.startsWith("verify_pay_")) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.editReply({ content: "❌ Admin only." });
      const parts = custom_id.split("_");
      const color = parts[2];
      const targetId = parts[3];
      const billId = parts[4];
      const bill = ticketData.bills?.[targetId]?.find(b => b.id === billId);
      const targetUser = await client.users.fetch(targetId).catch(() => null);

      if (color === "green") {
        if (bill) bill.status = "Paid";
        if (targetUser) {
          const successEmbed = new EmbedBuilder()
            .setTitle("✅ Payment Confirmed")
            .setDescription("Your bill has been considered paid! Thank you for your business.")
            .setColor("#00FF00");
          await targetUser.send({ embeds: [successEmbed] }).catch(() => {});
        }
        await interaction.editReply({ content: "✅ Verified." });
      } else {
        if (bill) bill.status = "Rejected";
        if (targetUser) {
          const rejectEmbed = new EmbedBuilder()
            .setTitle("❌ Payment Rejected")
            .setDescription("It seems like there was an issue with your bill and our staff team has considered it NOT PAID. If you believe it was a mistake please create a support ticket.")
            .setColor("#FF0000");
          
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`paid_button_${billId}`)
              .setLabel("Paid")
              .setStyle(ButtonStyle.Success)
          );

          await targetUser.send({ embeds: [rejectEmbed], components: [row] }).catch(() => {});
        }
        await interaction.editReply({ content: "❌ Denied." });
      }
      saveTicketData();
      try {
        await message.edit({ components: [] });
      } catch (err) {
        console.error("Failed to edit message:", err);
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
