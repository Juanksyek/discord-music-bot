# discord-music-bot

Bot de Discord con:

- Reproducción de música por búsqueda o URL de YouTube
- Cola por servidor
- Panel visual con botones
- Controles de pausa, skip, stop, shuffle, volumen y limpieza
- TTS estilo meme/shitpost con presets y efectos

## Requisitos

- Node.js 18+
- `ffmpeg` disponible en `PATH`
- Variables en `.env`:

```env
DISCORD_BOT_TOKEN=tu_token
CLIENT_ID=tu_client_id
GUILD_ID=opcional_para_registro_rapido
```

## Uso

```bash
npm run build
npm run register
npm start
```

## Comandos principales

- `/tocamela <query>`
- `/play <query>`
- `/cola`
- `/ahora`
- `/pausa`
- `/reanudar`
- `/skip`
- `/parar`
- `/mezclar`
- `/limpiar`
- `/quitar <posicion>`
- `/volumen <5-200>`
- `/panel`
- `/tts <voz> <texto>`
- `/voces`
- `/ttsguia`
- `/ayuda`

Tambien hay prefijos equivalentes como `!play`, `!tts`, `!cola` y `!panel`.

## Notas del TTS

- Las voces son presets estilo meme/shitpost, no voces oficiales de TikTok.
- El comando usa una base TTS y luego aplica efectos con `ffmpeg`.
- El texto TTS está limitado a 180 caracteres para mantenerlo rapido y estable.
- Si usas slash commands y no ves cambios en las voces o en la guía, vuelve a registrar con `npm run register`.
