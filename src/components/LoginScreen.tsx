import { useState } from 'react';
import { ShieldCheck, MessageSquare, Package, ArrowRight } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể đăng nhập Google. Vui lòng thử lại.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col">
      <header className="h-14 bg-[#4A69BB] text-white px-6 flex items-center justify-between border-b border-[#3d59a3]">
        <div className="flex items-center gap-2.5 font-bold text-xl tracking-tight whitespace-nowrap shrink-0">
          <span className="w-8 h-8 rounded-lg bg-white text-[#4A69BB] flex items-center justify-center font-extrabold text-base">
            d
          </span>
          <span>dauto</span>
        </div>
        <span className="text-xs text-white/85 whitespace-nowrap">
          Nền tảng quản lý hội thoại & bán hàng đa kênh
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-7 space-y-6">
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">
              Đăng nhập vào không gian làm việc dauto
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Quản lý tập trung tin nhắn và bình luận từ Facebook, Instagram, Zalo OA, TikTok Shop, Shopee cùng Mini-POS chốt đơn tức thì.
            </p>
          </div>

          <div className="space-y-2.5 py-3 border-y border-slate-100 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-[#4A69BB] shrink-0" />
              <span>Gộp nhiều Fanpage & sàn TMĐT trên cùng một màn hình trực page</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4 text-[#4A69BB] shrink-0" />
              <span>Trích xuất SĐT, cảnh báo hoàn đơn & đồng bộ tồn kho tự động</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#4A69BB] shrink-0" />
              <span>Bảo mật phiên làm việc và phân quyền RBAC theo tài khoản Google</span>
            </div>
          </div>

          {errorMsg && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full h-11 px-4 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors"
          >
            <span>{loading ? 'Đang xác thực Google...' : 'Đăng nhập với Google'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </main>
    </div>
  );
}
