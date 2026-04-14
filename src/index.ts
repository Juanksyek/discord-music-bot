import {
    Client,
    GatewayIntentBits,
    GuildMember,
    PermissionsBitField,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type Message,
} from 'discord.js';
import * as dotenv from 'dotenv';
import { slashCommands } from './commands/definitions';
import {
    type AnnouncementChannel,
    clearQueue,
    enqueueMusic,
    enqueueTts,
    getConnectedChannelId,
    getSnapshot,
    pause,
    removeFromQueue,
    resume,
    setVolume,
    shuffleQueue,
    skip,
    stop,
    togglePause,
} from './commands/music';
import {
    createControlButtons,
    createErrorEmbed,
    createHelpEmbed,
    createInfoEmbed,
    createNowPlayingEmbed,
    createPlaylistEmbed,
    createQueueEmbed,
    createTtsGuideEmbed,
    createQueuedEmbed,
    createTtsVoicesEmbed,
} from './lib/ui';

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const PREFIX = '!';

if (!TOKEN) {
    throw new Error('Falta DISCORD_BOT_TOKEN en .env');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.once('ready', () => {
    console.log(`✅ ${client.user?.tag ?? 'Bot'} listo con ${slashCommands.length} comandos.`);

    client.user?.setPresence({
        activities: [{ name: '/tocamela | /tts | /ayuda' }],
        status: 'online',
    });
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
        return;
    }

    if (interaction.isButton()) {
        await handleButton(interaction);
    }
});

client.on('messageCreate', async (message) => {
    if (!message.inGuild() || message.author.bot || !message.content.startsWith(PREFIX)) {
        return;
    }

    await handlePrefixCommand(message);
});

client.login(TOKEN).catch((error) => {
    console.error('❌ Error al iniciar sesión:', error);
});

async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ embeds: [createErrorEmbed('Este bot solo funciona dentro de servidores.')], ephemeral: true });
        return;
    }

    const member = interaction.member as GuildMember;

    try {
        switch (interaction.commandName) {
            case 'play':
            case 'tocamela':
                await interaction.deferReply();
                await handlePlayRequest({
                    guildId: interaction.guildId,
                    member,
                    textChannel: asTextChannel(interaction.channel),
                    query: getPlayQueryOption(interaction),
                    reply: (payload) => interaction.editReply(payload),
                });
                return;

            case 'cola':
                await interaction.reply({ embeds: [createQueueEmbed(getSnapshot(interaction.guildId))] });
                return;

            case 'ahora': {
                const snapshot = getSnapshot(interaction.guildId);
                await interaction.reply({
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('📭 Nada sonando', 'Usa `/tocamela` para empezar una sesión.')],
                    components: snapshot?.current ? [createControlButtons()] : [],
                });
                return;
            }

            case 'pausa':
                await interaction.reply({ embeds: [await buildPauseEmbed(interaction.guildId, member)] });
                return;

            case 'reanudar':
                await interaction.reply({ embeds: [await buildResumeEmbed(interaction.guildId, member)] });
                return;

            case 'skip':
                await interaction.reply({ embeds: [await buildSkipEmbed(interaction.guildId, member)] });
                return;

            case 'parar':
                await interaction.reply({ embeds: [await buildStopEmbed(interaction.guildId, member)] });
                return;

            case 'mezclar':
                await interaction.reply({ embeds: [buildShuffleEmbed(interaction.guildId, member)] });
                return;

            case 'limpiar':
                await interaction.reply({ embeds: [await buildClearEmbed(interaction.guildId, member)] });
                return;

            case 'quitar':
                await interaction.reply({
                    embeds: [await buildRemoveEmbed(interaction.guildId, member, interaction.options.getInteger('posicion', true))],
                });
                return;

            case 'volumen':
                await interaction.reply({
                    embeds: [buildVolumeEmbed(interaction.guildId, member, interaction.options.getInteger('porcentaje', true))],
                });
                return;

            case 'panel': {
                const snapshot = getSnapshot(interaction.guildId);
                await interaction.reply({
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('🎛 Panel listo', 'No hay nada sonando todavía. Usa `/tocamela` o `/tts`.')],
                    components: [createControlButtons()],
                });
                return;
            }

            case 'tts':
                await interaction.deferReply();
                await handleTtsRequest({
                    guildId: interaction.guildId,
                    member,
                    textChannel: asTextChannel(interaction.channel),
                    voiceKey: interaction.options.getString('voz', true),
                    text: interaction.options.getString('texto', true),
                    reply: (payload) => interaction.editReply(payload),
                });
                return;

            case 'voces':
                await interaction.reply({ embeds: [createTtsVoicesEmbed()] });
                return;

            case 'ttsguia':
                await interaction.reply({ embeds: [createTtsGuideEmbed()] });
                return;

            case 'ayuda':
                await interaction.reply({ embeds: [createHelpEmbed()] });
                return;

            default:
                await interaction.reply({ embeds: [createErrorEmbed('Ese comando todavía no está conectado.')] });
        }
    } catch (error) {
        console.error(`❌ Error en comando ${interaction.commandName}:`, error);

        const payload = {
            embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(payload);
            } else {
                await interaction.reply({ ...payload, ephemeral: true });
            }
        } catch {
            // Interaction expiró o ya fue respondida — ignorar silenciosamente
        }
    }
}

