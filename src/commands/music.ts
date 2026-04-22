import {
    AudioPlayer,
    AudioPlayerStatus,
    AudioResource,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnection,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import { spawn, type ChildProcess } from 'child_process';
import play from 'play-dl';
import { randomUUID } from 'crypto';
import { createControlButtons, createErrorEmbed, createNowPlayingEmbed } from '../lib/ui';

const PLAYLIST_LIMIT = 25;
const DISCONNECT_DELAY_MS = 3 * 60 * 1000;
const DEFAULT_VOLUME = 0.8;
const VOICE_READY_TIMEOUT_MS = 30_000;
const VOICE_RETRY_ATTEMPTS = 3;

export type AnnouncementChannel = {
    send: (payload: any) => Promise<unknown>;
};

export type QueueTrack = {
    id: string;
    title: string;
    requestedBy: string;
    requestedById: string;
    sourceLabel: string;
    durationLabel?: string;
    url: string;
    thumbnail?: string;
};

export type PlaybackSnapshot = {
    guildId: string;
    current: QueueTrack | null;
    queue: QueueTrack[];
    isPaused: boolean;
    volumePercent: number;
    connectedChannelId: string | null;
};

export type EnqueueMusicRequest = {
    guildId: string;
    voiceChannelId: string;
    adapterCreator: DiscordGatewayAdapterCreator;
    query: string;
    requestedBy: string;
    requestedById: string;
    textChannel?: AnnouncementChannel | null;
};

export type EnqueueMusicResult = {
    addedTracks: QueueTrack[];
    startedImmediately: boolean;
    firstQueuedPosition: number;
    playlistTitle?: string;
};

type GuildPlaybackState = {
    guildId: string;
    player: AudioPlayer;
    connection: VoiceConnection | null;
    queue: QueueTrack[];
    current: QueueTrack | null;
    currentResource: AudioResource<QueueTrack> | null;
    currentProcess: ChildProcess | null;
    volume: number;
    textChannel: AnnouncementChannel | null;
    disconnectTimeout: NodeJS.Timeout | null;
    sessionActive: boolean;
    voiceChannelId: string | null;
    adapterCreator: DiscordGatewayAdapterCreator | null;
    suppressNextIdleEvent: boolean;
    enqueueChain: Promise<void>;
};

const guildStates = new Map<string, GuildPlaybackState>();

export async function enqueueMusic(request: EnqueueMusicRequest): Promise<EnqueueMusicResult> {
    const state = getOrCreateState(request.guildId);
    state.textChannel = request.textChannel ?? state.textChannel;

    return enqueueSerial(state, async () => {
        const resolved = await resolveMusicTracks(request.query, request.requestedBy, request.requestedById);

        state.voiceChannelId = request.voiceChannelId;
        state.adapterCreator = request.adapterCreator;

        const alreadyPlaying = hasActivePlaybackSession(state);
        const startedImmediately = !alreadyPlaying;
        const firstQueuedPosition = alreadyPlaying ? state.queue.length + 1 : 0;

        if (!alreadyPlaying) {
            await ensureConnection(state, request.voiceChannelId, request.adapterCreator);
            state.sessionActive = true;
        }

        state.queue.push(...resolved.tracks);

        if (startedImmediately) {
            await playNext(state, false);
        }

        return {
            addedTracks: resolved.tracks,
            startedImmediately,
            firstQueuedPosition,
            playlistTitle: resolved.playlistTitle,
        };
    });
}

export function getSnapshot(guildId: string): PlaybackSnapshot | null {
    const state = guildStates.get(guildId);
    if (!state) {
        return null;
    }

    if (
        !state.sessionActive &&
        !state.current &&
        state.queue.length === 0 &&
        !state.connection &&
        state.player.state.status === AudioPlayerStatus.Idle
    ) {
        return null;
    }

    return snapshotFromState(state);
}

export function getConnectedChannelId(guildId: string): string | null {
    return guildStates.get(guildId)?.connection?.joinConfig.channelId ?? null;
}

/**
 * Toggles pause/resume. Used by the panel button.
 */
export async function togglePause(guildId: string): Promise<'paused' | 'resumed' | 'noop'> {
    const state = guildStates.get(guildId);
    if (!state) {
        return 'noop';
    }

    const status = state.player.state.status;

    if (status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused) {
        return state.player.unpause() ? 'resumed' : 'noop';
    }

    if (status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering) {
        return state.player.pause(true) ? 'paused' : 'noop';
    }

    return 'noop';
}

/**
 * Pauses playback. Returns true if the player is now paused (including already-paused states).
 */
export async function pause(guildId: string): Promise<boolean> {
    const state = guildStates.get(guildId);
    if (!state) {
        return false;
    }

    const status = state.player.state.status;

    // Already paused — treat as success so the user gets a clear confirmation.
    if (status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused) {
        return true;
    }

    if (status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering) {
        return state.player.pause(true);
    }

    return false;
}

/**
 * Resumes playback. Returns true if unpause succeeded.
 */
export async function resume(guildId: string): Promise<boolean> {
    const state = guildStates.get(guildId);
    if (!state) {
        return false;
    }

    const status = state.player.state.status;

    if (status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused) {
        return state.player.unpause();
    }

    return false;
}

/**
 * Skips the current track. All state checks happen inside the serial lock to
 * avoid races during track transitions.
 */
export async function skip(guildId: string): Promise<boolean> {
    const state = guildStates.get(guildId);
    if (!state) {
        return false;
    }

    return enqueueSerial(state, async () => {
        const status = state.player.state.status;

        // Truly nothing to skip: player is idle and no track is loaded.
        if (status === AudioPlayerStatus.Idle && !state.current) {
            return false;
        }

        destroyCurrentProcess(state);
        return state.player.stop(true);
    });
}

export async function stop(guildId: string): Promise<boolean> {
    const state = guildStates.get(guildId);
    if (!state) {
        return false;
    }

    return enqueueSerial(state, async () => {
        const hadSession =
            state.sessionActive ||
            Boolean(state.current) ||
            state.queue.length > 0 ||
            Boolean(state.connection) ||
            state.player.state.status !== AudioPlayerStatus.Idle;

        if (!hadSession) {
            return false;
        }

        clearDisconnectTimer(state);
        state.suppressNextIdleEvent = true;

        destroyCurrentProcess(state);

        state.current = null;
        state.currentResource = null;
        state.queue = [];
        state.sessionActive = false;
        state.voiceChannelId = null;
        state.adapterCreator = null;

        state.player.stop(true);

        if (state.connection) {
            state.connection.destroy();
            state.connection = null;
        }

        return true;
    });
}

export async function clearQueue(guildId: string): Promise<number> {
    const state = guildStates.get(guildId);
    if (!state || state.queue.length === 0) {
        return 0;
    }

    return enqueueSerial(state, async () => {
        const count = state.queue.length;
        state.queue = [];
        return count;
    });
}

export async function removeFromQueue(guildId: string, position: number): Promise<QueueTrack | null> {
    const state = guildStates.get(guildId);
    if (!state || position < 1 || position > state.queue.length) {
        return null;
    }

    return enqueueSerial(state, async () => {
        if (position < 1 || position > state.queue.length) {
            return null;
        }

        const [removed] = state.queue.splice(position - 1, 1);
        return removed ?? null;
    });
}

export function setVolume(guildId: string, percentage: number): number | null {
    const state = guildStates.get(guildId);
    if (!state) {
        return null;
    }

    const normalized = Math.min(200, Math.max(5, percentage)) / 100;
    state.volume = normalized;
    state.currentResource?.volume?.setVolume(normalized);
    return Math.round(normalized * 100);
}

function getOrCreateState(guildId: string): GuildPlaybackState {
    const existing = guildStates.get(guildId);
    if (existing) {
        return existing;
    }

    const state: GuildPlaybackState = {
        guildId,
        player: createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        }),
        connection: null,
        queue: [],
        current: null,
        currentResource: null,
        currentProcess: null,
        volume: DEFAULT_VOLUME,
        textChannel: null,
        disconnectTimeout: null,
        sessionActive: false,
        voiceChannelId: null,
        adapterCreator: null,
        suppressNextIdleEvent: false,
        enqueueChain: Promise.resolve(),
    };

    state.player.on(AudioPlayerStatus.Idle, () => {
        void enqueueSerial(state, async () => {
            await handleTrackEnd(state);
        });
    });

    state.player.on('error', (error) => {
        console.error(`[${guildId}] Error de reproduccion:`, error);
        void enqueueSerial(state, async () => {
            const failedTrack = state.current;
            destroyCurrentProcess(state);
            state.current = null;
            state.currentResource = null;

            await announceError(state, `No pude reproducir **${failedTrack?.title ?? 'la pista actual'}**. Paso a la siguiente.`);
            await playNext(state, true);
        });
    });

    guildStates.set(guildId, state);
    return state;
}

