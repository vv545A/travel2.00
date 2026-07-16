/* ====== 足迹地图 —— 地图核心 ====== */

let map = null;
let provinceLayer = null;      // 省级边界图层
let cityBoundaryLayer = null;  // 地级市边界图层
let cityFillLayer = null;      // 地级市填色图层（已打卡区域）
let provinceFillLayer = null;  // 省份填色图层（省份模式使用）
let cityMarkersGroup = null;   // 城市标记点图层组
let provinceLabelsGroup = null; // 省级标签图层（小比例尺时显示）
let allCitiesData = [];        // 所有城市数据（含经纬度）
let cityGeoJSONFeatures = [];  // 地级市 GeoJSON features
let provinceGeoJSONFeatures = []; // 省级 GeoJSON features
let currentMode = 'city';      // 当前显示模式：'city' | 'province'

// 当前高亮的城市标记
let highlightedMarker = null;
let currentPopup = null;

// ====== 地图初始化 ======

function initMap() {
  map = L.map('map-container', {
    center: CHINA_CENTER,
    zoom: MAP_DEFAULT_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    zoomControl: true,
    attributionControl: false,
    // 限制地图拖拽范围在中国附近
    maxBounds: [[15, 70], [58, 140]],
    maxBoundsViscosity: 0.8
  });

  // 纯色底图：不使用任何在线瓦片，仅显示 GeoJSON 边界和填色

  // 创建各图层
  cityFillLayer = L.geoJSON(null, {
    style: featureFillStyle,
    onEachFeature: onEachCityBoundaryFeature
  }).addTo(map);

  provinceFillLayer = L.geoJSON(null, {
    style: featureProvinceFillStyle,
    interactive: false
  }).addTo(map);

  cityBoundaryLayer = L.geoJSON(null, {
    style: featureBoundaryStyle,
    onEachFeature: onEachCityBoundaryFeature,
    interactive: true
  }).addTo(map);

  provinceLayer = L.geoJSON(null, {
    style: featureProvinceStyle,
    interactive: false
  }).addTo(map);

  cityMarkersGroup = L.layerGroup().addTo(map);
  provinceLabelsGroup = L.layerGroup().addTo(map);

  // 监听缩放事件
  map.on('zoomend', onZoomChange);
  map.on('click', onMapClick);

  // 初始加载数据
  loadGeoJSONData();
}

// ====== GeoJSON 数据加载 ======

async function loadGeoJSONData() {
  try {
    // 并行加载所有数据文件
    const [provinceData, cityData, pointsData] = await Promise.all([
      window.api.readDataFile('china-provinces.geojson'),
      window.api.readDataFile('china-cities.geojson'),
      window.api.readDataFile('china-city-points.json')
    ]);

    // 1. 先填充城市点位数据（边界层点击时需要用到）
    if (pointsData) {
      allCitiesData = pointsData;
    }

    // 2. 加载省级边界
    if (provinceData) {
      provinceLayer.addData(provinceData);
      provinceGeoJSONFeatures = provinceData.features || [];
      renderProvinceLabels();
    }

    // 3. 加载地级市边界（此时 allCitiesData 已就绪）
    if (cityData) {
      cityGeoJSONFeatures = cityData.features || [];
      cityBoundaryLayer.addData(cityData);
    }

    // 4. 渲染城市标记
    renderCityMarkers();

    // 5. 应用已保存的打卡记录
    applyCheckedRecords();

    console.log('地图数据加载完成');
    console.log('  - 省级边界: ✓');
    console.log('  - 地级市边界: ' + cityGeoJSONFeatures.length + ' 个');
    console.log('  - 城市点位: ' + allCitiesData.length + ' 个');
  } catch (err) {
    console.error('加载地图数据失败:', err);
  }
}

// 从 GeoJSON 提取城市信息（名称、坐标、代码等）
function extractCityInfo(geoJSON) {
  // GeoJSON features 中已经包含城市代码和名称
  // 这里不做额外处理，数据已在 applyCheckedRecords 中使用
}

// ====== 图层样式 ======

function featureProvinceStyle(feature) {
  return {
    color: '#888888',
    weight: 2.5,
    opacity: 0.7,
    fillColor: 'transparent',
    fillOpacity: 0
  };
}

