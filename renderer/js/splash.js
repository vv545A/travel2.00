/* ====== 足迹地图 —— 封面动画 ====== */

// ====== SplashUI 全局 API ======

window.SplashUI = {
  _readyForDismiss: false,
  _dismissed: false,

  // 已登录：隐藏登录按钮，显示"点击任意位置继续"
  showContinueHint: function () {
    var wrapper = document.querySelector('.splash__btn-wrapper');
    var hint = document.querySelector('.splash__hint');

    // 隐藏登录按钮容器
    if (wrapper) {
      wrapper.classList.add('splash__btn-wrapper--hidden');
    }

    // 显示点击提示
    if (hint) {
      hint.style.display = '';
      setTimeout(function () {
        hint.classList.add('splash__hint--visible');
      }, 400);
    }

    this._readyForDismiss = true;
  },

  // 未登录：确保登录按钮可见（已经是默认状态，CSS 动画自动展示）
  showLoginButton: function () {
    var wrapper = document.querySelector('.splash__btn-wrapper');
    var hint = document.querySelector('.splash__hint');

    if (wrapper) {
      wrapper.classList.remove('splash__btn-wrapper--hidden');
    }
    if (hint) {
      hint.classList.remove('splash__hint--visible');
      hint.style.display = 'none';
    }
    this._readyForDismiss = false;
  }
};

function initSplash() {
  var splash = document.getElementById('splash-screen');
  if (!splash) return;

  // 登录按钮点击 → 弹出 auth 弹窗
  var loginBtn = document.getElementById('btn-splash-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.Auth && typeof window.Auth.showAuthModal === 'function') {
        window.Auth.showAuthModal('login');
      } else {
        // 降级：直接显示弹窗
        var modal = document.getElementById('auth-modal');
        if (modal) modal.style.display = 'flex';
      }
    });
  }

  // 点击关闭封面（仅已登录后可关闭）
  splash.addEventListener('click', function () {
    if (!window.SplashUI._readyForDismiss) return;
    if (window.SplashUI._dismissed) return;
    window.SplashUI._dismissed = true;
    splash.classList.add('splash--dismissed');
    setTimeout(function () {
      splash.style.display = 'none';
      // 封面关闭后，初始化主应用
      if (typeof initApp === 'function') {
        initApp();
      }
    }, 600);
  });
}
