'use strict';

// Prova de funcionamento: gera amostras com o ffmpeg EMBUTIDO (não há ffmpeg
// no sistema), roda todas as conversões pelo motor do app (src/engine.js) e
// valida cada saída com o ffprobe embutido.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const engine = require('../src/engine');

const WORK = process.argv[2] || path.join(__dirname, 'work');
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

function ff(args) {
  execFileSync(engine.FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args]);
}

function probeRaw(file) {
  const out = execFileSync(engine.FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  return JSON.parse(out);
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FALHOU: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
}

async function main() {
  console.log(`ffmpeg embutido:  ${engine.FFMPEG}`);
  console.log(`ffprobe embutido: ${engine.FFPROBE}`);
  console.log('');

  // --- amostras ---
  const video = path.join(WORK, 'video.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=duration=4:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);

  const audio = path.join(WORK, 'musica.mp3');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:a', 'libmp3lame', audio]);

  // mp3 com capa de álbum (attached_pic=1) — não pode contar como vídeo
  const cover = path.join(WORK, 'capa.png');
  ff(['-f', 'lavfi', '-i', 'testsrc2=duration=0.1:size=300x300', '-frames:v', '1', cover]);
  const audioComCapa = path.join(WORK, 'musica-com-capa.mp3');
  ff(['-i', audio, '-i', cover, '-map', '0:a', '-map', '1:v',
      '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic',
      '-id3v2_version', '3', audioComCapa]);

  console.log('--- ffprobe / attached_pic ---');
  const vInfo = await engine.probe(video);
  assert(vInfo.hasVideo === true, `video.mp4 detectado como vídeo (duração ${vInfo.duration}s)`);
  assert(vInfo.formats.includes('mp4'), 'vídeo oferece MP4 como destino');

  const aInfo = await engine.probe(audioComCapa);
  const rawStreams = probeRaw(audioComCapa).streams.map((s) => s.codec_type);
  assert(rawStreams.includes('video'), 'musica-com-capa.mp3 TEM um stream de vídeo (a capa)');
  assert(aInfo.hasVideo === false, 'capa de álbum (attached_pic=1) NÃO conta como vídeo');
  assert(!aInfo.formats.includes('mp4'), 'arquivo de áudio não oferece MP4');
  assert(aInfo.formats.includes('flac'), 'arquivo de áudio oferece FLAC');

  // --- conversões de vídeo ---
  console.log('\n--- conversões de vídeo (via engine.convert) ---');
  for (const fmt of ['mp4', 'mov', 'mkv', 'webm', 'gif']) {
    let progressSamples = [];
    const out = await engine.convert(video, fmt, (p) => progressSamples.push(p));
    const info = probeRaw(out);
    const vStream = info.streams.find((s) => s.codec_type === 'video');
    const aStream = info.streams.find((s) => s.codec_type === 'audio');
    const sizeKB = (fs.statSync(out).size / 1024).toFixed(1);
    const detail = `${path.basename(out)} [v:${vStream ? vStream.codec_name : '-'} a:${aStream ? aStream.codec_name : '-'}] ${sizeKB} KB, progresso ${progressSamples.length} amostras, final ${progressSamples[progressSamples.length - 1]}`;
    assert(vStream, `vídeo -> ${fmt}: ${detail}`);
    if (fmt === 'webm') assert(vStream.codec_name === 'vp9' && aStream.codec_name === 'opus', 'webm usa VP9 + Opus');
    if (['mp4', 'mov', 'mkv'].includes(fmt)) assert(vStream.codec_name === 'h264' && aStream.codec_name === 'aac', `${fmt} usa H.264 + AAC`);
    if (fmt === 'gif') assert(vStream.codec_name === 'gif' && !aStream, 'gif é gif e não tem áudio');
    assert(progressSamples[progressSamples.length - 1] === 100, `${fmt}: progresso chegou a 100`);
  }

  // --- conversões de áudio ---
  console.log('\n--- conversões de áudio (via engine.convert) ---');
  const expectedCodec = { mp3: 'mp3', m4a: 'aac', wav: 'pcm_s16le', flac: 'flac', opus: 'opus' };
  for (const fmt of ['mp3', 'm4a', 'wav', 'flac', 'opus']) {
    const out = await engine.convert(audioComCapa, fmt, null);
    const info = probeRaw(out);
    const aStream = info.streams.find((s) => s.codec_type === 'audio');
    const realVideo = info.streams.find(
      (s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic === 1)
    );
    assert(aStream && aStream.codec_name === expectedCodec[fmt],
      `áudio -> ${fmt}: ${path.basename(out)} [${aStream ? aStream.codec_name : '-'}] ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
    assert(!realVideo, `${fmt}: saída não carrega stream de vídeo (-vn)`);
  }

  // --- nunca sobrescrever ---
  console.log('\n--- colisão de nomes ---');
  const first = await engine.convert(audio, 'wav', null);
  const second = await engine.convert(audio, 'wav', null);
  const third = await engine.convert(audio, 'wav', null);
  assert(path.basename(first) === 'musica.wav', `primeira saída: ${path.basename(first)}`);
  assert(path.basename(second) === 'musica-2.wav', `segunda saída vira: ${path.basename(second)}`);
  assert(path.basename(third) === 'musica-3.wav', `terceira saída vira: ${path.basename(third)}`);
  assert(fs.existsSync(first) && fs.existsSync(second) && fs.existsSync(third), 'nenhuma saída sobrescreveu a outra');
  assert(path.dirname(first) === path.dirname(audio), 'saída fica na mesma pasta do original');

  console.log('\nTODOS OS TESTES PASSARAM');
}

main().catch((err) => {
  console.error(`FALHOU: ${err.message}`);
  process.exit(1);
});
