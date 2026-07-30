'use strict';

// A partir do Electron 32, File.path não existe mais no renderer.
// O caminho real do arquivo vem de webUtils.getPathForFile, chamado aqui.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pathForFile: (file) => webUtils.getPathForFile(file),
  probe: (filePath) => ipcRenderer.invoke('probe', filePath),
  convert: (filePath, format, duration) =>
    ipcRenderer.invoke('convert', { file: filePath, format, duration }),
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  onProgress: (callback) => ipcRenderer.on('progress', (_event, pct) => callback(pct)),
});
