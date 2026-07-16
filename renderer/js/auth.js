/* ====== 足迹地图 —— 前端认证模块 ====== */

(function () {
  'use strict';

  // ====== Auth 状态 ======
  var Auth = {
    currentUser: null
  };

  // ====== Token 管理 ======

  Auth.getToken = function () {
    try {
      return localStorage.getItem('travel-map-token') || null;
    } catch (e) {
      return null;
    }
  };

  Auth.setToken = function (token) {
    try {
      localStorage.setItem('travel-map-token', token);
    } catch (e) { /* ignore */ }
  };

  Auth.clearToken = function () {
    try {
      localStorage.removeItem('travel-map-token');
    } catch (e) { /* ignore */ }
  };

  Auth.isAuthenticated = function () {
    return !!Auth.getToken();
  };

  // ====== Token 验证 ======

  Auth.verify = async function () {
    var token = Auth.getToken();
    if (!token) return false;

    try {
      var res = await fetch('/api/auth/verify', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      if (data.valid) {
        Auth.currentUser = data.user;
        return true;
      } else {
        Auth.clearToken();
        Auth.currentUser = null;
        return false;
      }
    } catch (e) {
      return Auth.isAuthenticated(); // 网络错误时保留本地状态
    }
  };

  // ====== 登录 / 注册 API ======

  Auth.login = async function (email, password) {
    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await res.json();
      if (res.ok && data.token) {
        Auth.setToken(data.token);
        Auth.currentUser = data.user;
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || '登录失败' };
    } catch (e) {
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  Auth.register = async function (email, password, confirmPassword) {
    try {
      var res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, confirmPassword: confirmPassword })
      });
      var data = await res.json();
      if (res.ok && data.token) {
        Auth.setToken(data.token);
        Auth.currentUser = data.user;
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || '注册失败' };
    } catch (e) {
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  Auth.getGithubUrl = async function () {
    try {
      var res = await fetch('/api/auth/github-url');
      var data = await res.json();
      if (res.ok && data.url) {
        return { success: true, url: data.url };
      }
      return { success: false, error: data.error || '获取 GitHub 授权链接失败' };
    } catch (e) {
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  // ====== 退出登录 ======

  Auth.logout = function () {
    Auth.clearToken();
    Auth.currentUser = null;
    // 清除应用数据，避免残留
    if (typeof appData !== 'undefined') {
      appData = { version: '1.0', photosDir: '', defaultColor: '#F7D6E0', records: [] };
    }
    window.location.reload();
  };

  // ====== Auth 弹窗 UI ======

  Auth.showAuthModal = function (defaultTab) {
    defaultTab = defaultTab || 'login';
    var modal = document.getElementById('auth-modal');
    if (!modal) return;

    // 切换 Tab
    var loginForm = document.getElementById('auth-login-form');
    var registerForm = document.getElementById('auth-register-form');
    var tabs = modal.querySelectorAll('.auth-tab');

    tabs.forEach(function (tab) {
      if (tab.getAttribute('data-tab') === defaultTab) {
        tab.classList.add('auth-tab--active');
      } else {
        tab.classList.remove('auth-tab--active');
      }
    });

    if (defaultTab === 'login') {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
    }

    // 清除错误信息和输入
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('register-email').value = '';
    document.getElementById('register-password').value = '';
    document.getElementById('register-confirm').value = '';

    // 显示弹窗
    modal.style.display = 'flex';
  };

  Auth.hideAuthModal = function () {
    var modal = document.getElementById('auth-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  // ====== 初始化 Auth 弹窗事件 ======

  function initAuthModal() {
    var modal = document.getElementById('auth-modal');
    if (!modal) return;

    // Tab 切换
    var tabs = modal.querySelectorAll('.auth-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var targetTab = this.getAttribute('data-tab');
        Auth.showAuthModal(targetTab);
      });
    });

    // 登录表单提交
    var loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = document.getElementById('login-email').value.trim();
        var password = document.getElementById('login-password').value;
        var errorEl = document.getElementById('login-error');

        if (!email || !password) {
          errorEl.textContent = '请填写邮箱和密码';
          return;
        }

        errorEl.textContent = '';
        var btn = loginForm.querySelector('.auth-submit');
        btn.textContent = '登录中...';
        btn.disabled = true;

        var result = await Auth.login(email, password);

        btn.textContent = '登录';
        btn.disabled = false;

        if (result.success) {
          Auth.hideAuthModal();
          onAuthSuccess();
        } else {
          errorEl.textContent = result.error;
        }
      });
    }

    // 注册表单提交
    var registerForm = document.getElementById('auth-register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = document.getElementById('register-email').value.trim();
        var password = document.getElementById('register-password').value;
        var confirm = document.getElementById('register-confirm').value;
        var errorEl = document.getElementById('register-error');

        if (!email || !email.includes('@')) {
          errorEl.textContent = '请输入有效的邮箱地址';
          return;
        }
        if (!password || password.length < 6) {
          errorEl.textContent = '密码长度不能少于 6 位';
          return;
        }
        if (password !== confirm) {
          errorEl.textContent = '两次输入的密码不一致';
          return;
        }

        errorEl.textContent = '';
        var btn = registerForm.querySelector('.auth-submit');
        btn.textContent = '注册中...';
        btn.disabled = true;

        var result = await Auth.register(email, password, confirm);

        btn.textContent = '注册';
        btn.disabled = false;

        if (result.success) {
          Auth.hideAuthModal();
          onAuthSuccess();
        } else {
          errorEl.textContent = result.error;
        }
      });
    }

    // 点击遮罩关闭
    var overlay = modal.querySelector('.modal__overlay');
    if (overlay) {
      overlay.addEventListener('click', function () {
        Auth.hideAuthModal();
      });
    }
  }

  // ====== 登录成功后回调 ======

  function onAuthSuccess() {
    // 更新封面状态
    if (typeof SplashUI !== 'undefined') {
      SplashUI.showContinueHint();
    }
    // 更新设置面板中的用户信息
    updateSettingsUserInfo();
  }

  // ====== 更新设置面板中的用户信息 ======

  function updateSettingsUserInfo() {
    var emailEl = document.getElementById('settings-user-email');
    if (emailEl && Auth.currentUser) {
      emailEl.textContent = '当前登录：' + (Auth.currentUser.email || Auth.currentUser.githubUsername || Auth.currentUser.id);
    }
  }

  // ====== URL token 处理（GitHub OAuth 回调） ======

  function handleUrlToken() {
    try {
      var params = new URLSearchParams(window.location.search);
      var token = params.get('token');
      if (token) {
        Auth.setToken(token);
        // 清除 URL 中的 token
        var url = new URL(window.location);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  // ====== 初始化 ======

  Auth.init = async function () {
    // 第一步：立即初始化弹窗事件（同步，确保按钮点击时已就绪）
    initAuthModal();

    // 第二步：处理 GitHub OAuth 回调中的 token
    var hasUrlToken = handleUrlToken();

    if (hasUrlToken) {
      var valid = await Auth.verify();
      if (valid) {
        onAuthSuccess();
        return true;
      }
    }

    // 第三步：验证已存储的 token
    var isLoggedIn = await Auth.verify();
    return isLoggedIn;
  };

  // ====== 暴露到全局 ======

  window.Auth = Auth;

  // ====== 初始化：立即同步设置弹窗事件，不等待 DOMContentLoaded ======
  // 这样即使是内联脚本也能保证按钮点击时弹窗已就绪

  if (document.readyState === 'loading') {
    // DOM 还在加载，等 DOMContentLoaded 再做异步验证
    document.addEventListener('DOMContentLoaded', function () {
      Auth.init();
    });
  } else {
    // DOM 已经加载完毕（脚本被动态注入等情况）
    Auth.init();
  }

})();
