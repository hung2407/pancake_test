import { useState, useEffect } from 'react';
import { CheckCircle2, Plus, Link2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { auth } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { ChannelBadge, PLATFORM_META } from './ChannelBadge';
import type { PlatformType } from '../types/schema';

const PLATFORMS: PlatformType[] = [
  'facebook',
  'instagram',
  'zalo',
  'tiktok',
  'shopee',
  'website',
];

export function ConnectChannelModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { pages, connectPage } = useAppStore();
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all'>('all');
  const [customName, setCustomName] = useState('');
  const [customHandle, setCustomHandle] = useState('');
  const [customExternalId, setCustomExternalId] = useState('');
  const [customAccessToken, setCustomAccessToken] = useState('');
  const [customPlatform, setCustomPlatform] = useState<PlatformType>('facebook');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<{
    facebookConfigured: boolean;
    zaloConfigured: boolean;
  } | null>(null);
  const [oauthHint, setOauthHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? '';
        const res = await fetch('/api/oauth/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) {
          setOauthStatus({
            facebookConfigured: Boolean(data.facebookConfigured),
            zaloConfigured: Boolean(data.zaloConfigured),
          });
        }
      } catch {
        // Non-critical check
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  const handleOneClickOAuth = (provider: 'facebook' | 'zalo') => {
    setOauthHint(null);
    if (provider === 'facebook') {
      if (oauthStatus?.facebookConfigured) {
        window.location.assign('/api/oauth/facebook/start');
        return;
      }
      setOauthHint(
        'Chưa điền META_APP_ID và META_APP_SECRET trong biến môi trường (.env). Xem hướng dẫn lấy khóa tại file candien.md mục 2 hoặc dán Page ID + Token trực tiếp ở form bên dưới.'
      );
      return;
    }
    if (oauthStatus?.zaloConfigured) {
      window.location.assign('/api/oauth/zalo/start');
      return;
    }
    setOauthHint(
      'Chưa điền ZALO_APP_ID và ZALO_APP_SECRET trong biến môi trường (.env). Xem hướng dẫn lấy khóa tại file candien.md mục 3 hoặc dán OA ID + Token ở form bên dưới.'
    );
  };

  const filteredPages = pages.filter(
    (p) => selectedPlatform === 'all' || p.platform === selectedPlatform
  );

  const handleActivateSample = async (pageId: string, platform: PlatformType) => {
    setSubmittingId(pageId);
    setErrorMsg(null);
    try {
      await connectPage({ pageId, platform });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleConnectCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) {
      setErrorMsg('Vui lòng nhập tên trang hoặc gian hàng cần kết nối');
      return;
    }
    setSubmittingId('custom');
    setErrorMsg(null);
    try {
      await connectPage({
        platform: customPlatform,
        name: customName.trim(),
        handle:
          customHandle.trim() ||
          `@${customName.trim().toLowerCase().replace(/\s+/g, '')}`,
        externalId: customExternalId.trim() || undefined,
        accessToken: customAccessToken.trim() || undefined,
      });
      setCustomName('');
      setCustomHandle('');
      setCustomExternalId('');
      setCustomAccessToken('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể kết nối trang');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden bg-white border border-slate-200 max-h-[88vh] flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 text-left">
          <DialogTitle className="text-lg font-bold text-slate-900">
            Kết nối kênh bán hàng đa kênh
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Kích hoạt trang mẫu có sẵn dữ liệu hội thoại hoặc thêm kênh mới từ Facebook, Instagram, Zalo OA, TikTok Shop, Shopee và Website
          </DialogDescription>
        </DialogHeader>

        {/* Platform selector tabs */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedPlatform('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              selectedPlatform === 'all'
                ? 'bg-[#4A69BB] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Tất cả kênh
          </button>
          {PLATFORMS.map((pf) => (
            <button
              key={pf}
              type="button"
              onClick={() => {
                setSelectedPlatform(pf);
                setCustomPlatform(pf);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
                selectedPlatform === pf
                  ? 'bg-[#4A69BB] text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <ChannelBadge platform={pf} size="xs" />
              <span>{pf === 'website' ? 'Website' : pf === 'facebook' ? 'Facebook' : PLATFORM_META[pf].label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 dauto-scroll flex-1">
          {errorMsg && (
            <div className="px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* 1-Click OAuth Connect */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Kết nối nhanh OAuth 1 chạm (Đồng bộ trang thật)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ủy quyền trực tiếp Fanpage Facebook hoặc Zalo OA để tự động lấy Access Token & Refresh Token về máy chủ.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleOneClickOAuth('facebook')}
                  className="h-9 px-3.5 rounded-lg bg-[#1877F2] hover:bg-[#1465d2] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Kết nối Facebook Fanpage</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleOneClickOAuth('zalo')}
                  className="h-9 px-3.5 rounded-lg bg-[#0068FF] hover:bg-[#0055d4] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Kết nối Zalo OA</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {oauthHint && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                {oauthHint}
              </div>
            )}
          </div>

          {/* Available pages list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Trang khả dụng để kích hoạt
              </h3>
              <button
                type="button"
                onClick={async () => {
                  for (const p of filteredPages.filter((x) => !x.isActive)) {
                    await connectPage({ pageId: p.id, platform: p.platform });
                  }
                }}
                className="text-xs font-semibold text-[#4A69BB] hover:underline"
              >
                Kích hoạt tất cả trang đang lọc
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredPages.map((page) => (
                <div
                  key={page.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ChannelBadge platform={page.platform} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {page.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {PLATFORM_META[page.platform].label} · {page.handle}
                      </p>
                    </div>
                  </div>

                  {page.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      Đã kích hoạt
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={submittingId === page.id}
                      onClick={() => handleActivateSample(page.id, page.platform)}
                      className="bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-xs font-semibold shrink-0"
                    >
                      {submittingId === page.id ? 'Đang kết nối...' : 'Kích hoạt'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Custom channel connection form */}
          <form
            onSubmit={handleConnectCustom}
            className="pt-5 border-t border-slate-200 space-y-3"
          >
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-[#4A69BB]" />
              Hoặc thêm kênh / trang tùy chỉnh mới
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="custom-platform"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Nền tảng
                </label>
                <select
                  id="custom-platform"
                  value={customPlatform}
                  onChange={(e) => setCustomPlatform(e.target.value as PlatformType)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#4A69BB]"
                >
                  {PLATFORMS.map((pf) => (
                    <option key={pf} value={pf}>
                      {PLATFORM_META[pf].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="custom-page-name"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Tên Fanpage / Gian hàng
                </label>
                <input
                  id="custom-page-name"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="VD: Lumi Official Store"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#4A69BB]"
                />
              </div>
              <div>
                <label
                  htmlFor="custom-page-handle"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Username / Đường dẫn
                </label>
                <input
                  id="custom-page-handle"
                  type="text"
                  value={customHandle}
                  onChange={(e) => setCustomHandle(e.target.value)}
                  placeholder="VD: @lumi.store"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#4A69BB]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="custom-external-id"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Page ID / OA ID thật (tùy chọn để khớp Webhook)
                </label>
                <input
                  id="custom-external-id"
                  type="text"
                  value={customExternalId}
                  onChange={(e) => setCustomExternalId(e.target.value)}
                  placeholder="VD: 102938475678901"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:border-[#4A69BB]"
                />
              </div>
              <div>
                <label
                  htmlFor="custom-access-token"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Page Access Token (tùy chọn để gửi tin nhắn ra ngoài)
                </label>
                <input
                  id="custom-access-token"
                  type="password"
                  value={customAccessToken}
                  onChange={(e) => setCustomAccessToken(e.target.value)}
                  placeholder="Dán token khi test trên localhost"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:border-[#4A69BB]"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submittingId === 'custom'}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Thêm & Kích hoạt trang
              </Button>
            </div>
          </form>
        </div>

        <DialogFooter className="mx-0 mb-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 rounded-b-xl">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-sm font-semibold"
          >
            Hoàn tất
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