async function handleButton(interaction: ButtonInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ embeds: [createErrorEmbed('Este panel solo funciona dentro de un servidor.')], ephemeral: true });
        return;
    }

    const member = interaction.member as GuildMember;

    try {
        switch (interaction.customId) {
            case 'music:toggle': {
                const accessError = getPlaybackAccessError(member, interaction.guildId);
                if (accessError) {
                    await interaction.reply({ embeds: [createErrorEmbed(accessError)], ephemeral: true });
                    return;
                }

                const result = await togglePause(interaction.guildId);
                const embed =
                    result === 'paused'
                        ? createInfoEmbed('⏸ En pausa', 'La reproducción quedó pausada.')
                        : result === 'resumed'
                            ? createInfoEmbed('▶️ Reanudado', 'La reproducción volvió a sonar.')
                            : createErrorEmbed('No hay nada reproduciéndose ahora mismo.');

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            case 'music:skip':
                await interaction.reply({ embeds: [await buildSkipEmbed(interaction.guildId, member)], ephemeral: true });
                return;

            case 'music:queue':
                await interaction.reply({ embeds: [createQueueEmbed(getSnapshot(interaction.guildId))], ephemeral: true });
                return;

            case 'music:shuffle':
                await interaction.reply({ embeds: [buildShuffleEmbed(interaction.guildId, member)], ephemeral: true });
                return;

            case 'music:stop':
                await interaction.reply({ embeds: [await buildStopEmbed(interaction.guildId, member)], ephemeral: true });
                return;

            default:
                await interaction.reply({ embeds: [createErrorEmbed('Botón no reconocido.')], ephemeral: true });
        }
    } catch (error) {
        console.error(`❌ Error en botón ${interaction.customId}:`, error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
                });
            } else {
                await interaction.reply({
                    embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
                    ephemeral: true,
                });
            }
        } catch {
            // Interaction expiró o ya fue respondida — ignorar silenciosamente
        }
    }
}

async function handlePrefixCommand(message: Message<true>) {
    const [rawCommand, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = rawCommand?.toLowerCase();
    const member = message.member;

    if (!command || !member) {
        return;
    }

    try {
        switch (command) {
            case 'play':
            case 'tocamela':
                await handlePlayRequest({
                    guildId: message.guildId,
                    member,
                    textChannel: asTextChannel(message.channel),
                    query: args.join(' '),
                    reply: (payload) => message.reply(payload),
                });
                return;

            case 'cola':
                await message.reply({ embeds: [createQueueEmbed(getSnapshot(message.guildId))] });
                return;

            case 'ahora': {
                const snapshot = getSnapshot(message.guildId);
                await message.reply({
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('📭 Nada sonando', 'Usa `!play` o `/tocamela` para empezar.')],
                    components: snapshot?.current ? [createControlButtons()] : [],
                });
                return;
            }

            case 'pausa':
                await message.reply({ embeds: [await buildPauseEmbed(message.guildId, member)] });
                return;

            case 'reanudar':
                await message.reply({ embeds: [await buildResumeEmbed(message.guildId, member)] });
                return;

            case 'skip':
                await message.reply({ embeds: [await buildSkipEmbed(message.guildId, member)] });
                return;

            case 'parar':
                await message.reply({ embeds: [await buildStopEmbed(message.guildId, member)] });
                return;

            case 'mezclar':
                await message.reply({ embeds: [buildShuffleEmbed(message.guildId, member)] });
                return;

            case 'limpiar':
                await message.reply({ embeds: [await buildClearEmbed(message.guildId, member)] });
                return;

            case 'quitar':
                await message.reply({ embeds: [await buildRemoveEmbed(message.guildId, member, Number(args[0]))] });
                return;

            case 'volumen':
                await message.reply({ embeds: [buildVolumeEmbed(message.guildId, member, Number(args[0]))] });
                return;

            case 'tts':
                await handleTtsRequest({
                    guildId: message.guildId,
                    member,
                    textChannel: asTextChannel(message.channel),
                    voiceKey: args[0],
                    text: args.slice(1).join(' '),
                    reply: (payload) => message.reply(payload),
                });
                return;

            case 'voces':
                await message.reply({ embeds: [createTtsVoicesEmbed()] });
                return;

            case 'ttsguia':
            case 'guiatts':
            case 'ttshelp':
                await message.reply({ embeds: [createTtsGuideEmbed()] });
                return;

            case 'panel': {
                const snapshot = getSnapshot(message.guildId);
                await message.reply({
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('🎛 Panel listo', 'No hay nada sonando todavía. Usa `!play` o `/tocamela`.')],
                    components: [createControlButtons()],
                });
                return;
            }

            case 'help':
            case 'ayuda':
                await message.reply({ embeds: [createHelpEmbed()] });
                return;

            default:
                return;
        }
    } catch (error) {
        console.error(`❌ Error en prefijo ${command}:`, error);
        await message.reply({
            embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
        });
    }
}

