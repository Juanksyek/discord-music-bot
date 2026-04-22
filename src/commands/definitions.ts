import { SlashCommandBuilder } from 'discord.js';

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
    new SlashCommandBuilder().setName('ahora').setDescription('Muestra lo que esta sonando ahora mismo.'),
    new SlashCommandBuilder().setName('pausa').setDescription('Pausa la reproduccion actual.'),
    new SlashCommandBuilder().setName('reanudar').setDescription('Reanuda la reproduccion pausada.'),
    new SlashCommandBuilder().setName('skip').setDescription('Salta la pista actual.'),
    new SlashCommandBuilder().setName('parar').setDescription('Detiene todo y desconecta el bot.'),
    new SlashCommandBuilder().setName('limpiar').setDescription('Vacia la cola pendiente pero deja la pista actual.'),
    new SlashCommandBuilder()
        .setName('quitar')
        .setDescription('Quita una pista de la cola.')
        .addIntegerOption((option) =>
            option
                .setName('posicion')
                .setDescription('Posicion dentro de la cola')
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
    new SlashCommandBuilder().setName('ayuda').setDescription('Muestra la ayuda del bot y ejemplos rapidos.'),
];

export const commandGuide = [
    '`/tocamela` o `!play` para buscar o pegar una URL de YouTube.',
    '`/cola`, `/ahora`, `/panel` para ver el estado con embeds y botones.',
    '`/pausa`, `/reanudar`, `/skip`, `/parar`, `/limpiar` y `/quitar` para controlar la sesion.',
    '`/volumen 80` para ajustar el nivel del reproductor.',
];
