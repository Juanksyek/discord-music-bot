"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createControlButtons = createControlButtons;
exports.createInfoEmbed = createInfoEmbed;
exports.createErrorEmbed = createErrorEmbed;
exports.createNowPlayingEmbed = createNowPlayingEmbed;
exports.createQueueEmbed = createQueueEmbed;
exports.createQueuedEmbed = createQueuedEmbed;
exports.createPlaylistEmbed = createPlaylistEmbed;
exports.createHelpEmbed = createHelpEmbed;
exports.createTtsVoicesEmbed = createTtsVoicesEmbed;
exports.createTtsGuideEmbed = createTtsGuideEmbed;
const discord_js_1 = require("discord.js");
const definitions_1 = require("../commands/definitions");
const tts_1 = require("./tts");
const BRAND_FOOTER = 'Papoy Deluxe • música + meme TTS';
const COLORS = {
    primary: 0x1ed760,
    accent: 0x00c2ff,
    danger: 0xff5d73,
    tts: 0xff7b00,
    muted: 0x8d99ae,
};
function createControlButtons() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('music:toggle')
        .setLabel('⏯ Pausa / Play')
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId('music:skip')
        .setLabel('⏭ Skip')
        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
        .setCustomId('music:queue')
        .setLabel('📋 Cola')
        .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
        .setCustomId('music:shuffle')
        .setLabel('🔀 Mezclar')
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId('music:stop')
        .setLabel('⏹ Parar')
        .setStyle(discord_js_1.ButtonStyle.Danger));
}
function createInfoEmbed(title, description, color = COLORS.accent) {
    return new discord_js_1.EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: BRAND_FOOTER });
}
function createErrorEmbed(message) {
    return createInfoEmbed('⚠️ Algo salió mal', message, COLORS.danger);
}
function createNowPlayingEmbed(snapshot) {
    if (!snapshot.current) {
        return createInfoEmbed('📭 No hay nada sonando', 'Usa `/tocamela`, `/play` o `!play` para empezar una sesión.', COLORS.muted);
    }
    const current = snapshot.current;
    const queueLabel = snapshot.queue.length === 0 ? 'Sin espera' : `${snapshot.queue.length} en cola`;
    const statusLabel = snapshot.isPaused ? 'Pausado' : 'En vivo';
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(current.kind === 'tts' ? COLORS.tts : COLORS.primary)
        .setTitle(current.kind === 'tts' ? '🗣 TTS sonando ahora' : '🎵 Sonando ahora')
        .setDescription([
        current.url ? `**${escapeInline(current.title)}**\n[abrir fuente](${current.url})` : `**${escapeInline(current.title)}**`,
        `Pedido por **${escapeInline(current.requestedBy)}**`,
        `Estado: **${statusLabel}** • Cola: **${queueLabel}** • Volumen: **${snapshot.volumePercent}%**`,
    ].join('\n'))
        .setFooter({ text: BRAND_FOOTER });
    if (current.thumbnail) {
        embed.setThumbnail(current.thumbnail);
    }
    if (current.durationLabel) {
        embed.addFields({ name: 'Duración', value: current.durationLabel, inline: true });
    }
    embed.addFields({
        name: 'Tipo',
        value: current.kind === 'tts' ? `TTS • ${current.sourceLabel}` : current.sourceLabel,
        inline: true,
    });
    return embed;
}
function createQueueEmbed(snapshot) {
    if (!snapshot || (!snapshot.current && snapshot.queue.length === 0)) {
        return createInfoEmbed('📭 Cola vacía', 'No hay pistas pendientes. Usa `/tocamela` o `/tts` para llenar la cola.', COLORS.muted);
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle('📋 Cola actual')
        .setFooter({ text: BRAND_FOOTER });
    if (snapshot.current) {
        embed.addFields({
            name: 'Sonando ahora',
            value: `${formatTrack(snapshot.current)}\nSolicitada por **${escapeInline(snapshot.current.requestedBy)}**\nVolumen **${snapshot.volumePercent}%** • ${snapshot.isPaused ? 'Pausado' : 'Reproduciendo'}`,
        });
    }
    if (snapshot.queue.length === 0) {
        embed.addFields({
            name: 'Pendientes',
            value: 'No hay más canciones en espera.',
        });
        return embed;
    }
    const visibleTracks = snapshot.queue.slice(0, 10);
    const lines = visibleTracks.map((track, index) => `\`${index + 1}.\` ${formatTrack(track)}\nSolicitada por **${escapeInline(track.requestedBy)}**`);
    if (snapshot.queue.length > visibleTracks.length) {
        lines.push(`… y **${snapshot.queue.length - visibleTracks.length}** más.`);
    }
    embed.addFields({
        name: `En espera (${snapshot.queue.length})`,
        value: lines.join('\n'),
    });
    return embed;
}
function createQueuedEmbed(track, position) {
    const color = track.kind === 'tts' ? COLORS.tts : COLORS.accent;
    const positionText = position <= 0 ? 'entra inmediatamente' : `quedó en la posición **${position}**`;
    const embed = createInfoEmbed(track.kind === 'tts' ? '🗣 TTS agregado' : '➕ Pista agregada', `**${escapeInline(track.title)}** ${positionText}.`, color);
    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }
    return embed;
}
function createPlaylistEmbed(playlistTitle, addedCount) {
    return createInfoEmbed('📚 Playlist cargada', `Se agregaron **${addedCount}** canciones de **${escapeInline(playlistTitle)}** a la cola.`, COLORS.primary);
}
function createHelpEmbed() {
    return new discord_js_1.EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle('🛠 Comandos del bot')
        .setDescription(definitions_1.commandGuide.join('\n'))
        .addFields({
        name: 'Ejemplos',
        value: [
            '`/tocamela after dark mr kitty`',
            '`/tts voz:shitpost texto:me fui full cine`',
            '`!play linkin park numb`',
            '`!tts ardilla hola chat`',
        ].join('\n'),
    }, {
        name: 'Tip',
        value: 'El panel y los botones usan el mismo estado por servidor, así que la cola no se rompe si mezclas slash commands y prefijo.',
    })
        .setFooter({ text: BRAND_FOOTER });
}
function createTtsVoicesEmbed() {
    return new discord_js_1.EmbedBuilder()
        .setColor(COLORS.tts)
        .setTitle('🗣 Voces TTS disponibles')
        .setDescription(tts_1.ttsPresets
        .map((preset) => `**${preset.label}** \`${preset.key}\`\n${preset.description}`)
        .join('\n\n'))
        .setFooter({ text: 'Usa `/ttsguia` para ver ejemplos y formato de uso.' });
}
function createTtsGuideEmbed() {
    return new discord_js_1.EmbedBuilder()
        .setColor(COLORS.tts)
        .setTitle('📖 Guía de TTS')
        .setDescription('El TTS lee tu texto dentro del canal de voz usando un preset de voz con efectos.')
        .addFields({
        name: '1. Entra a un canal de voz',
        value: 'Debes estar conectado al mismo canal donde quieres escuchar el TTS.',
    }, {
        name: '2. Elige una voz',
        value: 'Usa `/voces` para ver la lista. Ejemplos rápidos: `ardilla`, `shitpost`, `narrador`, `megafono`.',
    }, {
        name: '3. Usa el comando slash',
        value: '`/tts voz:ardilla texto:hola chat`',
    }, {
        name: '4. Usa el comando con prefijo',
        value: '`!tts ardilla hola chat`\n`!tts megáfono este audio ya quedó`',
    }, {
        name: 'Notas',
        value: 'El prefijo acepta mayúsculas, acentos y guiones en la voz. Si no te aparecen voces nuevas en el slash command, ejecuta `npm run register`.',
    })
        .setFooter({ text: BRAND_FOOTER });
}
function formatTrack(track) {
    const icon = track.kind === 'tts' ? '🗣' : '🎵';
    const duration = track.durationLabel ? ` • ${track.durationLabel}` : '';
    return `${icon} **${escapeInline(truncate(track.title, 64))}**${duration}`;
}
function truncate(value, maxLength) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
function escapeInline(value) {
    return value.replace(/([_*`~|])/g, '\\$1');
}
