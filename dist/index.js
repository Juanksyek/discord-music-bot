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
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildVoiceStates, discord_js_1.GatewayIntentBits.GuildMessages] });
client.on('ready', () => {
    console.log(`Bot iniciado como ${client.user?.tag}`);
});
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild)
        return;
    if (message.content.startsWith('!play')) {
        const args = message.content.split(' ');
        const url = args[1];
        if (!url || !ytdl_core_1.default.validateURL(url)) {
            return message.reply('Por favor, proporciona un enlace válido de YouTube.');
        }
        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) {
            return message.reply('¡Debes estar en un canal de voz para usar este comando!');
        }
        const connection = (0, voice_1.joinVoiceChannel)({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });
        const stream = (0, ytdl_core_1.default)(url, { filter: 'audioonly' });
        const resource = (0, voice_1.createAudioResource)(stream);
        const player = (0, voice_1.createAudioPlayer)();
        player.play(resource);
        connection.subscribe(player);
        message.reply('🎶 ¡Reproduciendo tu canción!');
    }
});
client.login(TOKEN);
