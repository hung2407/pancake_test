import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  RefreshCw,
  Plus,
  Search,
  Layers,
  MessageSquare,
  PowerOff,
  HelpCircle,
  X,
  ArrowRight,
  CheckSquare,
  Square,
  History,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { ChannelBadge, PLATFORM_META } from '../components/ChannelBadge';
import { ConnectChannelModal } from '../components/ConnectChannelModal';
import type { PlatformType } from '../types/schema';

const PLATFORM_FILTERS: { id: PlatformType | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'zalo', label: 'Zalo OA' },
  { id: 'tiktok', label: 'TikTok Shop' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'website', label: 'Website' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    pages,
    conversations,
    loading,
    refresh,
    togglePageActive,
    syncPageHistory,
    mergeMode,
    setMergeMode,
    selectedPageIds,
    toggleSelectedPageId,
  } = useAppStore();

  const [connectOpen, setConnectOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformType | 'all'>('all');
  const [supportOpen, setSupportOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [syncingPageId, setSyncingPageId] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const oauthError = searchParams.get('oauth_error');
    const count = searchParams.get('count');
    if (oauth === 'facebook_ok') {
      setBannerMsg({
        ok: true,
        text: `Kết nối Facebook OAuth thành công (${count || 1} Fanpage đã được lưu Token thật).`,
      });
      setSearchParams({}, { replace: true });
    } else if (oauth === 'zalo_ok') {
      setBannerMsg({
        ok: true,
        text: 'Kết nối Zalo OA v4 OAuth thành công (đã lưu Access Token & Refresh Token).',
      });
      setSearchParams({}, { replace: true });
    } else if (oauthError) {
      setBannerMsg({
        ok: false,
        text: `Kết nối OAuth chưa hoàn tất: ${oauthError}`,
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const activePages = useMemo(() => {
    return pages
      .filter((p) => p.isActive)
      .filter((p) => platformFilter === 'all' || p.platform === platformFilter)
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.handle.toLowerCase().includes(q) ||
          PLATFORM_META[p.platform].label.toLowerCase().includes(q)
        );
      });
  }, [pages, platformFilter, search]);

  const totalActivePagesCount = pages.filter((p) => p.isActive).length;

  const getPageStats = (pageId: string) => {
    const pageConvs = conversations.filter((c) => c.pageId === pageId);
    const unread = pageConvs.reduce((acc, c) => acc + c.unreadCount, 0);
    return {
      total: pageConvs.length,
      unread,
    };
  };

  const handleOpenMergedWorkspace = () => {
    if (selectedPageIds.length === 0) return;
    navigate(`/workspace?pages=${selectedPageIds.join(',')}`);
  };

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col justify-between bg-[#F0F2F5]">
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-4">
        {bannerMsg && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              bannerMsg.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {bannerMsg.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{bannerMsg.text}</span>
            </div>
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={() => setBannerMsg(null)}
              className="p-0.5 rounded hover:bg-black/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Central Control Card */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          {/* Primary Top Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Bảng điều khiển
              </h1>
              <button
                type="button"
                onClick={() => refresh()}
                aria-label="Làm mới danh sách trang"
                className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#4A69BB] flex items-center justify-center transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? 'animate-spin text-[#4A69BB]' : ''}`}
                />
              </button>
              <span className="text-xs text-slate-500 tabular-nums">
                {totalActivePagesCount} trang đang hoạt động
              </span>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Tìm kiếm trang đã kết nối"
                  placeholder="Tìm kiếm trang, ID..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4A69BB] transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="h-10 px-4 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Kết nối</span>
              </button>
            </div>
          </div>

          {/* Secondary Toolbar: Platform Filter + Merge Page Mode */}
          <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Lọc trang theo nền tảng"
              className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0"
            >
              {PLATFORM_FILTERS.map((f) => {
                const active = platformFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPlatformFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#4A69BB]/12 text-[#4A69BB]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={mergeMode}
                onClick={() => setMergeMode(!mergeMode)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  mergeMode
                    ? 'border-[#4A69BB] bg-[#4A69BB]/10 text-[#4A69BB]'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Chế độ gộp trang</span>
                <span
                  className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                    mergeMode ? 'bg-[#4A69BB] justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                </span>
              </button>

              {mergeMode && (
                <button
                  type="button"
                  disabled={selectedPageIds.length === 0}
                  onClick={handleOpenMergedWorkspace}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>Vào chế độ gộp ({selectedPageIds.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Pages Area: Empty State or Active Page Grid */}
        <section className="flex-1 flex flex-col">
          {activePages.length === 0 ? (
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center px-6 py-20 min-h-[380px]">
              <div className="w-14 h-14 rounded-2xl bg-[#4A69BB]/10 text-[#4A69BB] flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h2 className="text-base font-semibold text-slate-800">
                Chưa có trang nào được kích hoạt
              </h2>
              <p className="text-sm text-slate-500 mt-1.5 max-w-md">
                {totalActivePagesCount === 0
                  ? 'Kết nối Facebook Fanpage, TikTok Shop, Zalo OA, Instagram hoặc Shopee để bắt đầu quản lý hội thoại và lên đơn trực tiếp.'
                  : 'Không tìm thấy trang nào khớp với bộ lọc hiện tại.'}
              </p>
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="mt-5 px-5 py-2.5 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Kết nối trang ngay</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePages.map((page) => {
                const stats = getPageStats(page.id);
                const isSelected = selectedPageIds.includes(page.id);

                return (
                  <article
                    key={page.id}
                    className={`bg-white rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                      isSelected
                        ? 'border-[#4A69BB] ring-2 ring-[#4A69BB]/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ChannelBadge platform={page.platform} size="md" />
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {page.name}
                          </h3>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {PLATFORM_META[page.platform].label} · {page.handle}
                          </p>
                        </div>
                      </div>

                      {mergeMode ? (
                        <button
                          type="button"
                          onClick={() => toggleSelectedPageId(page.id)}
                          aria-label={`Chọn gộp trang ${page.name}`}
                          className="text-[#4A69BB] p-1 rounded hover:bg-slate-100 shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Tạm ngưng kích hoạt trang"
                          aria-label={`Ngắt kết nối ${page.name}`}
                          onClick={() => togglePageActive(page.id, false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                        >
                          <PowerOff className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
                        <span>
                          <strong className="text-slate-900">{stats.total}</strong> hội thoại
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          <strong
                            className={
                              stats.unread > 0 ? 'text-rose-600' : 'text-slate-900'
                            }
                          >
                            {stats.unread}
                          </strong>{' '}
                          chưa đọc
                        </span>
                      </div>

                      {!mergeMode && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(page.platform === 'facebook' ||
                            page.platform === 'instagram' ||
                            page.platform === 'zalo') && (
                            <button
                              type="button"
                              disabled={syncingPageId === page.id}
                              onClick={async () => {
                                setSyncingPageId(page.id);
                                setBannerMsg(null);
                                try {
                                  const res = await syncPageHistory(page.id);
                                  setBannerMsg({
                                    ok: true,
                                    text: `Đã đồng bộ ${res.syncedConversations} hội thoại (${res.importedMessages} tin nhắn mới) cho trang ${page.name}.`,
                                  });
                                } catch (err) {
                                  setBannerMsg({
                                    ok: false,
                                    text:
                                      err instanceof Error
                                        ? err.message
                                        : 'Không thể đồng bộ lịch sử hội thoại',
                                  });
                                } finally {
                                  setSyncingPageId(null);
                                }
                              }}
                              title="Đồng bộ tin nhắn & hội thoại cũ từ Fanpage / Zalo OA"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap disabled:opacity-60"
                            >
                              <History
                                className={`w-3.5 h-3.5 text-[#4A69BB] ${
                                  syncingPageId === page.id ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {syncingPageId === page.id
                                  ? 'Đang đồng bộ...'
                                  : 'Đồng bộ lịch sử'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => navigate(`/workspace?pageId=${page.id}`)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>Vào trực page</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Quiet Footer with Privacy link */}
      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-slate-500">
        <span>dauto Omnichannel Social Commerce</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="hover:text-slate-800 hover:underline"
          >
            Privacy
          </button>
        </div>
      </footer>

      {/* Floating Support Button bottom-right */}
      <div className="fixed bottom-5 right-5 z-30">
        {supportOpen && (
          <div className="mb-3 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-4 text-xs text-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Hỗ trợ & Phím tắt</span>
              <button
                type="button"
                aria-label="Đóng hộp hỗ trợ"
                onClick={() => setSupportOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-slate-600">
              <p className="flex justify-between">
                <span>Mở mẫu câu trả lời nhanh</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">/</kbd>
              </p>
              <p className="flex justify-between">
                <span>Gửi tin nhắn</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">Enter</kbd>
              </p>
              <p className="flex justify-between">
                <span>Chuyển hội thoại lên/xuống</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">Alt + ↑/↓</kbd>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSupportOpen(false);
                setConnectOpen(true);
              }}
              className="w-full py-2 rounded-lg bg-[#4A69BB]/10 text-[#4A69BB] font-semibold hover:bg-[#4A69BB]/15 transition-colors"
            >
              Hướng dẫn kết nối trang mới
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSupportOpen((v) => !v)}
          aria-label="Hỗ trợ trực tuyến"
          className="w-11 h-11 rounded-full bg-[#4A69BB] hover:bg-[#3d59a3] text-white shadow-md flex items-center justify-center transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Connect Channel Modal (Shadcn Dialog) */}
      <ConnectChannelModal open={connectOpen} onClose={() => setConnectOpen(false)} />

      {/* Privacy Policy Dialog (Shadcn Dialog) */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 p-5 gap-3">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Chính sách bảo mật dữ liệu (Privacy)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 leading-relaxed pt-1">
              Nền tảng dauto tuân thủ nghiêm ngặt quy định bảo vệ thông tin khách hàng từ
              Facebook, Instagram, Zalo OA, TikTok Shop và Shopee. Số điện thoại và địa chỉ
              trích xuất tự động chỉ được sử dụng cho mục đích xử lý đơn hàng nội bộ của doanh nghiệp.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 px-0 py-0 pt-2 bg-transparent border-t-0">
            <Button
              type="button"
              onClick={() => setPrivacyOpen(false)}
              className="bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-xs font-semibold"
            >
              Đã hiểu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
