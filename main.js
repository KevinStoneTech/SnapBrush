const { app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen, ipcMain, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('com.snapbrush.app');

// Modo automático para gerar o ícone 256x256 exigido pelo instalador .EXE
if (process.argv.includes('--make-icon')) {
  app.whenReady().then(() => {
    const src64 = path.join(__dirname, 'icone_64x64.png');
    const build256 = path.join(__dirname, 'icon_256.png');
    if (fs.existsSync(src64)) {
      const img = nativeImage.createFromPath(src64);
      if (!img.isEmpty()) {
        const resized = img.resize({ width: 256, height: 256, quality: 'best' });
        fs.writeFileSync(build256, resized.toPNG());
      }
    }
    app.exit(0);
  });
} else {
  // Impede que o programa abra vários ícones repetidos na bandeja do sistema
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.exit(0);
  } else {
    app.on('second-instance', () => {
      startCapture();
    });
  }

  // Salva as configurações na pasta AppData do usuário (compatível com o programa instalado)
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const defaultConfig = {
    autoStart: false,
    notifyCopy: true,
    notifySave: true,
    enableGeneralHotkey: true,
    generalHotkey: 'PrintScreen',
    enableInstantSave: true,
    instantSaveHotkey: 'Shift+PrintScreen',
    enableInstantCopy: false,
    instantCopyHotkey: 'CommandOrControl+PrintScreen'
  };

  let config = { ...defaultConfig };
  let tray = null;
  let overlayWindow = null;
  let optionsWindow = null;
  let aboutWindow = null;
  let trayIconFull = null;

  function applyAutoStart() {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(config.autoStart),
        path: process.execPath,
        args: app.isPackaged ? [] : [path.resolve(__dirname)]
      });
    } catch (e) {}
  }

  function loadConfig() {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        config = { ...defaultConfig, ...JSON.parse(raw) };
      }
    } catch (err) {
      config = { ...defaultConfig };
    }
    applyAutoStart();
  }

  function saveConfig(newConfig) {
    try {
      config = { ...config, ...newConfig };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      applyAutoStart();
      registerShortcuts();
      updateTrayMenu();
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
    }
  }

  function getIconImage() {
    const possibleNames = ['icone_64x64.png', 'icon_256.png', 'icon.png'];
    for (const name of possibleNames) {
      const iconPath = path.join(__dirname, name);
      if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
      }
    }
    return nativeImage.createEmpty();
  }

  function copyNativeImageToClipboard(img) {
    const methodName = 'write' + '\x49mage';
    if (typeof clipboard[methodName] === 'function') {
      clipboard[methodName](img);
    }
  }

  function updateTrayMenu() {
    if (!tray) return;
    const shortcutLabel = config.enableGeneralHotkey ? ` (${config.generalHotkey})` : '';
    const contextMenu = Menu.buildFromTemplate([
      { label: `Capturar Tela${shortcutLabel}`, click: () => startCapture() },
      { label: 'Opções...', click: () => openOptionsWindow() },
      { label: 'Sobre', click: () => openAboutWindow() },
      { type: 'separator' },
      { label: 'Sair', click: () => app.exit(0) }
    ]);
    tray.setContextMenu(contextMenu);
  }

  function createTray() {
    trayIconFull = getIconImage();
    const smallIcon = trayIconFull.isEmpty()
      ? trayIconFull
      : trayIconFull.resize({ width: 16, height: 16 });

    tray = new Tray(smallIcon);
    tray.setToolTip('SnapBrush');
    updateTrayMenu();
    tray.on('click', () => startCapture());
  }

  function notifyUser(title, content) {
    if (tray) {
      tray.displayBalloon({
        icon: trayIconFull && !trayIconFull.isEmpty() ? trayIconFull : undefined,
        iconType: 'custom',
        title,
        content
      });
    }
  }

  function openOptionsWindow() {
    if (optionsWindow) {
      optionsWindow.focus();
      return;
    }

    optionsWindow = new BrowserWindow({
      width: 500,
      height: 325,
      title: 'Opções',
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      icon: trayIconFull && !trayIconFull.isEmpty() ? trayIconFull : undefined,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    optionsWindow.loadFile('options.html');

    optionsWindow.webContents.on('did-finish-load', () => {
      optionsWindow.webContents.send('load-settings', config);
    });

    optionsWindow.on('closed', () => {
      optionsWindow = null;
    });
  }

  function openAboutWindow() {
    if (aboutWindow) {
      aboutWindow.focus();
      return;
    }

    aboutWindow = new BrowserWindow({
      width: 420,
      height: 290,
      title: 'Sobre',
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      icon: trayIconFull && !trayIconFull.isEmpty() ? trayIconFull : undefined,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    aboutWindow.loadFile('about.html');

    aboutWindow.on('closed', () => {
      aboutWindow = null;
    });
  }

  async function grabFullScreenDataURL() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.floor(width * scaleFactor),
        height: Math.floor(height * scaleFactor)
      }
    });

    return { dataUrl: sources[0].thumbnail.toDataURL(), width, height };
  }

  async function startCapture() {
    if (overlayWindow) {
      overlayWindow.hide();
      overlayWindow.destroy();
      overlayWindow = null;
      await new Promise(r => setTimeout(r, 120));
    }

    const { dataUrl, width, height } = await grabFullScreenDataURL();

    overlayWindow = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      fullscreen: true,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    overlayWindow.loadFile('index.html');

    overlayWindow.webContents.on('did-finish-load', () => {
      if (!overlayWindow) return;
      overlayWindow.webContents.send('screen-captured', dataUrl);
      overlayWindow.show();
      overlayWindow.focus();
    });

    overlayWindow.on('closed', () => {
      overlayWindow = null;
    });
  }

  async function instantFullScreenSave() {
    const { dataUrl } = await grabFullScreenDataURL();
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Salvar Captura de Tela Cheia',
      defaultPath: `captura-${Date.now()}.png`,
      filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
    });

    if (!canceled && filePath) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filePath, base64Data, 'base64');
      if (config.notifySave) {
        notifyUser('SnapBrush', `Captura salva em: ${path.basename(filePath)}`);
      }
    }
  }

  async function instantFullScreenCopy() {
    const { dataUrl } = await grabFullScreenDataURL();
    const img = nativeImage.createFromDataURL(dataUrl);
    copyNativeImageToClipboard(img);
    if (config.notifyCopy) {
      notifyUser('SnapBrush', 'Sua captura foi copiada para a área de transferência');
    }
  }

  function registerShortcuts() {
    globalShortcut.unregisterAll();

    if (config.enableGeneralHotkey && config.generalHotkey) {
      try { globalShortcut.register(config.generalHotkey, () => startCapture()); } catch (e) {}
    }
    if (config.enableInstantSave && config.instantSaveHotkey) {
      try { globalShortcut.register(config.instantSaveHotkey, () => instantFullScreenSave()); } catch (e) {}
    }
    if (config.enableInstantCopy && config.instantCopyHotkey) {
      try { globalShortcut.register(config.instantCopyHotkey, () => instantFullScreenCopy()); } catch (e) {}
    }
  }

  function closeOverlayCleanly() {
    if (overlayWindow) {
      overlayWindow.hide();
      overlayWindow.destroy();
      overlayWindow = null;
    }
  }

  app.whenReady().then(() => {
    loadConfig();
    createTray();
    registerShortcuts();
  });

  ipcMain.on('save-settings', (event, newCfg) => {
    saveConfig(newCfg);
    if (optionsWindow) optionsWindow.close();
  });

  ipcMain.on('close-overlay', () => {
    closeOverlayCleanly();
  });

  ipcMain.on('copy-image', (event, dataUrl) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      copyNativeImageToClipboard(img);
      closeOverlayCleanly();
      if (config.notifyCopy) {
        notifyUser('SnapBrush', 'Sua captura foi copiada para a área de transferência');
      }
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  });

  ipcMain.on('save-image', async (event, dataUrl) => {
    if (overlayWindow) overlayWindow.setAlwaysOnTop(false);

    const { filePath, canceled } = await dialog.showSaveDialog(overlayWindow, {
      title: 'Salvar Captura',
      defaultPath: `captura-${Date.now()}.png`,
      filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
    });

    if (!canceled && filePath) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filePath, base64Data, 'base64');
      closeOverlayCleanly();
      if (config.notifySave) {
        notifyUser('SnapBrush', `Captura salva em: ${path.basename(filePath)}`);
      }
    } else if (overlayWindow) {
      overlayWindow.setAlwaysOnTop(true);
    }
  });

  app.on('window-all-closed', (e) => {
    e.preventDefault();
  });
}