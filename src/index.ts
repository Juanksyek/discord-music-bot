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
    getConnectedChannelId,
    getSnapshot,
    pause,
    removeFromQueue,
    resume,
    setVolume,
    shutdownPlayback,
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
    createQueuedEmbed,
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
    console.log(`Bot listo: ${client.user?.tag ?? 'Bot'} con ${slashCommands.length} comandos.`);

    client.user?.setPresence({
        activities: [{ name: '/tocamela | /ayuda' }],
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
    console.error('Error al iniciar sesion:', error);
});

let shutdownPromise: Promise<void> | null = null;

async function shutdownBot(signal: NodeJS.Signals): Promise<void> {
    if (!shutdownPromise) {
        shutdownPromise = (async () => {
            console.log(`Cerrando bot por ${signal}...`);

            try {
                await shutdownPlayback();
            } catch (error) {
                console.error('Error apagando la reproduccion:', error);
            }

            client.destroy();
        })();
    }

    return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGUSR2'] as const) {
    process.once(signal, () => {
        void shutdownBot(signal).finally(() => {
            if (signal === 'SIGUSR2') {
                process.kill(process.pid, signal);
                return;
            }

            process.exit(0);
        });
    });
}

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
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('Nada sonando', 'Usa `/tocamela` para empezar una sesion.')],
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
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('Panel listo', 'No hay nada sonando todavia. Usa `/tocamela`.')],
                    components: [createControlButtons()],
                });
                return;
            }

            case 'ayuda':
                await interaction.reply({ embeds: [createHelpEmbed()] });
                return;

            default:
                await interaction.reply({ embeds: [createErrorEmbed('Ese comando todavia no esta conectado.')], ephemeral: true });
        }
    } catch (error) {
        console.error(`Error en comando ${interaction.commandName}:`, error);

        const payload = {
            embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrio un error inesperado.')],
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(payload);
            } else {
                await interaction.reply({ ...payload, ephemeral: true });
            }
        } catch {
            // Interaction expiro o ya fue respondida
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
                await interaction.deferReply({ ephemeral: true });

                const accessError = getPlaybackAccessError(member, interaction.guildId);
                if (accessError) {
                    await interaction.editReply({ embeds: [createErrorEmbed(accessError)] });
                    return;
                }

                const result = await togglePause(interaction.guildId);
                const embed =
                    result === 'paused'
                        ? createInfoEmbed('En pausa', 'La reproduccion quedo pausada.')
                        : result === 'resumed'
                            ? createInfoEmbed('Reanudado', 'La reproduccion volvio a sonar.')
                            : createErrorEmbed('No hay nada reproduciendose ahora mismo.');

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            case 'music:skip':
                await interaction.deferReply({ ephemeral: true });
                await interaction.editReply({ embeds: [await buildSkipEmbed(interaction.guildId, member)] });
                return;

            case 'music:queue':
                await interaction.reply({ embeds: [createQueueEmbed(getSnapshot(interaction.guildId))], ephemeral: true });
                return;

            case 'music:stop':
                await interaction.deferReply({ ephemeral: true });
                await interaction.editReply({ embeds: [await buildStopEmbed(interaction.guildId, member)] });
                return;

            default:
                await interaction.reply({ embeds: [createErrorEmbed('Boton no reconocido.')], ephemeral: true });
        }
    } catch (error) {
        console.error(`Error en boton ${interaction.customId}:`, error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrio un error inesperado.')],
                });
            } else {
                await interaction.reply({
                    embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrio un error inesperado.')],
                    ephemeral: true,
                });
            }
        } catch {
            // Interaction expiro o ya fue respondida
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
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('Nada sonando', 'Usa `!play` o `/tocamela` para empezar.')],
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

            case 'limpiar':
                await message.reply({ embeds: [await buildClearEmbed(message.guildId, member)] });
                return;

            case 'quitar':
                await message.reply({ embeds: [await buildRemoveEmbed(message.guildId, member, Number(args[0]))] });
                return;

            case 'volumen':
                await message.reply({ embeds: [buildVolumeEmbed(message.guildId, member, Number(args[0]))] });
                return;

            case 'panel': {
                const snapshot = getSnapshot(message.guildId);
                await message.reply({
                    embeds: [snapshot ? createNowPlayingEmbed(snapshot) : createInfoEmbed('Panel listo', 'No hay nada sonando todavia. Usa `!play` o `/tocamela`.')],
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
        console.error(`Error en prefijo ${command}:`, error);
        await message.reply({
            embeds: [createErrorEmbed(error instanceof Error ? error.message : 'Ocurrio un error inesperado.')],
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
        await reply({ embeds: [createErrorEmbed('Escribe una URL o una busqueda para reproducir.')] });
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
        await reply({ embeds: [createErrorEmbed('No pude iniciar la reproduccion.')] });
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

// ---- Embed builders ----

/**
 * Pause: no pre-check on snapshot.current to avoid races during track transitions.
 * pause() itself returns false if there is genuinely nothing to pause.
 */
async function buildPauseEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await pause(guildId))
        ? createInfoEmbed('En pausa', 'La pista actual quedo pausada.')
        : createErrorEmbed('No hay ninguna pista sonando para pausar.');
}

/**
 * Resume: no pre-check on snapshot.current to avoid races.
 */
async function buildResumeEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await resume(guildId))
        ? createInfoEmbed('Reanudado', 'La reproduccion volvio a sonar.')
        : createErrorEmbed('No hay una pista pausada para reanudar.');
}

/**
 * Skip: checks session existence but NOT snapshot.current — that check lived outside the
 * serial lock and caused false negatives during track transitions (between songs).
 */
async function buildSkipEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    if (!getSnapshot(guildId)) {
        return createErrorEmbed('No hay una sesion activa para saltar.');
    }

    return (await skip(guildId))
        ? createInfoEmbed('Skip', 'Salte la pista actual.')
        : createErrorEmbed('No hay ninguna pista activa para saltar.');
}

