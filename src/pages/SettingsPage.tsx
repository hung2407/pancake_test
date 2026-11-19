import { useState } from 'react';
import {
  Bot,
  Users,
  Tag as TagIcon,
  Shield,
  Plus,
  Trash2,
  Zap,
  CheckCircle2,
  Webhook,
  Copy,
  Check,
  Terminal,
  KeyRound,
  Code2,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ROLE_LABELS, hasPermission, type PermissionKey } from '../utils/omnichannel';
import { ChannelBadge, PLATFORM_META } from '../components/ChannelBadge';
import type { PlatformType, UserRole } from '../types/schema';

const WEBHOOK_PLATFORMS: PlatformType[] = [
  'facebook',
  'instagram',
  'zalo',
  'tiktok',
  'shopee',
  'website',
];

const TAG_COLORS = [
  '#7C3AED',
  '#16A34A',
  '#D97706',
  '#2563EB',
  '#DC2626',
  '#0F766E',
  '#4A69BB',
];

const PERMISSIONS_LIST: { key: PermissionKey; label: string }[] = [
  { key: 'manage_pages', label: 'Kết nối & ngắt trang' },
  { key: 'reply_conversations', label: 'Trả lời tin nhắn / bình luận' },
  { key: 'create_orders', label: 'Tạo đơn hàng trên Mini-POS' },
  { key: 'manage_inventory', label: 'Quản lý sản phẩm & tồn kho' },
  { key: 'update_order_shipping', label: 'Cập nhật trạng thái vận đơn' },
  { key: 'view_analytics', label: 'Xem báo cáo doanh thu' },
  { key: 'manage_automation', label: 'Cấu hình tự động hóa & Round-Robin' },
  { key: 'manage_rbac', label: 'Phân quyền vai trò hệ thống' },
];

const ROLES: UserRole[] = ['owner', 'admin', 'sale', 'warehouse'];

