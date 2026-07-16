/* ====== 足迹地图 —— 右侧游记面板 ====== */

let panelRightOpen = false;
let tempSelectedImages = [];   // 临时选中的图片 Data URLs（未保存）
let existingImages = [];       // 已有的图片文件名列表

// ====== 面板初始化 ======

// 日期 input：初始 type=text 显示"年/月/日"，点击时切换为 date 调用原生选择器
function initDateInput(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var _switched = false;
  // mousedown 在 focus/click 之前触发，先切换类型
  el.addEventListener('mousedown', function () {
    if (this.type === 'text') {
      this.type = 'date';
      this.removeAttribute('readonly');
      _switched = true;
    }
  });
  // click 时若刚切换了类型，主动弹出日期面板
  el.addEventListener('click', function () {
    if (_switched && this.type === 'date' && typeof this.showPicker === 'function') {
      _switched = false;
      try { this.showPicker(); } catch (e) { /* ignore */ }
    }
  });
  el.addEventListener('blur', function () {
    if (!this.value) {
      this.type = 'text';
      this.setAttribute('readonly', '');
    }
  });
}

function initRightPanel() {
  document.getElementById('btn-close-right').addEventListener('click', closeRightPanel);
  document.getElementById('btn-checkin').addEventListener('click', checkin);
  document.getElementById('btn-edit-note').addEventListener('click', switchToEditMode);
  document.getElementById('btn-delete-record').addEventListener('click', deleteCurrentRecord);
  document.getElementById('btn-upload-photos').addEventListener('click', uploadPhotos);

  // 初始化日期选择器
  initDateInput('input-arrival-date');
  initDateInput('input-departure-date');

  // 文件选择器变化事件（浏览器原生文件对话框）
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', handleFileSelect);
}

// ====== 打开面板 ======

// 编辑模式（新增或修改游记）
function openRightPanelForEdit(city) {
  const panel = document.getElementById('panel-right');
  const title = document.getElementById('panel-right-title');
  const viewMode = document.getElementById('note-view');
  const editMode = document.getElementById('note-edit');

  editingRecord = city;
  selectedCity = city;

  // 检查是否已有打卡记录（已打卡但想编辑游记）
  const existingRecord = getRecordByCity(String(city.cityCode));
  if (existingRecord && existingRecord.note) {
    // 填充已有内容
    document.getElementById('note-textarea').value = existingRecord.note.text || '';
    existingImages = existingRecord.note.images || [];
    // 填充旅行时间
    var arrivalEl = document.getElementById('input-arrival-date');
    var departureEl = document.getElementById('input-departure-date');
    if (existingRecord.arrivalDate) {
      arrivalEl.type = 'date';
      arrivalEl.removeAttribute('readonly');
      arrivalEl.value = existingRecord.arrivalDate;
    } else {
      arrivalEl.type = 'text';
      arrivalEl.setAttribute('readonly', '');
      arrivalEl.value = '';
    }
    if (existingRecord.departureDate) {
      departureEl.type = 'date';
      departureEl.removeAttribute('readonly');
      departureEl.value = existingRecord.departureDate;
    } else {
      departureEl.type = 'text';
      departureEl.setAttribute('readonly', '');
      departureEl.value = '';
    }
  } else {
    document.getElementById('note-textarea').value = '';
    existingImages = [];
    var aEl = document.getElementById('input-arrival-date');
    var dEl = document.getElementById('input-departure-date');
    aEl.type = 'text';
    aEl.setAttribute('readonly', '');
    aEl.value = '';
    dEl.type = 'text';
    dEl.setAttribute('readonly', '');
    dEl.value = '';
  }
  tempSelectedImages = [];

  title.textContent = '📝 写游记 — ' + (city.cityName || city.name);

  viewMode.style.display = 'none';
  editMode.style.display = 'block';

  // 刷新照片预览
  renderPhotoPreviews();

  panel.classList.add('panel-right--open');
  panelRightOpen = true;
}

