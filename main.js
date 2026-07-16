const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '足迹地图 - 个人旅游记录工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#F5F5F5'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ====== IPC 处理 ======
const defaultUserDataPath = path.join(__dirname, 'user-data');

ipcMain.handle('read-records', async () => {
  const recordsPath = path.join(defaultUserDataPath, 'records.json');
  try {
    if (fs.existsSync(recordsPath)) {
      const data = fs.readFileSync(recordsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('读取记录失败:', err);
  }
  return {
    version: '1.0',
    photosDir: '',
    records: []
  };
});

ipcMain.handle('write-records', async (_event, data) => {
  const recordsPath = path.join(defaultUserDataPath, 'records.json');
  try {
    if (!fs.existsSync(defaultUserDataPath)) {
      fs.mkdirSync(defaultUserDataPath, { recursive: true });
    }
    fs.writeFileSync(recordsPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('写入记录失败:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择图片存储文件夹'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: '选择游记图片',
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

ipcMain.handle('copy-image', async (_event, sourcePath, targetDir, fileName) => {
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, fileName);
    let finalPath = targetPath;
    let counter = 1;
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(targetDir, `${baseName}_${counter}${ext}`);
      counter++;
    }
    fs.copyFileSync(sourcePath, finalPath);
    return path.basename(finalPath);
  } catch (err) {
    console.error('复制图片失败:', err);
    return null;
  }
});

ipcMain.handle('get-image-path', async (_event, fileName) => {
  const allData = await readRecordsFile();
  const photosDir = allData.photosDir || path.join(defaultUserDataPath, 'photos');
  const fullPath = path.join(photosDir, fileName);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  const defaultPath = path.join(defaultUserDataPath, 'photos', fileName);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  return null;
});

ipcMain.handle('delete-image', async (_event, fileName) => {
  const allData = await readRecordsFile();
  const photosDir = allData.photosDir || path.join(defaultUserDataPath, 'photos');
  const fullPath = path.join(photosDir, fileName);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return { success: true };
  } catch (err) {
    console.error('删除图片失败:', err);
    return { success: false };
  }
});

ipcMain.handle('open-photos-folder', async () => {
  const allData = await readRecordsFile();
  const photosDir = allData.photosDir || path.join(defaultUserDataPath, 'photos');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }
  shell.openPath(photosDir);
});

ipcMain.handle('read-data-file', async (_event, fileName) => {
  const dataPath = path.join(__dirname, 'data', fileName);
  try {
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('读取数据文件失败:', fileName, err.message);
  }
  return null;
});

async function readRecordsFile() {
  const recordsPath = path.join(defaultUserDataPath, 'records.json');
  try {
    if (fs.existsSync(recordsPath)) {
      const data = fs.readFileSync(recordsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('读取记录失败:', err);
  }
  return { version: '1.0', photosDir: '', records: [] };
}
