const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
  // callback receives { title, artist, album, durationMs, positionMs, playing } or null
  onMedia: (cb) => {
    const handler = (_event, media) => cb(media);
    ipcRenderer.on("media:update", handler);
    return () => ipcRenderer.removeListener("media:update", handler);
  },
  // resolves to [{ startTimeMs, words }] or null
  getLyrics: (track) => ipcRenderer.invoke("lyrics:get", track),
});
