/* ====== 足迹地图 —— 数据存储层 ====== */

// 全局数据状态
let appData = {
  version: '1.0',
  photosDir: '',
  defaultColor: DEFAULT_COLOR_VALUE,
  records: []
};

// 当前选中的城市（用于交互）
let selectedCity = null;

// 当前编辑中的记录
let editingRecord = null;

// ====== 数据加载与保存 ======

async function loadData() {
  try {
    const data = await window.api.readRecords();
    if (data) {
      appData = data;
      // 确保 photosDir 有默认值
      if (!appData.photosDir) {
        appData.photosDir = '';
      }
      if (!appData.records) {
        appData.records = [];
      }
      // 兼容旧数据：无 defaultColor 时自动补默认值
      if (!appData.defaultColor) {
        appData.defaultColor = DEFAULT_COLOR_VALUE;
      }
    }
  } catch (err) {
    console.error('加载数据失败:', err);
  }
  return appData;
}

async function saveData() {
  try {
    const result = await window.api.writeRecords(appData);
    if (result.success) {
      // 数据保存成功后更新左侧面板
      updateLeftPanel();
    }
    return result;
  } catch (err) {
    console.error('保存数据失败:', err);
    return { success: false, error: err.message };
  }
}

// ====== 打卡记录操作 ======

// 获取城市的打卡记录
function getRecordByCity(cityCode) {
  return appData.records.find(r => r.cityCode === cityCode) || null;
}

// 添加或更新打卡记录
async function addOrUpdateRecord(record) {
  const existingIndex = appData.records.findIndex(r => r.cityCode === record.cityCode);
  if (existingIndex >= 0) {
    appData.records[existingIndex] = record;
  } else {
    appData.records.push(record);
  }
  await saveData();
}

// 删除打卡记录
async function deleteRecord(cityCode) {
  appData.records = appData.records.filter(r => r.cityCode !== cityCode);

  // 同时删除关联的游记图片
  const record = appData.records.find(r => r.cityCode === cityCode);
  // 注意：这里record已经被删了，我们需要传入图片文件名

  await saveData();
}

// 删除打卡记录（带图片清理）
async function deleteRecordWithImages(cityCode, imageFiles) {
  // 删除图片文件
  if (imageFiles && imageFiles.length > 0) {
    for (const fileName of imageFiles) {
      await window.api.deleteImage(fileName);
    }
  }
  // 删除记录
  appData.records = appData.records.filter(r => r.cityCode !== cityCode);
  await saveData();
}

// 获取已打卡的省份代码集合
function getCheckedProvinces() {
  const provinceSet = new Set();
  appData.records.forEach(r => {
    if (r.provinceCode) {
      provinceSet.add(r.provinceCode);
    }
  });
  return provinceSet;
}

// 获取已打卡的城市代码集合（返回完整记录）
function getCheckedCities() {
  return appData.records;
}

// 计算四至（最东/南/西/北）
function getCardinalBounds() {
  if (appData.records.length === 0) {
    return { east: null, west: null, south: null, north: null };
  }

  let east = appData.records[0];
  let west = appData.records[0];
  let south = appData.records[0];
  let north = appData.records[0];

  appData.records.forEach(r => {
    if (r.lng > east.lng) east = r;
    if (r.lng < west.lng) west = r;
    if (r.lat < south.lat) south = r;
    if (r.lat > north.lat) north = r;
  });

  return { east, west, south, north };
}

// 更新图片存储路径
async function updatePhotosDir(newDir) {
  appData.photosDir = newDir;
  await saveData();
}

// 获取默认颜色
function getDefaultColor() {
  return appData.defaultColor || DEFAULT_COLOR_VALUE;
}

// 设置默认颜色
async function setDefaultColor(colorValue) {
  appData.defaultColor = colorValue;
  await saveData();
}
