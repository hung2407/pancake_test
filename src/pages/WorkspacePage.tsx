import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Layers, PlusCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  ConversationListPane,
  type QuickFilterType,
} from '../components/workspace/ConversationListPane';
import { ChatStreamPane } from '../components/workspace/ChatStreamPane';
import { CrmMiniPosPane } from '../components/workspace/CrmMiniPosPane';

export function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const pageIdParam = searchParams.get('pageId');
  const pagesParam = searchParams.get('pages');
  const convIdParam = searchParams.get('convId');

  const {
    pages,
    conversations,
    messages,
    customers,
    tags,
    users,
    currentUserId,
    quickReplies,
    products,
    orders,
    hasMoreConversations,
    connectPage,
    updateConversation,
    loadMoreConversations,
  } = useAppStore();

  const [activeConvId, setActiveConvId] = useState<string | null>(convIdParam);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [mobileTab, setMobileTab] = useState<'list' | 'chat' | 'crm'>('chat');
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const targetPageIds = useMemo(() => {
    if (pagesParam) return pagesParam.split(',').filter(Boolean);
    if (pageIdParam) return [pageIdParam];
    const active = pages.filter((p) => p.isActive).map((p) => p.id);
    return active;
  }, [pagesParam, pageIdParam, pages]);

  const activePagesCount = pages.filter((p) => p.isActive).length;

  const filteredConversations = useMemo(() => {
    return conversations
      .filter((conv) => {
        if (targetPageIds.length > 0 && !targetPageIds.includes(conv.pageId)) {
          return false;
        }
        if (quickFilter === 'unread' && conv.unreadCount === 0) return false;
        if (quickFilter === 'inbox' && conv.channelType !== 'inbox') return false;
        if (quickFilter === 'comment' && conv.channelType !== 'comment') return false;
        if (quickFilter === 'has_phone' && !conv.hasPhone) return false;
        if (quickFilter === 'unreplied' && conv.isReplied) return false;
        if (tagFilter !== 'all' && !conv.tagIds.includes(tagFilter)) return false;
        if (assigneeFilter === 'unassigned' && conv.assigneeId !== null) return false;
        if (
          assigneeFilter !== 'all' &&
          assigneeFilter !== 'unassigned' &&
          conv.assigneeId !== assigneeFilter
        ) {
          return false;
        }

        if (search.trim()) {
          const q = search.toLowerCase();
          const cust = customers.find((c) => c.id === conv.customerId);
          const matchCustomer = cust?.fullName.toLowerCase().includes(q);
          const matchPhone = cust?.phone.includes(q);
          const matchMsg = conv.lastMessageText.toLowerCase().includes(q);
          if (!matchCustomer && !matchPhone && !matchMsg) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
  }, [
    conversations,
    targetPageIds,
    quickFilter,
    tagFilter,
    assigneeFilter,
    search,
    customers,
  ]);

  // Select conversation automatically on load or query param change
  useEffect(() => {
    if (convIdParam && conversations.some((c) => c.id === convIdParam)) {
      setActiveConvId(convIdParam);
      return;
    }
    if (
      !activeConvId ||
      !filteredConversations.some((c) => c.id === activeConvId)
    ) {
      setActiveConvId(filteredConversations[0]?.id ?? null);
    }
  }, [convIdParam, filteredConversations.length, targetPageIds.join(',')]);

  // Keyboard shortcuts: Alt+Up/Down (switch conv), Ctrl+K/F (search), F1-F6 (toggle tags)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setMobileTab('list');
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (/^F[1-6]$/.test(e.key)) {
        const tagIdx = Number(e.key.slice(1)) - 1;
        const targetTag = tags[tagIdx];
        const currentActive =
          conversations.find((c) => c.id === activeConvId) ?? filteredConversations[0];
        if (targetTag && currentActive) {
          e.preventDefault();
          const exists = currentActive.tagIds.includes(targetTag.id);
          const nextTagIds = exists
            ? currentActive.tagIds.filter((id) => id !== targetTag.id)
            : [...currentActive.tagIds, targetTag.id];
          void updateConversation(currentActive.id, { tagIds: nextTagIds });
        }
        return;
      }

      if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      if (filteredConversations.length === 0) return;
      e.preventDefault();
      const idx = filteredConversations.findIndex((c) => c.id === activeConvId);
      const nextIdx =
        e.key === 'ArrowDown'
          ? (idx + 1) % filteredConversations.length
          : (idx - 1 + filteredConversations.length) % filteredConversations.length;
      const nextConv = filteredConversations[nextIdx];
      if (nextConv) {
        handleSelectConv(nextConv.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredConversations, activeConvId, tags, conversations]);

  const handleSelectConv = (convId: string) => {
    setActiveConvId(convId);
    setMobileTab('chat');
    const conv = conversations.find((c) => c.id === convId);
    if (conv && conv.unreadCount > 0) {
      updateConversation(convId, { unreadCount: 0 });
    }
  };

  const activeConv =
    conversations.find((c) => c.id === activeConvId) ??
    filteredConversations[0] ??
    null;
  const activeCustomer = activeConv
    ? customers.find((c) => c.id === activeConv.customerId) ?? null
    : null;
  const activePage = activeConv
    ? pages.find((p) => p.id === activeConv.pageId) ?? null
    : null;
  const activeMessages = activeConv
    ? messages
        .filter((m) => m.conversationId === activeConv.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
    : [];
  const activeCustomerOrders = activeCustomer
    ? orders.filter((o) => o.customerId === activeCustomer.id)
    : [];
  const currentUser = users.find((u) => u.id === currentUserId);

  const pageTitle = useMemo(() => {
    if (pagesParam && targetPageIds.length > 1) {
      return `Gộp ${targetPageIds.length} trang`;
    }
    if (pageIdParam) {
      const p = pages.find((x) => x.id === pageIdParam);
      if (p) return p.name;
    }
    return activePagesCount > 0
      ? `Hộp thư (${activePagesCount} trang)`
      : 'Tất cả hội thoại mẫu';
  }, [pagesParam, pageIdParam, targetPageIds.length, pages, activePagesCount]);

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-[#F0F2F5] overflow-hidden">
      {/* Banner if no pages are activated on Dashboard yet */}
      {activePagesCount === 0 && !pageIdParam && !pagesParam && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-amber-900">
            <Layers className="w-4 h-4 shrink-0" />
            <span>
              Bạn chưa kích hoạt trang nào trên Bảng điều khiển. Đang hiển thị dữ liệu mẫu để thao tác thử nghiệm.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                for (const p of pages) {
                  await connectPage({ pageId: p.id, platform: p.platform });
                }
              }}
              className="px-2.5 py-1 rounded-md bg-[#4A69BB] text-white font-semibold inline-flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Kích hoạt tất cả kênh
            </button>
            <Link
              to="/dashboard"
              className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-amber-900 font-semibold"
            >
              Về Bảng điều khiển
            </Link>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden grid grid-cols-3 border-b border-slate-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`py-2.5 text-xs font-semibold ${
            mobileTab === 'list'
              ? 'text-[#4A69BB] border-b-2 border-[#4A69BB]'
              : 'text-slate-600'
          }`}
        >
          Hội thoại ({filteredConversations.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('chat')}
          className={`py-2.5 text-xs font-semibold ${
            mobileTab === 'chat'
              ? 'text-[#4A69BB] border-b-2 border-[#4A69BB]'
              : 'text-slate-600'
          }`}
        >
          Tin nhắn
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('crm')}
          className={`py-2.5 text-xs font-semibold ${
            mobileTab === 'crm'
              ? 'text-[#4A69BB] border-b-2 border-[#4A69BB]'
              : 'text-slate-600'
          }`}
        >
          CRM & Tạo đơn
        </button>
      </div>

      {/* 3-Pane Fullscreen Layout: 25% | 45% | 30% */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div
          className={`${
            mobileTab === 'list' ? 'flex w-full' : 'hidden'
          } lg:flex lg:contents`}
        >
          <ConversationListPane
            conversations={filteredConversations}
            activeConvId={activeConv?.id ?? null}
            onSelectConv={handleSelectConv}
            customers={customers}
            pages={pages}
            tags={tags}
            users={users}
            search={search}
            onSearchChange={setSearch}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={setAssigneeFilter}
            pageTitle={pageTitle}
            searchInputRef={searchInputRef}
            hasMore={hasMoreConversations}
            loadingMore={loadingMoreConvs}
            onLoadMore={async () => {
              setLoadingMoreConvs(true);
              try {
                await loadMoreConversations();
              } finally {
                setLoadingMoreConvs(false);
              }
            }}
          />
        </div>

        <div
          className={`${
            mobileTab === 'chat' ? 'flex w-full' : 'hidden'
          } lg:flex lg:contents`}
        >
          <ChatStreamPane
            conversation={activeConv}
            customer={activeCustomer}
            page={activePage}
            messages={activeMessages}
            tags={tags}
            users={users}
            currentUser={currentUser}
            quickReplies={quickReplies}
            products={products}
            onSelectConversation={handleSelectConv}
          />
        </div>

        <div
          className={`${
            mobileTab === 'crm' ? 'flex w-full' : 'hidden'
          } lg:flex lg:contents`}
        >
          <CrmMiniPosPane
            conversation={activeConv}
            customer={activeCustomer}
            messages={activeMessages}
            products={products}
            customerOrders={activeCustomerOrders}
          />
        </div>
      </div>
    </div>
  );
}
