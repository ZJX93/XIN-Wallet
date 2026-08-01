// 启动脚本：首页初始化用户界面（从 index.html 内联 script 外置化，配合 CSP 收紧）
import { renderUserMenu, bindLogout, bindProfileModal } from './auth.js';
renderUserMenu();
bindLogout();
bindProfileModal();