// 查看模式（已打卡城市）
function openRightPanelForView(record) {
  const panel = document.getElementById('panel-right');
  const title = document.getElementById('panel-right-title');
  const viewMode = document.getElementById('note-view');
  const editMode = document.getElementById('note-edit');

  editingRecord = record;

  title.textContent = '📝 ' + record.cityName;

  // 填充查看内容
  document.getElementById('note-city-name').textContent = record.cityName;
  document.getElementById('note-date').textContent = '打卡日期：' + (record.checkinDate || '未知');

  // 旅行时间
  var travelDatesEl = document.getElementById('note-travel-dates');
  var arrival = record.arrivalDate || '';
  var departure = record.departureDate || '';
  if (arrival || departure) {
    var parts = [];
    if (arrival) parts.push('到达：' + arrival);
    if (departure) parts.push('离开：' + departure);
    travelDatesEl.textContent = parts.join('    ');
    travelDatesEl.style.display = '';
  } else {
    travelDatesEl.style.display = 'none';
  }

  // 图片
  const imagesContainer = document.getElementById('note-images');
  imagesContainer.innerHTML = '';
  if (record.note && record.note.images && record.note.images.length > 0) {
    record.note.images.forEach(imgFileName => {
      const imgWrapper = document.createElement('div');
      const img = document.createElement('img');
      img.src = '/api/image?name=' + encodeURIComponent(imgFileName);
      img.alt = '游记照片';
      img.addEventListener('click', () => zoomImage(img.src));
      img.onerror = function() {
        imgWrapper.style.display = 'none';
      };
      imgWrapper.appendChild(img);
      imagesContainer.appendChild(imgWrapper);
    });
  } else {
    imagesContainer.innerHTML = '<span style="color:#999;font-size:13px;">暂无照片</span>';
  }

  // 文字
  document.getElementById('note-text').textContent =
    (record.note && record.note.text) || '暂无游记内容';

  viewMode.style.display = 'block';
  editMode.style.display = 'none';

  panel.classList.add('panel-right--open');
  panelRightOpen = true;
}

// ====== 关闭面板 ======

function closeRightPanel() {
  // 如果在编辑模式，自动保存
  if (document.getElementById('note-edit').style.display !== 'none') {
    doCheckin();
  }

  const panel = document.getElementById('panel-right');
  panel.classList.remove('panel-right--open');
  panelRightOpen = false;
  editingRecord = null;
  tempSelectedImages = [];
  existingImages = [];
}

// ====== 打卡 ======

async function checkin() {
  await doCheckin();
  closeRightPanel();
}

async function doCheckin() {
  if (!selectedCity) return;

  const cityCode = String(selectedCity.cityCode);
  const cityName = selectedCity.cityName || selectedCity.name;
  const provinceCode = String(selectedCity.provinceCode || '');
  const provinceName = selectedCity.provinceName || '';
  const lat = selectedCity.lat || selectedCity.latitude;
  const lng = selectedCity.lng || selectedCity.longitude;
  const text = document.getElementById('note-textarea').value.trim();
  const arrivalDate = document.getElementById('input-arrival-date').value || '';
  const departureDate = document.getElementById('input-departure-date').value || '';

  const allImages = [...existingImages];

  // 上传新选择的图片（base64 Data URLs）
  if (tempSelectedImages.length > 0) {
    const photosDir = appData.photosDir || '';
    const newNames = await window.api.uploadImages(tempSelectedImages, photosDir);
    if (newNames && newNames.length > 0) {
      allImages.push(...newNames);
    }
  }

  // 查找或创建打卡记录
  let record = getRecordByCity(cityCode);
  if (record) {
    // 已有记录（已选颜色），更新游记内容
    record.note = {
      text: text,
      images: allImages
    };
    record.arrivalDate = arrivalDate;
    record.departureDate = departureDate;
  } else {
    // 没有记录（未选颜色），用默认颜色创建新记录
    record = {
      cityName: cityName,
      cityCode: cityCode,
      provinceName: provinceName,
      provinceCode: provinceCode,
      color: getDefaultColor(),
      lat: lat,
      lng: lng,
      checkinDate: new Date().toISOString().split('T')[0],
      arrivalDate: arrivalDate,
      departureDate: departureDate,
      note: {
        text: text,
        images: allImages
      }
    };
  }

  await addOrUpdateRecord(record);
  tempSelectedImages = [];
  existingImages = allImages;

  // 刷新地图填色和标记
  applyCheckedRecords();
}

