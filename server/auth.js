/* ====== 足迹地图 —— 后端认证模块 ======
 * 纯 Node.js 内置模块实现，零额外依赖：
 * - crypto.randomUUID() → 用户 ID
 * - crypto.scryptSync()  → 密码哈希
 * - crypto.createHmac()  → JWT 签名
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'user-data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GITHUB_CONFIG_FILE = path.join(DATA_DIR, 'github-config.json');

// JWT 密钥（用户可通过环境变量覆盖）
const JWT_SECRET = process.env.JWT_SECRET || 'travel-map-local-secret-2026';
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

// ====== 用户数据文件读写 ======

function readUsersFile() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { version: '1.0', users: [] };
}

function writeUsersFile(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ====== 用户查询 ======

function findUserByEmail(email) {
  const data = readUsersFile();
  const normalized = email.toLowerCase().trim();
  return data.users.find(u => u.email === normalized) || null;
}

function findUserByGithubId(githubId) {
  const data = readUsersFile();
  return data.users.find(u => u.githubId === String(githubId)) || null;
}

function findUserById(userId) {
  const data = readUsersFile();
  return data.users.find(u => u.id === userId) || null;
}

// ====== 用户创建 ======

function createUser({ email, password, githubId, githubUsername }) {
  const data = readUsersFile();

  const user = {
    id: crypto.randomUUID(),
    email: email ? email.toLowerCase().trim() : null,
    passwordHash: null,
    passwordSalt: null,
    githubId: githubId ? String(githubId) : null,
    githubUsername: githubUsername || null,
    createdAt: new Date().toISOString()
  };

  // 如果提供了密码，进行哈希
  if (password) {
    const { hash, salt } = hashPassword(password);
    user.passwordHash = hash;
    user.passwordSalt = salt;
  }

  data.users.push(user);
  writeUsersFile(data);

  // 创建用户专属数据目录
  const userDir = path.join(DATA_DIR, user.id);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  return user;
}

// ====== 密码哈希（scrypt） ======

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(plain, salt, hash) {
  try {
    const computed = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch (e) {
    return false;
  }
}

// ====== JWT 签发与验证 ======

function base64urlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function generateToken(userId) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + TOKEN_EXPIRY_MS) / 1000)
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(headerB64 + '.' + payloadB64)
    .digest('base64url');

  return headerB64 + '.' + payloadB64 + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;

    // 验证签名
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(headerB64 + '.' + payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    // 解析 payload
    const payload = JSON.parse(base64urlDecode(payloadB64));

    // 检查过期
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload.userId;
  } catch (e) {
    return null;
  }
}

// ====== GitHub OAuth ======

function readGithubConfig() {
  try {
    if (fs.existsSync(GITHUB_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(GITHUB_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return null;
}

function getGithubAuthUrl() {
  const config = readGithubConfig();
  if (!config || !config.clientId) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: 'http://localhost:27286/api/auth/github',
    scope: 'read:user user:email',
    state: crypto.randomBytes(16).toString('hex')
  });

  // 存储 state 用于验证（简化实现：存在内存中）
  if (!getGithubAuthUrl._states) {
    getGithubAuthUrl._states = {};
  }
  getGithubAuthUrl._states[params.get('state')] = Date.now();

  return {
    url: 'https://github.com/login/oauth/authorize?' + params.toString(),
    state: params.get('state')
  };
}

function verifyGithubState(state) {
  if (!getGithubAuthUrl._states) return false;
  const ts = getGithubAuthUrl._states[state];
  if (!ts) return false;
  // state 10 分钟内有效
  if (Date.now() - ts > 10 * 60 * 1000) {
    delete getGithubAuthUrl._states[state];
    return false;
  }
  delete getGithubAuthUrl._states[state];
  return true;
}

function exchangeGithubCode(code) {
  return new Promise((resolve, reject) => {
    const config = readGithubConfig();
    if (!config || !config.clientId || !config.clientSecret) {
      return reject(new Error('github-config 未配置'));
    }

    const postData = JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: 'http://localhost:27286/api/auth/github'
    });

    const req = https.request({
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'travel-record-app'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            reject(new Error(result.error_description || result.error));
          } else {
            resolve(result.access_token);
          }
        } catch (e) {
          reject(new Error('解析 GitHub 响应失败'));
        }
      });
    });

    req.on('error', (e) => reject(new Error('连接 GitHub 失败: ' + e.message)));
    req.write(postData);
    req.end();
  });
}

function getGithubUser(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json',
        'User-Agent': 'travel-record-app'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const user = JSON.parse(body);
          if (user.message) {
            reject(new Error(user.message));
          } else {
            resolve({
              id: String(user.id),
              username: user.login,
              email: user.email || null
            });
          }
        } catch (e) {
          reject(new Error('解析 GitHub 用户信息失败'));
        }
      });
    });

    req.on('error', (e) => reject(new Error('连接 GitHub API 失败: ' + e.message)));
    req.end();
  });
}

// ====== 用户专属路径 ======

function getUserDir(userId) {
  const dir = path.join(DATA_DIR, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getUserPhotosDir(userId) {
  // 读取用户 records.json 检查自定义 photosDir
  const recordsPath = path.join(getUserDir(userId), 'records.json');
  try {
    if (fs.existsSync(recordsPath)) {
      const data = JSON.parse(fs.readFileSync(recordsPath, 'utf-8'));
      if (data.photosDir && fs.existsSync(data.photosDir)) {
        return data.photosDir;
      }
    }
  } catch (e) { /* ignore */ }

  const defaultDir = path.join(DATA_DIR, userId, 'photos');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
}

// ====== 导出 ======

module.exports = {
  // 用户管理
  readUsersFile,
  writeUsersFile,
  findUserByEmail,
  findUserByGithubId,
  findUserById,
  createUser,

  // 密码
  hashPassword,
  verifyPassword,

  // JWT
  generateToken,
  verifyToken,

  // GitHub OAuth
  readGithubConfig,
  getGithubAuthUrl,
  verifyGithubState,
  exchangeGithubCode,
  getGithubUser,

  // 路径
  getUserDir,
  getUserPhotosDir,
  DATA_DIR
};
