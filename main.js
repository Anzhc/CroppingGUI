const { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const initialWidth = Math.max(1100, Math.round(screenWidth * 0.9));
  const initialHeight = Math.max(720, Math.round(screenHeight * 0.9));

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function isImageFile(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function isCropFile(fileName) {
  return fileName.toLowerCase().includes('_crop_');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

function nextCropIndex(outputDir, baseName) {
  const entries = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
  const regex = new RegExp(`^${escapeRegExp(baseName)}_crop_(\\d+)\\.png$`, 'i');
  let maxIndex = 0;

  for (const entry of entries) {
    const match = entry.match(regex);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (!Number.isNaN(idx)) {
        maxIndex = Math.max(maxIndex, idx);
      }
    }
  }

  return maxIndex + 1;
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('read-images', async (_event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const images = entries
      .filter((entry) => entry.isFile() && isImageFile(entry.name))
      .map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        return {
          name: entry.name,
          path: fullPath,
          id: fullPath,
        };
      });

    return { success: true, images };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-crops', async (_event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const crops = entries
      .filter((entry) => entry.isFile() && isImageFile(entry.name) && isCropFile(entry.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
      }));

    return { success: true, crops };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-crops', async (_event, payload) => {
  const { imagePath, crops, outputDir } = payload;

  if (!crops?.length) {
    return { success: true, saved: [] };
  }

  try {
    await ensureDir(outputDir);
    const baseName = path.parse(imagePath).name;
    let startIndex = nextCropIndex(outputDir, baseName);
    const saved = [];
    const source = nativeImage.createFromPath(imagePath);
    const sourceSize = source.getSize();

    for (const crop of crops) {
      const { x, y, width, height } = crop;
      if (width <= 1 || height <= 1) continue;

      const safeX = Math.max(0, Math.floor(x));
      const safeY = Math.max(0, Math.floor(y));
      const safeWidth = Math.min(Math.floor(width), Math.max(0, sourceSize.width - safeX));
      const safeHeight = Math.min(Math.floor(height), Math.max(0, sourceSize.height - safeY));
      if (safeWidth <= 1 || safeHeight <= 1) continue;

      const cropped = source.crop({
        x: safeX,
        y: safeY,
        width: safeWidth,
        height: safeHeight,
      });

      const buffer = cropped.toPNG();
      const fileName = `${baseName}_crop_${startIndex}.png`;
      const outputPath = path.join(outputDir, fileName);

      await fs.promises.writeFile(outputPath, buffer);
      saved.push({ name: fileName, path: outputPath });
      startIndex += 1;
    }

    return { success: true, saved };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-crop', async (_event, filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