/** Runs fn after the guild's current enqueue operation completes, preventing concurrent state races. */
function enqueueSerial<T>(state: GuildPlaybackState, fn: () => Promise<T>): Promise<T> {
    const result = state.enqueueChain.then(fn);
    state.enqueueChain = result.then(
        () => {},
        () => {},
    );
    return result;
}

function hasActivePlaybackSession(state: GuildPlaybackState): boolean {
    return (
        state.sessionActive ||
        Boolean(state.current) ||
        state.queue.length > 0 ||
        state.currentResource !== null ||
        state.currentProcess !== null ||
        state.player.state.status !== AudioPlayerStatus.Idle
    );
}

async function ensureConnection(
    state: GuildPlaybackState,
    voiceChannelId: string,
    adapterCreator: DiscordGatewayAdapterCreator
): Promise<void> {
    clearDisconnectTimer(state);

    if (
        state.connection &&
        state.connection.joinConfig.channelId === voiceChannelId
    ) {
        if (state.connection.state.status === VoiceConnectionStatus.Ready) {
            return;
        }

        if (state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            try {
                await entersState(state.connection, VoiceConnectionStatus.Ready, 10_000);
                return;
            } catch {
                state.connection.destroy();
                state.connection = null;
            }
        } else {
            state.connection = null;
        }
    }

    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        state.connection.destroy();
        state.connection = null;
    }

    for (let attempt = 1; attempt <= VOICE_RETRY_ATTEMPTS; attempt += 1) {
        const connection = joinVoiceChannel({
            channelId: voiceChannelId,
            guildId: state.guildId,
            adapterCreator,
            selfDeaf: true,
        });

        connection.on('stateChange', (_, newState) => {
            console.log(`[${state.guildId}] Voz intento ${attempt}: ${newState.status}`);
        });

        connection.on('error', (error) => {
            console.error(`[${state.guildId}] Error de conexion de voz:`, error);
        });

        connection.subscribe(state.player);
        state.connection = connection;

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
            return;
        } catch (error) {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            state.connection = null;

            if (attempt === VOICE_RETRY_ATTEMPTS) {
                throw new Error(
                    `No pude conectarme al canal de voz tras ${VOICE_RETRY_ATTEMPTS} intentos. ${error instanceof Error ? error.message : String(error)}`
                );
            }

            await delay(1_250);
        }
    }
}

