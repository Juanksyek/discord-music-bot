import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

function isValidYouTubeUrl(url: string): boolean {
    const regex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

function cleanYouTubeUrl(url: string): string {
    // Eliminar parámetros adicionales después de `?v=XXXXXXXXXXX`
    const cleanedUrl = url.split('?')[0]; // Deja solo la parte base de la URL
    return cleanedUrl;
}

export async function playMusic(voiceChannelId: string, guildId: string, adapterCreator: any, query: string) {
    console.log("🎵 Obteniendo stream...");

    // Validar la URL de YouTube
    if (!isValidYouTubeUrl(query)) {
        throw new Error('❌ La URL proporcionada no es válida.');
    }

    // Limpiar la URL eliminando parámetros adicionales
    const cleanedUrl = cleanYouTubeUrl(query);

    // Conexión al canal de voz
    const connection = joinVoiceChannel({
        channelId: voiceChannelId,
        guildId: guildId,
        adapterCreator: adapterCreator,
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('✅ Conexión lista para transmitir audio');
    });

    connection.on('stateChange', (oldState, newState) => {
        console.log(`Estado de conexión cambiado: ${oldState.status} -> ${newState.status}`);
    });

    connection.on('error', (error) => {
        console.error('❌ Error en la conexión de voz:', error);
    });

    try {
        const videoUrl = cleanedUrl; // Usamos la URL limpia
        const outputPath = path.join(__dirname, 'temp_audio.mp3'); // Ruta temporal para guardar el audio

        // Usamos yt-dlp para obtener el audio
        const execCommand = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --output "${outputPath}" ${videoUrl}`;

        // Ejecutamos yt-dlp para descargar el audio
        exec(execCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error ejecutando yt-dlp: ${error.message}`);
                connection.destroy();
                return;
            }

            if (stderr) {
                console.error(`stderr: ${stderr}`);
                connection.destroy();
                return;
            }

            console.log(`stdout: ${stdout}`);
            console.log("✅ Audio descargado con éxito");

            // Creamos el stream desde el archivo mp3 descargado
            const audioStream = fs.createReadStream(outputPath);

            if (!audioStream || typeof audioStream.pipe !== 'function') {
                throw new Error('❌ El stream obtenido no es válido o no se pudo crear.');
            }

            console.log('✅ Stream obtenido desde archivo MP3');

            // Crear el AudioResource con el stream obtenido
            const resource = createAudioResource(audioStream, {
                inlineVolume: true,  // Activar el control de volumen
                inputType: undefined,  // Dejar el tipo de entrada como indefinido
                metadata: { title: videoUrl },  // Metadata para identificar el recurso
            });

            // Asegurar que el recurso de audio sea válido
            if (!resource) {
                throw new Error('❌ No se pudo crear el recurso de audio.');
            }

            // Asegurar que el volumen esté al máximo
            resource.volume?.setVolume(1.0);
            console.log('📦 Recurso de audio creado:', resource);

            // Crear el reproductor de audio y suscribirlo a la conexión
            const player = createAudioPlayer();
            connection.subscribe(player);

            player.play(resource);

            player.on(AudioPlayerStatus.Playing, () => {
                console.log('🎶 Reproduciendo audio...');
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('⏸️ Reproducción terminada.');
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                    connection.destroy();
                }

                // Eliminar el archivo de audio temporal después de la reproducción
                fs.unlinkSync(outputPath);
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
            console.error('❌ Error al obtener el stream o al crear el recurso:', error.message);
        } else {
            console.error('❌ Error al obtener el stream o al crear el recurso:', error);
        }
        connection.destroy(); // Asegurarse de destruir la conexión en caso de error
    }
}
