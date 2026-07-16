/* ====== 足迹地图 —— 全局配置 ====== */

// 马卡龙色系打卡配色板（12色）
const MACARON_COLORS = [
  { name: '樱花粉', value: '#FFB3BA' },
  { name: '杏橙',   value: '#FFDFBA' },
  { name: '奶油黄', value: '#FFFFBA' },
  { name: '薄荷绿', value: '#BAFFC9' },
  { name: '天蓝',   value: '#BAE1FF' },
  { name: '薰衣草紫', value: '#E8BAFF' },
  { name: '玫瑰粉', value: '#FFC8DD' },
  { name: '浅湖蓝', value: '#BDE0FE' },
  { name: '雾霾蓝', value: '#A7BED3' },
  { name: '香槟金', value: '#F1E0B0' },
  { name: '浅碧绿', value: '#C9E4DE' },
  { name: '蜜桃粉', value: '#F7D6E0' }
];

// 中国中心坐标
const CHINA_CENTER = [35.86, 104.19];

// 地图缩放范围
const MAP_MIN_ZOOM = 4;
const MAP_MAX_ZOOM = 12;
const MAP_DEFAULT_ZOOM = 5;

// 默认打卡颜色
const DEFAULT_COLOR_VALUE = '#F7D6E0';  // 蜜桃粉
const DEFAULT_COLOR_NAME = '蜜桃粉';

// 缩放阈值
const MIN_CITY_ZOOM = 6;       // 低于此级别完全不显示城市标记
const CAPITAL_ONLY_ZOOM = 7;   // 低于此级别只显示省会

// Leaflet 默认图标修复（webpack 环境下 leaflet 图标路径问题）
// 使用 DivIcon 代替默认 Icon，避免路径问题
const DEFAULT_ICON_SIZE = [10, 10];
const CAPITAL_ICON_SIZE = [14, 14];
