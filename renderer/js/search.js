/* ====== 足迹地图 —— 搜索功能 ====== */

let searchDebounceTimer = null;

// ====== 搜索初始化 ======

function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchDropdown = document.getElementById('search-dropdown');

  // 输入事件（带防抖）
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      performSearch(searchInput.value.trim());
    }, 250);
  });

  // 回车键立即搜索
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      performSearch(searchInput.value.trim(), true);
    }
    if (e.key === 'Escape') {
      searchDropdown.classList.remove('search-dropdown--visible');
      searchInput.blur();
    }
  });

  // 输入框获得焦点时，如果有内容则显示结果
  searchInput.addEventListener('focus', () => {
    const query = searchInput.value.trim();
    if (query) {
      performSearch(query);
    }
  });

  // 点击其他地方关闭下拉
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-bar')) {
      searchDropdown.classList.remove('search-dropdown--visible');
    }
  });
}

// ====== 搜索逻辑 ======

function performSearch(query, jumpToFirst = false) {
  const dropdown = document.getElementById('search-dropdown');

  if (!query || query.length === 0) {
    dropdown.classList.remove('search-dropdown--visible');
    return;
  }

  // 在所有城市数据中模糊搜索
  const results = fuzzySearchCities(query);

  if (results.length === 0) {
    dropdown.innerHTML = '<div class="search-dropdown__item" style="color:#999;">未找到匹配城市</div>';
    dropdown.classList.add('search-dropdown--visible');
    return;
  }

  // 渲染搜索结果
  dropdown.innerHTML = '';
  results.slice(0, 15).forEach((city, index) => {
    const item = document.createElement('div');
    item.className = 'search-dropdown__item';

    const isCapital = city.isCapital || city.level === 'capital';
    const isChecked = getRecordByCity(String(city.cityCode));

    let icon = isChecked ? '📍 ' : (isCapital ? '● ' : '○ ');
    item.textContent = icon + (city.cityName || city.name) +
      (city.provinceName ? ' · ' + city.provinceName : '');

    item.addEventListener('click', () => {
      selectSearchResult(city);
    });

    dropdown.appendChild(item);
  });

  dropdown.classList.add('search-dropdown--visible');

  // 如果按回车且只有一个结果，直接跳转
  if (jumpToFirst && results.length === 1) {
    selectSearchResult(results[0]);
  }
}

// 模糊搜索
function fuzzySearchCities(query) {
  const q = query.toLowerCase();
  const results = [];

  allCitiesData.forEach(city => {
    const name = (city.cityName || city.name || '').toLowerCase();
    const province = (city.provinceName || '').toLowerCase();
    const pinyin = (city.pinyin || '').toLowerCase();
    const pinyinAbbr = (city.pinyinAbbr || '').toLowerCase();

    // 匹配城市名、省份名、拼音、拼音首字母
    if (
      name.includes(q) ||
      province.includes(q) ||
      pinyin.includes(q) ||
      pinyinAbbr.includes(q)
    ) {
      // 精确匹配加分
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (pinyin.startsWith(q)) score = 40;
      else score = 20;

      // 已打卡城市优先
      if (getRecordByCity(String(city.cityCode))) score += 10;

      results.push({ city, score });
    }
  });

  // 按得分排序
  results.sort((a, b) => b.score - a.score);

  return results.map(r => r.city);
}

// 选中搜索结果
function selectSearchResult(city) {
  const dropdown = document.getElementById('search-dropdown');
  const searchInput = document.getElementById('search-input');

  // 关闭下拉
  dropdown.classList.remove('search-dropdown--visible');

  // 更新搜索框
  searchInput.value = city.cityName || city.name;
  searchInput.blur();

  // 飞行到该城市
  flyToCity(city);

  // 延迟触发点击交互
  setTimeout(() => {
    handleCityClick(city);
  }, 800);
}
