'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const engine = require('./engine');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 700,
    resizable: false,
    backgroundColor: '#E0E5EE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('probe', async (_event, filePath) => engine.probe(filePath));

ipcMain.handle('convert', async (_event, { file, format, duration }) =>
  engine.convert(file, format, (pct) => {
    if (win && !win.isDestroyed()) win.webContents.send('progress', pct);
  }, duration)
);

ipcMain.handle('choose-file', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Áudio e vídeo', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'gif', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'ts', 'm4v', '3gp'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Ganchos de auto-teste do pacote: provam que o app empacotado converte e
// renderiza sem depender de nada instalado na máquina.
async function selfTest() {
  const spec = process.env.NEOCONV_SELFTEST; // "arquivo:formato"
  const idx = spec.lastIndexOf(':');
  const file = spec.slice(0, idx);
  const format = spec.slice(idx + 1);
  try {
    const info = await engine.probe(file);
    console.log(`SELFTEST probe: hasVideo=${info.hasVideo} duration=${info.duration}s`);
    const out = await engine.convert(file, format, (p) => {
      console.log(`SELFTEST progress: ${p.toFixed(1)}%`);
    });
    console.log(`SELFTEST ok: ${out}`);
    app.exit(0);
  } catch (err) {
    console.error(`SELFTEST falhou: ${err.message}`);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  if (process.env.NEOCONV_SELFTEST) {
    selfTest();
    return;
  }
  createWindow();
  if (process.env.NEOCONV_SHOT) {
    win.webContents.once('did-finish-load', async () => {
      try {
        if (process.env.NEOCONV_SHOT_STATE === 'video') {
          await win.webContents.executeJavaScript(
            `showDemoState({ hasVideo: true, duration: 4, formats: ${JSON.stringify([
              ...Object.keys(engine.VIDEO_FORMATS),
              ...Object.keys(engine.AUDIO_FORMATS),
            ])} })`
          );
        }
        await new Promise((r) => setTimeout(r, 600));
        const image = await win.webContents.capturePage();
        require('fs').writeFileSync(process.env.NEOCONV_SHOT, image.toPNG());
        app.exit(0);
      } catch (err) {
        console.error(`screenshot falhou: ${err.message}`);
        app.exit(1);
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
