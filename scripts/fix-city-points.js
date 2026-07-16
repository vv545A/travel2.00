/* ====== 修复城市点位数据 —— 省会标记 + 直辖市处理 ====== */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 已知省会城市名（无"市"后缀，用于匹配）
const CAPITAL_NAMES = new Set([
  '北京', '天津', '上海', '重庆',
  '石家庄', '太原', '呼和浩特', '沈阳', '长春', '哈尔滨',
  '南京', '杭州', '合肥', '福州', '南昌', '济南',
  '郑州', '武汉', '长沙', '广州', '南宁', '海口',
  '成都', '贵阳', '昆明', '拉萨', '西安', '兰州',
  '西宁', '银川', '乌鲁木齐',
  '香港', '澳门', '台北'
]);

// 直辖市代码
const MUNICIPALITIES = new Set(['110000', '120000', '310000', '500000']);

function isCapital(cityName, provinceCode) {
  // 直辖市：整个城市就是"省会"
  if (MUNICIPALITIES.has(provinceCode)) {
    // 取该直辖市下第一个/中心区作为代表
    return cityName.includes('东城') || cityName.includes('黄浦') ||
           cityName.includes('和平') || cityName.includes('渝中');
  }
  // 常规省份：匹配已知省会名（去掉"市"后缀）
  const cleanName = cityName.replace(/市$/, '');
  return CAPITAL_NAMES.has(cleanName);
}

// 加载现有数据
const pointsPath = path.join(DATA_DIR, 'china-city-points.json');
const points = JSON.parse(fs.readFileSync(pointsPath, 'utf-8'));

// 加载省级数据获取直辖市中心
const provincesPath = path.join(DATA_DIR, 'china-provinces.geojson');
const provinces = JSON.parse(fs.readFileSync(provincesPath, 'utf-8'));

// 计算多边形中心
function getPolygonCenter(coordinates) {
  let allCoords = [];
  function flattenCoords(coords) {
    if (typeof coords[0][0] === 'number') {
      allCoords.push(coords);
    } else if (Array.isArray(coords[0])) {
      coords.forEach(c => flattenCoords(c));
    }
  }
  flattenCoords(coordinates);
  if (allCoords.length === 0) return null;
  let sumLng = 0, sumLat = 0;
  allCoords.forEach(c => { sumLng += c[0]; sumLat += c[1]; });
  return { lng: sumLng / allCoords.length, lat: sumLat / allCoords.length };
}

// 修复省会标记（常规省份）
let capitalCount = 0;
points.forEach(p => {
  // 跳过直辖市的区级数据（后续单独处理直辖市）
  if (MUNICIPALITIES.has(p.provinceCode)) {
    p.isCapital = false;
    p.level = 'city';
    return;
  }
  const cleanName = p.cityName.replace(/市$/, '');
  if (CAPITAL_NAMES.has(cleanName)) {
    p.isCapital = true;
    p.level = 'capital';
    capitalCount++;
  }
});

// 为直辖市创建统一入口（使用省级中心坐标和城市名）
const MUNI_NAMES = {
  '110000': '北京',
  '120000': '天津',
  '310000': '上海',
  '500000': '重庆'
};

MUNICIPALITIES.forEach(code => {
  const provinceFeature = provinces.features.find(
    f => String(f.properties.adcode) === code
  );
  if (!provinceFeature) return;

  const cityName = MUNI_NAMES[code];
  if (provinceFeature.geometry) {
    const center = getPolygonCenter(provinceFeature.geometry.coordinates);
    if (center) {
      points.push({
        cityName: cityName,
        cityCode: code,
        provinceName: provinceFeature.properties.name,
        provinceCode: code,
        lat: center.lat,
        lng: center.lng,
        isCapital: true,
        level: 'capital'
      });
      capitalCount++;
    }
  }
});

// 保存修复后的数据
fs.writeFileSync(pointsPath, JSON.stringify(points, null, 2));
console.log('✅ 城市点位数据修复完成');
console.log(`   - 总城市数: ${points.length}`);
console.log(`   - 省会/直辖市: ${capitalCount} 个`);
console.log(`   - 普通地级市: ${points.length - capitalCount} 个`);

// 列出所有省会
console.log('\n省会城市列表:');
points.filter(p => p.isCapital).forEach(p => {
  console.log(`  ● ${p.cityName} (${p.provinceName})`);
});
