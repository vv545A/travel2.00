/* ====== 一站式数据修复 v2 ======
 * 1. GCJ-02 → WGS-84 坐标转换
 * 2. 去掉城市名称"市"后缀
 * 3. 直辖市/港澳合并为单一记录
 * 4. 添加台湾
 */

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');

// ====== GCJ-02 → WGS-84 ======
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function gcj02ToWgs84(lng, lat) {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) {
    return [lng, lat];
  }
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatF = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  const dLngF = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lng - dLngF, lat - dLatF];
}

function convertCoords(coords) {
  if (typeof coords[0] === 'number') return gcj02ToWgs84(coords[0], coords[1]);
  return coords.map(c => convertCoords(c));
}

function convertGeoJSON(geoJSON) {
  const conv = JSON.parse(JSON.stringify(geoJSON));
  conv.features.forEach(f => {
    if (f.geometry && f.geometry.coordinates) {
      f.geometry.coordinates = convertCoords(f.geometry.coordinates);
    }
    if (f.properties && f.properties.center && Array.isArray(f.properties.center)) {
      f.properties.center = gcj02ToWgs84(f.properties.center[0], f.properties.center[1]);
    }
    if (f.properties && f.properties.centroid && Array.isArray(f.properties.centroid)) {
      f.properties.centroid = gcj02ToWgs84(f.properties.centroid[0], f.properties.centroid[1]);
    }
  });
  return conv;
}

// ====== 省会名称 ======
const CAPITAL_NAMES = new Set([
  '北京','天津','上海','重庆',
  '石家庄','太原','呼和浩特','沈阳','长春','哈尔滨',
  '南京','杭州','合肥','福州','南昌','济南',
  '郑州','武汉','长沙','广州','南宁','海口',
  '成都','贵阳','昆明','拉萨','西安','兰州',
  '西宁','银川','乌鲁木齐',
  '香港','澳门','台北'
]);

// 直辖市+特别行政区：合并为单一记录（去掉所有区级数据）
const MERGE_REGIONS = {
  '110000': { name: '北京',   provinceName: '北京市' },
  '120000': { name: '天津',   provinceName: '天津市' },
  '310000': { name: '上海',   provinceName: '上海市' },
  '500000': { name: '重庆',   provinceName: '重庆市' },
  '810000': { name: '香港',   provinceName: '香港特别行政区' },
  '820000': { name: '澳门',   provinceName: '澳门特别行政区' },
};

// ====== 主流程 ======
console.log('🔧 数据修复 v2 开始...\n');

// 1. 加载原始数据
console.log('📦 加载原始数据...');
const provincesRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'china-provinces.geojson'), 'utf-8'));
const citiesRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'china-cities.geojson'), 'utf-8'));

// 2. GCJ-02 → WGS-84 转换
console.log('📦 坐标转换 (GCJ-02 → WGS-84)...');
const provincesWGS = convertGeoJSON(provincesRaw);
const citiesWGS = convertGeoJSON(citiesRaw);
console.log(`  ✓ 省份: ${provincesWGS.features.length} 个`);
console.log(`  ✓ 城市区域: ${citiesWGS.features.length} 个`);

// 3. 提取城市点位
console.log('📦 提取城市点位...');
const allPoints = [];
const mergeCodes = new Set(Object.keys(MERGE_REGIONS));

citiesWGS.features.forEach(f => {
  const props = f.properties;
  const name = props.name;
  const adcode = String(props.adcode);
  const parentCode = props.parent ? String(props.parent.adcode) : adcode.substring(0, 2) + '0000';

  // 跳过合并区域的区级数据
  if (mergeCodes.has(parentCode)) return;

  // 使用 center 属性
  if (!props.center || !Array.isArray(props.center) || props.center.length !== 2) return;
  const [lng, lat] = props.center;
  if (lat == null || lng == null) return;

  // 获取省份名
  const pf = provincesWGS.features.find(f2 => String(f2.properties.adcode) === parentCode);
  const provinceName = pf ? pf.properties.name : '';

  // 去掉"市"后缀
  const cleanName = name.replace(/市$/, '');

  allPoints.push({
    cityName: cleanName,
    cityCode: adcode,
    provinceName: provinceName,
    provinceCode: parentCode,
    lat, lng,
    isCapital: CAPITAL_NAMES.has(cleanName),
    level: CAPITAL_NAMES.has(cleanName) ? 'capital' : 'city'
  });
});