async function playNext(state: GuildPlaybackState, announce: boolean): Promise<void> {
    clearDisconnectTimer(state);

    // Guard: don't start a new resource while the player is already actively playing one.
    if (
        (state.player.state.status === AudioPlayerStatus.Playing ||
            state.player.state.status === AudioPlayerStatus.Buffering) &&
        state.currentResource
    ) {
        console.warn(`[${state.guildId}] playNext called while player busy — skipping start.`);
        return;
    }

    destroyCurrentProcess(state);

    const nextTrack = state.queue.shift();
    if (!nextTrack) {
        state.current = null;
        state.currentResource = null;
        state.currentProcess = null;
        state.sessionActive = false;
        scheduleDisconnect(state);
        return;
    }

    state.current = nextTrack;
    state.sessionActive = true;

    try {
        if (!state.connection || state.connection.state.status !== VoiceConnectionStatus.Ready) {
            if (!state.voiceChannelId || !state.adapterCreator) {
                throw new Error('No tengo contexto del canal de voz para continuar la sesion.');
            }

            await ensureConnection(state, state.voiceChannelId, state.adapterCreator);
        }

        const { resource, process: ytProcess } = await createResource(nextTrack);
        resource.volume?.setVolume(state.volume);

        state.currentResource = resource;
        state.currentProcess = ytProcess;
        state.player.play(resource);

        if (announce) {
            await announceNowPlaying(state);
        }
    } catch (error) {
        console.error(`[${state.guildId}] Error creando recurso:`, error);
        state.current = null;
        state.currentResource = null;
        state.currentProcess = null;
        await announceError(state, `No pude preparar **${nextTrack.title}**. Intento con la siguiente.`);
        await playNext(state, announce);
    }
}

async function handleTrackEnd(state: GuildPlaybackState): Promise<void> {
    if (state.suppressNextIdleEvent) {
        state.suppressNextIdleEvent = false;
        return;
    }

    state.current = null;
    state.currentResource = null;
    state.currentProcess = null;
    await playNext(state, true);
}

