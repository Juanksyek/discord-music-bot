import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';
import { commandGuide } from '../commands/definitions';
import type { PlaybackSnapshot, QueueTrack } from '../commands/music';

const BRAND_FOOTER = 'Papoy Deluxe • bot de musica';

const COLORS = {
    primary: 0x1ed760,
    accent: 0x00c2ff,
    danger: 0xff5d73,
    muted: 0x8d99ae,
};

export function createControlButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('music:toggle')
            .setLabel('Pausa / Play')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music:skip')
            .setLabel('Skip')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music:queue')
            .setLabel('Cola')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('music:stop')
            .setLabel('Parar')
            .setStyle(ButtonStyle.Danger)
    );
}

export function createInfoEmbed(title: string, description: string, color = COLORS.accent) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: BRAND_FOOTER });
}

export function createErrorEmbed(message: string) {
    return createInfoEmbed('Algo salio mal', message, COLORS.danger);
}

export function createNowPlayingEmbed(snapshot: PlaybackSnapshot) {
    if (!snapshot.current) {
        return createInfoEmbed(
            'No hay nada sonando',
            'Usa `/tocamela`, `/play` o `!play` para empezar una sesion.',
            COLORS.muted
        );
    }

    const current = snapshot.current;
    const queueLabel = snapshot.queue.length === 0 ? 'Sin espera' : `${snapshot.queue.length} en cola`;
    const statusLabel = snapshot.isPaused ? 'Pausado' : 'Reproduciendo';

    const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('Sonando ahora')
        .setDescription(
            [
                `**${escapeInline(current.title)}**\n[abrir en YouTube](${current.url})`,
                `Pedido por **${escapeInline(current.requestedBy)}**`,
                `Estado: **${statusLabel}** | Cola: **${queueLabel}** | Volumen: **${snapshot.volumePercent}%**`,
            ].join('\n')
        )
        .setFooter({ text: BRAND_FOOTER });

    if (current.thumbnail) {
        embed.setThumbnail(current.thumbnail);
    }

    if (current.durationLabel) {
        embed.addFields({ name: 'Duracion', value: current.durationLabel, inline: true });
    }

    embed.addFields({ name: 'Fuente', value: current.sourceLabel, inline: true });

    return embed;
}

export function createQueueEmbed(snapshot: PlaybackSnapshot | null) {
    if (!snapshot || (!snapshot.current && snapshot.queue.length === 0)) {
        return createInfoEmbed(
            'Cola vacia',
            'No hay pistas pendientes. Usa `/tocamela` para llenar la cola.',
            COLORS.muted
        );
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle('Cola actual')
        .setFooter({ text: BRAND_FOOTER });

    if (snapshot.current) {
        embed.setDescription(
            `**Ahora:** ${formatTrack(snapshot.current)}\nVolumen **${snapshot.volumePercent}%** | ${snapshot.isPaused ? 'Pausado' : 'Reproduciendo'}`
        );
    }

    if (snapshot.queue.length === 0) {
        embed.addFields({
            name: 'Siguiente',
            value: 'No hay mas pistas esperando.',
        });
        return embed;
    }

    const visibleTracks = snapshot.queue.slice(0, 8);
    const lines = visibleTracks.map((track, index) => `\`${index + 1}.\` ${formatTrack(track)}`);

    if (snapshot.queue.length > visibleTracks.length) {
        lines.push(`... y **${snapshot.queue.length - visibleTracks.length}** mas.`);
    }

    embed.addFields({
        name: `En espera (${snapshot.queue.length})`,
        value: lines.join('\n'),
    });

    return embed;
}

export function createQueuedEmbed(track: QueueTrack, position: number) {
    const positionText = position <= 0 ? 'entra inmediatamente' : `quedo en la posicion **${position}**`;

    const embed = createInfoEmbed(
        'Pista agregada a la cola',
        `**${escapeInline(track.title)}** ${positionText}.`,
        COLORS.accent
    );

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    return embed;
}

export function createPlaylistEmbed(playlistTitle: string, addedCount: number) {
    return createInfoEmbed(
        'Playlist cargada',
        `Se agregaron **${addedCount}** canciones de **${escapeInline(playlistTitle)}** a la cola.`,
        COLORS.primary
    );
}

export function createHelpEmbed() {
    return new EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle('Comandos del bot')
        .setDescription(commandGuide.join('\n'))
        .addFields(
            {
                name: 'Ejemplos',
                value: [
                    '`/tocamela after dark mr kitty`',
                    '`/tocamela https://www.youtube.com/watch?v=...`',
                    '`!play linkin park numb`',
                ].join('\n'),
            },
            {
                name: 'Tip',
                value: 'El panel y los botones usan el mismo estado por servidor.',
            }
        )
        .setFooter({ text: BRAND_FOOTER });
}

function formatTrack(track: QueueTrack) {
    const duration = track.durationLabel ? ` | ${track.durationLabel}` : '';
    return `**${escapeInline(truncate(track.title, 64))}**${duration}`;
}

function truncate(value: string, maxLength: number) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function escapeInline(value: string) {
    return value.replace(/([_*`~|])/g, '\\$1');
}
