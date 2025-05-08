import { REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    throw new Error('El token del bot o el CLIENT_ID no están configurados en el archivo .env.');
}

const commands = [
    {
        name: 'create-dev-channel',
        description: 'Crea un canal de texto para desarrolladores',
        options: [
            {
                name: 'nombre',
                type: 3,
                description: 'El nombre del canal a crear',
                required: false,
            },
        ],
    },
    {
        name: 'tocamela',
        description: 'Reproduce música en el canal de voz',
        options: [
            {
                name: 'url',
                type: 3,
                description: 'La URL de la canción o video de YouTube',
                required: true,
            },
        ],
    },
    {
        name: 'cola',
        description: 'Muestra la lista de canciones en la cola',
    },
    {
        name: 'skip',
        description: 'Salta a la siguiente canción en la cola',
    },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🚀 Registrando comandos de aplicación...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('✅ Comandos registrados con éxito.');
    } catch (error) {
        console.error('❌ Error al registrar los comandos:', error);
    }
})();