function featureBoundaryStyle(feature) {
  return {
    color: '#CCCCCC',
    weight: 1,
    opacity: 0.55,
    fillColor: 'transparent',
    fillOpacity: 0  // 透明填充以接收点击事件
  };
}

function featureFillStyle(feature) {
  const cityCode = String(feature.properties.adcode || feature.properties.code);
  const parentCode = feature.properties.parent ? String(feature.properties.parent.adcode) : '';

  // 尝试匹配：1) 精确城市代码 2) 父级省份代码（直辖市/特区）
  let record = getRecordByCity(cityCode);
  if (!record && parentCode) {
    record = getRecordByCity(parentCode);
  }

  if (record) {
    return {
      color: record.color,
      weight: 1,
      opacity: 0.6,
      fillColor: record.color,
      fillOpacity: 0.35
    };
  }
  return {
    color: 'transparent',
    weight: 0,
    opacity: 0,
    fillColor: 'transparent',
    fillOpacity: 0
  };
}

// 省份填色图层样式（省份模式使用）
function featureProvinceFillStyle(feature) {
  return {
    color: '#888888',
    weight: 2.5,
    opacity: 0.7,
    fillColor: getDefaultColor(),
    fillOpacity: 0.35
  };
}

function onEachCityBoundaryFeature(feature, layer) {
  const featureCode = String(feature.properties.adcode || feature.properties.code || '');
  layer.on('click', () => {
    // 查找对应城市（处理多种匹配情况）
    let city = findCityByCode(featureCode);
    if (city) {
      handleCityClick(city);
    }
  });
}

// 根据代码查找城市（支持区级→市级映射）
function findCityByCode(code) {
  // 1. 精确匹配
  let city = allCitiesData.find(c => String(c.cityCode) === code);
  if (city) return city;

  // 2. 直辖市/特区：区级代码映射到省级代码
  //    例如 110101 (东城区) -> 110000 (北京)
  if (code.length === 6) {
    const provinceCode = code.substring(0, 2) + '0000';
    city = allCitiesData.find(c => String(c.cityCode) === provinceCode);
    if (city) return city;
  }

  // 3. 匹配前4位（地级市代码前缀）
  if (code.length === 6) {
    const prefix4 = code.substring(0, 4);
    city = allCitiesData.find(c => String(c.cityCode).substring(0, 4) === prefix4);
    if (city) return city;
  }

  return null;
}

// ====== 颜色工具 ======

// 将 hex 颜色加深指定百分比（amount 为 0~1，例如 0.15 表示降低 15% 亮度）
function darkenColor(hex, amount) {
  // hex -> RGB
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  // RGB -> HSL
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  // 降低亮度
  l = Math.max(0, l - amount);
  // HSL -> RGB -> hex
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = function(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p;
    };
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  var toHex = function(x) {
    var hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// ====== 城市标记渲染 ======

function renderCityMarkers() {
  cityMarkersGroup.clearLayers();
  const zoom = map.getZoom();

  // zoom < 5: 不显示任何城市标记（城市模式适用）
  const showAll = zoom >= CAPITAL_ONLY_ZOOM;

  allCitiesData.forEach(city => {
    const isCapital = city.isCapital === true || city.level === 'capital';
    const isChecked = getRecordByCity(String(city.cityCode));

    if (currentMode === 'province') {
      // 省份模式：只显示已打卡城市，不受缩放限制
      if (!isChecked) return;
    } else {
      // 城市模式：缩放相关过滤
      if (zoom < MIN_CITY_ZOOM) return;
      if (!showAll && !isCapital) return;
    }

    const marker = createCityMarker(city, isCapital, !!isChecked);
    marker.addTo(cityMarkersGroup);
  });
}

function createCityMarker(city, isCapital, isChecked) {
  const lat = city.lat || city.latitude;
  const lng = city.lng || city.longitude;

  let icon;
  if (isChecked && currentMode === 'province') {
    // 省份模式已打卡：深色实心圆
    var darkColor = darkenColor(getDefaultColor(), 0.15);
    icon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="marker-checked-province" style="background-color:' + darkColor + ';"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  } else if (isChecked) {
    // 已打卡：定位图标
    icon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="marker-checked">📍</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 24]
    });
  } else if (isCapital) {
    // 省会：实心圆
    icon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="marker-capital"></div>',
      iconSize: CAPITAL_ICON_SIZE,
      iconAnchor: [7, 7]
    });
  } else {
    // 普通地级市：空心圆
    icon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="marker-default"></div>',
      iconSize: DEFAULT_ICON_SIZE,
      iconAnchor: [5, 5]
    });
  }

  const marker = L.marker([lat, lng], { icon });

  // 存储城市数据
  marker.cityData = city;
  marker.isCapital = isCapital;

  // 绑定点击事件
  marker.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    handleCityClick(city);
  });

  // 城市名称标签
  if (isCapital || map.getZoom() >= CAPITAL_ONLY_ZOOM) {
    const labelIcon = L.divIcon({
      className: 'city-label' + (isCapital ? ' city-label--capital' : ''),
      html: city.cityName || city.name,
      iconSize: [80, 20],
      iconAnchor: [40, -8]
    });
    const labelMarker = L.marker([lat, lng], { icon: labelIcon, interactive: false });
    labelMarker.addTo(cityMarkersGroup);
    marker._labelMarker = labelMarker;
  }

  return marker;
}

