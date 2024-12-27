import { Client, GatewayIntentBits } from 'discord.js';
import { playMusic } from '../src/commands/music';
import * as dotenv from 'dotenv';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!TOKEN) {
    throw new Error('El token del bot no se encuentra configurado en el archivo .env.');
}

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user?.tag}`);
});

client.on('messageCreate', async (message) => {
    try {
        // Ignorar mensajes de otros bots
        if (message.author.bot) return;

        // Comando !play
        if (message.content.startsWith('!tocamela')) {
            const args = message.content.split(' ').slice(1); // Extraer los argumentos después de !play
            const query = args.join(' '); // Combinar los argumentos en una consulta

            // Validar si el usuario está en un canal de voz
            if (!message.member?.voice.channel) {
                await message.reply('❌ ¡Debes estar en un canal de voz para usar este comando!');
                return;
            }

            // Validar si se proporcionó una consulta
            if (!query) {
                await message.reply('❌ Por favor, especifica una URL o el nombre de la canción.');
                return;
            }

            // Intentar reproducir la música
            await playMusic(
                message.member.voice.channel.id,
                message.guild!.id,
                message.guild!.voiceAdapterCreator,
                query
            );
            await message.reply(`🎶 Reproduciendo: ${query}`);
        }
    } catch (error) {
        console.error('Error en el comando:', error);
        await message.reply('❌ Ocurrió un error al ejecutar el comando.');
    }
});

client.login(TOKEN).catch((error) => {
    console.error('Error al conectar el bot:', error.message);
});