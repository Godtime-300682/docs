# NeoConverter

Conversor de áudio e vídeo para desktop (Electron) com **ffmpeg e ffprobe embutidos**
via `ffmpeg-static` e `ffprobe-static` — não depende de nada instalado na máquina.

## Rodar em desenvolvimento

```bash
cd converter
npm install
npm start
```

## Empacotar

O `npm install` baixa automaticamente o binário de ffmpeg/ffprobe da plataforma atual.

```bash
npm run dist                 # alvo da plataforma atual
npx electron-builder --linux # AppImage
npx electron-builder --mac   # dmg (rodar num Mac)
npx electron-builder --win   # nsis (rodar num Windows)
```

Os binários ficam fora do asar (`asarUnpack` no `package.json`), senão não são executáveis
de dentro do pacote.

## Testes

Gera amostras com o ffmpeg embutido, roda todas as conversões pelo motor do app
(`src/engine.js`) e valida cada saída com o ffprobe embutido:

```bash
node test/run-tests.js
```

## Como funciona

- `src/engine.js` — ffprobe (streams de vídeo com `attached_pic=1` são capa de álbum e
  não contam como vídeo), conversão com progresso real via `-progress pipe:1`, saída na
  pasta do original com sufixo `-2`, `-3`… em caso de colisão (nunca sobrescreve).
- `src/preload.js` — a partir do Electron 32 o `File.path` não existe no renderer; o
  caminho real vem de `webUtils.getPathForFile` no preload.
- `renderer/` — UI neomórfica em CSS puro (fundo `#E0E5EE`, sem bordas, relevo/afundado
  por `box-shadow`, azul `#4270CB` só no texto do item ativo).

Formatos de saída — vídeo: MP4/MOV/MKV (H.264 + AAC), WEBM (VP9 + Opus), GIF
(palettegen + paletteuse numa passada); áudio: MP3, M4A, WAV, FLAC, OPUS (sempre `-vn`).
