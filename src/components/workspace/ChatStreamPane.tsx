import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Image as ImageIcon,
  Zap,
  ThumbsUp,
  EyeOff,
  Eye,
  MessageSquarePlus,
  Tag as TagIcon,
  UserCheck,
  Radio,
  CheckCheck,
  X,
  Bot,
  PauseCircle,
  Upload,
  MessageCircle,
  Paperclip,
  FileText,
  Download,
} from 'lucide-react';
import { ChannelBadge, PLATFORM_META } from '../ChannelBadge';
import { useAppStore } from '../../store/useAppStore';
import {
  formatRelativeTime,
  interpolateQuickReply,
} from '../../utils/omnichannel';
import type {
  ConnectedPage,
  Conversation,
  Customer,
  Message,
  PlatformType,
  Product,
  QuickReply,
  Tag,
  User,
} from '../../types/schema';

export function ChatStreamPane({
  conversation,
  customer,
  page,
  messages,
  tags,
  users,
  currentUser,
  quickReplies,
  products,
  onSelectConversation,
}: {
  conversation: Conversation | null;
  customer: Customer | null;
  page: ConnectedPage | null;
  messages: Message[];
  tags: Tag[];
  users: User[];
  currentUser: User | undefined;
  quickReplies: QuickReply[];
  products: Product[];
  onSelectConversation: (convId: string) => void;
}) {
  const {
    sendMessage,
    updateConversation,
    toggleCommentAction,
    simulateWebhook,
    uploadAttachment,
    loadOlderMessages,
    hasMoreMessagesByConv,
  } = useAppStore();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyAsPublicComment, setReplyAsPublicComment] = useState(false);
  const [replyingCommentAsInbox, setReplyingCommentAsInbox] = useState<string | null>(
    null
  );
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  // Simulator state for testing real Webhook Receiver
  const [simCustomerName, setSimCustomerName] = useState('Nguyễn Thảo Nguyên');
  const [simType, setSimType] = useState<'inbox' | 'comment'>('comment');
  const [simContent, setSimContent] = useState(
    'Giá serum vitamin C bao nhiêu vậy shop? SĐT mình 0918 776 655'
  );
  const [simPlatform, setSimPlatform] = useState<PlatformType>('facebook');
  const [simSubmitting, setSimSubmitting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, conversation?.id]);

  // Reset per-conversation composer modes
  useEffect(() => {
    setReplyingCommentAsInbox(null);
    setReplyAsPublicComment(false);
    setUploadError(null);
  }, [conversation?.id]);

  // Show Quick Replies popup automatically when typing "/"
  useEffect(() => {
    if (draft.startsWith('/')) {
      setShowQuickReplies(true);
    } else if (showQuickReplies && !draft.includes('/')) {
      setShowQuickReplies(false);
    }
  }, [draft]);

  // Esc to close popovers and lightbox
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQuickReplies(false);
        setShowImagePicker(false);
        setShowSimulator(false);
        setLightboxUrl(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!conversation || !customer || !page) {
    return (
      <section className="flex-1 bg-[#F0F2F5] flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-sm">
          <p className="text-sm font-semibold text-slate-800">
            Chọn một hội thoại bên trái để bắt đầu tư vấn
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Mọi tin nhắn và bình luận từ đa kênh sẽ đồng bộ thời gian thực tại đây.
          </p>
        </div>
      </section>
    );
  }

  const filteredQuickReplies = quickReplies.filter((qr) => {
    if (!draft.startsWith('/')) return true;
    const query = draft.slice(1).toLowerCase();
    return (
      qr.shortcut.toLowerCase().includes(query) ||
      qr.title.toLowerCase().includes(query)
    );
  });

  const handleInsertQuickReply = (qr: QuickReply) => {
    const interpolated = interpolateQuickReply(qr.content, {
      full_name: customer.fullName,
      phone: customer.phone,
      page_name: page.name,
      staff_name: currentUser?.name || 'Nhân viên CSKH',
    });
    setDraft(interpolated);
    setShowQuickReplies(false);
    inputRef.current?.focus();
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const usePublicComment =
        conversation.channelType === 'comment' &&
        replyAsPublicComment &&
        !replyingCommentAsInbox;
      await sendMessage({
        conversationId: conversation.id,
        content: draft.trim(),
        messageType: 'text',
        convertCommentToInbox: Boolean(replyingCommentAsInbox),
        commentId: replyingCommentAsInbox ?? undefined,
        replyAsPublicComment: usePublicComment,
      });
      setDraft('');
      setReplyingCommentAsInbox(null);
      setShowQuickReplies(false);
    } finally {
      setSending(false);
    }
  };

  const handleSendImage = async (imageUrl: string, caption: string) => {
    setShowImagePicker(false);
    await sendMessage({
      conversationId: conversation.id,
      content: caption,
      messageType: 'image',
      imageUrl,
    });
  };

  const handleUploadAndSendFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadError(null);
    setUploadingImage(true);
    setShowImagePicker(false);

    const captionDraft = draft.trim();
    let clearedDraft = false;

    try {
      for (const file of fileArray) {
        const uploaded = await uploadAttachment(file);
        const messageText =
          !clearedDraft && captionDraft
            ? captionDraft
            : uploaded.isImage
              ? `Gửi hình ảnh ${uploaded.fileName}`
              : `Gửi tài liệu ${uploaded.fileName}`;

        await sendMessage({
          conversationId: conversation.id,
          content: messageText,
          messageType: uploaded.isImage ? 'image' : 'file',
          imageUrl: uploaded.url,
          fileName: uploaded.fileName,
        });

        if (!clearedDraft && captionDraft) {
          setDraft('');
          clearedDraft = true;
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Tải tệp đính kèm thất bại');
    } finally {
      setUploadingImage(false);
    }
  };

  const hasMoreMessages =
    hasMoreMessagesByConv[conversation.id] ?? messages.length >= 50;

  const handleToggleTag = async (tagId: string) => {
    const exists = conversation.tagIds.includes(tagId);
    const nextTagIds = exists
      ? conversation.tagIds.filter((id) => id !== tagId)
      : [...conversation.tagIds, tagId];
    await updateConversation(conversation.id, { tagIds: nextTagIds });
  };

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simContent.trim()) return;
    setSimSubmitting(true);
    try {
      const res = await simulateWebhook({
        platform: simPlatform,
        customerName: simCustomerName.trim() || 'Khách hàng mới',
        channelType: simType,
        content: simContent.trim(),
      });
      setShowSimulator(false);
      onSelectConversation(res.conversation.id);
    } finally {
      setSimSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Khung tương tác thời gian thực"
      className="flex-1 lg:w-[45%] flex flex-col h-full bg-[#F0F2F5] min-w-0 relative"
    >
      {/* Conversation Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              {customer.avatarUrl ? (
                <img
                  src={customer.avatarUrl}
                  alt={customer.fullName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                  {customer.fullName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="absolute -bottom-1 -right-1 ring-2 ring-white rounded-sm">
                <ChannelBadge platform={conversation.platform} size="xs" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 truncate">
                  {customer.fullName}
                </h2>
                <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                  {conversation.channelType === 'comment' ? 'Bình luận' : 'Tin nhắn'}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {PLATFORM_META[conversation.platform].label} · {page.name}
              </p>
            </div>
          </div>

          {/* Right Controls: Assignee + Bot Pause + Mark Unread + Webhook Simulator */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 h-8">
              <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                aria-label="Phân công nhân viên phụ trách"
                value={conversation.assigneeId || ''}
                onChange={(e) =>
                  updateConversation(conversation.id, {
                    assigneeId: e.target.value || null,
                  })
                }
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
              >
                <option value="">Chưa phân công</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                updateConversation(conversation.id, {
                  botPaused: !conversation.botPaused,
                })
              }
              title={
                conversation.botPaused
                  ? 'Bot Local đang tạm dừng ở hội thoại này — Bấm để bật lại'
                  : 'Bot Local đang được phép trả lời — Bấm để tạm dừng cho nhân viên trực tiếp tư vấn'
              }
              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                conversation.botPaused
                  ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {conversation.botPaused ? (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Bot: Tạm dừng</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Bot: Đang bật</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                updateConversation(conversation.id, {
                  unreadCount: conversation.unreadCount > 0 ? 0 : 1,
                })
              }
              title={
                conversation.unreadCount > 0
                  ? 'Đánh dấu đã đọc'
                  : 'Đánh dấu chưa đọc'
              }
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#4A69BB]" />
              <span className="hidden xl:inline">
                {conversation.unreadCount > 0 ? 'Đã đọc' : 'Chưa đọc'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowSimulator((v) => !v)}
              className="h-8 px-2.5 rounded-lg border border-[#4A69BB]/30 bg-[#4A69BB]/8 hover:bg-[#4A69BB]/15 text-xs font-semibold text-[#4A69BB] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Test Webhook</span>
            </button>
          </div>
        </div>

        {/* Tag Selection Bar */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 mr-1">
            <TagIcon className="w-3 h-3" />
            Thẻ:
          </span>
          {tags.map((tag) => {
            const active = conversation.tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleToggleTag(tag.id)}
                style={
                  active
                    ? {
                        backgroundColor: `${tag.color}18`,
                        borderColor: tag.color,
                        color: tag.color,
                      }
                    : undefined
                }
                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  active
                    ? ''
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  style={{ backgroundColor: tag.color }}
                  className="w-2 h-2 rounded-xs shrink-0"
                />
                <span>{tag.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Webhook Simulator Popover */}
      {showSimulator && (
        <div className="absolute top-24 right-4 z-30 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-900">
              Giả lập sự kiện Webhook từ Mạng Xã Hội
            </h3>
            <button
              type="button"
              aria-label="Đóng giả lập webhook"
              onClick={() => setShowSimulator(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSimulateWebhook} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Chọn kênh webhook"
                value={simPlatform}
                onChange={(e) => setSimPlatform(e.target.value as PlatformType)}
                className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok Shop</option>
                <option value="zalo">Zalo OA</option>
                <option value="instagram">Instagram</option>
                <option value="shopee">Shopee</option>
                <option value="website">Website</option>
              </select>
              <select
                aria-label="Loại sự kiện webhook"
                value={simType}
                onChange={(e) => setSimType(e.target.value as 'inbox' | 'comment')}
                className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="comment">Bình luận bài viết</option>
                <option value="inbox">Tin nhắn (Inbox)</option>
              </select>
            </div>
            <input
              type="text"
              value={simCustomerName}
              onChange={(e) => setSimCustomerName(e.target.value)}
              placeholder="Tên khách hàng"
              className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs"
            />
            <textarea
              rows={2}
              value={simContent}
              onChange={(e) => setSimContent(e.target.value)}
              placeholder="Nhập nội dung bình luận / tin nhắn..."
              className="w-full p-2.5 rounded-lg border border-slate-200 text-xs resize-none"
            />
            <p className="text-[11px] text-slate-500">
              Mẹo: Thử gửi bình luận có SĐT (VD: 0918 776 655) hoặc từ khóa "giá" để kiểm tra Tự động ẩn & Tự động trả lời.
            </p>
            <button
              type="submit"
              disabled={simSubmitting}
              className="w-full py-2 rounded-lg bg-[#4A69BB] text-white text-xs font-semibold hover:bg-[#3d59a3]"
            >
              {simSubmitting ? 'Đang gửi webhook...' : 'Bắn sự kiện Webhook Realtime'}
            </button>
          </form>
        </div>
      )}

      {/* Post Context Banner for Comment Threads */}
      {conversation.channelType === 'comment' && conversation.postTitle && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">
            <strong>Bình luận trên bài viết:</strong> {conversation.postTitle}
          </span>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 dauto-scroll">
        {hasMoreMessages && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={async () => {
                setLoadingOlder(true);
                try {
                  await loadOlderMessages(conversation.id);
                } finally {
                  setLoadingOlder(false);
                }
              }}
              className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-[#4A69BB] hover:bg-slate-50 shadow-xs"
            >
              {loadingOlder ? 'Đang tải tin nhắn cũ...' : 'Tải tin nhắn cũ hơn'}
            </button>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.senderType === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="px-3.5 py-1.5 rounded-lg bg-slate-200/80 text-slate-700 text-[11px] font-medium text-center max-w-md">
                  {msg.content}
                </div>
              </div>
            );
          }

          const isStaff = msg.senderType === 'staff';
          const isComment = msg.messageType === 'comment';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">{msg.senderName}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatRelativeTime(msg.createdAt)}</span>
                {isComment && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-medium">Bình luận</span>
                  </>
                )}
                {msg.isHidden && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-rose-600 font-semibold">Đã ẩn bình luận</span>
                  </>
                )}
              </div>

              <div
                className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed border ${
                  isStaff
                    ? 'bg-[#4A69BB] text-white border-[#4A69BB]'
                    : msg.isHidden
                      ? 'bg-slate-100 text-slate-600 border-dashed border-slate-300'
                      : 'bg-white text-slate-900 border-slate-200'
                }`}
              >
                {msg.imageUrl && msg.messageType === 'file' ? (
                  <a
                    href={msg.imageUrl}
                    download={msg.fileName || 'tep-dinh-kem'}
                    target="_blank"
                    rel="noreferrer"
                    className={`mb-2 px-3 py-2 rounded-lg border flex items-center gap-2.5 transition-colors ${
                      isStaff
                        ? 'bg-white/15 border-white/25 text-white hover:bg-white/20'
                        : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold truncate max-w-[200px]">
                      {msg.fileName || 'Tài liệu đính kèm'}
                    </span>
                    <Download className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  </a>
                ) : (
                  msg.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(msg.imageUrl || null)}
                      className="block text-left mb-2 rounded-lg overflow-hidden border border-black/10 hover:opacity-95 transition-opacity"
                    >
                      <img
                        src={msg.imageUrl}
                        alt={msg.content || 'Hình ảnh sản phẩm'}
                        referrerPolicy="no-referrer"
                        className="w-48 h-48 object-cover"
                      />
                    </button>
                  )
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>

              {/* Comment Moderation Actions */}
              {isComment && !isStaff && (
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => toggleCommentAction(msg.id, 'like')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                      msg.isLiked
                        ? 'bg-blue-100 text-[#4A69BB]'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ThumbsUp className="w-3 h-3" />
                    <span>{msg.isLiked ? 'Đã thích' : 'Thích'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleCommentAction(msg.id, 'toggle_hide')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                      msg.isHidden
                        ? 'bg-rose-50 border border-rose-200 text-rose-700'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {msg.isHidden ? (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Hiện bình luận</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Ẩn bình luận</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReplyingCommentAsInbox(msg.id);
                      setDraft(
                        `Chào ${customer.fullName}, cảm ơn bạn đã bình luận trên ${page.name}. Em gửi thông tin chi tiết cho mình qua tin nhắn riêng nhé!`
                      );
                      inputRef.current?.focus();
                    }}
                    className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <MessageSquarePlus className="w-3 h-3 text-[#4A69BB]" />
                    <span>Nhắn tin riêng</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          if (e.dataTransfer.files?.length) {
            void handleUploadAndSendFiles(e.dataTransfer.files);
          }
        }}
        className={`bg-white border-t border-slate-200 p-3 relative shrink-0 transition-colors ${
          isDraggingFile ? 'ring-2 ring-[#4A69BB] bg-blue-50/40' : ''
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              void handleUploadAndSendFiles(files);
            }
            e.target.value = '';
          }}
        />

        {/* Quick Replies Floating Menu (triggered by "/" or Zap button) */}
        {showQuickReplies && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-20 max-h-64 flex flex-col">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Mẫu câu trả lời nhanh (gõ / để lọc)
              </span>
              <button
                type="button"
                aria-label="Đóng mẫu trả lời nhanh"
                onClick={() => setShowQuickReplies(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div
              role="listbox"
              aria-label="Kho mẫu câu trả lời nhanh"
              className="overflow-y-auto divide-y divide-slate-100 dauto-scroll"
            >
              {filteredQuickReplies.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">Không tìm thấy mẫu câu phù hợp</p>
              ) : (
                filteredQuickReplies.map((qr) => (
                  <button
                    key={qr.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleInsertQuickReply(qr)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-[#4A69BB]/8 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#4A69BB] font-mono">
                        {qr.shortcut}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {qr.title}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5 line-clamp-1">
                      {qr.content}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Product Image Picker + Real File Upload Popover */}
        {showImagePicker && (
          <div className="absolute bottom-full left-3 mb-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl p-3 z-20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Gửi hình ảnh cho khách
              </span>
              <button
                type="button"
                aria-label="Đóng chọn ảnh"
                onClick={() => setShowImagePicker(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-3 rounded-lg border border-dashed border-[#4A69BB] bg-[#4A69BB]/6 hover:bg-[#4A69BB]/12 text-xs font-semibold text-[#4A69BB] flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Chọn nhiều ảnh / file PDF, Word, Excel (hoặc kéo thả)</span>
            </button>

            <p className="text-[11px] font-semibold text-slate-500">
              Hoặc chọn nhanh ảnh sản phẩm trong kho:
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto dauto-scroll">
              {products.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() =>
                    handleSendImage(prod.imageUrl, `Gửi bạn hình ảnh ${prod.name} ạ`)
                  }
                  className="p-1.5 rounded-lg border border-slate-200 hover:border-[#4A69BB] text-left transition-colors"
                >
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-20 object-cover rounded mb-1"
                  />
                  <p className="text-[11px] font-semibold text-slate-800 truncate">
                    {prod.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comment Thread Reply Mode Switcher */}
        {conversation.channelType === 'comment' && !replyingCommentAsInbox && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-500 font-medium">Chế độ gửi:</span>
            <button
              type="button"
              onClick={() => setReplyAsPublicComment(false)}
              className={`px-2 py-0.5 rounded font-semibold border transition-colors ${
                !replyAsPublicComment
                  ? 'bg-[#4A69BB] text-white border-[#4A69BB]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Nhắn tin riêng (Inbox)
            </button>
            <button
              type="button"
              onClick={() => setReplyAsPublicComment(true)}
              className={`px-2 py-0.5 rounded font-semibold border inline-flex items-center gap-1 transition-colors ${
                replyAsPublicComment
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <MessageCircle className="w-3 h-3" />
              Trả lời bình luận công khai
            </button>
          </div>
        )}

        {replyingCommentAsInbox && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center justify-between">
            <span>Đang trả lời bằng tin nhắn riêng (Inbox) từ bình luận</span>
            <button
              type="button"
              onClick={() => setReplyingCommentAsInbox(null)}
              className="text-blue-600 hover:underline font-semibold"
            >
              Hủy
            </button>
          </div>
        )}

        {uploadError && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-rose-500 hover:text-rose-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile();
                  if (file) {
                    e.preventDefault();
                    void handleUploadAndSendFiles([file]);
                    break;
                  }
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            aria-label="Nhập nội dung tin nhắn phản hồi"
            placeholder={
              uploadingImage
                ? 'Đang tải tệp đính kèm...'
                : 'Nhập tin nhắn... (gõ / để mở mẫu câu nhanh, dán ảnh Ctrl+V hoặc Enter để gửi)'
            }
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4A69BB] resize-none"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => {
                  setShowImagePicker((v) => !v);
                  setShowQuickReplies(false);
                }}
                className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>{uploadingImage ? 'Đang tải...' : 'Gửi ảnh'}</span>
              </button>

              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
                title="Đính kèm nhiều ảnh hoặc tài liệu PDF, Word, Excel"
                className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                <span>Đính kèm tệp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowQuickReplies((v) => !v);
                  setShowImagePicker(false);
                }}
                className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Trả lời nhanh (/)</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={!draft.trim() || sending || uploadingImage}
              className="h-8 px-4 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] disabled:bg-slate-300 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gửi</span>
            </button>
          </div>
        </form>
      </div>

      {/* Image Lightbox Modal */}
      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh phóng to"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl max-h-[85vh] bg-white rounded-xl p-2 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Đóng ảnh phóng to"
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-800 shadow-lg flex items-center justify-center hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxUrl}
              alt="Ảnh xem trước"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </section>
  );
}
