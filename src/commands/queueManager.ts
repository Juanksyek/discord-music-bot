import { AudioPlayer, AudioPlayerStatus, VoiceConnection, VoiceConnectionStatus, createAudioResource } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import sqlite3 from 'sqlite3'; // Importamos sqlite3 para la base de datos

// Inicializar la base de datos SQLite
const db = new sqlite3.Database('./queue.db');

// Crear la tabla de la cola si no existe
db.run("CREATE TABLE IF NOT EXISTS queue (song TEXT)");

class QueueManager {
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    private queue: string[] = [];
    private isPlaying: boolean = false;

    constructor() {
        this.player = new AudioPlayer();

        this.player.on(AudioPlayerStatus.Playing, () => {
            console.log('🎶 Reproduciendo audio...');
            this.isPlaying = true;
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log('⏸️ Reproducción terminada.');
            this.isPlaying = false;
            this.playNext();
        });

        this.player.on('error', (error) => {
            console.error('❌ Error en el reproductor:', error.message);
            this.isPlaying = false;
            this.playNext();
        });

        // Cargar la cola desde la base de datos al iniciar
        this.loadQueue();
    }

    public setConnection(connection: VoiceConnection) {
        this.connection = connection;
        this.connection.subscribe(this.player);
    }

    public addToQueue(url: string) {
        this.queue.push(url);
        this.saveToQueue(url);  // Guardar la canción en la base de datos
        if (!this.isPlaying) {
            this.playNext();
        }
    }

    private async playNext() {
        if (this.queue.length === 0) {
            if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                this.connection.destroy();
                this.connection = null;
            }
            return;
        }

        const url = this.queue.shift();
        if (!url) return;

        try {
            const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
            const resource = createAudioResource(stream, {
                inlineVolume: true,
            });
            resource.volume?.setVolume(1.0); // Asegúrate de que el volumen esté al máximo
            this.player.play(resource);

            // Eliminar la canción de la base de datos después de reproducirla
            this.removeFromQueue(url);
        } catch (error) {
            console.error('❌ Error al obtener el stream:', error);
            this.playNext();
        }
    }

    public pause() {
        this.player.pause();
    }

    public stop() {
        this.player.stop();
        this.queue = [];
        this.clearQueue();
    }

    public clear() {
        this.stop();
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
            this.connection = null;
        }
        this.clearQueue();  // Limpiar la cola en la base de datos
    }

    // Función para cargar la cola desde la base de datos
    private loadQueue() {
        db.all("SELECT song FROM queue", [], (err, rows: { song: string }[]) => {
            if (err) {
                console.error('❌ Error al cargar la cola desde la base de datos:', err);
                return;
            }
            this.queue = rows.map(row => row.song);
            console.log('✅ Cola cargada desde la base de datos:', this.queue);
        });
    }

    // Función para guardar una canción en la base de datos
    private saveToQueue(url: string) {
        db.run("INSERT INTO queue (song) VALUES (?)", [url], function (err) {
            if (err) {
                console.error('❌ Error al añadir a la cola:', err);
                return;
            }
            console.log(`🎶 Canción añadida a la cola en la base de datos: ${url}`);
        });
    }

    // Función para eliminar una canción de la base de datos
    private removeFromQueue(url: string) {
        db.run("DELETE FROM queue WHERE song = ?", [url], (err) => {
            if (err) {
                console.error('❌ Error al eliminar de la cola:', err);
            } else {
                console.log(`🎶 Canción eliminada de la cola de la base de datos: ${url}`);
            }
        });
    }

    // Función para limpiar la cola en la base de datos
    private clearQueue() {
        db.run("DELETE FROM queue", (err) => {
            if (err) {
                console.error('❌ Error al limpiar la cola de la base de datos:', err);
            } else {
                console.log('✅ Cola limpiada en la base de datos');
            }
        });
    }
}

export default new QueueManager();
