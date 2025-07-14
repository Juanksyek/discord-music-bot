import {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteractionOptionResolver,
    GuildMember,
    EmbedBuilder
} from 'discord.js';
import * as path from 'path';
import * as fs from 'fs';
import {
    queueAndPlay,
    getQueue,
    skipCurrentTrack,
    currentConnection,
    currentPlayer,
    setCurrentPlayer
} from './commands/music';
import * as dotenv from 'dotenv';
import { createAudioPlayer } from '@discordjs/voice';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error('Falta DISCORD_BOT_TOKEN en .env');

let isPaused = false;

// Miniatura y botones
function getVideoId(url: string): string {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    return match ? match[1] : '';
}

function createNowPlayingEmbed(url: string, username: string) {
    const videoId = getVideoId(url);
    return new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🎶 Reproduciendo ahora')
        .setDescription(`[Ver en YouTube](${url})\nSolicitada por: **${username}**`)
        .setImage(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`)
        .setFooter({ text: 'Bot de música de Juan' });
}

function createControlButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('pause_play').setLabel('⏯ Pausa/Play').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('queue').setLabel('📋 Cola').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('stop').setLabel('⏹ Detener').setStyle(ButtonStyle.Danger)
    );
}

// Comando de mensaje (!tocamela)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!tocamela')) return;

    const args = message.content.split(' ').slice(1);
    const query = args.join(' ');
    const member = message.member as GuildMember;

    if (!member.voice.channel || !isValidYouTubeUrl(query)) {
        return message.reply('❌ Debes estar en un canal de voz y proporcionar una URL válida.');
    }

    const embed = createNowPlayingEmbed(query, message.author.username);
    const buttons = createControlButtons();

    await message.reply({ embeds: [embed], components: [buttons] });

    await queueAndPlay({
        url: query,
        voiceChannelId: member.voice.channel.id,
        guildId: message.guild!.id,
        adapterCreator: message.guild!.voiceAdapterCreator,
    });
});

// Comando slash (/tocamela)
client.on('interactionCreate', async (interaction) => {
    console.log(`🔹 Interacción recibida: ${interaction.type}`);

    if (interaction.isCommand()) {
        const { commandName } = interaction;
        console.log(`🟢 Comando recibido: ${commandName}`);

        if (commandName === 'tocamela') {
            const url = (interaction.options as CommandInteractionOptionResolver).getString('url');
            const member = interaction.member as GuildMember;

            console.log(`🎶 Ejecutando /tocamela con URL: ${url}`);

            if (!member.voice.channel || !isValidYouTubeUrl(url)) {
                return interaction.reply({
                    content: '❌ Debes estar en un canal de voz y proporcionar una URL válida.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                await queueAndPlay({
                    url: url!,
                    voiceChannelId: member.voice.channel.id,
                    guildId: interaction.guild!.id,
                    adapterCreator: interaction.guild!.voiceAdapterCreator,
                });

                const embed = createNowPlayingEmbed(url!, member.user.username);
                const buttons = createControlButtons();

                await interaction.editReply({ embeds: [embed], components: [buttons] });
                console.log('✅ Embed enviado');

            } catch (err) {
                console.error('❌ Error en /tocamela:', err);
                await interaction.editReply({ content: '❌ Error al reproducir la canción.' });
            }
        }

        if (commandName === 'cola') {
            const queue = getQueue();
            const list = queue.length
                ? queue.map((track, i) => `\`${i + 1}.\` ${track.url}`).join('\n')
                : '📭 Cola vacía.';
            await interaction.reply({ content: list, ephemeral: true });
        }

        if (commandName === 'skip') {
            skipCurrentTrack();
            await interaction.reply('⏭️ Canción actual saltada.');
        }
    }

    if (interaction.isButton()) {
        console.log(`🟦 Botón presionado: ${interaction.customId}`);

        switch (interaction.customId) {
            case 'pause_play':
                if (!currentPlayer) {
                    await interaction.reply({ content: '❌ No hay nada reproduciendo.', ephemeral: true });
                    return;
                }

                if (isPaused) {
                    currentPlayer.unpause();
                    isPaused = false;
                    await interaction.reply({ content: '▶️ Reanudado.', ephemeral: true });
                } else {
                    currentPlayer.pause();
                    isPaused = true;
                    await interaction.reply({ content: '⏸️ En pausa.', ephemeral: true });
                }
                break;

            case 'skip':
                skipCurrentTrack();
                await interaction.reply({ content: '⏭️ Canción saltada.', ephemeral: true });
                break;

            case 'queue':
                const queue = getQueue();
                const list = queue.length
                    ? queue.map((track, i) => `\`${i + 1}.\` ${track.url}`).join('\n')
                    : '📭 Cola vacía.';
                await interaction.reply({ content: list, ephemeral: true });
                break;

            case 'stop':
                cleanTempFolder();
                currentPlayer?.stop();
                const newPlayer = createAudioPlayer();
                currentConnection?.subscribe(newPlayer);
                setCurrentPlayer(newPlayer);
                isPaused = false;
                await interaction.reply({ content: '⏹ Reproductor reiniciado.', ephemeral: true });
                break;
        }
    }
});

function cleanTempFolder() {
    const tempPath = path.join(__dirname, './commands');
    const files = fs.readdirSync(tempPath);
    for (const file of files) {
        if (file.endsWith('.mp3')) {
            try {
                fs.unlinkSync(path.join(tempPath, file));
            } catch (err) {
                console.warn(`⚠️ No se pudo eliminar ${file}:`, err);
            }
        }
    }
    console.log('🧹 Carpeta temporal limpiada');
}

function isValidYouTubeUrl(url: string | null): boolean {
    if (!url) return false;
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

client.login(TOKEN).catch(err => console.error('❌ Error al iniciar sesión:', err));
