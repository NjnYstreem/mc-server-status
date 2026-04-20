const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ActivityType } = require('discord.js');
const { status } = require('minecraft-server-util');
const path = require('path');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const ID_FILE = path.join(__dirname, 'message_id.txt');
let statusMessageId = loadMessageId();
let lastPlayerCount = null;

function loadMessageId() {
    try {
        if (fs.existsSync(ID_FILE)) return fs.readFileSync(ID_FILE, 'utf8').trim();
    } catch { }
    return null;
}

function saveMessageId(id) {
    fs.writeFileSync(ID_FILE, id, 'utf8');
}

function clearMessageId() {
    try { fs.unlinkSync(ID_FILE); } catch { }
}

// ─── Fetch Minecraft server status ───────────────────────────────────────────
async function fetchServerStatus() {
    try {
        const result = await status(config.minecraft.host, config.minecraft.port, {
            timeout: 5000,
            enableSRV: true,
        });
        return {
            online: true,
            players: result.players.online,
            maxPlayers: result.players.max,
            latency: result.roundTripLatency,
        };
    } catch {
        return {
            online: false,
            players: 0,
            maxPlayers: 0,
            latency: null,
        };
    }
}

// ─── Build embed ──────────────────────────────────────────────────────────────
function buildEmbed(data) {
    const isOnline = data.online;
    const logoExt = config.animatedLogo ? 'gif' : 'png';
    const bannerExt = config.animatedBanner ? 'gif' : 'png';

    return new EmbedBuilder()
        .setTitle(`${config.minecraft.name} | Server Status`)
        .setColor(isOnline ? config.embedColorOnline : config.embedColorOffline)
        .setThumbnail(`attachment://logo.${logoExt}`)
        .addFields(
            {
                name: '🖥️  Server Name',
                value: `\`\`\`${config.minecraft.name}\`\`\``,
                inline: false,
            },
            {
                name: '🔗  IP Address',
                value: `\`\`\`${config.minecraft.host}\`\`\``,
                inline: false,
            },
            {
                name: '👥  Players Online',
                value: `\`\`\`${isOnline ? `${data.players}/${data.maxPlayers}` : 'N/A'}\`\`\``,
                inline: false,
            },
            {
                name: '📡  Status',
                value: isOnline ? '🟢  Online' : '🔴  Offline',
                inline: true,
            },
            {
                name: '🎮  Version',
                value: `\`${config.minecraft.version}\``,
                inline: true,
            },
            {
                name: '🏓  Latency',
                value: isOnline ? `\`${data.latency}ms\`` : '`N/A`',
                inline: true,
            }
        )
        .setImage(`attachment://banner.${bannerExt}`)
        .setFooter({
            text: `${config.minecraft.name} • Last updated ${new Date().toLocaleTimeString()}`,
        })
        .setTimestamp();
}

async function updateStatus() {
    try {
        const channel = await client.channels.fetch(config.channelId);
        const data = await fetchServerStatus();
        const embed = buildEmbed(data);

        const logoFile = config.animatedLogo ? 'logo.gif' : 'logo.png';
        const bannerFile = config.animatedBanner ? 'banner.gif' : 'banner.png';

        const logo = new AttachmentBuilder(path.join(__dirname, logoFile), { name: logoFile });
        const banner = new AttachmentBuilder(path.join(__dirname, bannerFile), { name: bannerFile });

        const payload = { embeds: [embed], files: [logo, banner] };

        lastPlayerCount = data.players;

        // Bot presence
        client.user.setPresence({
            activities: [{
                name: data.online
                    ? `${data.players}/${data.maxPlayers} players on ${config.minecraft.name}`
                    : `Server Offline`,
                type: ActivityType.Watching,
            }],
            status: config.botStatus,
        });

        if (statusMessageId) {
            try {
                const existing = await channel.messages.fetch(statusMessageId);
                await existing.edit(payload);
                return;
            } catch {
                statusMessageId = null;
                clearMessageId();
            }
        }

        try {
            const messages = await channel.messages.fetch({ limit: 20 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            for (const msg of botMessages.values()) {
                await msg.delete();
            }
        } catch { }

        const sent = await channel.send(payload);
        statusMessageId = sent.id;
        saveMessageId(sent.id);

    } catch (err) {
        console.error('Error updating status:', err);
    }
}

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    client.user.setPresence({
        activities: [{
            name: 'Starting up...',
            type: ActivityType.Watching,
        }],
        status: config.botStatus,
    });

    await updateStatus();
    setInterval(updateStatus, config.updateIntervalSeconds * 1000);
});

client.login(config.token);