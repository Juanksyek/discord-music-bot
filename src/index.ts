import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteractionOptionResolver, GuildMember } from 'discord.js';
import * as path from 'path';
import * as fs from 'fs';
import { playMusic, currentConnection, currentPlayer, setCurrentConnection, setCurrentPlayer } from '../src/commands/music';
import * as dotenv from 'dotenv';
import { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus } from '@discordjs/voice';

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

if (!TOKEN) {
    throw new Error('El token del bot no se encuentra configurado en el archivo .env.');
}

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user?.tag}`);
});

// 🎵 Comando !tocamela vía mensaje
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;

        if (message.content.startsWith('!tocamela')) {
            const args = message.content.split(' ').slice(1);
            const query = args.join(' ');

            if (!message.member?.voice.channel) {
                await message.reply('❌ ¡Debes estar en un canal de voz para usar este comando!');
                return;
            }

            if (!query) {
                await message.reply('❌ Por favor, especifica una URL o el nombre de la canción.');
                return;
            }

            const stopButton = new ButtonBuilder()
                .setCustomId('stop_music')
                .setLabel('Paramela')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);

            await message.reply({
                content: `🎶 Reproduciendo ahora: ${query}`,
                components: [row],
            });

            await playMusic(
                message.member.voice.channel.id,
                message.guild!.id,
                message.guild!.voiceAdapterCreator,
                query
            );
        }
    } catch (error) {
        console.error('Error en el comando:', error);
        await message.reply('❌ Ocurrió un error al ejecutar el comando.');
    }
});

// 🎵 Comando slash /tocamela
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'tocamela') {
        const url = (interaction.options as CommandInteractionOptionResolver).getString('url');
        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await interaction.reply({
                content: '❌ ¡Debes estar en un canal de voz para usar este comando!',
                ephemeral: true
            });
            return;
        }

        if (!isValidYouTubeUrl(url)) {
            await interaction.reply({
                content: '❌ La URL proporcionada no es válida.',
                ephemeral: true
            });
            return;
        }

        try {
            const stopButton = new ButtonBuilder()
                .setCustomId('stop_music')
                .setLabel('Detener Música')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);

            await interaction.reply({
                content: `🎶 Reproduciendo ahora: ${url}`,
                components: [row],
            });

            await playMusic(
                member.voice.channel.id,
                interaction.guild!.id,
                interaction.guild!.voiceAdapterCreator,
                url!
            );
        } catch (error) {
            console.error('Error al intentar reproducir la música:', error);
            await interaction.reply({
                content: '❌ Ocurrió un error al intentar reproducir la música.',
                ephemeral: true
            });
        }
    }
});

// 🛑 Botón: detener música y reiniciar conexión
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'stop_music') {
        if (!interaction.guild || !interaction.member || !('voice' in interaction.member)) {
            await interaction.reply({
                content: '❌ No se pudo obtener información del canal de voz.',
                ephemeral: true
            });
            return;
        }

        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply({
                content: '❌ Debes estar en un canal de voz para reiniciar la música.',
                ephemeral: true
            });
            return;
        }

        cleanTempFolder();

        currentPlayer?.stop();
        currentConnection?.destroy();

        await interaction.reply({
            content: '♻️ Reiniciando reproducción y reconectando...',
            ephemeral: true
        });

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('✅ Conexión lista para transmitir audio');
        });

        connection.on('stateChange', (oldState, newState) => {
            console.log(`Estado de conexión cambiado: ${oldState.status} -> ${newState.status}`);
        });

        setCurrentConnection(connection);

        const player = createAudioPlayer();
        connection.subscribe(player);
        setCurrentPlayer(player);

        console.log('🎵 Conexión y reproductor reiniciados y listos.');
    }
});

// 🔧 Función de limpieza de carpeta temporal
function cleanTempFolder() {
    const tempPath = path.join(__dirname, '../src/commands');
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

// 🎵 Validador URL YouTube
function isValidYouTubeUrl(url: string | null): boolean {
    if (!url) return false;
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

client.login(TOKEN).catch((error) => {
    console.error('Error al conectar el bot:', error.message);
});