async function buildStopEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    return (await stop(guildId))
        ? createInfoEmbed('Sesion cerrada', 'Limpie la cola y desconecte el bot del canal de voz.')
        : createErrorEmbed('No habia una sesion activa para detener.');
}

async function buildClearEmbed(guildId: string, member: GuildMember) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    const removed = await clearQueue(guildId);
    return removed > 0
        ? createInfoEmbed('Cola limpiada', `Quite **${removed}** pistas pendientes.`)
        : createErrorEmbed('La cola ya estaba vacia.');
}

async function buildRemoveEmbed(guildId: string, member: GuildMember, position: number) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    if (!Number.isInteger(position) || position < 1) {
        return createErrorEmbed('Indica una posicion valida dentro de la cola.');
    }

    const removed = await removeFromQueue(guildId, position);
    return removed
        ? createInfoEmbed('Pista eliminada', `Quite **${removed.title}** de la cola.`)
        : createErrorEmbed('No encontre esa posicion dentro de la cola.');
}

function buildVolumeEmbed(guildId: string, member: GuildMember, percentage: number) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return createErrorEmbed(accessError);
    }

    if (!Number.isInteger(percentage)) {
        return createErrorEmbed('Escribe un valor numerico entre 5 y 200.');
    }

    const applied = setVolume(guildId, percentage);
    return applied
        ? createInfoEmbed('Volumen actualizado', `El reproductor quedo en **${applied}%**.`)
        : createErrorEmbed('No hay una sesion activa para cambiar el volumen.');
}

// ---- Access control ----

function getPlaybackAccessError(member: GuildMember, guildId: string) {
    const botChannelId = getConnectedChannelId(guildId);
    const snapshot = getSnapshot(guildId);
    const hasActiveSession = Boolean(snapshot);

    const userChannel = member.voice.channel;

    if (!hasActiveSession && !userChannel) {
        return 'Debes entrar a un canal de voz primero.';
    }

    if (botChannelId && userChannel && member.voice.channelId !== botChannelId) {
        return 'Debes estar en el mismo canal de voz que el bot para usar esa sesion.';
    }

    if (userChannel) {
        const botMember = member.guild.members.me;
        if (!botMember) {
            return 'No pude encontrar al bot dentro del servidor para revisar permisos.';
        }

        const permissions = userChannel.permissionsFor(botMember);
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
            return `Al bot le faltan permisos en **${userChannel.name}**: ${missingPermissions.join(', ')}.`;
        }

        if (userChannel.userLimit > 0 && userChannel.members.size >= userChannel.userLimit && !userChannel.members.has(botMember.id)) {
            return `El canal **${userChannel.name}** esta lleno y el bot no puede entrar.`;
        }
    }

    return null;
}

// ---- Helpers ----

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
        throw new Error('No llego la URL o busqueda del comando. Si acabas de actualizar el bot, ejecuta `npm run register` y vuelve a abrir el slash command.');
    }

    return query;
}
