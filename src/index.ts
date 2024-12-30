import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';  // Importar los componentes de los botones
import * as path from 'path';
import * as fs from 'fs';
import { playMusic } from '../src/commands/music';
import * as dotenv from 'dotenv';
import { getVoiceConnection } from '@discordjs/voice';
import { AudioResource, createAudioPlayer, createAudioResource as djsCreateAudioResource } from '@discordjs/voice';

// Cargar variables de entorno desde el archivo .env
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

client.on('messageCreate', async (message) => {
    try {
        // Ignorar mensajes de otros bots
        if (message.author.bot) return;

        // Comando !tocamela
        if (message.content.startsWith('!tocamela')) {
            const args = message.content.split(' ').slice(1); // Extraer los argumentos después de !play
            const query = args.join(' '); // Combinar los argumentos en una consulta

            // Validar si el usuario está en un canal de voz
            if (!message.member?.voice.channel) {
                await message.reply('❌ ¡Debes estar en un canal de voz para usar este comando!');
                return;
            }

            // Validar si se proporcionó una consulta
            if (!query) {
                await message.reply('❌ Por favor, especifica una URL o el nombre de la canción.');
                return;
            }

            // Crear el botón de detención
            const stopButton = new ButtonBuilder()
                .setCustomId('stop_music')
                .setLabel('Paramela')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);

            // Enviar el mensaje con el botón de detener
            const replyMessage = await message.reply({
                content: `🎶 Reproduciendo: ${query}`,
                components: [row],
            });

            // Intentar reproducir la música
            await playMusic(
                message.member.voice.channel.id,
                message.guild!.id,
                message.guild!.voiceAdapterCreator,
                query
            );
            //await message.reply(`🎶 Reproduciendo: ${query}`);
        }
    } catch (error) {
        console.error('Error en el comando:', error);
        await message.reply('❌ Ocurrió un error al ejecutar el comando.');
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'stop_music') {
        if (!interaction.guildId) {
            await interaction.reply({ content: '❌ No se pudo obtener la ID de la guild.', ephemeral: true });
            return;
        }

        const connection = getVoiceConnection(interaction.guildId);

        if (connection) {
            console.log("⏹️ Deteniendo la música");

            // Obtener el reproductor de audio actual
            const player = (connection.state as any).subscription?.player;

            if (player) {
                // Obtener el tiempo total de la canción en segundos
                const totalDuration = player.state.resource.playbackDuration;

                // Si la canción está en reproducción, deténla y reiníciala 1 segundo antes de finalizar
                if (totalDuration > 1000) { // Asegurarse de que no estemos en los últimos 1 segundo
                    player.stop();
                    console.log('🎶 Música detenida, reiniciando desde 1 segundo antes del final.');

                    // Volver a crear el AudioResource desde el archivo y reproducirlo
                    const outputPath = path.join(__dirname, 'src', 'commands', 'temp_audio.mp3');
                    const audioStream = fs.createReadStream(outputPath);

                    if (!audioStream || typeof audioStream.pipe !== 'function') {
                        throw new Error('❌ El stream obtenido no es válido o no se pudo crear.');
                    }

                    // Recreate resource with adjusted start point
                    const resource = createAudioResource(audioStream, {
                        inlineVolume: true,
                        metadata: { title: player.state.resource.metadata.title },
                    });

                    // Reproducir nuevamente desde el nuevo punto
                    player.play(resource);
                    await interaction.reply({ content: '🎶 Reproducción avanzada a 1 segundo antes del final.', ephemeral: true });
                } else {
                    // Si está cerca de terminar, detener la música
                    player.stop();
                    await interaction.reply({ content: '🎶 Música detenida', ephemeral: true });
                }
            } else {
                await interaction.reply({ content: '❌ No hay música reproduciéndose', ephemeral: true });
            }
        } else {
            await interaction.reply({ content: '❌ No hay conexión activa', ephemeral: true });
        }
    }
});

function createAudioResource(audioStream: fs.ReadStream, options: { inlineVolume: boolean; metadata: { title: any; }; }): AudioResource {
    const resource = djsCreateAudioResource(audioStream, {
        inlineVolume: options.inlineVolume,
        metadata: options.metadata,
    });
    return resource;
}

client.login(TOKEN).catch((error) => {
    console.error('Error al conectar el bot:', error.message);
});