// 4. 为合并区域创建统一点位
console.log('📦 处理直辖市/特别行政区...');
Object.entries(MERGE_REGIONS).forEach(([code, info]) => {
  const pf = provincesWGS.features.find(f => String(f.properties.adcode) === code);
  if (!pf) return;

  let lat, lng;
  if (pf.properties.center && Array.isArray(pf.properties.center)) {
    [lng, lat] = pf.properties.center;
  } else if (pf.geometry) {
    // 取第一个坐标点
    const coords = JSON.parse(JSON.stringify(pf.geometry.coordinates));
    function firstPoint(c) {
      if (typeof c[0] === 'number') return c;
      return firstPoint(c[0]);
    }
    [lng, lat] = firstPoint(coords);
  }
  if (lat == null || lng == null) return;

  allPoints.push({
    cityName: info.name,
    cityCode: code,
    provinceName: info.provinceName,
    provinceCode: code,
    lat, lng,
    isCapital: true,
    level: 'capital'
  });
});

// 5. 添加台湾
console.log('📦 添加台湾...');
const twProvince = provincesWGS.features.find(f => String(f.properties.adcode) === '710000');
if (!twProvince) {
  // 台湾 GeoJSON 不存在，手动创建基础数据
  // 台湾近似中心点 (WGS-84)
  const twCenterWgs = [120.9605, 23.6978];
  allPoints.push({
    cityName: '台北',
    cityCode: '710000',
    provinceName: '台湾省',
    provinceCode: '710000',
    lat: twCenterWgs[1],
    lng: twCenterWgs[0],
    isCapital: true,
    level: 'capital'
  });
  console.log('  ⚠ 台湾省GeoJSON边界数据缺失，使用近似坐标');
} else {
  // 如果台湾边界存在
  let lat, lng;
  if (twProvince.properties.center) {
    [lng, lat] = twProvince.properties.center;
  }
  allPoints.push({
    cityName: '台北',
    cityCode: '710000',
    provinceName: '台湾省',
    provinceCode: '710000',
    lat: lat || 23.6978,
    lng: lng || 120.9605,
    isCapital: true,
    level: 'capital'
  });
}

// 6. 保存
console.log('📦 保存数据...');
fs.writeFileSync(path.join(DATA_DIR, 'china-provinces.geojson'), JSON.stringify(provincesWGS));
fs.writeFileSync(path.join(DATA_DIR, 'china-cities.geojson'), JSON.stringify(citiesWGS));
fs.writeFileSync(path.join(DATA_DIR, 'china-city-points.json'), JSON.stringify(allPoints, null, 2));

const capitals = allPoints.filter(p => p.isCapital);
const regular = allPoints.filter(p => !p.isCapital);
console.log(`\n✅ 数据修复完成！`);
console.log(`   总城市: ${allPoints.length}`);
console.log(`   省会/直辖市/特区: ${capitals.length}`);
console.log(`   普通地级市: ${regular.length}`);

console.log(`\n📍 省会/直辖市/特区列表:`);
capitals.forEach(c => console.log(`   ● ${c.cityName} (${c.provinceName})`));

// 特殊检查
console.log(`\n🔍 合并区域验证:`);
Object.entries(MERGE_REGIONS).forEach(([code, info]) => {
  const pts = allPoints.filter(p => p.provinceCode === code);
  console.log(`   ${info.name}: ${pts.length}个点位 (应只有1个) ${pts.length === 1 ? '✅' : '❌'}`);
});
const tw = allPoints.filter(p => p.provinceCode === '710000');
console.log(`   台湾: ${tw.length}个点位 ${tw.length >= 1 ? '✅' : '❌'}`);

// 检查"市"后缀
const shiSuffix = allPoints.filter(p => p.cityName.endsWith('市'));
console.log(`   "市"后缀剩余: ${shiSuffix.length}个 ${shiSuffix.length === 0 ? '✅' : '⚠️'}`);
if (shiSuffix.length > 0) {
  shiSuffix.slice(0, 5).forEach(p => console.log(`      ${p.cityName}`));
}