// ====== 缩放联动 ======

function onZoomChange() {
  const zoom = map.getZoom();
  const showCities = zoom >= CAPITAL_ONLY_ZOOM;

  renderCityMarkers();
  updateLabelVisibility();

  // 省份标签 vs 城市标签切换
  if (provinceLabelsGroup) {
    if (showCities) {
      map.removeLayer(provinceLabelsGroup);
    } else {
      map.addLayer(provinceLabelsGroup);
    }
  }

  refreshAllFills();
}

function updateLabelVisibility() {
  const zoom = map.getZoom();
  cityMarkersGroup.eachLayer(layer => {
    if (layer._labelMarker) {
      const showLabel = zoom >= CAPITAL_ONLY_ZOOM || layer.isCapital;
      const labelEl = layer._labelMarker.getElement();
      if (labelEl) {
        labelEl.style.display = showLabel ? '' : 'none';
      }
    }
  });
}

// ====== 省级标签（小比例尺时显示） ======

function renderProvinceLabels() {
  if (!provinceLabelsGroup) return;
  provinceLabelsGroup.clearLayers();

  // 省份名称简化映射
  const nameShort = {
    '北京市': '北京', '天津市': '天津', '上海市': '上海', '重庆市': '重庆',
    '河北省': '河北', '山西省': '山西', '内蒙古自治区': '内蒙古',
    '辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江',
    '江苏省': '江苏', '浙江省': '浙江', '安徽省': '安徽',
    '福建省': '福建', '江西省': '江西', '山东省': '山东',
    '河南省': '河南', '湖北省': '湖北', '湖南省': '湖南',
    '广东省': '广东', '广西壮族自治区': '广西', '海南省': '海南',
    '四川省': '四川', '贵州省': '贵州', '云南省': '云南',
    '西藏自治区': '西藏', '陕西省': '陕西', '甘肃省': '甘肃',
    '青海省': '青海', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
    '台湾省': '台湾', '香港特别行政区': '香港', '澳门特别行政区': '澳门'
  };

  provinceGeoJSONFeatures.forEach(feature => {
    const props = feature.properties;
    const name = props.name;
    const shortName = nameShort[name] || name;

    let lat, lng;
    if (props.center && Array.isArray(props.center)) {
      [lng, lat] = props.center;
    } else if (props.centroid && Array.isArray(props.centroid)) {
      [lng, lat] = props.centroid;
    }
    if (lat == null || lng == null) return;

    const labelIcon = L.divIcon({
      className: 'province-label',
      html: '<span class="province-label__text">' + shortName + '</span>',
      iconSize: [80, 24],
      iconAnchor: [40, 12]
    });

    const label = L.marker([lat, lng], {
      icon: labelIcon,
      interactive: false,
      zIndexOffset: -100
    });
    label.addTo(provinceLabelsGroup);
  });
}

// ====== 地图点击（空白区域） ======