async function createResource(track: QueueTrack): Promise<{ resource: AudioResource<QueueTrack>; process: ChildProcess | null }> {
    if (!track.url) {
        throw new Error('La pista no tiene URL valida.');
    }

    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '-o', '-',
        '--quiet',
        '--no-playlist',
        '--no-warnings',
        track.url,
    ]);

    ytdlp.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
            console.warn(`[yt-dlp] ${msg}`);
        }
    });

    return {
        resource: createAudioResource(ytdlp.stdout, {
            inlineVolume: true,
            inputType: StreamType.Arbitrary,
            metadata: track,
        }),
        process: ytdlp,
    };
}

async function resolveMusicTracks(
    query: string,
    requestedBy: string,
    requestedById: string
): Promise<{ tracks: QueueTrack[]; playlistTitle?: string }> {
    const directTarget = extractYouTubeTarget(query);

    if (directTarget?.type === 'playlist') {
        const playlist = await play.playlist_info(directTarget.url);
        const videos = (await playlist.all_videos())
            .filter((video) => video.url && !video.live && !video.private)
            .slice(0, PLAYLIST_LIMIT);

        if (videos.length === 0) {
            throw new Error('No encontre videos reproducibles dentro de esa playlist.');
        }

        return {
            tracks: videos.map((video) => createMusicTrack(video, requestedBy, requestedById)),
            playlistTitle: playlist.title ?? 'playlist sin titulo',
        };
    }

    if (directTarget?.type === 'video') {
        const info = await play.video_basic_info(directTarget.url);
        return {
            tracks: [createMusicTrack(info.video_details, requestedBy, requestedById)],
        };
    }

    const normalizedQuery = normalizeMusicQuery(query);
    const validation = await play.validate(normalizedQuery).catch(() => false);

    if (validation === 'yt_playlist') {
        const playlist = await play.playlist_info(normalizedQuery);
        const videos = (await playlist.all_videos())
            .filter((video) => video.url && !video.live && !video.private)
            .slice(0, PLAYLIST_LIMIT);

        if (videos.length === 0) {
            throw new Error('No encontre videos reproducibles dentro de esa playlist.');
        }

        return {
            tracks: videos.map((video) => createMusicTrack(video, requestedBy, requestedById)),
            playlistTitle: playlist.title ?? 'playlist sin titulo',
        };
    }

    if (validation && validation !== 'yt_video' && validation !== 'search') {
        throw new Error('Ahora mismo solo acepto YouTube o busquedas normales para mantener el bot estable.');
    }

    if (validation === 'yt_video') {
        const info = await play.video_basic_info(normalizedQuery);
        return {
            tracks: [createMusicTrack(info.video_details, requestedBy, requestedById)],
        };
    }

    const results = await play.search(normalizedQuery, {
        limit: 1,
        source: { youtube: 'video' },
    });

    const match = results.find((item) => item.url && !item.live && !item.private);
    if (!match) {
        throw new Error('No encontre resultados validos para esa busqueda.');
    }

    return {
        tracks: [createMusicTrack(match, requestedBy, requestedById)],
    };
}

function normalizeMusicQuery(query: string): string {
    const trimmedQuery = sanitizeRawQuery(query);
    if (!trimmedQuery) {
        return trimmedQuery;
    }

    const normalizedUrl = normalizeYouTubeUrl(trimmedQuery);
    return normalizedUrl ?? trimmedQuery;
}

function normalizeYouTubeUrl(input: string): string | null {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(input);
    } catch {
        return null;
    }

    const hostname = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = parsedUrl.pathname.replace(/\/+$/, '');

    if (hostname === 'youtu.be') {
        const videoId = pathname.split('/').filter(Boolean)[0];
        return isYouTubeId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
    }

    const isYouTubeHost = hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com';
    if (!isYouTubeHost) {
        return null;
    }

    if (pathname === '/watch') {
        const videoId = parsedUrl.searchParams.get('v');
        if (isYouTubeId(videoId)) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }

        const playlistId = parsedUrl.searchParams.get('list');
        if (playlistId) {
            return `https://www.youtube.com/playlist?list=${playlistId}`;
        }

        return null;
    }

    if (pathname === '/playlist') {
        const playlistId = parsedUrl.searchParams.get('list');
        return playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : null;
    }

    const directVideoId = pathname.match(/^\/(?:shorts|live|embed)\/([0-9A-Za-z_-]{11})$/)?.[1];
    if (isYouTubeId(directVideoId)) {
        return `https://www.youtube.com/watch?v=${directVideoId}`;
    }

    return null;
}

