"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.playCommand = void 0;
const voice_1 = require("@discordjs/voice");
const play_dl_1 = __importDefault(require("play-dl"));
const playCommand = async (message, args) => {
    const url = args[0];
    if (!url || !play_dl_1.default.yt_validate(url)) {
        return message.reply('Por favor, proporciona un enlace válido de YouTube.');
    }
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
        return message.reply('¡Debes estar en un canal de voz para usar este comando!');
    }
    if (!message.guild) {
        return message.reply('Hubo un problema al obtener la información del servidor.');
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
    try {
        const stream = await play_dl_1.default.stream(url, { quality: 2 }); // Usamos play-dl para obtener el stream
        const resource = (0, voice_1.createAudioResource)(stream.stream, { inputType: stream.type });
        const player = (0, voice_1.createAudioPlayer)();
        player.on('stateChange', (oldState, newState) => {
            console.log(`Reproductor cambió de ${oldState.status} a ${newState.status}`);
        });
        player.on('error', (error) => {
            console.error('Error en el reproductor:', error.message);
        });
        player.play(resource);
        connection.subscribe(player);
        message.reply('🎶 ¡Reproduciendo tu canción!');
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Error al procesar el stream:', error.message);
        }
        else {
            console.error('Error al procesar el stream:', error);
        }
        message.reply('Hubo un problema al reproducir la canción. Por favor, intenta con otro enlace.');
    }
};
exports.playCommand = playCommand;
