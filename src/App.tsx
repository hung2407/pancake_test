import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, signOutUser } from './lib/firebase';
import { useAppStore } from './store/useAppStore';
import { TopHeader } from './components/TopHeader';
import { LoginScreen } from './components/LoginScreen';
import { DashboardPage } from './pages/DashboardPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { OrdersProductsPage } from './pages/OrdersProductsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const { init, resetAuthState, initialized, error } = useAppStore();
  const [authChecking, setAuthChecking] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthChecking(false);
      if (user) {
        const token = await user.getIdToken();
        await init(token);
      } else {
        resetAuthState();
      }
    });
    return () => unsub();
  }, [init, resetAuthState]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-4 text-xs font-semibold text-slate-600">
          Đang kiểm tra phiên đăng nhập dauto...
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  if (!initialized && error) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm text-center space-y-3">
          <p className="text-sm font-bold text-rose-600">Không thể kết nối máy chủ dauto</p>
          <p className="text-xs text-slate-600">{error}</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#4A69BB] text-white text-xs font-semibold"
            >
              Thử lại
            </button>
            <button
              type="button"
              onClick={() => signOutUser()}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-[#F0F2F5]">
        <TopHeader />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/orders" element={<OrdersProductsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
