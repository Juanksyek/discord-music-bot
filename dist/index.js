"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const voice_1 = require("@discordjs/voice");
const ytdl_core_1 = __importDefault(require("ytdl-core"));
// Carga el token desde las variables de entorno
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
    throw new Error('Por favor, define el token en el archivo .env');
}
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
});
client.on('ready', () => {
    console.log(`Bot iniciado como ${client.user?.tag}`);
});
const handlePlayCommand = async (message, args) => {
    const url = args[0];
    if (!url || !ytdl_core_1.default.validateURL(url)) {
        return message.reply('Por favor, proporciona un enlace válido de YouTube.');
    }
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
        return message.reply('¡Debes estar en un canal de voz para usar este comando!');
    }
    if (!message.guild) {
        return message.reply('No se pudo obtener la información del servidor.');
    }
    const connection = (0, voice_1.joinVoiceChannel)({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
    });
    connection.on('stateChange', (oldState, newState) => {
        console.log(`Conexión de voz cambió de ${oldState.status} a ${newState.status}`);
    });
    connection.on('error', (error) => {
        console.error('Error en la conexión de voz:', error.message);
    });
    const player = (0, voice_1.createAudioPlayer)();
    player.on('stateChange', (oldState, newState) => {
        console.log(`Reproductor cambió de ${oldState.status} a ${newState.status}`);
        if (newState.status === 'playing') {
            console.log('El audio está reproduciéndose.');
        }
    });
    player.on('error', (error) => {
        console.error('Error en el reproductor:', error.message);
        message.reply('Hubo un problema al reproducir la canción. Por favor, intenta con otro enlace.');
    });
    try {
        const cleanUrl = url.split('?')[0]; // Limpia la URL
        const stream = (0, ytdl_core_1.default)(cleanUrl, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 26, // Ajusta el buffer
        });
        const resource = (0, voice_1.createAudioResource)(stream);
        player.play(resource);
        connection.subscribe(player);
        message.reply('🎶 ¡Reproduciendo tu canción!');
    }
    catch (error) {
        console.error('Error al obtener el stream:', error.message);
        message.reply('Hubo un problema al reproducir la canción. Por favor, intenta con otro enlace.');
    }
};
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild)
        return;
    const content = message.content.trim();
    console.log(`Mensaje recibido completo: "${content}"`);
    const [command, ...args] = content.split(/\s+/);
    console.log(`Comando recibido: "${command}"`);
    console.log(`Argumentos recibidos: "${args.join(' ')}"`);
    switch (command) {
        case '!play':
            await handlePlayCommand(message, args);
            break;
        default:
            message.reply('Comando no reconocido.');
    }
});
client.login(TOKEN);
