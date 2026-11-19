import { useMemo, useState } from 'react';
import {
  MessageSquare,
  ShoppingBag,
  TrendingUp,
  Clock,
  BarChart3,
  Calendar,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ChannelBadge, PLATFORM_META } from '../components/ChannelBadge';
import {
  ROLE_LABELS,
  formatVND,
  isWithinDateRange,
  type DateRangeFilter,
} from '../utils/omnichannel';
import type { PlatformType } from '../types/schema';

const PLATFORMS: PlatformType[] = [
  'facebook',
  'tiktok',
  'zalo',
  'instagram',
  'shopee',
  'website',
];

const DATE_RANGES: { id: DateRangeFilter; label: string }[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'all', label: 'Tất cả' },
];

export function AnalyticsPage() {
  const { conversations, messages, orders, users, pages } = useAppStore();

  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [pageFilter, setPageFilter] = useState<string>('all');

  const scopedConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (pageFilter !== 'all' && c.pageId !== pageFilter) return false;
      return isWithinDateRange(c.lastMessageAt, dateRange);
    });
  }, [conversations, pageFilter, dateRange]);

  const scopedConvIds = useMemo(
    () => new Set(scopedConversations.map((c) => c.id)),
    [scopedConversations]
  );

  const scopedMessages = useMemo(() => {
    return messages.filter((m) => {
      if (pageFilter !== 'all' && !scopedConvIds.has(m.conversationId)) return false;
      return isWithinDateRange(m.createdAt, dateRange);
    });
  }, [messages, pageFilter, scopedConvIds, dateRange]);

  const scopedOrders = useMemo(() => {
    return orders.filter((o) => {
      if (pageFilter !== 'all' && o.pageId !== pageFilter) return false;
      return isWithinDateRange(o.createdAt, dateRange);
    });
  }, [orders, pageFilter, dateRange]);

  const metrics = useMemo(() => {
    const customerMessages = scopedMessages.filter(
      (m) => m.senderType === 'customer'
    ).length;
    const totalRevenue = scopedOrders
      .filter((o) => o.status !== 'returned')
      .reduce((acc, o) => acc + o.codTotal, 0);
    const totalOrders = scopedOrders.length;
    const avgResponseSec =
      users.length > 0
        ? Math.round(
            users.reduce((acc, u) => acc + u.avgResponseSeconds, 0) / users.length
          )
        : 0;

    return {
      customerMessages,
      totalConversations: scopedConversations.length,
      totalRevenue,
      totalOrders,
      avgResponseSec,
    };
  }, [scopedConversations, scopedMessages, scopedOrders, users]);

  const channelBreakdown = useMemo(() => {
    const maxCount = Math.max(
      1,
      ...PLATFORMS.map(
        (pf) => scopedConversations.filter((c) => c.platform === pf).length
      )
    );
    return PLATFORMS.map((pf) => {
      const convCount = scopedConversations.filter((c) => c.platform === pf).length;
      const commentCount = scopedConversations.filter(
        (c) => c.platform === pf && c.channelType === 'comment'
      ).length;
      const inboxCount = convCount - commentCount;
      const pct = Math.round((convCount / maxCount) * 100);
      return {
        platform: pf,
        label: PLATFORM_META[pf].label,
        convCount,
        commentCount,
        inboxCount,
        pct,
      };
    });
  }, [scopedConversations]);

  const pageBreakdown = useMemo(() => {
    return pages.map((page) => {
      const pageConvs = scopedConversations.filter((c) => c.pageId === page.id).length;
      const pageOrders = scopedOrders.filter((o) => o.pageId === page.id);
      const pageRevenue = pageOrders
        .filter((o) => o.status !== 'returned')
        .reduce((acc, o) => acc + o.codTotal, 0);
      return {
        page,
        convCount: pageConvs,
        orderCount: pageOrders.length,
        revenue: pageRevenue,
      };
    });
  }, [pages, scopedConversations, scopedOrders]);

  const dailyTrend = useMemo(() => {
    const days: { key: string; label: string; ordersCount: number; revenue: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(
        d.getMonth() + 1
      ).padStart(2, '0')}`;
      const dayOrders = scopedOrders.filter(
        (o) => o.createdAt.slice(0, 10) === key && o.status !== 'returned'
      );
      const revenue = dayOrders.reduce((acc, o) => acc + o.codTotal, 0);
      days.push({
        key,
        label,
        ordersCount: dayOrders.length,
        revenue,
      });
    }
    const maxRev = Math.max(1, ...days.map((d) => d.revenue));
    return days.map((d) => ({
      ...d,
      pct: Math.round((d.revenue / maxRev) * 100),
    }));
  }, [scopedOrders]);

  const staffPerformance = useMemo(() => {
    return users.map((u) => {
      const assignedConvs = scopedConversations.filter(
        (c) => c.assigneeId === u.id
      ).length;
      const createdOrders = scopedOrders.filter((o) => o.createdByStaffId === u.id);
      const revenue = createdOrders
        .filter((o) => o.status !== 'returned')
        .reduce((acc, o) => acc + o.codTotal, 0);
      return {
        user: u,
        assignedConvs,
        ordersCount: createdOrders.length,
        revenue,
      };
    });
  }, [users, scopedConversations, scopedOrders]);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-[#F0F2F5] py-6 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Báo cáo hiệu suất & Thống kê thời gian thực
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Số liệu đồng bộ trực tiếp từ luồng hội thoại và đơn hàng trên hệ thống dauto
            </p>
          </div>

          {/* Date Range + Page Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5" />
              {DATE_RANGES.map((dr) => (
                <button
                  key={dr.id}
                  type="button"
                  onClick={() => setDateRange(dr.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    dateRange === dr.id
                      ? 'bg-white text-[#4A69BB] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {dr.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-8">
              <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                aria-label="Lọc báo cáo theo trang"
                value={pageFilter}
                onChange={(e) => setPageFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="all">Tất cả trang ({pages.length})</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 4-column KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Tin nhắn & Bình luận mới</span>
              <MessageSquare className="w-4 h-4 text-[#4A69BB]" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
              {metrics.customerMessages}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Trên {metrics.totalConversations} hội thoại đang mở
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Đơn hàng tạo mới</span>
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
              {metrics.totalOrders}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Chốt trực tiếp từ khung chat Mini-POS
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Doanh thu ước tính</span>
              <TrendingUp className="w-4 h-4 text-[#4A69BB]" />
            </div>
            <p className="text-2xl font-bold text-[#4A69BB] mt-2 font-mono tabular-nums">
              {formatVND(metrics.totalRevenue)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Đã trừ các đơn hoàn hàng
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Thời gian phản hồi TB</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
              {metrics.avgResponseSec}s
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Trung bình toàn đội ngũ CSKH
            </p>
          </div>
        </section>

        {/* Daily Trend Chart + Per-Page Breakdown */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#4A69BB]" />
                Biểu đồ doanh thu & đơn hàng 7 ngày gần nhất
              </h2>
            </div>
            <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4">
              {dailyTrend.map((day) => (
                <div
                  key={day.key}
                  className="flex flex-col items-center justify-end h-full gap-1.5"
                >
                  <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                    {day.ordersCount > 0 ? `${day.ordersCount}đ` : '0'}
                  </span>
                  <div className="w-full flex-1 flex items-end justify-center bg-slate-100 rounded-md overflow-hidden p-0.5">
                    <div
                      title={`${day.label}: ${formatVND(day.revenue)} (${day.ordersCount} đơn)`}
                      style={{
                        height: `${day.revenue > 0 ? Math.max(10, day.pct) : 4}%`,
                      }}
                      className={`w-full rounded-sm transition-all ${
                        day.revenue > 0 ? 'bg-[#4A69BB]' : 'bg-slate-200'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#4A69BB]" />
                Thống kê chi tiết theo từng Trang / Shop
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Trang / Gian hàng</th>
                    <th className="py-2.5 px-4 text-right">Hội thoại</th>
                    <th className="py-2.5 px-4 text-right">Đơn hàng</th>
                    <th className="py-2.5 px-4 text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageBreakdown.map((row) => (
                    <tr key={row.page.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <ChannelBadge platform={row.page.platform} size="xs" />
                          <span className="font-semibold text-slate-900 truncate max-w-[180px]">
                            {row.page.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.convCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {row.orderCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#4A69BB]">
                        {formatVND(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Channel Breakdown + Staff Performance */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#4A69BB]" />
              Phân bổ hội thoại theo kênh
            </h2>
            <div className="space-y-3">
              {channelBreakdown.map((item) => (
                <div key={item.platform} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ChannelBadge platform={item.platform} size="xs" />
                      <span className="font-semibold text-slate-800">{item.label}</span>
                    </div>
                    <span className="text-slate-600 tabular-nums">
                      <strong className="text-slate-900">{item.convCount}</strong>{' '}
                      ({item.inboxCount} tin · {item.commentCount} cmt)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{ width: `${item.pct}%` }}
                      className="h-full bg-[#4A69BB] rounded-full transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">
                Hiệu suất nhân viên trực page
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Nhân viên</th>
                    <th className="py-2.5 px-4">Vai trò</th>
                    <th className="py-2.5 px-4 text-right">Hội thoại</th>
                    <th className="py-2.5 px-4 text-right">Đơn chốt</th>
                    <th className="py-2.5 px-4 text-right">Doanh thu</th>
                    <th className="py-2.5 px-4 text-right">Phản hồi TB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffPerformance.map((row) => (
                    <tr key={row.user.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {row.user.name}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {ROLE_LABELS[row.user.role].split(' (')[0]}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {row.assignedConvs}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {row.ordersCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#4A69BB]">
                        {formatVND(row.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.user.avgResponseSeconds}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
