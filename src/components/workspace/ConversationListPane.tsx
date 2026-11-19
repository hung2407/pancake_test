import type { RefObject } from 'react';
import { Search, Phone, MessageCircle, MessageSquare, PauseCircle } from 'lucide-react';
import { ChannelBadge } from '../ChannelBadge';
import { formatRelativeTime } from '../../utils/omnichannel';
import type {
  ConnectedPage,
  Conversation,
  Customer,
  Tag,
  User,
} from '../../types/schema';

export type QuickFilterType =
  | 'all'
  | 'unread'
  | 'inbox'
  | 'comment'
  | 'has_phone'
  | 'unreplied';

const QUICK_FILTERS: { id: QuickFilterType; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'inbox', label: 'Tin nhắn' },
  { id: 'comment', label: 'Bình luận' },
  { id: 'has_phone', label: 'Có SĐT' },
  { id: 'unreplied', label: 'Chưa phản hồi' },
];

export function ConversationListPane({
  conversations,
  activeConvId,
  onSelectConv,
  customers,
  pages,
  tags,
  users,
  search,
  onSearchChange,
  quickFilter,
  onQuickFilterChange,
  tagFilter,
  onTagFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  pageTitle,
  searchInputRef,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelectConv: (convId: string) => void;
  customers: Customer[];
  pages: ConnectedPage[];
  tags: Tag[];
  users: User[];
  search: string;
  onSearchChange: (val: string) => void;
  quickFilter: QuickFilterType;
  onQuickFilterChange: (val: QuickFilterType) => void;
  tagFilter: string;
  onTagFilterChange: (val: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (val: string) => void;
  pageTitle: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <aside
      aria-label="Danh sách hội thoại"
      className="w-full lg:w-[25%] lg:min-w-[290px] lg:max-w-[380px] bg-white border-r border-slate-200 flex flex-col h-full shrink-0"
    >
      {/* Top Bar */}
      <div className="p-3 border-b border-slate-200 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 truncate">{pageTitle}</h2>
          <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
            {conversations.length} hội thoại
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Tìm kiếm tin nhắn, khách hàng, số điện thoại"
            placeholder="Tìm tên khách, SĐT, tin nhắn... (Ctrl+K)"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4A69BB]"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-1">
          {QUICK_FILTERS.map((f) => {
            const active = quickFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onQuickFilterChange(f.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#4A69BB] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Tag & Assignee Filters */}
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Lọc theo thẻ phân loại"
            value={tagFilter}
            onChange={(e) => onTagFilterChange(e.target.value)}
            className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#4A69BB]"
          >
            <option value="all">Tất cả thẻ</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo nhân viên phụ trách"
            value={assigneeFilter}
            onChange={(e) => onAssigneeFilterChange(e.target.value)}
            className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#4A69BB]"
          >
            <option value="all">Tất cả nhân viên</option>
            <option value="unassigned">Chưa phân công</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dauto-scroll">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Không có hội thoại nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          conversations.map((conv) => {
            const customer = customers.find((c) => c.id === conv.customerId);
            const page = pages.find((p) => p.id === conv.pageId);
            const assignee = users.find((u) => u.id === conv.assigneeId);
            const convTags = tags.filter((t) => conv.tagIds.includes(t.id));
            const isSelected = conv.id === activeConvId;

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConv(conv.id)}
                className={`w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors ${
                  isSelected
                    ? 'bg-[#4A69BB]/10'
                    : conv.unreadCount > 0
                      ? 'bg-blue-50/40 hover:bg-slate-50'
                      : 'bg-white hover:bg-slate-50'
                }`}
              >
                {/* Avatar & Channel */}
                <div className="relative shrink-0 mt-0.5">
                  {customer?.avatarUrl ? (
                    <img
                      src={customer.avatarUrl}
                      alt={customer.fullName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                      {(customer?.fullName || 'KH').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="absolute -bottom-1 -right-1 ring-2 ring-white rounded-md">
                    <ChannelBadge platform={conv.platform} size="xs" />
                  </span>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${
                        conv.unreadCount > 0
                          ? 'font-bold text-slate-900'
                          : 'font-semibold text-slate-800'
                      }`}
                    >
                      {customer?.fullName || 'Khách hàng'}
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {formatRelativeTime(conv.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                    {conv.channelType === 'comment' ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium">
                        <MessageCircle className="w-3 h-3" />
                        Bình luận
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-slate-500">
                        <MessageSquare className="w-3 h-3" />
                        Tin nhắn
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{page?.name}</span>
                  </div>

                  <p
                    className={`text-xs mt-1 line-clamp-2 leading-snug ${
                      conv.unreadCount > 0 ? 'text-slate-900 font-medium' : 'text-slate-600'
                    }`}
                  >
                    {conv.lastMessageText}
                  </p>

                  {/* Bottom Meta Row: Tags, Phone indicator, Unread count, Assignee */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      {conv.hasPhone && (
                        <span
                          title="Đã nhận diện số điện thoại"
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700"
                        >
                          <Phone className="w-3 h-3" />
                          <span className="font-mono tabular-nums">
                            {customer?.phone || 'SĐT'}
                          </span>
                        </span>
                      )}
                      {convTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700"
                        >
                          <span
                            style={{ backgroundColor: tag.color }}
                            className="w-2 h-2 rounded-xs shrink-0"
                          />
                          <span className="truncate max-w-[85px]">{tag.name}</span>
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.botPaused && (
                        <span
                          title="Bot Local đang tạm dừng ở hội thoại này"
                          className="text-amber-600"
                        >
                          <PauseCircle className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {assignee && (
                        <span
                          title={`Phụ trách: ${assignee.name}`}
                          className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
                        >
                          {assignee.name.split(' ').slice(-1)[0]}
                        </span>
                      )}
                      {conv.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#4A69BB] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}

        {hasMore && onLoadMore && (
          <div className="p-3 bg-slate-50/70">
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="w-full py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#4A69BB]"
            >
              {loadingMore ? 'Đang tải thêm...' : 'Tải thêm hội thoại'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
