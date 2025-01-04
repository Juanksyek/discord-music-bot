import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteractionOptionResolver, GuildMember } from 'discord.js';  // Importar los componentes de los botones
import * as path from 'path';
import * as fs from 'fs';
import { playMusic } from '../src/commands/music';
import * as dotenv from 'dotenv';
import { getVoiceConnection } from '@discordjs/voice';
import { AudioResource, createAudioPlayer, createAudioResource as djsCreateAudioResource } from '@discordjs/voice';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const songQueue: string[] = [];

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
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'tocamela') {
        // Extraer la URL proporcionada por el usuario
        const url = (interaction.options as CommandInteractionOptionResolver).getString('url');

        const member = interaction.member as GuildMember;
        if (!member.voice.channel) {
            await interaction.reply({ content: '❌ ¡Debes estar en un canal de voz para usar este comando!', ephemeral: true });
            return;
        }

        // Validar la URL de YouTube
        if (!isValidYouTubeUrl(url)) {
            await interaction.reply({ content: '❌ La URL proporcionada no es válida.', ephemeral: true });
            return;
        }

        // Reproducir la música
        try {
            // Añadir la canción a la cola
            if (url) {
                songQueue.push(url);
            } else {
                await interaction.reply({ content: '❌ La URL proporcionada no es válida.', ephemeral: true });
                return;
            }
            console.log(`🎶 Canción añadida a la cola: ${url}`);

            // Si no hay música reproduciéndose, comienza la reproducción
            if (songQueue.length === 1) {
                await playMusic(
                    (interaction.member as GuildMember)?.voice?.channel?.id ?? '',
                    interaction.guild!.id,
                    interaction.guild!.voiceAdapterCreator,
                    songQueue[0]
                );
            }

            // Crear el botón de detención
            const stopButton = new ButtonBuilder()
                .setCustomId('stop_music')
                .setLabel('Detener Música')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);

            // Responder al usuario que la canción se ha añadido
            await interaction.reply({
                content: `🎶 Canción añadida a la cola: ${url}`,
                components: [row],
            });
        } catch (error) {
            console.error('Error al intentar reproducir la música:', error);
            await interaction.reply({ content: '❌ Ocurrió un error al intentar reproducir la música.', ephemeral: true });
        }
    }
});


client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'create-dev-channel') {
        // Verificar permisos del usuario
        if (!interaction.memberPermissions?.has('ManageChannels')) {
            await interaction.reply({ content: '❌ No tienes permisos para crear canales.', ephemeral: true });
            return;
        }

        const channelName = (interaction.options as CommandInteractionOptionResolver).getString('nombre') || 'noticias-desarrolladores';

        try {
            // Crear el canal de texto
            const devChannel = await interaction.guild?.channels.create({
                name: channelName,
                type: 0, // Canal de texto
                topic: 'Actualizaciones de la API de Discord y noticias para desarrolladores.',
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id, // Todos los usuarios
                        allow: ['ViewChannel'], // Permitir ver el canal
                        deny: ['SendMessages'], // Denegar enviar mensajes
                    },
                    {
                        id: interaction.user.id, // Usuario que ejecutó el comando
                        allow: ['SendMessages'], // Permitir enviar mensajes
                    },
                ],
            });

            if (devChannel) {
                await interaction.reply(`✅ Canal creado con éxito: <#${devChannel.id}>`);
            } else {
                throw new Error('No se pudo crear el canal.');
            }
        } catch (error) {
            console.error('Error al crear el canal:', error);
            await interaction.reply({ content: '❌ Hubo un error al intentar crear el canal.', ephemeral: true });
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

function isValidYouTubeUrl(url: string | null): boolean {
    if (!url) return false;
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}