async function handlePlayRequest({
    guildId,
    member,
    textChannel,
    query,
    reply,
}: {
    guildId: string;
    member: GuildMember;
    textChannel: AnnouncementChannel | null;
    query: string;
    reply: (payload: any) => Promise<unknown>;
}) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        await reply({ embeds: [createErrorEmbed(accessError)] });
        return;
    }

    if (!query.trim()) {
        await reply({ embeds: [createErrorEmbed('Escribe una URL o una búsqueda para reproducir.')] });
        return;
    }

    const result = await enqueueMusic({
        guildId,
        voiceChannelId: member.voice.channel!.id,
        adapterCreator: member.guild.voiceAdapterCreator,
        query,
        requestedBy: member.displayName,
        requestedById: member.id,
        textChannel,
    });

    const snapshot = getSnapshot(guildId);
    if (!snapshot) {
        await reply({ embeds: [createErrorEmbed('No pude iniciar la reproducción.')] });
        return;
    }

    if (result.playlistTitle) {
        await reply({
            embeds: [createPlaylistEmbed(result.playlistTitle, result.addedTracks.length), createNowPlayingEmbed(snapshot)],
            components: [createControlButtons()],
        });
        return;
    }

    const track = result.addedTracks[0];
    if (result.startedImmediately) {
        await reply({
            embeds: [createNowPlayingEmbed(snapshot)],
            components: [createControlButtons()],
        });
        return;
    }

    await reply({
        embeds: [createQueuedEmbed(track, result.firstQueuedPosition)],
        components: [createControlButtons()],
    });
}

async function handleTtsRequest({
    guildId,
    member,
    textChannel,
    voiceKey,
    text,
    reply,
}: {
    guildId: string;
    member: GuildMember;
    textChannel: AnnouncementChannel | null;
    voiceKey: string;
    text: string;
    reply: (payload: any) => Promise<unknown>;
}) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        await reply({ embeds: [createErrorEmbed(accessError)] });
        return;
    }

    if (!voiceKey || !text.trim()) {
        await reply({ embeds: [createErrorEmbed('Usa `!tts <voz> <texto>` o `/tts` con ambos campos completos. Si necesitas ejemplos, usa `/ttsguia`.')] });
        return;
    }

    const result = await enqueueTts({
        guildId,
        voiceChannelId: member.voice.channel!.id,
        adapterCreator: member.guild.voiceAdapterCreator,
        voiceKey,
        text,
        requestedBy: member.displayName,
        requestedById: member.id,
        textChannel,
    });

    const snapshot = getSnapshot(guildId);
    if (!snapshot) {
        await reply({ embeds: [createErrorEmbed('No pude preparar el TTS.')] });
        return;
    }

    if (result.startedImmediately) {
        await reply({
            embeds: [createNowPlayingEmbed(snapshot)],
            components: [createControlButtons()],
        });
        return;
    }

    await reply({
        embeds: [
            createInfoEmbed(
                '🗣 TTS en cola',
                result.willPlayNext
                    ? `**${result.track.title}** quedó como siguiente audio.`
                    : `**${result.track.title}** se agregó a la cola.`
            ),
        ],
        components: [createControlButtons()],
    });
}

async function buildPauseEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await pause(guildId))
        ? createInfoEmbed('⏸ En pausa', 'La pista actual quedó pausada.')
        : createErrorEmbed('No hay ninguna pista sonando para pausar.');
}

