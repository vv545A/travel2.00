/* ====== 足迹地图 —— 本地服务器 ====== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 认证模块
const auth = require('./server/auth');

const PORT = 27286;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'user-data');
const RENDERER_DIR = path.join(ROOT_DIR, 'renderer');

// MIME 类型
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

// ====== 辅助函数 ======

function readRecordsFile(userId) {
  const recordsPath = path.join(auth.getUserDir(userId), 'records.json');
  try {
    if (fs.existsSync(recordsPath)) {
      const data = JSON.parse(fs.readFileSync(recordsPath, 'utf-8'));
      if (data.photosDir && !fs.existsSync(data.photosDir)) {
        console.log('[数据] photosDir 路径无效，已重置');
        data.photosDir = '';
      }
      return data;
    }
  } catch (err) { /* ignore */ }
  return { version: '1.0', photosDir: '', defaultColor: '#F7D6E0', records: [] };
}

function writeRecordsFile(userId, data) {
  const userDir = auth.getUserDir(userId);
  fs.writeFileSync(
    path.join(userDir, 'records.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res, message, statusCode = 500, code = 'ERROR') {
  sendJSON(res, { error: message, code }, statusCode);
}

// ====== Auth 中间件 ======

function parseAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return auth.verifyToken(authHeader.substring(7));
}

function requireAuth(req, res) {
  const userId = parseAuthToken(req);
  if (!userId) {
    sendJSON(res, { error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    return null;
  }
  return userId;
}

// ====== 静态文件服务 ======

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (err) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

// ====== 读取请求体 ======

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// ====== API 路由 ======

async function handleAPI(req, res, urlObj) {
  const method = req.method;
  const pathname = urlObj.pathname;

  // ========== Auth 路由（无需登录） ==========

  // POST /api/auth/register - 注册
  if (method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    if (!body) return sendError(res, '请求格式错误', 400, 'VALIDATION');

    const { email, password, confirmPassword } = body;

    // 校验邮箱
    if (!email || !email.includes('@')) {
      return sendError(res, '请输入有效的邮箱地址', 400, 'VALIDATION');
    }
    // 校验密码
    if (!password || password.length < 6) {
      return sendError(res, '密码长度不能少于 6 位', 400, 'VALIDATION');
    }
    // 校验确认密码
    if (password !== confirmPassword) {
      return sendError(res, '两次输入的密码不一致', 400, 'VALIDATION');
    }
    // 检查邮箱是否已注册
    if (auth.findUserByEmail(email)) {
      return sendError(res, '该邮箱已被注册', 400, 'DUPLICATE');
    }

    // 创建用户
    const user = auth.createUser({ email, password });

    // 生成 token，自动登录
    const token = auth.generateToken(user.id);

    console.log('[认证] 新用户注册:', user.email, user.id);
    return sendJSON(res, {
      token,
      user: { id: user.id, email: user.email }
    });
  }

  // POST /api/auth/login - 邮箱登录
  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    if (!body) return sendError(res, '请求格式错误', 400, 'VALIDATION');

    const { email, password } = body;

    if (!email || !password) {
      return sendError(res, '请输入邮箱和密码', 400, 'VALIDATION');
    }

    const user = auth.findUserByEmail(email);
    if (!user) {
      return sendError(res, '邮箱未注册', 401, 'NOT_FOUND');
    }

    if (!user.passwordHash || !user.passwordSalt) {
      return sendError(res, '该账号未设置密码，请使用 GitHub 登录', 401, 'NO_PASSWORD');
    }

    if (!auth.verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return sendError(res, '密码错误', 401, 'WRONG_PASSWORD');
    }

    const token = auth.generateToken(user.id);

    console.log('[认证] 用户登录:', user.email);
    return sendJSON(res, {
      token,
      user: { id: user.id, email: user.email }
    });
  }

  // GET /api/auth/verify - 验证 token
  if (method === 'GET' && pathname === '/api/auth/verify') {
    const userId = parseAuthToken(req);
    if (!userId) {
      return sendJSON(res, { valid: false });
    }
    const user = auth.findUserById(userId);
    if (!user) {
      return sendJSON(res, { valid: false });
    }
    return sendJSON(res, {
      valid: true,
      user: { id: user.id, email: user.email, githubUsername: user.githubUsername }
    });
  }

  // GET /api/auth/github-url - 获取 GitHub OAuth URL
  if (method === 'GET' && pathname === '/api/auth/github-url') {
    const result = auth.getGithubAuthUrl();
    if (!result) {
      return sendError(res, 'GitHub OAuth 未配置，请在 user-data/github-config.json 中设置 clientId 和 clientSecret', 400, 'GITHUB_NOT_CONFIGURED');
    }
    return sendJSON(res, { url: result.url });
  }

  // GET /api/auth/github - GitHub OAuth 回调
  if (method === 'GET' && pathname === '/api/auth/github') {
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');

    if (!code) {
      return sendError(res, '缺少授权码', 400);
    }
    if (!auth.verifyGithubState(state)) {
      return sendError(res, 'state 验证失败，请重试', 400);
    }

    try {
      const accessToken = await auth.exchangeGithubCode(code);
      const githubUser = await auth.getGithubUser(accessToken);

      // 查找或创建用户
      let user = auth.findUserByGithubId(githubUser.id);
      if (!user) {
        user = auth.createUser({
          email: githubUser.email,
          githubId: githubUser.id,
          githubUsername: githubUser.username
        });
        console.log('[认证] GitHub 新用户注册:', user.githubUsername, user.id);
      } else {
        console.log('[认证] GitHub 用户登录:', user.githubUsername);
      }

      const token = auth.generateToken(user.id);

      // 重定向到首页，通过 hash 传递 token
      res.writeHead(302, {
        'Location': '/?token=' + token,
        'Cache-Control': 'no-cache'
      });
      return res.end();
    } catch (err) {
      console.error('[GitHub OAuth] 错误:', err.message);
      return sendError(res, 'GitHub 登录失败: ' + err.message, 500);
    }
  }

  // GET /api/auth/me - 获取当前用户信息
  if (method === 'GET' && pathname === '/api/auth/me') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const user = auth.findUserById(userId);
    if (!user) return sendError(res, '用户不存在', 404);
    return sendJSON(res, {
      user: { id: user.id, email: user.email, githubUsername: user.githubUsername, createdAt: user.createdAt }
    });
  }

  // ========== 以下路由全部需要登录 ==========

  // GET /api/records - 读取打卡记录
  if (method === 'GET' && pathname === '/api/records') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const data = readRecordsFile(userId);
    return sendJSON(res, data);
  }

  // POST /api/records - 写入打卡记录
  if (method === 'POST' && pathname === '/api/records') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const body = await readBody(req);
    if (!body) return sendError(res, 'Invalid JSON');
    writeRecordsFile(userId, body);
    return sendJSON(res, { success: true });
  }

  // GET /api/data-file?name=xxx - 读取 data/ 目录下的文件（无需登录，共享数据）
  if (method === 'GET' && pathname === '/api/data-file') {
    const fileName = urlObj.searchParams.get('name');
    if (!fileName) return sendError(res, 'Missing name parameter', 400);
    const filePath = path.join(ROOT_DIR, 'data', fileName);
    if (!filePath.startsWith(path.join(ROOT_DIR, 'data'))) {
      return sendError(res, 'Forbidden', 403);
    }
    return serveStaticFile(res, filePath);
  }

  // POST /api/select-folder - 打开文件夹选择对话框（无需登录）
  if (method === 'POST' && pathname === '/api/select-folder') {
    console.log('[API] select-folder 请求收到');
    try {
      const outFile = path.join(os.tmpdir(), 'travel-map-folder-result.txt');
      const psScript = `Add-Type -AssemblyName System.Windows.Forms;\n[System.Windows.Forms.Application]::EnableVisualStyles();\n$form = New-Object System.Windows.Forms.Form;\n$form.TopMost = $true;\n$form.ShowInTaskbar = $false;\n$form.StartPosition = 'CenterScreen';\n$form.Width = 1;\n$form.Height = 1;\n$form.Opacity = 0;\n$form.Show();\n$form.Activate();\n$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;\n$dialog.Description = '选择图片存储文件夹';\n$dialog.RootFolder = 'MyComputer';\n$result = $dialog.ShowDialog($form);\n$form.Close();\nif ($result -eq 'OK') { [System.IO.File]::WriteAllText('${outFile.replace(/\\/g, '/')}', $dialog.SelectedPath, [System.Text.Encoding]::UTF8) }`;
      const tmpFile = path.join(os.tmpdir(), 'travel-map-sel-folder.ps1');
      fs.writeFileSync(tmpFile, '﻿' + psScript, { encoding: 'utf-8' });
      console.log('[API] 执行 PowerShell 文件夹选择...');
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile.replace(/\\/g, '/')}"`,
        { encoding: 'utf-8', timeout: 60000 }
      );
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
      let result = null;
      if (fs.existsSync(outFile)) {
        result = fs.readFileSync(outFile, 'utf-8').trim();
        try { fs.unlinkSync(outFile); } catch (e) { /* ignore */ }
      }
      console.log('[API] select-folder 结果:', result || '(取消)');
      sendJSON(res, { path: result || null });
    } catch (err) {
      console.error('[API] select-folder 错误:', err.message);
      sendJSON(res, { path: null });
    }
    return;
  }

  // POST /api/select-images - 打开图片多选对话框（无需登录）
  if (method === 'POST' && pathname === '/api/select-images') {
    console.log('[API] select-images 请求收到');
    try {
      const outFile = path.join(os.tmpdir(), 'travel-map-images-result.txt');
      const psScript = `Add-Type -AssemblyName System.Windows.Forms;\n[System.Windows.Forms.Application]::EnableVisualStyles();\n$form = New-Object System.Windows.Forms.Form;\n$form.TopMost = $true;\n$form.ShowInTaskbar = $false;\n$form.StartPosition = 'CenterScreen';\n$form.Width = 1;\n$form.Height = 1;\n$form.Opacity = 0;\n$form.Show();\n$form.Activate();\n$dialog = New-Object System.Windows.Forms.OpenFileDialog;\n$dialog.Title = '选择游记图片';\n$dialog.Filter = '图片文件|*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp';\n$dialog.Multiselect = $true;\n$result = $dialog.ShowDialog($form);\n$form.Close();\nif ($result -eq 'OK') { [System.IO.File]::WriteAllText('${outFile.replace(/\\/g, '/')}', ($dialog.FileNames -join '|'), [System.Text.Encoding]::UTF8) }`;
      const tmpFile = path.join(os.tmpdir(), 'travel-map-sel-images.ps1');
      fs.writeFileSync(tmpFile, '﻿' + psScript, { encoding: 'utf-8' });
      console.log('[API] 执行 PowerShell 文件选择...');
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile.replace(/\\/g, '/')}"`,
        { encoding: 'utf-8', timeout: 60000 }
      );
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
      let result = null;
      if (fs.existsSync(outFile)) {
        result = fs.readFileSync(outFile, 'utf-8').trim();
        try { fs.unlinkSync(outFile); } catch (e) { /* ignore */ }
      }
      console.log('[API] select-images 结果:', result || '(取消)');
      const files = result ? result.split('|') : [];
      sendJSON(res, { files });
    } catch (err) {
      console.error('[API] select-images 错误:', err.message);
      sendJSON(res, { files: [] });
    }
    return;
  }

  // POST /api/copy-image - 复制图片到存储目录
  if (method === 'POST' && pathname === '/api/copy-image') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const body = await readBody(req);
    if (!body) return sendError(res, 'Invalid JSON');
    try {
      const { sourcePath, targetDir, fileName } = body;
      const finalTargetDir = targetDir || auth.getUserPhotosDir(userId);
      if (!fs.existsSync(finalTargetDir)) {
        fs.mkdirSync(finalTargetDir, { recursive: true });
      }
      let finalPath = path.join(finalTargetDir, fileName);
      let counter = 1;
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      while (fs.existsSync(finalPath)) {
        finalPath = path.join(finalTargetDir, `${baseName}_${counter}${ext}`);
        counter++;
      }
      fs.copyFileSync(sourcePath, finalPath);
      sendJSON(res, { fileName: path.basename(finalPath) });
    } catch (err) {
      sendError(res, err.message);
    }
    return;
  }

  // GET /api/image?name=xxx - 获取图片
  if (method === 'GET' && pathname === '/api/image') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const fileName = urlObj.searchParams.get('name');
    if (!fileName) return sendError(res, 'Missing name', 400);

    const photosDir = auth.getUserPhotosDir(userId);
    let fullPath = path.join(photosDir, fileName);

    if (!fs.existsSync(fullPath)) {
      // 兼容旧图片路径
      const legacyPath = path.join(DATA_DIR, 'photos', fileName);
      if (fs.existsSync(legacyPath)) {
        return serveStaticFile(res, legacyPath);
      }
    }

    if (fs.existsSync(fullPath)) {
      return serveStaticFile(res, fullPath);
    }
    res.writeHead(404);
    return res.end('Image not found');
  }

  // POST /api/upload-images - 上传 base64 图片
  if (method === 'POST' && pathname === '/api/upload-images') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const body = await readBody(req);
    if (!body) return sendError(res, 'Invalid JSON');
    try {
      const { images, targetDir } = body;
      const dir = targetDir || auth.getUserPhotosDir(userId);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const savedNames = [];
      images.forEach(dataUrl => {
        const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 6);
          const fileName = `photo_${timestamp}_${random}.${ext}`;
          const filePath = path.join(dir, fileName);
          fs.writeFileSync(filePath, buffer);
          savedNames.push(fileName);
        }
      });
      sendJSON(res, { fileNames: savedNames });
    } catch (err) {
      sendError(res, err.message);
    }
    return;
  }

  // DELETE /api/image?name=xxx - 删除图片
  if (method === 'DELETE' && pathname === '/api/image') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const fileName = urlObj.searchParams.get('name');
    if (!fileName) return sendError(res, 'Missing name', 400);

    const photosDir = auth.getUserPhotosDir(userId);
    const fullPath = path.join(photosDir, fileName);

    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      sendJSON(res, { success: true });
    } catch (err) {
      sendError(res, err.message);
    }
    return;
  }

  // POST /api/open-folder - 打开图片文件夹
  if (method === 'POST' && pathname === '/api/open-folder') {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const photosDir = auth.getUserPhotosDir(userId);
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
    }
    const { exec } = require('child_process');
    exec(`explorer "${photosDir}"`);
    sendJSON(res, { success: true });
    return;
  }

  // 404
  sendError(res, 'API Not Found', 404);
}

// ====== 主服务器 ======

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);

  // API 请求
  if (urlObj.pathname.startsWith('/api/')) {
    return handleAPI(req, res, urlObj);
  }

  // 静态文件请求
  let filePath;

  if (urlObj.pathname === '/' || urlObj.pathname === '') {
    filePath = path.join(RENDERER_DIR, 'index.html');
  } else {
    // 安全：防止路径穿越
    const safePath = path.normalize(urlObj.pathname).replace(/^[/\\]/, '');
    filePath = path.join(ROOT_DIR, safePath);
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
  }

  serveStaticFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('🗺️  足迹地图服务器已启动');
  console.log('   地址: http://localhost:' + PORT);
  console.log('   按 Ctrl+C 停止服务器');
  console.log('');

  // 自动打开浏览器
  const { exec } = require('child_process');
  const url = 'http://localhost:' + PORT;
  exec('start "" "' + url + '"');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ 端口 ' + PORT + ' 已被占用，请先关闭占用该端口的程序');
    console.error('   或者修改 server.js 中的 PORT 变量');
  } else {
    console.error('❌ 服务器启动失败:', err.message);
  }
  process.exit(1);
});
