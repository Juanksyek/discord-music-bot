import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import play from 'play-dl';

// Función para crear un recurso de silencio
function createSilentResource() {
    const { Readable } = require('stream');
    const silence = Buffer.from([0xF8, 0xFF, 0xFE]); // Paquete de silencio
    const silenceStream = new Readable();
    silenceStream.push(silence);
    silenceStream.push(null);
    return createAudioResource(silenceStream, { inlineVolume: true });
}

export async function playMusic(voiceChannelId: string, guildId: string, adapterCreator: any, query: string) {
    // Conexión al canal de voz
    const connection = joinVoiceChannel({
        channelId: voiceChannelId,
        guildId: guildId,
        adapterCreator: adapterCreator,
    });
    console.log('🔊 Conectado al canal de voz:', connection.state.status);
    console.log('Adaptador de voz configurado:', adapterCreator);

    // Agregar el listener de cambios de estado
    connection.on('stateChange', (oldState, newState) => {
        console.log(`Estado de conexión cambiado: ${oldState.status} -> ${newState.status}`);
    });

    try {
        console.log('🎵 Obteniendo stream...');
        const stream = await play.stream(query);
        console.log('✅ Stream obtenido:', stream);

        // Listeners para depurar el stream
        stream.stream.on('data', (chunk) => {
            console.log('🔊 Recibiendo datos del stream:', chunk.length);
        });

        stream.stream.on('end', () => {
            console.log('🔚 El stream ha finalizado.');
        });

        stream.stream.on('error', (error) => {
            console.error('❌ Error en el stream:', error);
        });

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true,
        });
        resource.volume?.setVolume(1.0);
        console.log('📦 Recurso de audio creado:', resource);

        const player = createAudioPlayer();
        connection.subscribe(player);

        // Asegurarse de que el tiempo de espera no sea negativo
        const timeoutDuration = Math.max(0, 5000); // Ajusta el tiempo de espera según sea necesario

        console.log('🔇 Reproduciendo silencio...');
        player.play(createSilentResource());

        setTimeout(() => {
            console.log('▶️ Reproduciendo recurso principal...');
            player.play(resource);
        }, timeoutDuration);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log('🎶 Reproduciendo audio...');
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('⏸️ Reproducción terminada.');
            if (connection.state.status !== 'destroyed') {
                connection.destroy();
            }
        });

        player.on('error', (error) => {
            console.error('❌ Error en el reproductor:', error);
        });

    } catch (error) {
        console.error('❌ Error al obtener el stream:', error);
    }
}
