import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  MessageSquare,
  LayoutGrid,
  Package,
  BarChart3,
  Settings,
  CheckCheck,
  Shield,
  LogOut,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { signOutUser } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { ROLE_LABELS, formatRelativeTime } from '../utils/omnichannel';

export function TopHeader() {
  const navigate = useNavigate();
  const {
    users,
    currentUserId,
    setCurrentUserId,
    notifications,
    markNotificationsRead,
    soundEnabled,
    toggleSoundEnabled,
  } = useAppStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const currentUser = users.find((u) => u.id === currentUserId) ?? users[0];
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { to: '/dashboard', label: 'Bảng điều khiển', icon: LayoutGrid },
    { to: '/workspace', label: 'Hội thoại', icon: MessageSquare },
    { to: '/orders', label: 'Đơn & Kho', icon: Package },
    { to: '/analytics', label: 'Báo cáo', icon: BarChart3 },
    { to: '/settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <header className="dauto-no-print h-14 bg-[#4A69BB] text-white px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0 border-b border-[#3d59a3] z-30 relative">
      {/* Left: Brand Logo & Wordmark + Primary Navigation */}
      <div className="flex items-center gap-6 min-w-0">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-2.5 text-white font-bold text-xl tracking-tight whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white rounded"
        >
          <span className="w-8 h-8 rounded-lg bg-white text-[#4A69BB] flex items-center justify-center font-extrabold text-base shadow-xs">
            d
          </span>
          <span>dauto</span>
        </NavLink>

        <nav aria-label="Điều hướng chính" className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Right: Sound Toggle, Notification Bell & User Account / RBAC Switcher */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleSoundEnabled}
          aria-label={soundEnabled ? 'Tắt âm báo tin nhắn mới' : 'Bật âm báo tin nhắn mới'}
          title={soundEnabled ? 'Đang bật chuông báo tin nhắn mới' : 'Đang tắt chuông báo'}
          aria-pressed={soundEnabled}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors focus-visible:outline-2 focus-visible:outline-white"
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-white/60" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Thông báo hệ thống"
            aria-expanded={notifOpen}
            className="relative w-10 h-10 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors focus-visible:outline-2 focus-visible:outline-white"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadNotifCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-slate-900 rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-900">
                  Thông báo hệ thống
                </span>
                {unreadNotifCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markNotificationsRead()}
                    className="text-xs font-medium text-[#4A69BB] hover:underline flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Đánh dấu đã đọc
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    Chưa có thông báo mới
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        if (n.conversationId) {
                          navigate(`/workspace?convId=${n.conversationId}`);
                        }
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                        n.read ? 'bg-white' : 'bg-blue-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">
                          {n.title}
                        </p>
                        <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {n.body}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Role Switcher */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-label="Tài khoản và phân quyền người dùng"
            aria-expanded={userMenuOpen}
            className="flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-lg hover:bg-white/15 transition-colors focus-visible:outline-2 focus-visible:outline-white"
          >
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-white/40 shrink-0"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-white/25 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                {currentUser?.name.slice(0, 2).toUpperCase() || 'NV'}
              </span>
            )}
            <div className="hidden sm:flex flex-col items-start text-left leading-tight">
              <span className="text-sm font-semibold text-white whitespace-nowrap">
                {currentUser?.name || 'Đang tải...'}
              </span>
              <span className="text-[11px] text-white/80 whitespace-nowrap">
                {currentUser ? ROLE_LABELS[currentUser.role].split(' (')[0] : ''}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-white/80 shrink-0" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white text-slate-900 rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#4A69BB]" />
                  Chuyển vai trò nhân viên (RBAC)
                </p>
              </div>
              <div className="p-1.5 space-y-0.5">
                {users.map((u) => {
                  const active = u.id === currentUserId;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setCurrentUserId(u.id);
                        setUserMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-[#4A69BB]/10 text-[#4A69BB]'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{u.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {ROLE_LABELS[u.role]}
                        </p>
                      </div>
                      {active && (
                        <span className="text-xs font-semibold text-[#4A69BB] shrink-0">
                          Đang chọn
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Mobile nav fallback inside menu */}
              <div className="md:hidden border-t border-slate-100 p-2 grid grid-cols-2 gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setUserMenuOpen(false)}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md"
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <div className="border-t border-slate-100 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void signOutUser();
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất tài khoản Google</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