// ====== 切换到编辑模式 ======

function switchToEditMode() {
  if (!editingRecord) return;

  const record = editingRecord;
  const city = {
    cityName: record.cityName,
    cityCode: record.cityCode,
    provinceCode: record.provinceCode,
    provinceName: record.provinceName,
    lat: record.lat,
    lng: record.lng
  };

  selectedCity = city;
  openRightPanelForEdit(city);
}

// ====== 删除打卡记录 ======

async function deleteCurrentRecord() {
  if (!editingRecord) return;

  const record = editingRecord;
  const cityCode = String(record.cityCode);
  const cityName = record.cityName;

  // 确认对话框
  const confirmed = confirm(
    '确定要删除「' + cityName + '」的打卡记录吗？\n\n' +
    '该城市将恢复未打卡状态，游记内容将被删除。\n此操作不可撤销！'
  );

  if (!confirmed) return;

  const imageFiles = (record.note && record.note.images) ? record.note.images : [];
  await deleteRecordWithImages(cityCode, imageFiles);

  // 关闭面板
  closeRightPanel();

  // 刷新地图
  clearHighlight();
  hideColorPicker();
  applyCheckedRecords();
}

// ====== 照片上传（浏览器原生文件选择器） ======

function uploadPhotos() {
  const fileInput = document.getElementById('file-input');
  fileInput.value = '';  // 清空，允许重新选择同一文件
  fileInput.click();     // 触发浏览器原生文件对话框
}

// 处理文件选择
function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  // 使用 FileReader 读取为 Data URLs
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = function(e) {
      tempSelectedImages.push(e.target.result);  // Data URL
      renderPhotoPreviews();
    };
    reader.readAsDataURL(file);
  }
}

function renderPhotoPreviews() {
  const container = document.getElementById('photo-preview');
  container.innerHTML = '';

  // 已有照片
  existingImages.forEach((fileName, index) => {
    const item = createPreviewItem(fileName, index, 'existing');
    container.appendChild(item);
  });

  // 新选照片（Data URLs，直接显示）
  tempSelectedImages.forEach((dataUrl, index) => {
    const item = createPreviewItem(dataUrl, index, 'temp');
    container.appendChild(item);
  });
}

function createPreviewItem(src, index, type) {
  const item = document.createElement('div');
  item.className = 'photo-preview__item';

  const img = document.createElement('img');
  if (type === 'existing') {
    img.src = '/api/image?name=' + encodeURIComponent(src);
    img.onerror = function() {
      img.src = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        '<rect fill="%23eee" width="100" height="100" rx="4"/>' +
        '<text x="50" y="55" text-anchor="middle" fill="%23999" font-size="12">无图片</text></svg>'
      );
    };
  } else {
    // 新选中的图片：直接显示 Data URL（即时预览）
    img.src = src;
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'photo-preview__remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (type === 'existing') {
      existingImages.splice(index, 1);
    } else {
      tempSelectedImages.splice(index, 1);
    }
    renderPhotoPreviews();
  });

  item.appendChild(img);
  item.appendChild(removeBtn);
  return item;
}

// ====== 图片放大查看 ======

function zoomImage(src) {
  const viewer = document.createElement('div');
  viewer.className = 'image-viewer';
  viewer.innerHTML = '<img src="' + src + '">';
  viewer.addEventListener('click', () => {
    document.body.removeChild(viewer);
  });
  document.body.appendChild(viewer);
}
