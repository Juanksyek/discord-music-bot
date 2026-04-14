import { REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
import { slashCommands } from './definitions';

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
    throw new Error('Faltan DISCORD_BOT_TOKEN o CLIENT_ID en el archivo .env.');
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        const route = GUILD_ID
            ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            : Routes.applicationCommands(CLIENT_ID);

        console.log(`🚀 Registrando ${slashCommands.length} comandos${GUILD_ID ? ' en el guild de pruebas' : ' globales'}...`);

        await rest.put(route, {
            body: slashCommands.map((command) => command.toJSON()),
        });

        console.log('✅ Comandos registrados con éxito.');
    } catch (error) {
        console.error('❌ Error al registrar los comandos:', error);
    }
})();
