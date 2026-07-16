/* ====== 足迹地图 —— GeoJSON 数据下载脚本 ======
 * 从 DataV.GeoAtlas 下载中国省级 + 地级市边界数据
 * 运行方式：node scripts/download-geojson.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 中国所有省级行政区代码
const PROVINCE_CODES = [
  '110000', // 北京
  '120000', // 天津
  '130000', // 河北
  '140000', // 山西
  '150000', // 内蒙古
  '210000', // 辽宁
  '220000', // 吉林
  '230000', // 黑龙江
  '310000', // 上海
  '320000', // 江苏
  '330000', // 浙江
  '340000', // 安徽
  '350000', // 福建
  '360000', // 江西
  '370000', // 山东
  '410000', // 河南
  '420000', // 湖北
  '430000', // 湖南
  '440000', // 广东
  '450000', // 广西
  '460000', // 海南
  '500000', // 重庆
  '510000', // 四川
  '520000', // 贵州
  '530000', // 云南
  '540000', // 西藏
  '610000', // 陕西
  '620000', // 甘肃
  '630000', // 青海
  '640000', // 宁夏
  '650000', // 新疆
  '710000', // 台湾
  '810000', // 香港
  '820000'  // 澳门
];

// 下载函数
function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (redirectRes) => {
          let data = '';
          redirectRes.on('data', chunk => data += chunk);
          redirectRes.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('JSON 解析失败: ' + url));
            }
          });
        }).on('error', reject);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON 解析失败: ' + url));
        }
      });
    }).on('error', reject);
  });
}

// 计算多边形中心点
function getPolygonCenter(coordinates) {
  // 处理 MultiPolygon 和 Polygon
  let allCoords = [];

  function flattenCoords(coords) {
    if (typeof coords[0][0] === 'number') {
      // 这是一个坐标点 [lng, lat]
      allCoords.push(coords);
    } else if (Array.isArray(coords[0])) {
      coords.forEach(c => flattenCoords(c));
    }
  }

  flattenCoords(coordinates);

  if (allCoords.length === 0) return null;

  let sumLng = 0, sumLat = 0;
  allCoords.forEach(c => {
    sumLng += c[0];
    sumLat += c[1];
  });

  return {
    lng: sumLng / allCoords.length,
    lat: sumLat / allCoords.length
  };
}

// 判断是否为省会级别（在省份数据中标记）
function isProvinceCapital(cityName, provinceName) {
  const capitals = {
    '北京': '北京市', '天津': '天津市', '上海': '上海市', '重庆': '重庆市',
    '石家庄': '河北省', '太原': '山西省', '呼和浩特': '内蒙古自治区',
    '沈阳': '辽宁省', '长春': '吉林省', '哈尔滨': '黑龙江省',
    '南京': '江苏省', '杭州': '浙江省', '合肥': '安徽省',
    '福州': '福建省', '南昌': '江西省', '济南': '山东省',
    '郑州': '河南省', '武汉': '湖北省', '长沙': '湖南省',
    '广州': '广东省', '南宁': '广西壮族自治区', '海口': '海南省',
    '成都': '四川省', '贵阳': '贵州省', '昆明': '云南省',
    '拉萨': '西藏自治区', '西安': '陕西省', '兰州': '甘肃省',
    '西宁': '青海省', '银川': '宁夏回族自治区', '乌鲁木齐': '新疆维吾尔自治区',
    '台北': '台湾省', '香港': '香港特别行政区', '澳门': '澳门特别行政区'
  };
  return capitals[cityName] === provinceName || cityName.endsWith('辖区') || cityName === provinceName.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区/g, '');
}

async function main() {
  console.log('🗺️ 开始下载中国地图数据...\n');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // ====== 第1步：下载省级边界 ======
  console.log('📦 下载省级边界数据...');
  const chinaProvinces = await downloadJSON(
    'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'china-provinces.geojson'),
    JSON.stringify(chinaProvinces)
  );
  console.log(`  ✓ 省级边界: ${chinaProvinces.features.length} 个省份\n`);

  // ====== 第2步：下载地级市边界 + 提取城市点位 ======
  console.log('📦 下载地级市边界数据...');
  const allCityFeatures = [];
  const allCityPoints = [];

  for (let i = 0; i < PROVINCE_CODES.length; i++) {
    const code = PROVINCE_CODES[i];
    try {
      const url = `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`;
      const provinceData = await downloadJSON(url);

      const features = provinceData.features || [];
      allCityFeatures.push(...features);

      // 从地级市边界提取城市点位信息
      features.forEach(feature => {
        const props = feature.properties;
        const name = props.name;
        const adcode = props.adcode || props.code;

        if (feature.geometry && name) {
          const center = getPolygonCenter(feature.geometry.coordinates);
          if (center) {
            // 获取省份名称
            const provinceFeature = chinaProvinces.features.find(
              pf => String(pf.properties.adcode) === String(code)
            );
            const provinceName = provinceFeature ? provinceFeature.properties.name : '';

            allCityPoints.push({
              cityName: name,
              cityCode: String(adcode),
              provinceName: provinceName,
              provinceCode: String(code),
              lat: center.lat,
              lng: center.lng,
              isCapital: isProvinceCapital(name, provinceName),
              level: isProvinceCapital(name, provinceName) ? 'capital' : 'city'
            });
          }
        }
      });

      // 进度显示
      const pct = Math.round((i + 1) / PROVINCE_CODES.length * 100);
      process.stdout.write(`\r  进度: ${pct}% (${i + 1}/${PROVINCE_CODES.length})`);
    } catch (err) {
      console.error(`\n  ⚠ 下载失败: ${code} - ${err.message}`);
    }
  }
  console.log('\n  ✓ 地级市边界下载完成\n');

  // 保存地级市边界
  const cityBoundaryGeoJSON = {
    type: 'FeatureCollection',
    features: allCityFeatures
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'china-cities.geojson'),
    JSON.stringify(cityBoundaryGeoJSON)
  );
  console.log(`  ✓ 地级市边界: ${allCityFeatures.length} 个区域`);

  // 保存城市点位数据
  fs.writeFileSync(
    path.join(DATA_DIR, 'china-city-points.json'),
    JSON.stringify(allCityPoints, null, 2)
  );
  console.log(`  ✓ 城市点位: ${allCityPoints.length} 个城市`);
  console.log(`    - 省会: ${allCityPoints.filter(p => p.isCapital).length} 个`);
  console.log(`    - 普通地级市: ${allCityPoints.filter(p => !p.isCapital).length} 个\n`);

  console.log('✅ 地图数据下载完成！');
  console.log('数据文件位于: ' + DATA_DIR);
}

main().catch(console.error);
