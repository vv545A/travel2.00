const { contextBridge, ipcRenderer } = require('electron');

// 通过 contextBridge 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('api', {
  // 读取打卡记录
  readRecords: () => ipcRenderer.invoke('read-records'),

  // 写入打卡记录
  writeRecords: (data) => ipcRenderer.invoke('write-records', data),

  // 选择文件夹
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // 选择图片文件（多选）
  selectImages: () => ipcRenderer.invoke('select-images'),

  // 复制图片到存储目录
  copyImage: (sourcePath, targetDir, fileName) =>
    ipcRenderer.invoke('copy-image', sourcePath, targetDir, fileName),

  // 获取图片完整路径（用于显示）
  getImagePath: (fileName) => ipcRenderer.invoke('get-image-path', fileName),

  // 删除图片
  deleteImage: (fileName) => ipcRenderer.invoke('delete-image', fileName),

  // 在文件管理器中打开图片文件夹
  openPhotosFolder: () => ipcRenderer.invoke('open-photos-folder'),

  // 读取 data/ 目录下的数据文件（GeoJSON等）
  readDataFile: (fileName) => ipcRenderer.invoke('read-data-file', fileName)
});
