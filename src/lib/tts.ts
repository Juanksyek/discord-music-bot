import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const TTS_TEMP_DIR = path.join(os.tmpdir(), 'discord-music-bot-tts');
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: 'https://translate.google.com/',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

export type TtsPresetKey =
    | 'latina'
    | 'narrador'
    | 'ardilla'
    | 'demonio'
    | 'robot'
    | 'megafono'
    | 'npc'
    | 'gigachad'
    | 'shitpost';

export type TtsPreset = {
    key: TtsPresetKey;
    label: string;
    description: string;
    language: 'es' | 'en';
    filter: string;
    aliases?: string[];
};

export type GeneratedTtsAudio = {
    filePath: string;
    preset: TtsPreset;
};

export const ttsPresets: TtsPreset[] = [
    {
        key: 'latina',
        label: 'Latina Chill',
        description: 'Clara, limpia y rápida para avisos normales.',
        language: 'es',
        filter: 'acompressor=threshold=-18dB:ratio=2.5:attack=5:release=80,highpass=f=120,lowpass=f=9000',
        aliases: ['normal', 'sabina', 'mexico'],
    },
    {
        key: 'narrador',
        label: 'Narrador Épico',
        description: 'Más grave y seria, como intro dramática.',
        language: 'es',
        filter: 'asetrate=48000*0.92,aresample=48000,atempo=1.04,acompressor=threshold=-22dB:ratio=3.8:attack=3:release=90,lowpass=f=6500',
        aliases: ['epico', 'narradorepico', 'dramatica'],
    },
    {
        key: 'ardilla',
        label: 'Ardilla',
        description: 'Aguda y rápida, puro caos meme.',
        language: 'es',
        filter: 'asetrate=48000*1.35,aresample=48000,atempo=0.86,acompressor=threshold=-16dB:ratio=2.8:attack=4:release=70',
        aliases: ['chipmunk', 'aguda'],
    },
    {
        key: 'demonio',
        label: 'Demonio',
        description: 'Pitch bajo y oscuro para rematar audios cursed.',
        language: 'es',
        filter: 'asetrate=48000*0.78,aresample=48000,atempo=1.14,acompressor=threshold=-24dB:ratio=4.5:attack=2:release=110,lowpass=f=5000',
        aliases: ['diablo', 'grave'],
    },
    {
        key: 'robot',
        label: 'Robot',
        description: 'Metálica y recortada estilo NPC roto.',
        language: 'en',
        filter: 'flanger=delay=2:depth=2:regen=0.3:width=65:speed=6,highpass=f=200,lowpass=f=3600,acompressor=threshold=-15dB:ratio=3.4:attack=4:release=70',
        aliases: ['bot', 'metalica'],
    },
    {
        key: 'megafono',
        label: 'Megáfono',
        description: 'Sonido de anuncio callejero o bocina quemada.',
        language: 'es',
        filter: 'highpass=f=350,lowpass=f=2500,acompressor=threshold=-17dB:ratio=4.2:attack=1:release=60',
        aliases: ['megafono', 'megáfono', 'bocina'],
    },
    {
        key: 'npc',
        label: 'NPC TikTok',
        description: 'Brillante y acelerada tipo clip corto.',
        language: 'en',
        filter: 'asetrate=48000*1.08,aresample=48000,atempo=0.97,acompressor=threshold=-16dB:ratio=2.6:attack=4:release=65,highpass=f=150',
        aliases: ['tiktok', 'npc-tiktok'],
    },
    {
        key: 'gigachad',
        label: 'Gigachad',
        description: 'Voz grave, pesada y con presencia.',
        language: 'en',
        filter: 'asetrate=48000*0.84,aresample=48000,atempo=1.08,acompressor=threshold=-23dB:ratio=5.0:attack=2:release=95,lowpass=f=5600',
        aliases: ['giga', 'giga-chad', 'sigma'],
    },
    {
        key: 'shitpost',
        label: 'Shitpost',
        description: 'Sucio, comprimido y exagerado para remates meme.',
        language: 'en',
        filter: 'asetrate=48000*1.12,aresample=48000,atempo=0.95,highpass=f=280,lowpass=f=3200,flanger=delay=1.5:depth=1.8:regen=0.25:width=70:speed=10,acompressor=threshold=-14dB:ratio=3.8:attack=3:release=55',
        aliases: ['meme', 'shitposting'],
    },
];

export function getTtsPreset(key: string): TtsPreset | undefined {
    return resolveTtsPreset(key);
}

export function resolveTtsPreset(input: string): TtsPreset | undefined {
    const normalizedInput = normalizeVoiceToken(input);

    if (!normalizedInput) {
        return undefined;
    }

    return ttsPresets.find((preset) =>
        [preset.key, preset.label, ...(preset.aliases ?? [])]
            .map((candidate) => normalizeVoiceToken(candidate))
            .includes(normalizedInput)
    );
}

export function getTtsPresetKeys(): string[] {
    return ttsPresets.map((preset) => preset.key);
}

export function sanitizeTtsText(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
}

export async function generateTtsAudio(text: string, presetKey: string): Promise<GeneratedTtsAudio> {
    const preset = resolveTtsPreset(presetKey);
    const normalizedText = sanitizeTtsText(text);

    if (!preset) {
        throw new Error(`Voz no reconocida. Usa una de estas: ${getTtsPresetKeys().join(', ')}. También puedes usar \`/voces\` o \`/ttsguia\`.`);
    }

    if (!normalizedText) {
        throw new Error('Escribe un texto válido para el TTS.');
    }

    if (normalizedText.length > 180) {
        throw new Error('El texto del TTS debe tener 180 caracteres o menos.');
    }

    await fs.mkdir(TTS_TEMP_DIR, { recursive: true });

    const baseFilePath = path.join(TTS_TEMP_DIR, `${randomUUID()}-base.mp3`);
    const finalFilePath = path.join(TTS_TEMP_DIR, `${randomUUID()}-${preset.key}.mp3`);

    try {
        await downloadBaseSpeech(normalizedText, preset.language, baseFilePath);
        await applyVoiceEffect(baseFilePath, finalFilePath, preset.filter);
        return { filePath: finalFilePath, preset };
    } finally {
        await safeUnlink(baseFilePath);
    }
}

export async function cleanupTtsFile(filePath?: string | null): Promise<void> {
    if (!filePath) {
        return;
    }

    await safeUnlink(filePath);
}

async function downloadBaseSpeech(text: string, language: 'es' | 'en', outputPath: string): Promise<void> {
    const url = new URL('https://translate.google.com/translate_tts');
    url.searchParams.set('ie', 'UTF-8');
    url.searchParams.set('client', 'tw-ob');
    url.searchParams.set('tl', language);
    url.searchParams.set('q', text);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
        const response = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`El servicio TTS respondió con ${response.status}.`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('audio')) {
            throw new Error('El servicio TTS no devolvió audio válido.');
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(outputPath, audioBuffer);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('El servicio TTS tardó demasiado en responder.');
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function applyVoiceEffect(inputPath: string, outputPath: string, filter: string): Promise<void> {
    await execFileAsync(
        'ffmpeg',
        ['-y', '-i', inputPath, '-filter:a', filter, '-ar', '48000', '-ac', '1', '-b:a', '128k', outputPath],
        { windowsHide: true }
    );
}

async function safeUnlink(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn(`No se pudo borrar el archivo temporal ${filePath}:`, error);
        }
    }
}

function normalizeVoiceToken(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}
