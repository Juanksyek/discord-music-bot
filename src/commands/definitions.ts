import { SlashCommandBuilder } from 'discord.js';
import { ttsPresets } from '../lib/tts';

const ttsChoices = ttsPresets.map((preset) => ({
    name: preset.label,
    value: preset.key,
}));

const buildPlayCommand = (name: 'play' | 'tocamela') => {
    const builder = new SlashCommandBuilder()
        .setName(name)
        .setDescription('Busca o reproduce música de YouTube por URL o texto.');

    if (name === 'tocamela') {
        builder.addStringOption((option) =>
            option
                .setName('url')
                .setDescription('La URL o búsqueda de YouTube')
                .setRequired(true)
        );

        return builder;
    }

    builder.addStringOption((option) =>
        option
            .setName('query')
            .setDescription('URL o búsqueda de YouTube')
            .setRequired(true)
    );

    return builder;
};

export const slashCommands = [
    buildPlayCommand('play'),
    buildPlayCommand('tocamela'),
    new SlashCommandBuilder().setName('cola').setDescription('Muestra la cola actual.'),
    new SlashCommandBuilder().setName('ahora').setDescription('Muestra lo que está sonando ahora mismo.'),
    new SlashCommandBuilder().setName('pausa').setDescription('Pausa la reproducción actual.'),
    new SlashCommandBuilder().setName('reanudar').setDescription('Reanuda la reproducción pausada.'),
    new SlashCommandBuilder().setName('skip').setDescription('Salta la pista actual.'),
    new SlashCommandBuilder().setName('parar').setDescription('Detiene todo y desconecta el bot.'),
    new SlashCommandBuilder().setName('mezclar').setDescription('Mezcla la cola pendiente.'),
    new SlashCommandBuilder().setName('limpiar').setDescription('Vacía la cola pendiente pero deja la pista actual.'),
    new SlashCommandBuilder()
        .setName('quitar')
        .setDescription('Quita una pista de la cola.')
        .addIntegerOption((option) =>
            option
                .setName('posicion')
                .setDescription('Posición dentro de la cola')
                .setRequired(true)
                .setMinValue(1)
        ),
    new SlashCommandBuilder()
        .setName('volumen')
        .setDescription('Ajusta el volumen del reproductor.')
        .addIntegerOption((option) =>
            option
                .setName('porcentaje')
                .setDescription('Valor entre 5 y 200')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(200)
        ),
    new SlashCommandBuilder().setName('panel').setDescription('Publica un panel visual con controles del bot.'),
    new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Lee un texto con una voz estilo meme/shitpost.')
        .addStringOption((option) =>
            option
                .setName('voz')
                .setDescription('Preset de voz')
                .setRequired(true)
                .addChoices(...ttsChoices)
        )
        .addStringOption((option) =>
            option
                .setName('texto')
                .setDescription('Texto a leer')
                .setRequired(true)
                .setMaxLength(180)
        ),
    new SlashCommandBuilder().setName('voces').setDescription('Lista las voces TTS disponibles.'),
    new SlashCommandBuilder().setName('ttsguia').setDescription('Explica cómo usar el TTS paso a paso.'),
    new SlashCommandBuilder().setName('ayuda').setDescription('Muestra la ayuda del bot y ejemplos rápidos.'),
];

export const commandGuide = [
    '`/tocamela` o `!play` para buscar o pegar una URL de YouTube.',
    '`/cola`, `/ahora`, `/panel` para ver el estado con embeds y botones.',
    '`/pausa`, `/reanudar`, `/skip`, `/parar`, `/mezclar`, `/limpiar` y `/quitar` para controlar la sesión.',
    '`/volumen 80` para ajustar el nivel del reproductor.',
    '`/tts` y `/voces` para el TTS estilo meme/shitpost.',
    '`/ttsguia` para ver cómo elegir voz y escribir el comando correctamente.',
];