function onMapClick(e) {
  // 点击空白区域时取消所有高亮
  clearHighlight();
  hideColorPicker();
  // 检查是否点击到地级市区域
  // Leaflet 的 GeoJSON 点击事件会在冒泡前处理，这里处理空白区域点击
}

// ====== 应用打卡记录 ======

function applyCheckedRecords() {
  // 先刷新填色图层
  refreshAllFills();

  // 更新标记
  renderCityMarkers();

  // 更新统计面板
  updateLeftPanel();
}

// 根据当前模式刷新对应填色图层
function refreshAllFills() {
  if (currentMode === 'province') {
    cityFillLayer.clearLayers();
    refreshProvinceFills();
  } else {
    provinceFillLayer.clearLayers();
    refreshCityFills();
  }
}

function refreshCityFills() {
  if (!cityFillLayer) return;
  cityFillLayer.clearLayers();

  // 直辖市/特别行政区/台湾（整个区域统一填色）
  const unifiedRegions = new Set(['110000','120000','310000','500000','810000','820000','710000']);

  appData.records.forEach(record => {
    const recordCode = String(record.cityCode);

    if (unifiedRegions.has(recordCode)) {
      // 先尝试城市级 GeoJSON features
      let features = cityGeoJSONFeatures.filter(f => {
        const parentCode = f.properties.parent ? String(f.properties.parent.adcode) : '';
        const selfCode = String(f.properties.adcode || f.properties.code);
        return parentCode === recordCode || selfCode === recordCode;
      });

      // 如果没有城市级数据（如台湾），使用省份级 GeoJSON
      if (features.length === 0) {
        features = provinceGeoJSONFeatures.filter(f => {
          return String(f.properties.adcode || f.properties.code) === recordCode;
        });
      }

      features.forEach(f => cityFillLayer.addData(f));
    } else {
      // 普通地级市：精确匹配城市代码
      const cityFeature = cityGeoJSONFeatures.find(f => {
        const code = f.properties.adcode || f.properties.code;
        return String(code) === recordCode;
      });
      if (cityFeature) {
        cityFillLayer.addData(cityFeature);
      }
    }
  });
}

// 省份模式：填充已打卡的省份
function refreshProvinceFills() {
  if (!provinceFillLayer) return;
  provinceFillLayer.clearLayers();

  // 收集已打卡的省份代码（去重）
  const checkedProvinces = new Set();
  appData.records.forEach(record => {
    if (record.provinceCode) {
      checkedProvinces.add(String(record.provinceCode));
    }
  });

  // 对每个已打卡省份，查找对应的省份 GeoJSON feature 并填充
  checkedProvinces.forEach(provinceCode => {
    const feature = provinceGeoJSONFeatures.find(f => {
      return String(f.properties.adcode || f.properties.code) === provinceCode;
    });
    if (feature) {
      provinceFillLayer.addData(feature);
    }
  });
}

// 切换显示模式
function switchMode(mode) {
  currentMode = mode;
  refreshAllFills();
  renderCityMarkers();

  // 更新切换按钮图标
  const btn = document.getElementById('btn-mode-toggle');
  if (btn) {
    btn.innerHTML = mode === 'province' ? '🗺️' : '🏙️';
    btn.title = mode === 'province' ? '切换城市模式' : '切换省份模式';
  }
}

// ====== 高亮管理 ======

function clearHighlight() {
  if (highlightedMarker) {
    const el = highlightedMarker.getElement();
    if (el) {
      el.classList.remove('marker-highlighted');
    }
    highlightedMarker = null;
  }
  if (currentPopup && map.hasLayer(currentPopup)) {
    map.closePopup(currentPopup);
    currentPopup = null;
  }
  selectedCity = null;
}

// ====== 飞行动画到城市 ======

function flyToCity(city) {
  const lat = city.lat || city.latitude;
  const lng = city.lng || city.longitude;
  map.flyTo([lat, lng], Math.max(map.getZoom(), 8), {
    duration: 1.2
  });
}

// ====== 获取城市 GeoJSON feature ======

function getCityFeature(cityCode) {
  return cityGeoJSONFeatures.find(f => {
    const code = f.properties.adcode || f.properties.code;
    return String(code) === String(cityCode);
  });
}