function isYouTubeId(value: string | null | undefined): value is string {
    return typeof value === 'string' && /^[0-9A-Za-z_-]{11}$/.test(value);
}

function extractYouTubeTarget(input: string): { type: 'video' | 'playlist'; url: string } | null {
    const sanitizedInput = sanitizeRawQuery(input);
    if (!sanitizedInput) {
        return null;
    }

    const urlCandidate = sanitizedInput.match(/https?:\/\/[^\s>]+/i)?.[0] ?? sanitizedInput;
    const normalizedUrl = normalizeYouTubeUrl(urlCandidate);

    if (!normalizedUrl) {
        if (isYouTubeId(sanitizedInput)) {
            return {
                type: 'video',
                url: `https://www.youtube.com/watch?v=${sanitizedInput}`,
            };
        }

        return null;
    }

    return normalizedUrl.includes('/playlist?list=')
        ? { type: 'playlist', url: normalizedUrl }
        : { type: 'video', url: normalizedUrl };
}

function sanitizeRawQuery(input: string): string {
    return input
        .trim()
        .replace(/^<+/, '')
        .replace(/>+$/, '');
}

function createMusicTrack(video: any, requestedBy: string, requestedById: string): QueueTrack {
    return {
        id: randomUUID(),
        title: video.title ?? 'Cancion sin titulo',
        requestedBy,
        requestedById,
        sourceLabel: 'YouTube',
        durationLabel: video.live ? 'Directo' : video.durationRaw || formatDuration(video.durationInSec),
        url: video.url,
        thumbnail: Array.isArray(video.thumbnails) ? video.thumbnails.at(-1)?.url : undefined,
    };
}

function formatDuration(seconds?: number): string {
    if (!seconds || Number.isNaN(seconds)) {
        return 'desconocida';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function scheduleDisconnect(state: GuildPlaybackState): void {
    clearDisconnectTimer(state);

    state.disconnectTimeout = setTimeout(() => {
        if (state.connection) {
            state.connection.destroy();
            state.connection = null;
        }
    }, DISCONNECT_DELAY_MS);
}

function clearDisconnectTimer(state: GuildPlaybackState): void {
    if (state.disconnectTimeout) {
        clearTimeout(state.disconnectTimeout);
        state.disconnectTimeout = null;
    }
}

function destroyCurrentProcess(state: GuildPlaybackState): void {
    const activeProcess = state.currentProcess;
    if (!activeProcess) {
        return;
    }

    activeProcess.stdout?.destroy();
    activeProcess.stderr?.destroy();

    try {
        activeProcess.kill();
    } catch {
        // El proceso ya termino o no pudo recibir la senal.
    }

    state.currentProcess = null;
}

export async function shutdownPlayback(): Promise<void> {
    const activeGuilds = [...guildStates.keys()];
    await Promise.all(activeGuilds.map((guildId) => stop(guildId)));
}

function snapshotFromState(state: GuildPlaybackState): PlaybackSnapshot {
    return {
        guildId: state.guildId,
        current: state.current,
        queue: [...state.queue],
        isPaused:
            state.player.state.status === AudioPlayerStatus.Paused ||
            state.player.state.status === AudioPlayerStatus.AutoPaused,
        volumePercent: Math.round(state.volume * 100),
        connectedChannelId: state.connection?.joinConfig.channelId ?? null,
    };
}

async function announceNowPlaying(state: GuildPlaybackState): Promise<void> {
    if (!state.textChannel || !state.current) {
        return;
    }

    const snapshot = snapshotFromState(state);

    await state.textChannel.send({
        embeds: [createNowPlayingEmbed(snapshot)],
        components: [createControlButtons()],
    }).catch((error: unknown) => {
        console.warn(`[${state.guildId}] No pude anunciar la nueva pista:`, error);
    });
}

async function announceError(state: GuildPlaybackState, message: string): Promise<void> {
    if (!state.textChannel) {
        return;
    }

    await state.textChannel.send({
        embeds: [createErrorEmbed(message)],
    }).catch((error: unknown) => {
        console.warn(`[${state.guildId}] No pude anunciar un error:`, error);
    });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
