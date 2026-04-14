"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueMusic = enqueueMusic;
exports.enqueueTts = enqueueTts;
exports.getSnapshot = getSnapshot;
exports.getConnectedChannelId = getConnectedChannelId;
exports.togglePause = togglePause;
exports.pause = pause;
exports.resume = resume;
exports.skip = skip;
exports.stop = stop;
exports.clearQueue = clearQueue;
exports.removeFromQueue = removeFromQueue;
exports.shuffleQueue = shuffleQueue;
exports.setVolume = setVolume;
exports.shutdownPlayback = shutdownPlayback;
const voice_1 = require("@discordjs/voice");
const child_process_1 = require("child_process");
const play_dl_1 = __importDefault(require("play-dl"));
const crypto_1 = require("crypto");
const tts_1 = require("../lib/tts");
const ui_1 = require("../lib/ui");
const PLAYLIST_LIMIT = 25;
const DISCONNECT_DELAY_MS = 3 * 60 * 1000;
const DEFAULT_VOLUME = 0.8;
const VOICE_READY_TIMEOUT_MS = 30_000;
const VOICE_RETRY_ATTEMPTS = 3;
const guildStates = new Map();
async function enqueueMusic(request) {
    const state = getOrCreateState(request.guildId);
    state.textChannel = request.textChannel ?? state.textChannel;
    // Resolve tracks outside the serial lock — safe to run in parallel
    const resolved = await resolveMusicTracks(request.query, request.requestedBy, request.requestedById);
    // Serialize state mutations per guild so concurrent commands don't race
    return enqueueSerial(state, async () => {
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
async function enqueueTts(request) {
    const state = getOrCreateState(request.guildId);
    state.textChannel = request.textChannel ?? state.textChannel;
    // Generate TTS audio outside the serial lock
    const generated = await (0, tts_1.generateTtsAudio)(request.text, request.voiceKey);
    return enqueueSerial(state, async () => {
        state.voiceChannelId = request.voiceChannelId;
        state.adapterCreator = request.adapterCreator;
        const preview = request.text.length > 40 ? `${request.text.slice(0, 39)}…` : request.text;
        const track = {
            id: (0, crypto_1.randomUUID)(),
            kind: 'tts',
            title: `${generated.preset.label}: ${preview}`,
            requestedBy: request.requestedBy,
            requestedById: request.requestedById,
            sourceLabel: generated.preset.label,
            durationLabel: 'TTS',
            filePath: generated.filePath,
        };
        const alreadyPlaying = hasActivePlaybackSession(state);
        const startedImmediately = !alreadyPlaying;
        const willPlayNext = alreadyPlaying;
        if (!alreadyPlaying) {
            await ensureConnection(state, request.voiceChannelId, request.adapterCreator);
            state.sessionActive = true;
        }
        if (startedImmediately) {
            state.queue.push(track);
            await playNext(state, false);
        }
        else {
            state.queue.unshift(track);
        }
        return { track, startedImmediately, willPlayNext };
    });
}
function getSnapshot(guildId) {
    const state = guildStates.get(guildId);
    if (!state) {
        return null;
    }
    if (!state.current && state.queue.length === 0 && !state.connection) {
        return null;
    }
    return snapshotFromState(state);
}
function getConnectedChannelId(guildId) {
    return guildStates.get(guildId)?.connection?.joinConfig.channelId ?? null;
}
async function togglePause(guildId) {
    const state = guildStates.get(guildId);
    if (!state?.current) {
        return 'noop';
    }
    const status = state.player.state.status;
    if (status === voice_1.AudioPlayerStatus.Paused || status === voice_1.AudioPlayerStatus.AutoPaused) {
        state.player.unpause();
        return 'resumed';
    }
    const paused = state.player.pause(true);
    return paused ? 'paused' : 'noop';
}
async function pause(guildId) {
    const state = guildStates.get(guildId);
    if (!state?.current) {
        return false;
    }
    return state.player.pause(true);
}
async function resume(guildId) {
    const state = guildStates.get(guildId);
    if (!state?.current) {
        return false;
    }
    return state.player.unpause();
}
async function skip(guildId) {
    const state = guildStates.get(guildId);
    if (!state?.current) {
        return false;
    }
    return enqueueSerial(state, async () => {
        if (!state.current) {
            return false;
        }
        destroyCurrentProcess(state);
        return state.player.stop(true);
    });
}
async function stop(guildId) {
    const state = guildStates.get(guildId);
    if (!state) {
        return false;
    }
    return enqueueSerial(state, async () => {
        const hadSession = hasActivePlaybackSession(state) || Boolean(state.connection);
        if (!hadSession) {
            return false;
        }
        clearDisconnectTimer(state);
        state.suppressNextIdleEvent = true;
        const currentTrack = state.current;
        const queuedTracks = [...state.queue];
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
        await cleanupTrack(currentTrack);
        await Promise.all(queuedTracks.map((track) => cleanupTrack(track)));
        return true;
    });
}
async function clearQueue(guildId) {
    const state = guildStates.get(guildId);
    if (!state || state.queue.length === 0) {
        return 0;
    }
    return enqueueSerial(state, async () => {
        const removed = [...state.queue];
        state.queue = [];
        await Promise.all(removed.map((track) => cleanupTrack(track)));
        return removed.length;
    });
}
async function removeFromQueue(guildId, position) {
    const state = guildStates.get(guildId);
    if (!state || position < 1 || position > state.queue.length) {
        return null;
    }
    return enqueueSerial(state, async () => {
        if (position < 1 || position > state.queue.length) {
            return null;
        }
        const [removed] = state.queue.splice(position - 1, 1);
        await cleanupTrack(removed);
        return removed ?? null;
    });
}
function shuffleQueue(guildId) {
    const state = guildStates.get(guildId);
    if (!state || state.queue.length < 2) {
        return state?.queue.length ?? 0;
    }
    for (let index = state.queue.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [state.queue[index], state.queue[swapIndex]] = [state.queue[swapIndex], state.queue[index]];
    }
    return state.queue.length;
}
function setVolume(guildId, percentage) {
    const state = guildStates.get(guildId);
    if (!state) {
        return null;
    }
    const normalized = Math.min(200, Math.max(5, percentage)) / 100;
    state.volume = normalized;
    state.currentResource?.volume?.setVolume(normalized);
    return Math.round(normalized * 100);
}
function getOrCreateState(guildId) {
    const existing = guildStates.get(guildId);
    if (existing) {
        return existing;
    }
    const state = {
        guildId,
        player: (0, voice_1.createAudioPlayer)({
            behaviors: {
                noSubscriber: voice_1.NoSubscriberBehavior.Pause,
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
    state.player.on(voice_1.AudioPlayerStatus.Idle, () => {
        void enqueueSerial(state, async () => {
            await handleTrackEnd(state);
        });
    });
    state.player.on('error', (error) => {
        console.error(`[${guildId}] Error de reproducción:`, error);
        void enqueueSerial(state, async () => {
            const failedTrack = state.current;
            destroyCurrentProcess(state);
            state.current = null;
            state.currentResource = null;
            await cleanupTrack(failedTrack);
            await announceError(state, `No pude reproducir **${failedTrack?.title ?? 'la pista actual'}**. Paso a la siguiente.`);
            await playNext(state, true);
        });
    });
    guildStates.set(guildId, state);
    return state;
}
/** Runs `fn` after the guild's current enqueue operation completes, preventing concurrent state races. */
function enqueueSerial(state, fn) {
    const result = state.enqueueChain.then(fn);
    state.enqueueChain = result.then(() => { }, () => { });
    return result;
}
function hasActivePlaybackSession(state) {
    return (state.sessionActive ||
        Boolean(state.current) ||
        state.queue.length > 0 ||
        state.currentResource !== null ||
        state.currentProcess !== null ||
        state.player.state.status !== voice_1.AudioPlayerStatus.Idle);
}
async function ensureConnection(state, voiceChannelId, adapterCreator) {
    clearDisconnectTimer(state);
    if (state.connection &&
        state.connection.joinConfig.channelId === voiceChannelId) {
        if (state.connection.state.status === voice_1.VoiceConnectionStatus.Ready) {
            return;
        }
        if (state.connection.state.status !== voice_1.VoiceConnectionStatus.Destroyed) {
            try {
                await (0, voice_1.entersState)(state.connection, voice_1.VoiceConnectionStatus.Ready, 10_000);
                return;
            }
            catch {
                state.connection.destroy();
                state.connection = null;
            }
        }
        else {
            state.connection = null;
        }
    }
    if (state.connection && state.connection.state.status !== voice_1.VoiceConnectionStatus.Destroyed) {
        state.connection.destroy();
        state.connection = null;
    }
    for (let attempt = 1; attempt <= VOICE_RETRY_ATTEMPTS; attempt += 1) {
        const connection = (0, voice_1.joinVoiceChannel)({
            channelId: voiceChannelId,
            guildId: state.guildId,
            adapterCreator,
            selfDeaf: true,
        });
        connection.on('stateChange', (_, newState) => {
            console.log(`[${state.guildId}] Voz intento ${attempt}: ${newState.status}`);
        });
        connection.on('debug', (msg) => {
            console.log(`[${state.guildId}] [voice debug] ${msg}`);
        });
        connection.on('error', (error) => {
            console.error(`[${state.guildId}] Error de conexión de voz:`, error);
        });
        connection.subscribe(state.player);
        state.connection = connection;
        try {
            await (0, voice_1.entersState)(connection, voice_1.VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
            return;
        }
        catch (error) {
            if (connection.state.status !== voice_1.VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            state.connection = null;
            if (attempt === VOICE_RETRY_ATTEMPTS) {
                throw new Error(`No pude conectarme al canal de voz tras ${VOICE_RETRY_ATTEMPTS} intentos. ${error instanceof Error ? error.message : String(error)}`);
            }
            await delay(1_250);
        }
    }
}
async function playNext(state, announce) {
    clearDisconnectTimer(state);
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
        if (!state.connection || state.connection.state.status !== voice_1.VoiceConnectionStatus.Ready) {
            if (!state.voiceChannelId || !state.adapterCreator) {
                throw new Error('No tengo contexto del canal de voz para continuar la sesión.');
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
    }
    catch (error) {
        console.error(`[${state.guildId}] Error creando recurso:`, error);
        await cleanupTrack(nextTrack);
        state.current = null;
        state.currentResource = null;
        state.currentProcess = null;
        await announceError(state, `No pude preparar **${nextTrack.title}**. Intento con la siguiente.`);
        await playNext(state, announce);
    }
}
async function handleTrackEnd(state) {
    if (state.suppressNextIdleEvent) {
        state.suppressNextIdleEvent = false;
        return;
    }
    const finishedTrack = state.current;
    state.current = null;
    state.currentResource = null;
    state.currentProcess = null;
    await cleanupTrack(finishedTrack);
    await playNext(state, true);
}
async function createResource(track) {
    if (track.kind === 'tts') {
        if (!track.filePath) {
            throw new Error('El archivo TTS no existe.');
        }
        return {
            resource: (0, voice_1.createAudioResource)(track.filePath, {
                inlineVolume: true,
                metadata: track,
            }),
            process: null,
        };
    }
    if (!track.url) {
        throw new Error('La pista no tiene URL válida.');
    }
    const ytdlp = (0, child_process_1.spawn)('yt-dlp', [
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '-o', '-',
        '--quiet',
        '--no-playlist',
        '--no-warnings',
        track.url,
    ]);
    ytdlp.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
            console.warn(`[yt-dlp] ${msg}`);
        }
    });
    return {
        resource: (0, voice_1.createAudioResource)(ytdlp.stdout, {
            inlineVolume: true,
            inputType: voice_1.StreamType.Arbitrary,
            metadata: track,
        }),
        process: ytdlp,
    };
}
async function resolveMusicTracks(query, requestedBy, requestedById) {
    const directTarget = extractYouTubeTarget(query);
    if (directTarget?.type === 'playlist') {
        const playlist = await play_dl_1.default.playlist_info(directTarget.url);
        const videos = (await playlist.all_videos())
            .filter((video) => video.url && !video.live && !video.private)
            .slice(0, PLAYLIST_LIMIT);
        if (videos.length === 0) {
            throw new Error('No encontré videos reproducibles dentro de esa playlist.');
        }
        return {
            tracks: videos.map((video) => createMusicTrack(video, requestedBy, requestedById)),
            playlistTitle: playlist.title ?? 'playlist sin título',
        };
    }
    if (directTarget?.type === 'video') {
        const info = await play_dl_1.default.video_basic_info(directTarget.url);
        return {
            tracks: [createMusicTrack(info.video_details, requestedBy, requestedById)],
        };
    }
    const normalizedQuery = normalizeMusicQuery(query);
    const validation = await play_dl_1.default.validate(normalizedQuery).catch(() => false);
    if (validation === 'yt_playlist') {
        const playlist = await play_dl_1.default.playlist_info(normalizedQuery);
        const videos = (await playlist.all_videos())
            .filter((video) => video.url && !video.live && !video.private)
            .slice(0, PLAYLIST_LIMIT);
        if (videos.length === 0) {
            throw new Error('No encontré videos reproducibles dentro de esa playlist.');
        }
        return {
            tracks: videos.map((video) => createMusicTrack(video, requestedBy, requestedById)),
            playlistTitle: playlist.title ?? 'playlist sin título',
        };
    }
    if (validation && validation !== 'yt_video' && validation !== 'search') {
        throw new Error('Ahora mismo solo acepto YouTube o búsquedas normales para mantener el bot estable.');
    }
    if (validation === 'yt_video') {
        const info = await play_dl_1.default.video_basic_info(normalizedQuery);
        return {
            tracks: [createMusicTrack(info.video_details, requestedBy, requestedById)],
        };
    }
    const results = await play_dl_1.default.search(normalizedQuery, {
        limit: 1,
        source: { youtube: 'video' },
    });
    const match = results.find((item) => item.url && !item.live && !item.private);
    if (!match) {
        throw new Error('No encontré resultados válidos para esa búsqueda.');
    }
    return {
        tracks: [createMusicTrack(match, requestedBy, requestedById)],
    };
}
function normalizeMusicQuery(query) {
    const trimmedQuery = sanitizeRawQuery(query);
    if (!trimmedQuery) {
        return trimmedQuery;
    }
    const normalizedUrl = normalizeYouTubeUrl(trimmedQuery);
    return normalizedUrl ?? trimmedQuery;
}
function normalizeYouTubeUrl(input) {
    let parsedUrl;
    try {
        parsedUrl = new URL(input);
    }
    catch {
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
function isYouTubeId(value) {
    return typeof value === 'string' && /^[0-9A-Za-z_-]{11}$/.test(value);
}
function extractYouTubeTarget(input) {
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
function sanitizeRawQuery(input) {
    return input
        .trim()
        .replace(/^<+/, '')
        .replace(/>+$/, '');
}
function createMusicTrack(video, requestedBy, requestedById) {
    return {
        id: (0, crypto_1.randomUUID)(),
        kind: 'music',
        title: video.title ?? 'Canción sin título',
        requestedBy,
        requestedById,
        sourceLabel: 'YouTube',
        durationLabel: video.live ? 'Directo' : video.durationRaw || formatDuration(video.durationInSec),
        url: video.url,
        thumbnail: Array.isArray(video.thumbnails) ? video.thumbnails.at(-1)?.url : undefined,
    };
}
function formatDuration(seconds) {
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
function scheduleDisconnect(state) {
    clearDisconnectTimer(state);
    state.disconnectTimeout = setTimeout(() => {
        if (state.connection) {
            state.connection.destroy();
            state.connection = null;
        }
    }, DISCONNECT_DELAY_MS);
}
function clearDisconnectTimer(state) {
    if (state.disconnectTimeout) {
        clearTimeout(state.disconnectTimeout);
        state.disconnectTimeout = null;
    }
}
function destroyCurrentProcess(state) {
    const activeProcess = state.currentProcess;
    if (!activeProcess) {
        return;
    }
    activeProcess.stdout?.destroy();
    activeProcess.stderr?.destroy();
    try {
        activeProcess.kill();
    }
    catch {
        // El proceso ya terminó o no pudo recibir la señal.
    }
    state.currentProcess = null;
}
async function shutdownPlayback() {
    const activeGuilds = [...guildStates.keys()];
    await Promise.all(activeGuilds.map((guildId) => stop(guildId)));
}
async function cleanupTrack(track) {
    if (!track || track.kind !== 'tts') {
        return;
    }
    await (0, tts_1.cleanupTtsFile)(track.filePath);
}
function snapshotFromState(state) {
    return {
        guildId: state.guildId,
        current: state.current,
        queue: [...state.queue],
        isPaused: state.player.state.status === voice_1.AudioPlayerStatus.Paused ||
            state.player.state.status === voice_1.AudioPlayerStatus.AutoPaused,
        volumePercent: Math.round(state.volume * 100),
        connectedChannelId: state.connection?.joinConfig.channelId ?? null,
    };
}
async function announceNowPlaying(state) {
    if (!state.textChannel || !state.current) {
        return;
    }
    const snapshot = snapshotFromState(state);
    await state.textChannel.send({
        embeds: [(0, ui_1.createNowPlayingEmbed)(snapshot)],
        components: [(0, ui_1.createControlButtons)()],
    }).catch((error) => {
        console.warn(`[${state.guildId}] No pude anunciar la nueva pista:`, error);
    });
}
async function announceError(state, message) {
    if (!state.textChannel) {
        return;
    }
    await state.textChannel.send({
        embeds: [(0, ui_1.createErrorEmbed)(message)],
    }).catch((error) => {
        console.warn(`[${state.guildId}] No pude anunciar un error:`, error);
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
