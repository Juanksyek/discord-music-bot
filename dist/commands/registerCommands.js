"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv = __importStar(require("dotenv"));
const definitions_1 = require("./definitions");
dotenv.config();
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID) {
    throw new Error('Faltan DISCORD_BOT_TOKEN o CLIENT_ID en el archivo .env.');
}
const rest = new discord_js_1.REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
        const route = GUILD_ID
            ? discord_js_1.Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            : discord_js_1.Routes.applicationCommands(CLIENT_ID);
        console.log(`🚀 Registrando ${definitions_1.slashCommands.length} comandos${GUILD_ID ? ' en el guild de pruebas' : ' globales'}...`);
        await rest.put(route, {
            body: definitions_1.slashCommands.map((command) => command.toJSON()),
        });
        console.log('✅ Comandos registrados con éxito.');
    }
    catch (error) {
        console.error('❌ Error al registrar los comandos:', error);
    }
})();
