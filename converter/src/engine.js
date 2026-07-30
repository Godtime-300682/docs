'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Dentro do pacote os binários ficam fora do asar (asarUnpack); o require
// devolve o caminho dentro do asar, que não é executável.
function unpacked(p) {
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

const FFMPEG = unpacked(require('ffmpeg-static'));
const FFPROBE = unpacked(require('ffprobe-static').path);

const VIDEO_FORMATS = {
  mp4: { ext: 'mp4', args: ['-c:v', 'libx264', '-c:a', 'aac'] },
  mov: { ext: 'mov', args: ['-c:v', 'libx264', '-c:a', 'aac'] },
  mkv: { ext: 'mkv', args: ['-c:v', 'libx264', '-c:a', 'aac'] },
  webm: { ext: 'webm', args: ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'] },
  gif: {
    ext: 'gif',
    args: [
      '-filter_complex',
      '[0:v]fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
      '-loop', '0',
      '-an',
    ],
  },
};

const AUDIO_FORMATS = {
  mp3: { ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame'] },
  m4a: { ext: 'm4a', args: ['-vn', '-c:a', 'aac'] },
  wav: { ext: 'wav', args: ['-vn', '-c:a', 'pcm_s16le'] },
  flac: { ext: 'flac', args: ['-vn', '-c:a', 'flac'] },
  opus: { ext: 'opus', args: ['-vn', '-c:a', 'libopus'] },
};

const ALL_FORMATS = { ...VIDEO_FORMATS, ...AUDIO_FORMATS };

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(bin)} saiu com código ${code}: ${err.slice(-800)}`));
    });
  });
}

// Um stream de vídeo com attached_pic=1 é capa de álbum, não vídeo de verdade.
async function probe(file) {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  const info = JSON.parse(out);
  const streams = info.streams || [];
  const hasVideo = streams.some(
    (s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic === 1)
  );
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  let duration = parseFloat(info.format && info.format.duration);
  if (!Number.isFinite(duration)) {
    duration = Math.max(0, ...streams.map((s) => parseFloat(s.duration) || 0));
  }
  return {
    hasVideo,
    hasAudio,
    duration,
    formats: hasVideo
      ? [...Object.keys(VIDEO_FORMATS), ...Object.keys(AUDIO_FORMATS)]
      : Object.keys(AUDIO_FORMATS),
  };
}

// nome.ext -> nome-2.ext -> nome-3.ext; nunca sobrescreve.
function uniqueOutputPath(inputFile, ext) {
  const dir = path.dirname(inputFile);
  const base = path.basename(inputFile, path.extname(inputFile));
  let candidate = path.join(dir, `${base}.${ext}`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${n}.${ext}`);
    n += 1;
  }
  return candidate;
}

function convert(inputFile, formatKey, onProgress, durationHint) {
  const format = ALL_FORMATS[formatKey];
  if (!format) return Promise.reject(new Error(`Formato desconhecido: ${formatKey}`));

  return (durationHint ? Promise.resolve({ duration: durationHint }) : probe(inputFile)).then(
    ({ duration }) =>
      new Promise((resolve, reject) => {
        const output = uniqueOutputPath(inputFile, format.ext);
        const args = [
          '-hide_banner',
          '-nostdin',
          '-i', inputFile,
          ...format.args,
          '-progress', 'pipe:1',
          '-nostats',
          output,
        ];
        const proc = spawn(FFMPEG, args, { windowsHide: true });
        let err = '';
        let buf = '';
        proc.stderr.on('data', (d) => (err += d));
        proc.stdout.on('data', (d) => {
          buf += d;
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const [key, value] = line.trim().split('=');
            if (key === 'out_time_us' || key === 'out_time_ms') {
              const seconds = parseInt(value, 10) / 1e6;
              if (Number.isFinite(seconds) && duration > 0 && onProgress) {
                onProgress(Math.min(99, (seconds / duration) * 100));
              }
            } else if (key === 'progress' && value === 'end' && onProgress) {
              onProgress(100);
            }
          }
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve(output);
          else {
            fs.rm(output, { force: true }, () => {});
            reject(new Error(`ffmpeg saiu com código ${code}: ${err.slice(-800)}`));
          }
        });
      })
  );
}

module.exports = { FFMPEG, FFPROBE, probe, convert, uniqueOutputPath, VIDEO_FORMATS, AUDIO_FORMATS };
