import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

export let currentPlayer: AudioPlayer | null = null;
export let currentConnection: VoiceConnection | null = null;
let disconnectTimeout: NodeJS.Timeout | null = null;

// Validar si la URL es de YouTube
function isValidYouTubeUrl(url: string): boolean {
    const regex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

// Limpiar parámetros extra en la URL de YouTube
function cleanYouTubeUrl(url: string): string {
    return url.split('?')[0];
}

// Setters para manejar el estado global desde otros archivos
export function setCurrentConnection(connection: VoiceConnection | null) {
    currentConnection = connection;
}

export function setCurrentPlayer(player: AudioPlayer | null) {
    currentPlayer = player;
}

// Función principal para reproducir música en un canal de voz
export async function playMusic(voiceChannelId: string, guildId: string, adapterCreator: any, query: string) {
    console.log("🎵 Obteniendo stream...");

    // Validar la URL de YouTube
    if (!isValidYouTubeUrl(query)) {
        throw new Error('❌ La URL proporcionada no es válida.');
    }

    // Limpiar la URL eliminando parámetros adicionales
    const cleanedUrl = cleanYouTubeUrl(query);

    // Si hay una reproducción previa, detiene el reproductor actual
    if (currentPlayer) {
        currentPlayer.stop();
        console.log("⏹️ Música detenida");
    }

    // Si hay una conexión previa activa, destruirla
    if (currentConnection && currentConnection.state.status !== VoiceConnectionStatus.Destroyed) {
        currentConnection.destroy();
        console.log("❌ Conexión destruida");
    }

    // Conexión al canal de voz (nueva conexión siempre que se inicie una nueva canción)
    const connection = joinVoiceChannel({
        channelId: voiceChannelId,
        guildId: guildId,
        adapterCreator: adapterCreator,
    });

    // Escuchar eventos de la conexión
    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('✅ Conexión lista para transmitir audio');
    });

    connection.on('stateChange', (oldState, newState) => {
        console.log(`Estado de conexión cambiado: ${oldState.status} -> ${newState.status}`);
    });

    connection.on('error', (error) => {
        console.error('❌ Error en la conexión de voz:', error);
    });

    // Guardar la conexión para futuras referencias
    currentConnection = connection;

    const outputPath = path.join(__dirname, 'temp_audio.mp3');

    try {
        // 🔁 Eliminar archivo si ya existe antes de descargar
        if (fs.existsSync(outputPath)) {
            try {
                fs.unlinkSync(outputPath);
                console.log('🧹 Archivo viejo eliminado antes de nueva descarga');
            } catch (err) {
                console.warn('⚠️ No se pudo eliminar archivo previo:', err);
            }
        }

        const videoUrl = cleanedUrl;

        // Comando yt-dlp mejorado con flags adicionales
        const execCommand = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --no-cache-dir --no-check-certificate --ignore-errors --output "${outputPath}" "${videoUrl}"`;

        // Mostrar el comando en consola para depuración
        console.log('🛠️ Ejecutando yt-dlp con comando:', execCommand);

        // Ejecutar el comando para descargar el audio
        exec(execCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error ejecutando yt-dlp: ${error.message}`);
                connection.destroy();
                return;
            }

            if (stderr) {
                console.warn(`⚠️ yt-dlp stderr: ${stderr}`);
            }

            console.log(`stdout: ${stdout}`);
            console.log("⏳ Verificando existencia de archivo descargado...");

            // ✅ Validar que el archivo MP3 se haya creado correctamente
            if (!fs.existsSync(outputPath)) {
                console.error('❌ El archivo de audio no se generó. Fallo silencioso de descarga.');
                connection.destroy();
                return;
            }

            console.log("✅ Audio descargado con éxito");

            // Creamos el stream desde el archivo mp3 descargado
            const audioStream = fs.createReadStream(outputPath);

            if (!audioStream || typeof audioStream.pipe !== 'function') {
                console.error('❌ El stream obtenido no es válido.');
                connection.destroy();
                return;
            }

            console.log('✅ Stream obtenido desde archivo MP3');

            // Crear el AudioResource con el stream obtenido
            const resource = createAudioResource(audioStream, {
                inlineVolume: true,
                metadata: { title: videoUrl },
            });

            // Asegurar que el recurso de audio sea válido
            if (!resource) {
                console.error('❌ No se pudo crear el recurso de audio.');
                connection.destroy();
                return;
            }

            // Asegurar que el volumen esté al máximo
            resource.volume?.setVolume(1.0);
            console.log('📦 Recurso de audio creado:', resource);

            // Crear el reproductor de audio y suscribirlo a la conexión
            const player = createAudioPlayer();
            connection.subscribe(player);

            // Guardar el reproductor actual para detenerlo si es necesario
            currentPlayer = player;

            // Iniciar la reproducción
            player.play(resource);

            player.on(AudioPlayerStatus.Playing, () => {
                console.log('🎶 Reproduciendo audio...');
                if (disconnectTimeout) {
                    clearTimeout(disconnectTimeout);
                    disconnectTimeout = null;
                }
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('⏸️ Reproducción terminada.');

                // Eliminar el archivo de audio temporal después de la reproducción
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                    console.log('✅ Archivo de audio temporal eliminado');
                }

                // Reiniciar el reproductor para próximas canciones
                currentPlayer?.stop();
                currentPlayer = createAudioPlayer();
                connection.subscribe(currentPlayer);
                console.log('🔄 Reproductor reiniciado y listo para otra canción.');
                console.log('✅ Conexión y reproductor listos para siguiente canción.');

                // Programar desconexión si no se recibe nueva música en 5 minutos
                disconnectTimeout = setTimeout(() => {
                    console.log('🛑 No se han recibido más canciones. Desconectando...');
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                        console.log('🧹 Archivo temporal limpiado por inactividad');
                    }
                    currentConnection?.destroy();
                    currentPlayer?.stop();
                }, 5 * 60 * 1000);
            });

            player.on('error', (error) => {
                console.error('❌ Error en el reproductor:', error.message);
                if (error.message.includes('Status code: 410')) {
                    console.error('❌ El recurso solicitado ya no está disponible.');
                } else {
                    console.error(`❌ Error no esperado: ${error.message}`);
                }
            });
        });

    } catch (error) {
        if (error instanceof Error) {
            console.error('❌ Error general:', error.message);
        } else {
            console.error('❌ Error inesperado:', error);
        }

        if (currentConnection) currentConnection.destroy();
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
            console.log('✅ Archivo de audio temporal eliminado (error)');
        }
    }
}
