const { app, BrowserWindow, screen, Tray, Menu, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { getLyrics } = require("./lyrics.cjs");

// dev only: read VITE_PORT from .env (packaged app loads built files instead)
if (!app.isPackaged) require("dotenv").config();
const port = process.env.VITE_PORT || 3000;

// Files in app.asar can't be run/read by external programs (PowerShell) or reliably by the tray,
// so those are unpacked next to it. This maps a path to its unpacked location when packaged.
const unpacked = (p) => p.replace("app.asar", "app.asar.unpacked");

const BASE_W = 440; // window size at "Medium"
const BASE_H = 112;
const MARGIN = 16; // gap from screen edge

let mainWindow;
let tray;
let watcher;

// ---- saved settings (position / size / opacity) ----------------------------
let settings = { position: "bottom-center", size: 1, opacity: 1 };
const settingsFile = () => path.join(app.getPath("userData"), "overlay-settings.json");

function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) };
  } catch {
    // first run: keep defaults
  }
}
function saveSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function applyLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.round(BASE_W * settings.size);
  const h = Math.round(BASE_H * settings.size);
  const [vert, horiz] = settings.position.split("-"); // top|bottom, left|center|right

  const x =
    horiz === "left"
      ? wa.x + MARGIN
      : horiz === "right"
        ? wa.x + wa.width - w - MARGIN
        : Math.round(wa.x + (wa.width - w) / 2);
  const y = vert === "top" ? wa.y + MARGIN : wa.y + wa.height - h - MARGIN;

  mainWindow.webContents.setZoomFactor(settings.size);
  mainWindow.setBounds({ x, y, width: w, height: h });
  mainWindow.setOpacity(settings.opacity);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: BASE_W,
    height: BASE_H,
    show: false,
    transparent: true,
    alwaysOnTop: true,
    frame: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    icon: unpacked(path.join(__dirname, "icon.png")),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Click-through by default so it never blocks your game
  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");

  mainWindow.once("ready-to-show", () => {
    applyLayout();
    mainWindow.showInactive(); // don't steal focus from the game
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }
  mainWindow.webContents.on("did-finish-load", applyLayout);
}

// ---- Windows "now playing" watcher -----------------------------------------
function startMediaWatcher() {
  if (process.platform !== "win32") {
    console.error("Media watcher only supports Windows.");
    return;
  }
  const script = unpacked(path.join(__dirname, "media-watcher.ps1"));
  watcher = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
    { windowsHide: true }
  );

  let buffer = "";
  watcher.stdout.setEncoding("utf8");
  watcher.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).replace(/^\uFEFF/, "").trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        const media = JSON.parse(line);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("media:update", media);
        }
      } catch {
        // ignore partial/garbled line
      }
    }
  });
  watcher.stderr.on("data", (d) => console.error("[media-watcher]", d.toString().trim()));
  watcher.on("exit", (code) => console.error("[media-watcher] exited with code", code));
}

ipcMain.handle("lyrics:get", (_event, track) => getLyrics(track));

// ---- tray menu -------------------------------------------------------------
function radio(label, key, value) {
  return {
    label,
    type: "radio",
    checked: settings[key] === value,
    click: () => {
      settings[key] = value;
      saveSettings();
      applyLayout();
    },
  };
}

function buildTray() {
  tray = new Tray(unpacked(path.join(__dirname, "icon.png")));
  tray.setToolTip("Lyrics Overlay");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Position",
        submenu: [
          radio("Top left", "position", "top-left"),
          radio("Top center", "position", "top-center"),
          radio("Top right", "position", "top-right"),
          radio("Bottom left", "position", "bottom-left"),
          radio("Bottom center", "position", "bottom-center"),
          radio("Bottom right", "position", "bottom-right"),
        ],
      },
      {
        label: "Size",
        submenu: [
          radio("Small", "size", 0.8),
          radio("Medium", "size", 1),
          radio("Large", "size", 1.3),
        ],
      },
      {
        label: "Opacity",
        submenu: [
          radio("100%", "opacity", 1),
          radio("75%", "opacity", 0.75),
          radio("50%", "opacity", 0.5),
          radio("30%", "opacity", 0.3),
        ],
      },
      {
        label: "Unlock to drag",
        type: "checkbox",
        checked: false,
        click: (item) => mainWindow.setIgnoreMouseEvents(!item.checked),
      },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        enabled: app.isPackaged, // only meaningful for the installed .exe
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  startMediaWatcher();
  buildTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  screen.on("display-metrics-changed", applyLayout);
});

app.on("before-quit", () => {
  if (watcher && !watcher.killed) watcher.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
