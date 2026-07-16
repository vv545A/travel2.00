/* ====== 足迹地图 —— 应用入口 ====== */

// ====== 应用初始化 ======

async function initApp() {
  console.log('🏔️ 足迹地图启动中...');

  // 1. 加载数据
  await loadData();
  console.log('  - 数据加载: ✓');

  // 2. 首次启动检测：如果没有设置图片目录，弹出选择框
  if (!appData.photosDir) {
    const folder = await window.api.selectFolder();
    if (folder) {
      appData.photosDir = folder;
      await saveData();
    }
  }

  // 3. 初始化地图
  initMap();

  // 4. 初始化左侧面板
  initLeftPanel();

  // 5. 初始化右侧面板
  initRightPanel();

  // 6. 初始化搜索
  initSearch();

  // 7. 初始化模式切换按钮
  initModeToggle();

  // 8. 初始化设置弹窗关闭按钮（通过点击遮罩）
  initSettingsModal();

  // 9. 键盘快捷键
  initKeyboardShortcuts();

  console.log('✅ 足迹地图初始化完成！');
}

// ====== 设置弹窗额外初始化 ======

function initModeToggle() {
  const btn = document.getElementById('btn-mode-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const nextMode = (currentMode === 'province') ? 'city' : 'province';
    switchMode(nextMode);
  });
}

function initSettingsModal() {
  const modal = document.getElementById('settings-modal');
  // 点击遮罩关闭（已在 openSettings 中设置，这里做备用）
  if (modal) {
    const overlay = modal.querySelector('.modal__overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
  }
}

// ====== 键盘快捷键 ======

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S / Cmd+S：打卡保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (panelRightOpen && document.getElementById('note-edit').style.display !== 'none') {
        e.preventDefault();
        doCheckin();
        console.log('📍 已打卡保存');
      }
    }

    // Escape：关闭面板/弹窗
    if (e.key === 'Escape') {
      if (panelRightOpen) {
        closeRightPanel();
      }
      hideColorPicker();
      clearHighlight();
      const modal = document.getElementById('settings-modal');
      if (modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
      const dropdown = document.getElementById('search-dropdown');
      if (dropdown) {
        dropdown.classList.remove('search-dropdown--visible');
      }
    }
  });
}

// ====== 窗口启动 ======

window.addEventListener('DOMContentLoaded', async () => {
  // 启动封面动画
  initSplash();

  // 等待 auth.init() 完成（在 auth.js 的 DOMContentLoaded 中也触发了）
  // auth.init 验证 token 后会自动调用 SplashUI 设置封面状态
  // 如果已登录 → SplashUI.showContinueHint() → 封面显示"点击继续"
  // 如果未登录 → SplashUI.showLoginButton() → 封面显示"登录按钮"

  // auth.js 在 DOMContentLoaded 时会自动调用 Auth.init()
  // 我们等一小段时间让它完成
  await new Promise(resolve => setTimeout(resolve, 100));

  // 如果 auth.init 还没完成，这里再次触发
  if (window.Auth) {
    var loggedIn = await window.Auth.init();
    if (loggedIn) {
      window.SplashUI.showContinueHint();
    } else {
      window.SplashUI.showLoginButton();
    }
  }

  // initApp() 不再在启动时调用，改为在封面关闭后由 splash.js 调用
});
