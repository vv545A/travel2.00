/* ====== 足迹地图 —— 左侧统计面板 ====== */

let panelLeftOpen = true;

// ====== 面板切换 ======

function initLeftPanel() {
  const toggleBtn = document.getElementById('btn-toggle-left');
  toggleBtn.addEventListener('click', toggleLeftPanel);

  // 设置按钮
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.addEventListener('click', openSettings);
  }
}

function toggleLeftPanel() {
  const panel = document.getElementById('panel-left');
  const toggleBtn = document.getElementById('btn-toggle-left');

  panelLeftOpen = !panelLeftOpen;

  if (panelLeftOpen) {
    panel.classList.remove('panel-left--collapsed');
    toggleBtn.textContent = '◀';
    toggleBtn.title = '收起面板';
  } else {
    panel.classList.add('panel-left--collapsed');
    toggleBtn.textContent = '▶';
    toggleBtn.title = '展开面板';
  }
}

// ====== 更新统计数据 ======

function updateLeftPanel() {
  const records = getCheckedCities();
  const provinces = getCheckedProvinces();
  const bounds = getCardinalBounds();

  // 省份和城市数量
  document.getElementById('stat-provinces').textContent = provinces.size + ' / 34';
  document.getElementById('stat-cities').textContent = records.length;

  // 四至
  document.getElementById('bound-east').textContent =
    '➡️ 最东端：' + (bounds.east ? bounds.east.cityName : '--');
  document.getElementById('bound-west').textContent =
    '⬅️ 最西端：' + (bounds.west ? bounds.west.cityName : '--');
  document.getElementById('bound-south').textContent =
    '⬇️ 最南端：' + (bounds.south ? bounds.south.cityName : '--');
  document.getElementById('bound-north').textContent =
    '⬆️ 最北端：' + (bounds.north ? bounds.north.cityName : '--');

  // 城市列表
  const cityListEl = document.getElementById('city-list');
  cityListEl.innerHTML = '';

  if (records.length === 0) {
    cityListEl.innerHTML = '<span style="color:#999;font-size:12px;">还没有打卡记录，点击地图上的城市开始打卡吧 ✈️</span>';
  } else {
    // 按打卡时间倒序排列
    const sortedRecords = [...records].sort((a, b) => {
      return (b.checkinDate || '').localeCompare(a.checkinDate || '');
    });

    sortedRecords.forEach(record => {
      const item = document.createElement('span');
      item.className = 'city-list__item';
      item.textContent = record.cityName;
      item.style.borderLeft = '3px solid ' + record.color;
      item.title = '点击跳转到 ' + record.cityName;
      item.addEventListener('click', () => {
        // 在地图上定位该城市
        const city = {
          cityName: record.cityName,
          cityCode: record.cityCode,
          provinceCode: record.provinceCode,
          provinceName: record.provinceName,
          lat: record.lat,
          lng: record.lng
        };
        flyToCity(city);
        // 延迟触发点击交互
        setTimeout(() => {
          handleCityClick(city);
        }, 800);
      });
      cityListEl.appendChild(item);
    });
  }
}

// ====== 设置弹窗 ======

// 渲染默认颜色选项
function renderDefaultColorOptions() {
  const container = document.getElementById('default-color-options');
  if (!container) return;

  container.innerHTML = '';
  const currentDefault = getDefaultColor();

  MACARON_COLORS.forEach(color => {
    const dot = document.createElement('div');
    dot.className = 'settings-color-option';
    dot.style.backgroundColor = color.value;
    dot.title = color.name;
    if (color.value === currentDefault) {
      dot.classList.add('settings-color-option--selected');
    }
    dot.addEventListener('click', async () => {
      await setDefaultColor(color.value);
      // 刷新选中态
      container.querySelectorAll('.settings-color-option').forEach(d => {
        d.classList.remove('settings-color-option--selected');
      });
      dot.classList.add('settings-color-option--selected');
    });
    container.appendChild(dot);
  });
}

function openSettings() {
  const modal = document.getElementById('settings-modal');
  const dirInput = document.getElementById('settings-photos-dir');

  dirInput.value = appData.photosDir || '(使用默认位置)';

  // 渲染默认颜色选项
  renderDefaultColorOptions();

  modal.style.display = 'flex';

  // 更换文件夹按钮
  const btnChange = document.getElementById('btn-change-photos-dir');
  if (!btnChange) return;
  btnChange.onclick = async () => {
    const folder = await window.api.selectFolder();
    if (folder) {
      appData.photosDir = folder;
      dirInput.value = folder;
      await saveData();
    }
  };

  // 关闭按钮
  const btnClose = document.getElementById('btn-close-settings');
  btnClose.onclick = () => {
    modal.style.display = 'none';
  };

  // 退出登录按钮
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    // 显示当前用户信息
    var emailEl = document.getElementById('settings-user-email');
    if (emailEl && window.Auth && window.Auth.currentUser) {
      var u = window.Auth.currentUser;
      emailEl.textContent = '当前登录：' + (u.email || u.githubUsername || u.id);
    }
    btnLogout.onclick = () => {
      if (confirm('确定要退出登录吗？\n\n退出后需要重新登录才能查看地图数据。')) {
        if (window.Auth) {
          window.Auth.logout();
        }
      }
    };
  }

  // 点击遮罩关闭
  const overlay = modal.querySelector('.modal__overlay');
  overlay.onclick = () => {
    modal.style.display = 'none';
  };
}