async function buildResumeEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await resume(guildId))
        ? createInfoEmbed('▶️ Reanudado', 'La reproducción volvió a sonar.')
        : createErrorEmbed('No hay una pista pausada para reanudar.');
}

async function buildSkipEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await skip(guildId))
        ? createInfoEmbed('⏭ Skip', 'Salté la pista actual.')
        : createErrorEmbed('No hay ninguna pista activa para saltar.');
}

async function buildStopEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await stop(guildId))
        ? createInfoEmbed('⏹ Sesión cerrada', 'Limpié la cola y desconecté el bot del canal de voz.')
        : createErrorEmbed('No había una sesión activa para detener.');
}

function buildShuffleEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    const shuffled = shuffleQueue(guildId);
    return shuffled > 1
        ? createInfoEmbed('🔀 Cola mezclada', `Reorganicé **${shuffled}** pistas pendientes.`)
        : createErrorEmbed('Necesitas al menos dos pistas en cola para mezclar.');
}

async function buildClearEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    const removed = await clearQueue(guildId);
    return removed > 0
        ? createInfoEmbed('🧹 Cola limpiada', `Quité **${removed}** pistas pendientes.`)
        : createErrorEmbed('La cola ya estaba vacía.');
}

async function buildRemoveEmbed(guildId: string, member: GuildMember, position: number) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    if (!Number.isInteger(position) || position < 1) {
        return createErrorEmbed('Indica una posición válida dentro de la cola.');
    }

    const removed = await removeFromQueue(guildId, position);
    return removed
        ? createInfoEmbed('🗑 Pista eliminada', `Quité **${removed.title}** de la cola.`)
        : createErrorEmbed('No encontré esa posición dentro de la cola.');
}

function buildVolumeEmbed(guildId: string, member: GuildMember, percentage: number) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    if (!Number.isInteger(percentage)) {
        return createErrorEmbed('Escribe un valor numérico entre 5 y 200.');
    }

    const applied = setVolume(guildId, percentage);
    return applied
        ? createInfoEmbed('🔊 Volumen actualizado', `El reproductor quedó en **${applied}%**.`)
        : createErrorEmbed('No hay una sesión activa para cambiar el volumen.');
}

function getPlaybackAccessError(member: GuildMember, guildId: string) {
    const channel = member.voice.channel;
    if (!channel) {
        return 'Debes entrar a un canal de voz primero.';
    }

    const botChannelId = getConnectedChannelId(guildId);
    if (botChannelId && member.voice.channelId !== botChannelId) {
        return 'Debes estar en el mismo canal de voz que el bot para usar esa sesión.';
    }

    const botMember = member.guild.members.me;
    if (!botMember) {
        return 'No pude encontrar al bot dentro del servidor para revisar permisos.';
    }

    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
        return 'No pude comprobar los permisos del bot en ese canal de voz.';
    }

    const missingPermissions: string[] = [];

    if (!permissions.has(PermissionsBitField.Flags.ViewChannel)) {
        missingPermissions.push('ViewChannel');
    }

    if (!permissions.has(PermissionsBitField.Flags.Connect)) {
        missingPermissions.push('Connect');
    }

    if (!permissions.has(PermissionsBitField.Flags.Speak)) {
        missingPermissions.push('Speak');
    }

    if (missingPermissions.length > 0) {
        return `Al bot le faltan permisos en **${channel.name}**: ${missingPermissions.join(', ')}.`;
    }

    if (channel.userLimit > 0 && channel.members.size >= channel.userLimit && !channel.members.has(botMember.id)) {
        return `El canal **${channel.name}** está lleno y el bot no puede entrar.`;
    }

    return null;
}

function asTextChannel(channel: unknown): AnnouncementChannel | null {
    if (!channel || typeof channel !== 'object') {
        return null;
    }

    if (
        'isTextBased' in channel &&
        typeof channel.isTextBased === 'function' &&
        channel.isTextBased() &&
        'send' in channel &&
        typeof channel.send === 'function'
    ) {
        return channel as AnnouncementChannel;
    }

    return null;
}

function getPlayQueryOption(interaction: ChatInputCommandInteraction): string {
    const query =
        interaction.options.getString('query', false) ??
        interaction.options.getString('url', false);

    if (!query) {
        throw new Error('No llegó la URL o búsqueda del comando. Si acabas de actualizar el bot, ejecuta `npm run register` y vuelve a abrir el slash command.');
    }

    return query;
}
