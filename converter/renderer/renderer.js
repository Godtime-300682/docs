'use strict';

const VIDEO_KEYS = ['mp4', 'mov', 'mkv', 'webm', 'gif'];
const AUDIO_KEYS = ['mp3', 'm4a', 'wav', 'flac', 'opus'];

const dropzone = document.getElementById('dropzone');
const dropzoneTitle = document.getElementById('dropzone-title');
const dropzoneHint = document.getElementById('dropzone-hint');
const formatsBox = document.getElementById('formats');
const videoRow = document.getElementById('video-row');
const audioRow = document.getElementById('audio-row');
const videoPills = document.getElementById('video-pills');
const audioPills = document.getElementById('audio-pills');
const convertBtn = document.getElementById('convert');
const progressTrack = document.getElementById('progress-track');
const progressFill = document.getElementById('progress-fill');
const statusEl = document.getElementById('status');

let currentFile = null;
let currentInfo = null;
let selectedFormat = null;
let converting = false;

function basename(p) {
  return p.split(/[\\/]/).pop();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function renderPills(container, keys, available) {
  container.textContent = '';
  for (const key of keys) {
    if (!available.includes(key)) continue;
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = key.toUpperCase();
    pill.dataset.format = key;
    pill.addEventListener('click', () => {
      if (converting) return;
      selectedFormat = key;
      document.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      convertBtn.disabled = false;
    });
    container.appendChild(pill);
  }
}

function showFormats(info) {
  currentInfo = info;
  selectedFormat = null;
  convertBtn.disabled = true;
  formatsBox.classList.remove('hidden');
  if (info.hasVideo) {
    videoRow.classList.remove('hidden');
    renderPills(videoPills, VIDEO_KEYS, info.formats);
  } else {
    videoRow.classList.add('hidden');
    videoPills.textContent = '';
  }
  audioRow.classList.remove('hidden');
  renderPills(audioPills, AUDIO_KEYS, info.formats);
}

async function loadFile(filePath) {
  if (!filePath || converting) return;
  setStatus('');
  progressTrack.classList.add('hidden');
  progressFill.style.width = '0%';
  try {
    const info = await window.api.probe(filePath);
    if (!info.hasAudio && !info.hasVideo) {
      setStatus('Esse arquivo não tem áudio nem vídeo.');
      return;
    }
    currentFile = filePath;
    dropzoneTitle.textContent = basename(filePath);
    dropzoneHint.textContent = info.hasVideo ? 'vídeo detectado' : 'áudio detectado';
    showFormats(info);
  } catch (err) {
    setStatus('Não consegui ler esse arquivo como áudio ou vídeo.');
  }
}

dropzone.addEventListener('click', async () => {
  if (converting) return;
  const filePath = await window.api.chooseFile();
  if (filePath) loadFile(filePath);
});

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
});

dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const filePath = window.api.pathForFile(file);
  loadFile(filePath);
});

window.api.onProgress((pct) => {
  progressFill.style.width = `${pct}%`;
});

convertBtn.addEventListener('click', async () => {
  if (!currentFile || !selectedFormat || converting) return;
  converting = true;
  convertBtn.classList.add('busy');
  convertBtn.disabled = true;
  progressTrack.classList.remove('hidden');
  progressFill.style.width = '0%';
  setStatus(`Convertendo para ${selectedFormat.toUpperCase()}…`);
  try {
    const output = await window.api.convert(currentFile, selectedFormat, currentInfo.duration);
    progressFill.style.width = '100%';
    setStatus(`Pronto: ${basename(output)}`);
  } catch (err) {
    setStatus(`Falhou: ${String(err.message || err).slice(0, 200)}`);
  } finally {
    converting = false;
    convertBtn.classList.remove('busy');
    convertBtn.disabled = false;
  }
});

// Usado só pelo gancho de screenshot do auto-teste (NEOCONV_SHOT_STATE).
function showDemoState(info) {
  dropzoneTitle.textContent = 'ferias-na-praia.mp4';
  dropzoneHint.textContent = 'vídeo detectado';
  showFormats(info);
  const pill = document.querySelector('.pill[data-format="webm"]');
  if (pill) pill.click();
  return true;
}
window.showDemoState = showDemoState;
