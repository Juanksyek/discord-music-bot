import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import ytdl from 'ytdl-core';

// Carga el token desde las variables de entorno
const TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!TOKEN) {
  throw new Error('Por favor, define el token en el archivo .env');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages] });

client.on('ready', () => {
  console.log(`Bot iniciado como ${client.user?.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith('!play')) {
    const args = message.content.split(' ');
    const url = args[1];

    if (!url || !ytdl.validateURL(url)) {
      return message.reply('Por favor, proporciona un enlace válido de YouTube.');
    }

    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply('¡Debes estar en un canal de voz para usar este comando!');
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    const stream = ytdl(url, { filter: 'audioonly' });
    const resource = createAudioResource(stream);
    const player = createAudioPlayer();

    player.play(resource);
    connection.subscribe(player);

    message.reply('🎶 ¡Reproduciendo tu canción!');
  }
});

client.login(TOKEN);