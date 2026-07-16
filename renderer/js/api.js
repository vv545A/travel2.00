/* ====== 足迹地图 —— API 兼容层 ======
 * 将 window.api 调用转换为 fetch() HTTP 请求
 * v2: 添加认证支持，自动注入 Authorization header
 */

// ====== 认证感知的 fetch 包装器 ======

function authFetch(url, options) {
  options = options || {};
  var headers = options.headers || {};

  // 自动注入 token
  var token = window.Auth && window.Auth.getToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  options.headers = headers;

  return fetch(url, options).then(function (res) {
    if (res.status === 401) {
      // Token 过期或无效 → 清除并触发重新登录
      if (window.Auth) {
        window.Auth.clearToken();
        window.Auth.currentUser = null;
      }
      // 如果封面还在，显示登录按钮
      if (window.SplashUI) {
        window.SplashUI.showLoginButton();
      }
      throw new Error('AUTH_REQUIRED');
    }
    return res;
  });
}

// ====== Auth API ======

window.api = {
  // ====== 认证相关 ======

  async login(email, password) {
    var res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    return res.json();
  },

  async register(email, password, confirmPassword) {
    var res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, confirmPassword: confirmPassword })
    });
    return res.json();
  },

  async verifyToken() {
    var res = await authFetch('/api/auth/verify');
    return res.json();
  },

  async getGithubUrl() {
    var res = await fetch('/api/auth/github-url');
    return res.json();
  },

  // ====== 数据操作 ======

  // 读取打卡记录
  async readRecords() {
    var res = await authFetch('/api/records');
    return res.json();
  },

  // 写入打卡记录
  async writeRecords(data) {
    var res = await authFetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // 选择文件夹
  async selectFolder() {
    var res = await fetch('/api/select-folder', { method: 'POST' });
    var data = await res.json();
    return data.path;
  },

  // 选择图片文件（多选）
  async selectImages() {
    var res = await fetch('/api/select-images', { method: 'POST' });
    var data = await res.json();
    return data.files || [];
  },

  // 复制图片到存储目录
  async copyImage(sourcePath, targetDir, fileName) {
    var res = await authFetch('/api/copy-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: sourcePath, targetDir: targetDir, fileName: fileName })
    });
    var data = await res.json();
    return data.fileName || null;
  },

  // 获取图片完整路径（用于显示）
  async getImagePath(fileName) {
    return '/api/image?name=' + encodeURIComponent(fileName);
  },

  // 删除图片
  async deleteImage(fileName) {
    var res = await authFetch('/api/image?name=' + encodeURIComponent(fileName), {
      method: 'DELETE'
    });
    return res.json();
  },

  // 在文件管理器中打开图片文件夹
  async openPhotosFolder() {
    var res = await authFetch('/api/open-folder', { method: 'POST' });
    return res.json();
  },

  // 读取 data/ 目录下的数据文件
  async readDataFile(fileName) {
    var res = await fetch('/api/data-file?name=' + encodeURIComponent(fileName));
    if (!res.ok) return null;
    return res.json();
  },

  // 上传图片（base64 格式）
  async uploadImages(imageDataUrls, targetDir) {
    var res = await authFetch('/api/upload-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: imageDataUrls, targetDir: targetDir })
    });
    var data = await res.json();
    return data.fileNames || [];
  }
};