export function SettingsPage() {
  const {
    automation,
    tags,
    quickReplies,
    users,
    pages,
    currentUserId,
    updateAutomation,
    updatePageCredentials,
    refreshPageToken,
    addTag,
    deleteTag,
    addQuickReply,
    deleteQuickReply,
    toggleStaffOnline,
    inviteStaff,
    updateStaffAccess,
    deleteStaff,
    simulateWebhook,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<
    'automation' | 'round_robin' | 'tags_replies' | 'rbac_webhook'
  >('automation');

  // New keyword rule form
  const [kwInput, setKwInput] = useState('');
  const [kwCommentReply, setKwCommentReply] = useState(
    'Dạ {full_name} kiểm tra tin nhắn chờ nhé, {page_name} đã inbox tư vấn cho mình ạ!'
  );
  const [kwInboxReply, setKwInboxReply] = useState(
    'Chào {full_name}, em hỗ trợ báo giá sản phẩm mình vừa bình luận ạ.'
  );

  // New tag form
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#4A69BB');

  // New quick reply form
  const [qrShortcut, setQrShortcut] = useState('');
  const [qrTitle, setQrTitle] = useState('');
  const [qrContent, setQrContent] = useState('');

  // Webhook & Localhost config state
  const [webhookTestedMsg, setWebhookTestedMsg] = useState<string | null>(null);
  const [verifyTokenDraft, setVerifyTokenDraft] = useState<string | null>(null);
  const [tokenSavedMsg, setTokenSavedMsg] = useState<string | null>(null);
  const [challengeResult, setChallengeResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [credDrafts, setCredDrafts] = useState<
    Record<string, { externalId?: string; accessToken?: string; saved?: boolean }>
  >({});
  const [refreshingPageId, setRefreshingPageId] = useState<string | null>(null);
  const [pageRefreshNotice, setPageRefreshNotice] = useState<{
    pageId: string;
    ok: boolean;
    text: string;
  } | null>(null);

  // Bot Local config state
  const [botKeyDraft, setBotKeyDraft] = useState<string | null>(null);
  const [outboundUrlDraft, setOutboundUrlDraft] = useState<string | null>(null);
  const [botSavedMsg, setBotSavedMsg] = useState<string | null>(null);

  // Website widget embed selector
  const websitePages = pages.filter((p) => p.platform === 'website');
  const [widgetPageId, setWidgetPageId] = useState<string>('');

  // Team RBAC invite state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('sale');
  const [invitePageIds, setInvitePageIds] = useState<string[]>([]);
  const [teamMsg, setTeamMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!automation) return null;

  const currentUser = users.find((u) => u.id === currentUserId);
  const canManageRbac = currentUser ? hasPermission(currentUser.role, 'manage_rbac') : false;

  const activeVerifyToken =
    verifyTokenDraft ?? automation.webhookVerifyToken ?? 'dauto_verify_2026';
  const activeBotKey = botKeyDraft ?? automation.botApiKey ?? '';
  const activeOutboundUrl = outboundUrlDraft ?? automation.outboundWebhookUrl ?? '';
  const activeWidgetPageId =
    widgetPageId || websitePages[0]?.id || pages[0]?.id || 'page_web_1';
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const widgetEmbedCode = `<script src="${currentOrigin}/widget.js" data-page-id="${activeWidgetPageId}"></script>`;

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      // Clipboard blocked in non-secure context
    }
  };

  const handleVerifyChallengeTest = async () => {
    try {
      const url = `/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        activeVerifyToken
      )}&hub.challenge=DAUTO_LOCALHOST_OK`;
      const res = await fetch(url);
      const bodyText = await res.text();
      setChallengeResult({
        ok: res.ok && bodyText === 'DAUTO_LOCALHOST_OK',
        text: `HTTP ${res.status} · Phản hồi: "${bodyText}"`,
      });
    } catch {
      setChallengeResult({
        ok: false,
        text: 'Không kết nối được tới /api/webhooks/facebook',
      });
    }
  };

  const handleAddKeywordRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = kwInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;
    await updateAutomation({
      keywordRules: [
        ...automation.keywordRules,
        {
          id: `kr_${Date.now()}`,
          keywords,
          commentReply: kwCommentReply,
          inboxReply: kwInboxReply,
          enabled: true,
        },
      ],
    });
    setKwInput('');
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    await addTag(tagName, tagColor);
    setTagName('');
  };

  const handleAddQuickReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrShortcut.trim() || !qrContent.trim()) return;
    await addQuickReply({
      shortcut: qrShortcut,
      title: qrTitle || qrShortcut,
      content: qrContent,
      category: 'Tùy chỉnh',
    });
    setQrShortcut('');
    setQrTitle('');
    setQrContent('');
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-[#F0F2F5] py-6 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h1 className="text-xl font-bold text-slate-900">
            Tự động hóa & Cài đặt hệ thống
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cấu hình tự động ẩn bình luận chứa SĐT, trả lời theo từ khóa, chia hội thoại Round-Robin và phân quyền RBAC
          </p>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('automation')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'automation'
                  ? 'bg-[#4A69BB] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              Tự động hóa bình luận
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('round_robin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'round_robin'
                  ? 'bg-[#4A69BB] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Phân bổ Round-Robin
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tags_replies')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'tags_replies'
                  ? 'bg-[#4A69BB] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TagIcon className="w-3.5 h-3.5" />
              Thẻ màu & Trả lời nhanh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rbac_webhook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'rbac_webhook'
                  ? 'bg-[#4A69BB] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Webhook, Bot Local & Phân quyền
            </button>
          </div>
        </div>

        {/* Tab 1: Comment Automation */}
        {activeTab === 'automation' && (
          <section className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Tự động ẩn bình luận chứa số điện thoại
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Phát hiện số điện thoại Việt Nam (09x, 03x, 07x, 08x, +84...) bằng Regex ngay khi nhận webhook để tránh đối thủ cướp khách.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={automation.autoHidePhoneComments}
                  aria-label="Bật tắt tự động ẩn bình luận chứa số điện thoại"
                  onClick={() =>
                    updateAutomation({
                      autoHidePhoneComments: !automation.autoHidePhoneComments,
                    })
                  }
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                    automation.autoHidePhoneComments
                      ? 'bg-[#4A69BB] justify-end'
                      : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Tự động trả lời bình luận & gửi inbox theo từ khóa
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Khi khách bình luận khớp từ khóa cài sẵn, hệ thống tự động phản hồi bình luận và nhắn tin riêng.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={automation.autoReplyComments}
                  aria-label="Bật tắt tự động trả lời bình luận"
                  onClick={() =>
                    updateAutomation({
                      autoReplyComments: !automation.autoReplyComments,
                    })
                  }
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                    automation.autoReplyComments
                      ? 'bg-[#4A69BB] justify-end'
                      : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </button>
              </div>
            </div>

            {/* Keyword Rules */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Kịch bản từ khóa trả lời tự động
              </h3>

              <div className="space-y-2.5">
                {automation.keywordRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-900">
                        Từ khóa:{' '}
                        <span className="font-mono text-[#4A69BB]">
                          {rule.keywords.join(', ')}
                        </span>
                      </p>
                      <p className="text-slate-600">
                        <strong>Trả lời bình luận:</strong> {rule.commentReply}
                      </p>
                      <p className="text-slate-600">
                        <strong>Gửi Inbox:</strong> {rule.inboxReply}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Xóa kịch bản từ khóa"
                      onClick={() =>
                        updateAutomation({
                          keywordRules: automation.keywordRules.filter(
                            (r) => r.id !== rule.id
                          ),
                        })
                      }
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddKeywordRule}
                className="pt-4 border-t border-slate-100 space-y-3 text-xs"
              >
                <p className="font-semibold text-slate-800">Thêm kịch bản từ khóa mới</p>
                <input
                  type="text"
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  placeholder="Nhập từ khóa cách nhau bởi dấu phẩy (VD: freeship, màu đen, size M)"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <textarea
                    rows={2}
                    value={kwCommentReply}
                    onChange={(e) => setKwCommentReply(e.target.value)}
                    placeholder="Nội dung trả lời bình luận..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 resize-none"
                  />
                  <textarea
                    rows={2}
                    value={kwInboxReply}
                    onChange={(e) => setKwInboxReply(e.target.value)}
                    placeholder="Nội dung gửi tin nhắn riêng..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#4A69BB] text-white font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm kịch bản
                </button>
              </form>
            </div>
          </section>
        )}

        {/* Tab 2: Round-Robin Assignment */}
        {activeTab === 'round_robin' && (
          <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Tự động phân bổ hội thoại cho nhân viên
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chia đều khách hàng mới cho các nhân viên đang trực hoặc giữ nguyên nhân viên đã chăm sóc trước đó.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={automation.roundRobinEnabled}
                onClick={() =>
                  updateAutomation({
                    roundRobinEnabled: !automation.roundRobinEnabled,
                  })
                }
                className={`w-12 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                  automation.roundRobinEnabled
                    ? 'bg-[#4A69BB] justify-end'
                    : 'bg-slate-300 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => updateAutomation({ roundRobinMode: 'round_robin' })}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  automation.roundRobinMode === 'round_robin'
                    ? 'border-[#4A69BB] bg-[#4A69BB]/8'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <p className="font-bold text-slate-900">Chia đều vòng tròn (Round-Robin)</p>
                <p className="text-slate-600 mt-1">
                  Khách mới được chia lần lượt cho từng nhân viên đang bật trạng thái trực page.
                </p>
              </button>

              <button
                type="button"
                onClick={() => updateAutomation({ roundRobinMode: 'sticky_previous' })}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  automation.roundRobinMode === 'sticky_previous'
                    ? 'border-[#4A69BB] bg-[#4A69BB]/8'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <p className="font-bold text-slate-900">
                  Ưu tiên nhân viên cũ chăm sóc khách
                </p>
                <p className="text-slate-600 mt-1">
                  Nếu khách quay lại, gắn ưu tiên cho nhân viên từng tư vấn trước đó; nếu khách mới sẽ chia Round-Robin.
                </p>
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Trạng thái trực ca của nhân viên
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{u.name}</p>
                      <p className="text-slate-500">{ROLE_LABELS[u.role]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleStaffOnline(u.id, !u.online)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                        u.online
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {u.online ? 'Đang trực ca' : 'Tạm nghỉ'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Tab 3: Tags & Quick Replies */}
        {activeTab === 'tags_replies' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tags Management */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-[#4A69BB]" />
                Quản lý bộ thẻ màu (Tags)
              </h2>

              <div className="space-y-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="px-3 py-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: tag.color }}
                        className="w-3.5 h-3.5 rounded-xs shrink-0"
                      />
                      <span className="font-semibold text-slate-800">{tag.name}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Xóa thẻ ${tag.name}`}
                      onClick={() => deleteTag(tag.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddTag}
                className="pt-3 border-t border-slate-100 space-y-2.5 text-xs"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder="Tên thẻ mới (VD: Chờ giao hàng)"
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-200"
                  />
                  <button
                    type="submit"
                    className="h-9 px-3.5 rounded-lg bg-[#4A69BB] text-white font-semibold shrink-0"
                  >
                    Thêm thẻ
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Chọn màu:</span>
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTagColor(c)}
                      style={{ backgroundColor: c }}
                      aria-label={`Chọn màu ${c}`}
                      className={`w-5 h-5 rounded ${
                        tagColor === c ? 'ring-2 ring-offset-2 ring-slate-900' : ''
                      }`}
                    />
                  ))}
                </div>
              </form>
            </div>

            {/* Quick Replies Management */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Kho mẫu câu trả lời nhanh (gõ /)
              </h2>
              <p className="text-[11px] text-slate-500">
                Hỗ trợ biến động: <code className="font-mono text-[#4A69BB]">{'{full_name}'}</code>,{' '}
                <code className="font-mono text-[#4A69BB]">{'{phone}'}</code>,{' '}
                <code className="font-mono text-[#4A69BB]">{'{page_name}'}</code>,{' '}
                <code className="font-mono text-[#4A69BB]">{'{staff_name}'}</code>
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto dauto-scroll">
                {quickReplies.map((qr) => (
                  <div
                    key={qr.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 text-xs flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#4A69BB]">
                          {qr.shortcut}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">
                          {qr.title}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1 leading-relaxed">{qr.content}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Xóa mẫu ${qr.shortcut}`}
                      onClick={() => deleteQuickReply(qr.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddQuickReply}
                className="pt-3 border-t border-slate-100 space-y-2 text-xs"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={qrShortcut}
                    onChange={(e) => setQrShortcut(e.target.value)}
                    placeholder="Phím tắt (VD: /ship)"
                    className="h-9 px-3 rounded-lg border border-slate-200 font-mono"
                  />
                  <input
                    type="text"
                    value={qrTitle}
                    onChange={(e) => setQrTitle(e.target.value)}
                    placeholder="Tiêu đề ngắn"
                    className="h-9 px-3 rounded-lg border border-slate-200"
                  />
                </div>
                <textarea
                  rows={2}
                  value={qrContent}
                  onChange={(e) => setQrContent(e.target.value)}
                  placeholder="Nội dung mẫu có thể chèn {full_name}..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 resize-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#4A69BB] text-white font-semibold"
                >
                  Thêm mẫu trả lời
                </button>
              </form>
            </div>
          </section>
        )}

        {/* Tab 4: Webhook Localhost & RBAC Matrix */}
        {activeTab === 'rbac_webhook' && (
          <section className="space-y-4">
            {/* Localhost & Real Webhook Integration Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 text-xs">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-[#4A69BB]" />
                    Kết nối Webhook & Chạy Localhost (Cổng 3000)
                  </h2>
                  <p className="text-slate-500 mt-1">
                    Máy chủ Express + Socket.io chạy trực tiếp tại{' '}
                    <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">
                      http://localhost:3000
                    </code>{' '}
                    (đang truy cập: <span className="font-mono text-slate-700">{currentOrigin}</span>).
                    Hỗ trợ xác thực GET challenge và payload chuẩn Meta Messenger, Instagram, Zalo OA v3, TikTok & Shopee.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleVerifyChallengeTest}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold whitespace-nowrap"
                  >
                    Kiểm tra GET Challenge
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await simulateWebhook({
                        platform: 'facebook',
                        customerName: 'Trần Mỹ Linh',
                        channelType: 'comment',
                        content: 'Tư vấn giá serum cho mình nha 0915 223 344',
                      });
                      setWebhookTestedMsg(
                        'Đã bắn Webhook bình luận có SĐT — tự động ẩn & trả lời thành công!'
                      );
                    }}
                    className="px-4 py-2 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white font-semibold whitespace-nowrap"
                  >
                    Gửi Webhook thử nghiệm ngay
                  </button>
                </div>
              </div>

              {challengeResult && (
                <div
                  className={`px-3 py-2 rounded-lg border font-medium flex items-center gap-1.5 ${
                    challengeResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{challengeResult.text}</span>
                </div>
              )}

              {webhookTestedMsg && (
                <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{webhookTestedMsg}</span>
                </div>
              )}

              {/* Verify Token Config */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <label
                  htmlFor="webhook-verify-token"
                  className="block font-bold text-slate-800"
                >
                  Mã xác thực Webhook (Verify Token cho Meta / Facebook / Instagram)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    id="webhook-verify-token"
                    type="text"
                    value={activeVerifyToken}
                    onChange={(e) => {
                      setVerifyTokenDraft(e.target.value);
                      setTokenSavedMsg(null);
                    }}
                    className="flex-1 min-w-[220px] h-9 px-3 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const clean = activeVerifyToken.trim() || 'dauto_verify_2026';
                      await updateAutomation({ webhookVerifyToken: clean });
                      setVerifyTokenDraft(clean);
                      setTokenSavedMsg('Đã lưu Verify Token');
                    }}
                    className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold whitespace-nowrap"
                  >
                    Lưu Verify Token
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText('verify_token', activeVerifyToken)}
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {copiedKey === 'verify_token' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Chép Token
                      </>
                    )}
                  </button>
                </div>
                {tokenSavedMsg && (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    {tokenSavedMsg}
                  </p>
                )}
              </div>

              {/* Callback URLs for all 6 channels */}
              <div className="space-y-2">
                <h3 className="font-bold text-slate-800">
                  Danh sách Callback URL cho từng nền tảng (dán vào Meta / Zalo OA / TikTok / Shopee)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {WEBHOOK_PLATFORMS.map((pf) => {
                    const localUrl = `http://localhost:3000/api/webhooks/${pf}`;
                    const liveUrl = `${currentOrigin}/api/webhooks/${pf}`;
                    return (
                      <div
                        key={pf}
                        className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ChannelBadge platform={pf} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {PLATFORM_META[pf].label}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 truncate">
                              {localUrl}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(`url_${pf}`, liveUrl)}
                          className="px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                        >
                          {copiedKey === `url_${pf}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              Đã chép
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Chép URL
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Localhost + Ngrok instructions */}
              <div className="p-4 rounded-xl bg-slate-900 text-slate-100 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-white">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  Hướng dẫn chạy Localhost trên máy cá nhân & Mở Tunnel nhận Webhook thật
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 leading-relaxed">
                  <li>
                    Cài đặt và chạy web trên cổng 3000:{' '}
                    <code className="font-mono text-sky-300">npm install && npm run dev</code>{' '}
                    → truy cập{' '}
                    <code className="font-mono text-emerald-300">http://localhost:3000</code>.
                  </li>
                  <li>
                    Mở HTTPS Tunnel trỏ vào cổng 3000 để Facebook / Zalo / TikTok gửi sự kiện về máy bạn:{' '}
                    <code className="font-mono text-sky-300">ngrok http 3000</code> hoặc{' '}
                    <code className="font-mono text-sky-300">
                      cloudflared tunnel --url http://localhost:3000
                    </code>
                    .
                  </li>
                  <li>
                    Lấy domain HTTPS từ ngrok (ví dụ{' '}
                    <code className="font-mono text-amber-300">https://xxxx.ngrok-free.app</code>) +
                    đuôi <code className="font-mono text-amber-300">/api/webhooks/facebook</code> (hoặc{' '}
                    <code className="font-mono text-amber-300">/zalo</code>), nhập Verify Token{' '}
                    <code className="font-mono text-emerald-300">{activeVerifyToken}</code>.
                  </li>
                </ol>
              </div>
            </div>

            {/* Bot Local Integration API */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#4A69BB]" />
                    Kết nối Bot Local / Tự động hóa ngoài (REST API & Outbound Webhook)
                  </h2>
                  <p className="text-slate-500 mt-1">
                    Dùng Bot riêng chạy trên máy của bạn để đọc tin nhắn khách hàng và tự động đẩy phản hồi qua <code className="font-mono text-slate-800">X-Bot-Api-Key</code>.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="bot-api-key" className="block font-semibold text-slate-800">
                    Bot API Key (Header: X-Bot-Api-Key)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="bot-api-key"
                      type="text"
                      value={activeBotKey}
                      onChange={(e) => {
                        setBotKeyDraft(e.target.value);
                        setBotSavedMsg(null);
                      }}
                      placeholder="Bấm Tạo Key hoặc nhập từ file .env"
                      className="flex-1 h-9 px-3 rounded-lg border border-slate-300 font-mono text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const rand = `dauto_bot_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
                        setBotKeyDraft(rand);
                        setBotSavedMsg(null);
                      }}
                      title="Tạo Bot API Key ngẫu nhiên"
                      className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Tạo Key
                    </button>
                    <button
                      type="button"
                      disabled={!activeBotKey}
                      onClick={() => handleCopyText('bot_key', activeBotKey)}
                      className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold inline-flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'bot_key' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="outbound-bot-url" className="block font-semibold text-slate-800">
                    Outbound Webhook URL (Đẩy sự kiện sang Bot Local)
                  </label>
                  <input
                    id="outbound-bot-url"
                    type="url"
                    value={activeOutboundUrl}
                    onChange={(e) => {
                      setOutboundUrlDraft(e.target.value);
                      setBotSavedMsg(null);
                    }}
                    placeholder="VD: http://localhost:8000/webhook (tùy chọn)"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 flex-wrap">
                <label className="inline-flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={automation.autoPauseBotOnStaffReply}
                    onChange={(e) =>
                      updateAutomation({ autoPauseBotOnStaffReply: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#4A69BB] rounded"
                  />
                  <span className="font-medium text-slate-800">
                    Tự động tạm dừng Bot khi nhân viên trả lời tay (Handover thông minh)
                  </span>
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    await updateAutomation({
                      botApiKey: activeBotKey.trim(),
                      outboundWebhookUrl: activeOutboundUrl.trim(),
                    });
                    setBotSavedMsg('Đã lưu cấu hình Bot Local!');
                  }}
                  className="h-9 px-4 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white font-semibold whitespace-nowrap"
                >
                  Lưu cấu hình Bot
                </button>
              </div>

              {botSavedMsg && (
                <p className="text-[11px] font-semibold text-emerald-700">{botSavedMsg}</p>
              )}

              <div className="p-3.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1 overflow-x-auto">
                <p className="text-sky-400 font-semibold">
                  # Endpoints dành cho Bot Local (Header: X-Bot-Api-Key: {activeBotKey || '<BOT_API_KEY>'})
                </p>
                <p>GET   {currentOrigin}/api/bot/conversations?unreadOnly=true</p>
                <p>POST  {currentOrigin}/api/bot/messages  {`{"conversationId":"...","content":"..."}`}</p>
                <p>PATCH {currentOrigin}/api/bot/conversations/:id/bot-pause  {`{"botPaused":true}`}</p>
              </div>
            </div>

            {/* Website Livechat Widget Embed */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-[#4A69BB]" />
                    Mã nhúng Website Livechat (Gắn vào Landing Page / Web bán hàng)
                  </h2>
                  <p className="text-slate-500 mt-0.5">
                    Dán thẻ script dưới đây trước thẻ đóng <code className="font-mono">&lt;/body&gt;</code> trên website của bạn để khách chat trực tiếp vào hộp thư dauto.
                  </p>
                </div>
                <select
                  aria-label="Chọn kênh Website để lấy mã nhúng"
                  value={activeWidgetPageId}
                  onChange={(e) => setWidgetPageId(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                >
                  {(websitePages.length > 0 ? websitePages : pages).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto whitespace-nowrap">
                  {widgetEmbedCode}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyText('widget_embed', widgetEmbedCode)}
                  className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  {copiedKey === 'widget_embed' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Đã chép
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Chép mã nhúng
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Bind Real Page ID & Access Token */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#4A69BB]" />
                  Gán Page ID / OA ID & Access Token thật cho từng kênh
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Điền đúng Page ID (hoặc Zalo OA ID) để webhook tự khớp đúng trang, và dán Access Token nếu muốn gửi tin nhắn trả lời ra nền tảng thật.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {pages.map((page) => {
                  const draft = credDrafts[page.id] ?? {};
                  const extVal = draft.externalId ?? page.externalId;
                  const tokVal = draft.accessToken ?? '';
                  return (
                    <div
                      key={page.id}
                      className="px-5 py-3.5 space-y-2 text-xs"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 lg:w-56 shrink-0">
                          <ChannelBadge platform={page.platform} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{page.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {page.hasAccessToken ? 'Đã cấu hình Token' : 'Chế độ thử nghiệm nội bộ'}
                              {page.tokenExpiresAt && (
                                <>
                                  {' · Hết hạn: '}
                                  {new Date(page.tokenExpiresAt).toLocaleString('vi-VN')}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={extVal}
                            onChange={(e) =>
                              setCredDrafts((prev) => ({
                                ...prev,
                                [page.id]: {
                                  ...prev[page.id],
                                  externalId: e.target.value,
                                  saved: false,
                                },
                              }))
                            }
                            placeholder="Page ID / OA ID"
                            aria-label={`Page ID cho ${page.name}`}
                            className="h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                          />
                          <input
                            type="password"
                            value={tokVal}
                            onChange={(e) =>
                              setCredDrafts((prev) => ({
                                ...prev,
                                [page.id]: {
                                  ...prev[page.id],
                                  accessToken: e.target.value,
                                  saved: false,
                                },
                              }))
                            }
                            placeholder={
                              page.hasAccessToken
                                ? '•••••••• (để trống nếu giữ nguyên)'
                                : 'Page Access Token (tùy chọn)'
                            }
                            aria-label={`Access Token cho ${page.name}`}
                            className="h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {page.platform === 'zalo' && (
                            <button
                              type="button"
                              disabled={refreshingPageId === page.id}
                              onClick={async () => {
                                setRefreshingPageId(page.id);
                                setPageRefreshNotice(null);
                                try {
                                  await refreshPageToken(page.id);
                                  setPageRefreshNotice({
                                    pageId: page.id,
                                    ok: true,
                                    text: 'Đã làm mới Access Token Zalo OA v4 thành công!',
                                  });
                                } catch (err) {
                                  setPageRefreshNotice({
                                    pageId: page.id,
                                    ok: false,
                                    text:
                                      err instanceof Error
                                        ? err.message
                                        : 'Không thể làm mới token Zalo OA',
                                  });
                                } finally {
                                  setRefreshingPageId(null);
                                }
                              }}
                              className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 text-[#0068FF] ${
                                  refreshingPageId === page.id ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {refreshingPageId === page.id
                                  ? 'Đang làm mới...'
                                  : 'Làm mới Token Zalo'}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await updatePageCredentials(page.id, {
                                externalId: extVal,
                                ...(tokVal.trim() ? { accessToken: tokVal.trim() } : {}),
                              });
                              setCredDrafts((prev) => ({
                                ...prev,
                                [page.id]: {
                                  externalId: extVal,
                                  accessToken: '',
                                  saved: true,
                                },
                              }));
                            }}
                            className="h-9 px-3.5 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white font-semibold shrink-0 whitespace-nowrap"
                          >
                            {draft.saved ? 'Đã lưu' : 'Lưu cấu hình'}
                          </button>
                        </div>
                      </div>
                      {pageRefreshNotice?.pageId === page.id && (
                        <p
                          className={`text-[11px] font-semibold ${
                            pageRefreshNotice.ok ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {pageRefreshNotice.text}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Team & Role Management (RBAC CRUD) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#4A69BB]" />
                    Quản lý nhân sự & Phân quyền theo Page
                  </h2>
                  <p className="text-slate-500 mt-0.5">
                    Mời nhân viên bằng Email Google. Khi nhân viên đăng nhập lần đầu, hệ thống tự động gắn đúng vai trò và danh sách Page được phép trực.
                  </p>
                </div>
              </div>

              {teamMsg && (
                <div
                  className={`px-3 py-2 rounded-lg border font-medium ${
                    teamMsg.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  {teamMsg.text}
                </div>
              )}

              {canManageRbac && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setTeamMsg(null);
                    try {
                      await inviteStaff({
                        name: inviteName.trim(),
                        email: inviteEmail.trim(),
                        role: inviteRole,
                        allowedPageIds: invitePageIds,
                      });
                      setInviteName('');
                      setInviteEmail('');
                      setInvitePageIds([]);
                      setTeamMsg({
                        ok: true,
                        text: 'Đã thêm nhân viên mới vào Workspace!',
                      });
                    } catch (err) {
                      setTeamMsg({
                        ok: false,
                        text:
                          err instanceof Error ? err.message : 'Không thể mời nhân viên',
                      });
                    }
                  }}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Họ tên nhân viên"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white"
                    />
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="Email Google đăng nhập *"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white"
                    />
                    <select
                      aria-label="Vai trò nhân viên mới"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white font-semibold"
                    >
                      <option value="sale">Nhân viên trực page (Sale)</option>
                      <option value="admin">Quản trị viên (Admin)</option>
                      <option value="warehouse">Nhân viên kho / vận đơn</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Giới hạn trang được phép xem (bỏ trống nếu cho xem tất cả trang):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {pages.map((p) => {
                        const checked = invitePageIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              setInvitePageIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== p.id)
                                  : [...prev, p.id]
                              )
                            }
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                              checked
                                ? 'bg-[#4A69BB] text-white border-[#4A69BB]'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white font-semibold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Mời nhân viên
                  </button>
                </form>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Nhân viên</th>
                      <th className="py-2.5 px-4">Vai trò</th>
                      <th className="py-2.5 px-4">Phạm vi Trang (Page)</th>
                      <th className="py-2.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => {
                      const isOwner = u.role === 'owner';
                      const allowed = u.allowedPageIds ?? [];
                      return (
                        <tr key={u.id}>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-slate-900">{u.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                          </td>
                          <td className="py-2.5 px-4">
                            {isOwner || !canManageRbac ? (
                              <span className="font-semibold text-[#4A69BB]">
                                {ROLE_LABELS[u.role].split(' (')[0]}
                              </span>
                            ) : (
                              <select
                                aria-label={`Vai trò của ${u.name}`}
                                value={u.role}
                                onChange={async (e) => {
                                  try {
                                    await updateStaffAccess(u.id, {
                                      role: e.target.value as UserRole,
                                    });
                                  } catch (err) {
                                    setTeamMsg({
                                      ok: false,
                                      text:
                                        err instanceof Error
                                          ? err.message
                                          : 'Lỗi đổi vai trò',
                                    });
                                  }
                                }}
                                className="h-8 px-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-800"
                              >
                                <option value="admin">Quản trị viên</option>
                                <option value="sale">Nhân viên trực page</option>
                                <option value="warehouse">Nhân viên kho</option>
                              </select>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {isOwner ? (
                              <span className="text-slate-500">Toàn quyền tất cả trang</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {pages.map((p) => {
                                  const selected = allowed.includes(p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      disabled={!canManageRbac}
                                      onClick={async () => {
                                        const next = selected
                                          ? allowed.filter((id) => id !== p.id)
                                          : [...allowed, p.id];
                                        await updateStaffAccess(u.id, {
                                          allowedPageIds: next,
                                        });
                                      }}
                                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                        selected
                                          ? 'bg-[#4A69BB]/12 border-[#4A69BB] text-[#4A69BB]'
                                          : 'bg-slate-50 border-slate-200 text-slate-500'
                                      }`}
                                    >
                                      {p.name.split(' ')[0]}
                                    </button>
                                  );
                                })}
                                {allowed.length === 0 && (
                                  <span className="text-[10px] text-emerald-700 font-medium ml-1">
                                    (Tất cả)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {!isOwner && canManageRbac && (
                              <button
                                type="button"
                                aria-label={`Xóa nhân viên ${u.name}`}
                                onClick={async () => {
                                  try {
                                    await deleteStaff(u.id);
                                  } catch (err) {
                                    setTeamMsg({
                                      ok: false,
                                      text:
                                        err instanceof Error ? err.message : 'Không thể xóa',
                                    });
                                  }
                                }}
                                className="text-slate-400 hover:text-rose-600 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RBAC Matrix */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  Ma trận phân quyền theo vai trò (RBAC)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Quyền hạn chức năng</th>
                      {ROLES.map((r) => (
                        <th key={r} className="py-2.5 px-4 text-center">
                          {ROLE_LABELS[r].split(' (')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PERMISSIONS_LIST.map((perm) => (
                      <tr key={perm.key}>
                        <td className="py-2.5 px-4 font-medium text-slate-800">
                          {perm.label}
                        </td>
                        {ROLES.map((r) => (
                          <td key={r} className="py-2.5 px-4 text-center">
                            {hasPermission(r, perm.key) ? (
                              <span className="text-emerald-600 font-bold">Có</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
