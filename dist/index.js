"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv = __importStar(require("dotenv"));
const definitions_1 = require("./commands/definitions");
const music_1 = require("./commands/music");
const ui_1 = require("./lib/ui");
dotenv.config();
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const PREFIX = '!';
if (!TOKEN) {
    throw new Error('Falta DISCORD_BOT_TOKEN en .env');
}
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
    ],
});
client.once('ready', () => {
    console.log(`✅ ${client.user?.tag ?? 'Bot'} listo con ${definitions_1.slashCommands.length} comandos.`);
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
async function handleSlashCommand(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ embeds: [(0, ui_1.createErrorEmbed)('Este bot solo funciona dentro de servidores.')], ephemeral: true });
        return;
    }
    const member = interaction.member;
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
                await interaction.reply({ embeds: [(0, ui_1.createQueueEmbed)((0, music_1.getSnapshot)(interaction.guildId))] });
                return;
            case 'ahora': {
                const snapshot = (0, music_1.getSnapshot)(interaction.guildId);
                await interaction.reply({
                    embeds: [snapshot ? (0, ui_1.createNowPlayingEmbed)(snapshot) : (0, ui_1.createInfoEmbed)('📭 Nada sonando', 'Usa `/tocamela` para empezar una sesión.')],
                    components: snapshot?.current ? [(0, ui_1.createControlButtons)()] : [],
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
                const snapshot = (0, music_1.getSnapshot)(interaction.guildId);
                await interaction.reply({
                    embeds: [snapshot ? (0, ui_1.createNowPlayingEmbed)(snapshot) : (0, ui_1.createInfoEmbed)('🎛 Panel listo', 'No hay nada sonando todavía. Usa `/tocamela` o `/tts`.')],
                    components: [(0, ui_1.createControlButtons)()],
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
                await interaction.reply({ embeds: [(0, ui_1.createTtsVoicesEmbed)()] });
                return;
            case 'ttsguia':
                await interaction.reply({ embeds: [(0, ui_1.createTtsGuideEmbed)()] });
                return;
            case 'ayuda':
                await interaction.reply({ embeds: [(0, ui_1.createHelpEmbed)()] });
                return;
            default:
                await interaction.reply({ embeds: [(0, ui_1.createErrorEmbed)('Ese comando todavía no está conectado.')] });
        }
    }
    catch (error) {
        console.error(`❌ Error en comando ${interaction.commandName}:`, error);
        const payload = {
            embeds: [(0, ui_1.createErrorEmbed)(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
        };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        }
        else {
            await interaction.reply(payload);
        }
    }
}
async function handleButton(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ embeds: [(0, ui_1.createErrorEmbed)('Este panel solo funciona dentro de un servidor.')], ephemeral: true });
        return;
    }
    const member = interaction.member;
    try {
        switch (interaction.customId) {
            case 'music:toggle': {
                const accessError = getPlaybackAccessError(member, interaction.guildId);
                if (accessError) {
                    await interaction.reply({ embeds: [(0, ui_1.createErrorEmbed)(accessError)], ephemeral: true });
                    return;
                }
                const result = await (0, music_1.togglePause)(interaction.guildId);
                const embed = result === 'paused'
                    ? (0, ui_1.createInfoEmbed)('⏸ En pausa', 'La reproducción quedó pausada.')
                    : result === 'resumed'
                        ? (0, ui_1.createInfoEmbed)('▶️ Reanudado', 'La reproducción volvió a sonar.')
                        : (0, ui_1.createErrorEmbed)('No hay nada reproduciéndose ahora mismo.');
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }
            case 'music:skip':
                await interaction.reply({ embeds: [await buildSkipEmbed(interaction.guildId, member)], ephemeral: true });
                return;
            case 'music:queue':
                await interaction.reply({ embeds: [(0, ui_1.createQueueEmbed)((0, music_1.getSnapshot)(interaction.guildId))], ephemeral: true });
                return;
            case 'music:shuffle':
                await interaction.reply({ embeds: [buildShuffleEmbed(interaction.guildId, member)], ephemeral: true });
                return;
            case 'music:stop':
                await interaction.reply({ embeds: [await buildStopEmbed(interaction.guildId, member)], ephemeral: true });
                return;
            default:
                await interaction.reply({ embeds: [(0, ui_1.createErrorEmbed)('Botón no reconocido.')], ephemeral: true });
        }
    }
    catch (error) {
        console.error(`❌ Error en botón ${interaction.customId}:`, error);
        await interaction.reply({
            embeds: [(0, ui_1.createErrorEmbed)(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
            ephemeral: true,
        });
    }
}
async function handlePrefixCommand(message) {
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
                await message.reply({ embeds: [(0, ui_1.createQueueEmbed)((0, music_1.getSnapshot)(message.guildId))] });
                return;
            case 'ahora': {
                const snapshot = (0, music_1.getSnapshot)(message.guildId);
                await message.reply({
                    embeds: [snapshot ? (0, ui_1.createNowPlayingEmbed)(snapshot) : (0, ui_1.createInfoEmbed)('📭 Nada sonando', 'Usa `!play` o `/tocamela` para empezar.')],
                    components: snapshot?.current ? [(0, ui_1.createControlButtons)()] : [],
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
                await message.reply({ embeds: [(0, ui_1.createTtsVoicesEmbed)()] });
                return;
            case 'ttsguia':
            case 'guiatts':
            case 'ttshelp':
                await message.reply({ embeds: [(0, ui_1.createTtsGuideEmbed)()] });
                return;
            case 'panel': {
                const snapshot = (0, music_1.getSnapshot)(message.guildId);
                await message.reply({
                    embeds: [snapshot ? (0, ui_1.createNowPlayingEmbed)(snapshot) : (0, ui_1.createInfoEmbed)('🎛 Panel listo', 'No hay nada sonando todavía. Usa `!play` o `/tocamela`.')],
                    components: [(0, ui_1.createControlButtons)()],
                });
                return;
            }
            case 'help':
            case 'ayuda':
                await message.reply({ embeds: [(0, ui_1.createHelpEmbed)()] });
                return;
            default:
                return;
        }
    }
    catch (error) {
        console.error(`❌ Error en prefijo ${command}:`, error);
        await message.reply({
            embeds: [(0, ui_1.createErrorEmbed)(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')],
        });
    }
}
async function handlePlayRequest({ guildId, member, textChannel, query, reply, }) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        await reply({ embeds: [(0, ui_1.createErrorEmbed)(accessError)] });
        return;
    }
    if (!query.trim()) {
        await reply({ embeds: [(0, ui_1.createErrorEmbed)('Escribe una URL o una búsqueda para reproducir.')] });
        return;
    }
    const result = await (0, music_1.enqueueMusic)({
        guildId,
        voiceChannelId: member.voice.channel.id,
        adapterCreator: member.guild.voiceAdapterCreator,
        query,
        requestedBy: member.displayName,
        requestedById: member.id,
        textChannel,
    });
    const snapshot = (0, music_1.getSnapshot)(guildId);
    if (!snapshot) {
        await reply({ embeds: [(0, ui_1.createErrorEmbed)('No pude iniciar la reproducción.')] });
        return;
    }
    if (result.playlistTitle) {
        await reply({
            embeds: [(0, ui_1.createPlaylistEmbed)(result.playlistTitle, result.addedTracks.length), (0, ui_1.createNowPlayingEmbed)(snapshot)],
            components: [(0, ui_1.createControlButtons)()],
        });
        return;
    }
    const track = result.addedTracks[0];
    if (result.startedImmediately) {
        await reply({
            embeds: [(0, ui_1.createNowPlayingEmbed)(snapshot)],
            components: [(0, ui_1.createControlButtons)()],
        });
        return;
    }
    await reply({
        embeds: [(0, ui_1.createQueuedEmbed)(track, result.firstQueuedPosition)],
        components: [(0, ui_1.createControlButtons)()],
    });
}
async function handleTtsRequest({ guildId, member, textChannel, voiceKey, text, reply, }) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        await reply({ embeds: [(0, ui_1.createErrorEmbed)(accessError)] });
        return;
    }
    if (!voiceKey || !text.trim()) {
        await reply({ embeds: [(0, ui_1.createErrorEmbed)('Usa `!tts <voz> <texto>` o `/tts` con ambos campos completos. Si necesitas ejemplos, usa `/ttsguia`.')] });
        return;
    }
    const result = await (0, music_1.enqueueTts)({
        guildId,
        voiceChannelId: member.voice.channel.id,
        adapterCreator: member.guild.voiceAdapterCreator,
        voiceKey,
        text,
        requestedBy: member.displayName,
        requestedById: member.id,
        textChannel,
    });
    const snapshot = (0, music_1.getSnapshot)(guildId);
    if (!snapshot) {
        await reply({ embeds: [(0, ui_1.createErrorEmbed)('No pude preparar el TTS.')] });
        return;
    }
    if (result.startedImmediately) {
        await reply({
            embeds: [(0, ui_1.createNowPlayingEmbed)(snapshot)],
            components: [(0, ui_1.createControlButtons)()],
        });
        return;
    }
    await reply({
        embeds: [
            (0, ui_1.createInfoEmbed)('🗣 TTS en cola', result.willPlayNext
                ? `**${result.track.title}** quedó como siguiente audio.`
                : `**${result.track.title}** se agregó a la cola.`),
        ],
        components: [(0, ui_1.createControlButtons)()],
    });
}
async function buildPauseEmbed(guildId, member) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    return (await (0, music_1.pause)(guildId))
        ? (0, ui_1.createInfoEmbed)('⏸ En pausa', 'La pista actual quedó pausada.')
        : (0, ui_1.createErrorEmbed)('No hay ninguna pista sonando para pausar.');
}
async function buildResumeEmbed(guildId, member) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    return (await (0, music_1.resume)(guildId))
        ? (0, ui_1.createInfoEmbed)('▶️ Reanudado', 'La reproducción volvió a sonar.')
        : (0, ui_1.createErrorEmbed)('No hay una pista pausada para reanudar.');
}
async function buildSkipEmbed(guildId, member) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    return (await (0, music_1.skip)(guildId))
        ? (0, ui_1.createInfoEmbed)('⏭ Skip', 'Salté la pista actual.')
        : (0, ui_1.createErrorEmbed)('No hay ninguna pista activa para saltar.');
}
async function buildStopEmbed(guildId, member) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    return (await (0, music_1.stop)(guildId))
        ? (0, ui_1.createInfoEmbed)('⏹ Sesión cerrada', 'Limpié la cola y desconecté el bot del canal de voz.')
        : (0, ui_1.createErrorEmbed)('No había una sesión activa para detener.');
}
function buildShuffleEmbed(guildId, member) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    const shuffled = (0, music_1.shuffleQueue)(guildId);
    return shuffled > 1
        ? (0, ui_1.createInfoEmbed)('🔀 Cola mezclada', `Reorganicé **${shuffled}** pistas pendientes.`)
        : (0, ui_1.createErrorEmbed)('Necesitas al menos dos pistas en cola para mezclar.');
}
async function buildClearEmbed(guildId, member) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    const removed = await (0, music_1.clearQueue)(guildId);
    return removed > 0
        ? (0, ui_1.createInfoEmbed)('🧹 Cola limpiada', `Quité **${removed}** pistas pendientes.`)
        : (0, ui_1.createErrorEmbed)('La cola ya estaba vacía.');
}
async function buildRemoveEmbed(guildId, member, position) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    if (!Number.isInteger(position) || position < 1) {
        return (0, ui_1.createErrorEmbed)('Indica una posición válida dentro de la cola.');
    }
    const removed = await (0, music_1.removeFromQueue)(guildId, position);
    return removed
        ? (0, ui_1.createInfoEmbed)('🗑 Pista eliminada', `Quité **${removed.title}** de la cola.`)
        : (0, ui_1.createErrorEmbed)('No encontré esa posición dentro de la cola.');
}
function buildVolumeEmbed(guildId, member, percentage) {
    const accessError = getPlaybackAccessError(member, guildId);
    if (accessError) {
        return (0, ui_1.createErrorEmbed)(accessError);
    }
    if (!Number.isInteger(percentage)) {
        return (0, ui_1.createErrorEmbed)('Escribe un valor numérico entre 5 y 200.');
    }
    const applied = (0, music_1.setVolume)(guildId, percentage);
    return applied
        ? (0, ui_1.createInfoEmbed)('🔊 Volumen actualizado', `El reproductor quedó en **${applied}%**.`)
        : (0, ui_1.createErrorEmbed)('No hay una sesión activa para cambiar el volumen.');
}
function getPlaybackAccessError(member, guildId) {
    const channel = member.voice.channel;
    if (!channel) {
        return 'Debes entrar a un canal de voz primero.';
    }
    const botChannelId = (0, music_1.getConnectedChannelId)(guildId);
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
    const missingPermissions = [];
    if (!permissions.has(discord_js_1.PermissionsBitField.Flags.ViewChannel)) {
        missingPermissions.push('ViewChannel');
    }
    if (!permissions.has(discord_js_1.PermissionsBitField.Flags.Connect)) {
        missingPermissions.push('Connect');
    }
    if (!permissions.has(discord_js_1.PermissionsBitField.Flags.Speak)) {
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
function asTextChannel(channel) {
    if (!channel || typeof channel !== 'object') {
        return null;
    }
    if ('isTextBased' in channel &&
        typeof channel.isTextBased === 'function' &&
        channel.isTextBased() &&
        'send' in channel &&
        typeof channel.send === 'function') {
        return channel;
    }
    return null;
}
function getPlayQueryOption(interaction) {
    const query = interaction.options.getString('query', false) ??
        interaction.options.getString('url', false);
    if (!query) {
        throw new Error('No llegó la URL o búsqueda del comando. Si acabas de actualizar el bot, ejecuta `npm run register` y vuelve a abrir el slash command.');
    }
    return query;
}
