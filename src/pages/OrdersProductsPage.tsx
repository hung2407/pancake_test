import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  ShoppingCart,
  Search,
  Plus,
  X,
  ExternalLink,
  Boxes,
  Download,
  Printer,
  Upload,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ChannelBadge } from '../components/ChannelBadge';
import {
  formatVND,
  formatRelativeTime,
  hasPermission,
  generateOrdersCsv,
  generateSampleProductsCsv,
} from '../utils/omnichannel';
import type { Order, OrderStatus } from '../types/schema';

const STATUS_TABS: { id: OrderStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả đơn' },
  { id: 'pending', label: 'Chờ xác nhận' },
  { id: 'shipping', label: 'Đang giao' },
  { id: 'delivered', label: 'Giao thành công' },
  { id: 'returned', label: 'Hoàn hàng' },
];

export function OrdersProductsPage() {
  const {
    workspace,
    orders,
    products,
    pages,
    users,
    currentUserId,
    updateOrderStatus,
    addProduct,
    addProductVariant,
    importProductsCsv,
    updateVariantStock,
  } = useAppStore();

  const currentUser = users.find((u) => u.id === currentUserId);
  const canManageInventory = currentUser
    ? hasPermission(currentUser.role, 'manage_inventory')
    : true;
  const canUpdateShipping = currentUser
    ? hasPermission(currentUser.role, 'update_order_shipping')
    : true;

  const [activeTab, setActiveTab] = useState<'orders' | 'products'>('orders');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  // Add Product modal state (supports multiple variants)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Chăm sóc da');
  const [modalVariants, setModalVariants] = useState<
    { sku: string; color: string; size: string; price: number; stock: number }[]
  >([{ sku: '', color: 'Mặc định', size: 'Tiêu chuẩn', price: 250000, stock: 20 }]);
  const [prodError, setProdError] = useState<string | null>(null);

  // Inline add variant to existing product
  const [addingVariantForId, setAddingVariantForId] = useState<string | null>(null);
  const [newVarSku, setNewVarSku] = useState('');
  const [newVarColor, setNewVarColor] = useState('');
  const [newVarSize, setNewVarSize] = useState('');
  const [newVarPrice, setNewVarPrice] = useState(250000);
  const [newVarStock, setNewVarStock] = useState(10);

  // Bulk CSV product import
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importNotice, setImportNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => statusFilter === 'all' || o.status === statusFilter)
      .filter((o) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          o.code.toLowerCase().includes(q) ||
          o.trackingCode.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.includes(q)
        );
      });
  }, [orders, statusFilter, search]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(q))
    );
  }, [products, search]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) {
      setProdError('Vui lòng nhập tên sản phẩm');
      return;
    }
    if (modalVariants.length === 0) {
      setProdError('Vui lòng giữ ít nhất 1 biến thể');
      return;
    }
    try {
      await addProduct({
        name: prodName.trim(),
        category: prodCategory.trim() || 'Chăm sóc da',
        variants: modalVariants.map((v) => ({
          sku: v.sku.trim(),
          color: v.color.trim() || 'Mặc định',
          size: v.size.trim() || 'Tiêu chuẩn',
          price: Number(v.price) || 0,
          stock: Number(v.stock) || 0,
        })),
      });
      setAddModalOpen(false);
      setProdName('');
      setModalVariants([
        { sku: '', color: 'Mặc định', size: 'Tiêu chuẩn', price: 250000, stock: 20 },
      ]);
      setProdError(null);
    } catch (err) {
      setProdError(err instanceof Error ? err.message : 'Lỗi thêm sản phẩm');
    }
  };

  const handleImportCsvFile = async (file: File) => {
    setImportingCsv(true);
    setImportNotice(null);
    try {
      const csvText = await file.text();
      const res = await importProductsCsv(csvText);
      setImportNotice({
        ok: true,
        text: `Đã nhập thành công ${res.importedCount} sản phẩm từ tệp CSV vào kho!`,
      });
    } catch (err) {
      setImportNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Không thể nhập tệp CSV',
      });
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-[#F0F2F5] py-6 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Top Control Card */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">
                Đơn hàng & Kho sản phẩm
              </h1>
              <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'orders'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Đơn hàng ({orders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'products'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Sản phẩm & Tồn kho ({products.length})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    activeTab === 'orders'
                      ? 'Tìm mã đơn, vận đơn, SĐT...'
                      : 'Tìm tên sản phẩm, SKU...'
                  }
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:border-[#4A69BB]"
                />
              </div>

              {activeTab === 'orders' && (
                <button
                  type="button"
                  onClick={() => {
                    const csv = generateOrdersCsv(filteredOrders);
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `don-hang-dauto-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={filteredOrders.length === 0}
                  className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4 text-[#4A69BB]" />
                  <span>Xuất CSV / Excel</span>
                </button>
              )}

              {activeTab === 'products' && canManageInventory && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void handleImportCsvFile(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const csv = generateSampleProductsCsv();
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'mau-nhap-san-pham-dauto.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Tải CSV mẫu</span>
                  </button>
                  <button
                    type="button"
                    disabled={importingCsv}
                    onClick={() => csvInputRef.current?.click()}
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <Upload className="w-4 h-4 text-[#4A69BB]" />
                    <span>{importingCsv ? 'Đang nhập...' : 'Nhập CSV'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(true)}
                    className="h-9 px-3.5 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm sản phẩm</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {activeTab === 'products' && importNotice && (
            <div
              className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 ${
                importNotice.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <span>{importNotice.text}</span>
              <button
                type="button"
                aria-label="Đóng thông báo nhập CSV"
                onClick={() => setImportNotice(null)}
                className="p-0.5 rounded hover:bg-black/5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-[#4A69BB]/12 text-[#4A69BB]'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Orders Table View */}
        {activeTab === 'orders' ? (
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Mã đơn / Kênh</th>
                    <th className="py-3 px-4">Khách hàng</th>
                    <th className="py-3 px-4">Sản phẩm</th>
                    <th className="py-3 px-4">Vận chuyển</th>
                    <th className="py-3 px-4 text-right">Thu hộ (COD)</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-4 text-right">Hội thoại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Chưa có đơn hàng nào khớp bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const page = pages.find((p) => p.id === order.pageId);
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 align-top">
                            <div className="flex items-center gap-2">
                              {page && <ChannelBadge platform={page.platform} size="xs" />}
                              <span className="font-bold font-mono text-slate-900">
                                {order.code}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                              {formatRelativeTime(order.createdAt)}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <p className="font-semibold text-slate-900">
                              {order.customerName}
                            </p>
                            <p className="font-mono text-[11px] text-slate-600 tabular-nums mt-0.5">
                              {order.customerPhone}
                            </p>
                            <p className="text-[11px] text-slate-500 max-w-[220px] truncate mt-0.5">
                              {order.shippingAddress}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top max-w-[240px]">
                            {order.items.map((item, idx) => (
                              <p key={idx} className="text-slate-700 truncate">
                                <span className="font-semibold tabular-nums">
                                  {item.quantity}x
                                </span>{' '}
                                {item.productName} ({item.variantLabel})
                              </p>
                            ))}
                            {order.note && (
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                Ghi chú: {order.note}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <p className="font-semibold text-slate-800">{order.carrier}</p>
                            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {order.trackingCode}
                            </p>
                            <span
                              className={`inline-block mt-0.5 text-[10px] font-semibold ${
                                order.carrierSynced
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {order.carrierSynced ? 'Đã đẩy hãng ship' : 'Mã nội bộ'}
                            </span>
                          </td>
                          <td className="py-3 px-4 align-top text-right font-mono font-bold text-slate-900 tabular-nums">
                            {formatVND(order.codTotal)}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <select
                              aria-label={`Trạng thái đơn ${order.code}`}
                              disabled={!canUpdateShipping}
                              value={order.status}
                              onChange={(e) =>
                                updateOrderStatus(order.id, e.target.value as OrderStatus)
                              }
                              className={`h-8 px-2 rounded-lg border text-xs font-semibold focus:outline-none ${
                                order.status === 'delivered'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : order.status === 'returned'
                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                    : order.status === 'shipping'
                                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                                      : 'bg-amber-50 border-amber-200 text-amber-800'
                              }`}
                            >
                              <option value="pending">Chờ xác nhận</option>
                              <option value="shipping">Đang giao</option>
                              <option value="delivered">Giao thành công</option>
                              <option value="returned">Hoàn hàng</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 align-top text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPrintingOrder(order)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#4A69BB]"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>In phiếu (A5)</span>
                              </button>
                              <Link
                                to={`/workspace?convId=${order.conversationId}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#4A69BB] hover:underline"
                              >
                                <span>Mở chat</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          /* Products & Variants Inventory View */
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">
                          {product.category}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                          {product.name}
                        </h3>
                      </div>
                      {canManageInventory && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingVariantForId((prev) =>
                              prev === product.id ? null : product.id
                            );
                            setNewVarSku('');
                            setNewVarColor('');
                            setNewVarSize('');
                          }}
                          className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-[#4A69BB] inline-flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Biến thể</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {product.variants.length} biến thể · Tổng tồn:{' '}
                      <strong className="text-slate-800">
                        {product.variants.reduce((acc, v) => acc + v.stock, 0)}
                      </strong>
                    </p>
                  </div>
                </div>

                {addingVariantForId === product.id && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await addProductVariant(product.id, {
                        sku: newVarSku.trim(),
                        color: newVarColor.trim() || 'Mặc định',
                        size: newVarSize.trim() || 'Tiêu chuẩn',
                        price: Number(newVarPrice) || 0,
                        stock: Number(newVarStock) || 0,
                      });
                      setAddingVariantForId(null);
                    }}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"
                  >
                    <input
                      type="text"
                      value={newVarSku}
                      onChange={(e) => setNewVarSku(e.target.value)}
                      placeholder="SKU"
                      className="h-8 px-2 rounded border border-slate-200 bg-white font-mono"
                    />
                    <input
                      type="text"
                      value={newVarColor}
                      onChange={(e) => setNewVarColor(e.target.value)}
                      placeholder="Màu / Loại"
                      className="h-8 px-2 rounded border border-slate-200 bg-white"
                    />
                    <input
                      type="text"
                      value={newVarSize}
                      onChange={(e) => setNewVarSize(e.target.value)}
                      placeholder="Size / Dung tích"
                      className="h-8 px-2 rounded border border-slate-200 bg-white"
                    />
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={newVarPrice}
                      onChange={(e) => setNewVarPrice(Number(e.target.value) || 0)}
                      placeholder="Giá"
                      className="h-8 px-2 rounded border border-slate-200 bg-white font-mono tabular-nums"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={newVarStock}
                        onChange={(e) => setNewVarStock(Number(e.target.value) || 0)}
                        placeholder="Kho"
                        className="w-16 h-8 px-2 rounded border border-slate-200 bg-white font-mono tabular-nums"
                      />
                      <button
                        type="submit"
                        className="h-8 px-2.5 rounded bg-[#4A69BB] text-white font-semibold shrink-0"
                      >
                        Lưu
                      </button>
                    </div>
                  </form>
                )}

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
                        <th className="py-2 px-3">SKU</th>
                        <th className="py-2 px-3">Biến thể</th>
                        <th className="py-2 px-3 text-right">Giá bán</th>
                        <th className="py-2 px-3 text-right">Tồn kho</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {product.variants.map((v) => (
                        <tr key={v.id}>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                            {v.sku}
                          </td>
                          <td className="py-2 px-3 text-slate-800">
                            {v.color} · {v.size}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                            {formatVND(v.price)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                aria-label={`Tồn kho ${v.sku}`}
                                disabled={!canManageInventory}
                                value={v.stock}
                                onChange={(e) =>
                                  updateVariantStock(
                                    product.id,
                                    v.id,
                                    Number(e.target.value) || 0
                                  )
                                }
                                className="w-16 h-7 px-2 rounded border border-slate-200 text-right font-mono text-xs tabular-nums focus:outline-none focus:border-[#4A69BB]"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {/* Add Product Modal (Multi-Variant) */}
      {addModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-product-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden max-h-[88vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 id="add-product-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#4A69BB]" />
                Thêm sản phẩm mới vào kho (Hỗ trợ nhiều biến thể)
              </h2>
              <button
                type="button"
                aria-label="Đóng thêm sản phẩm"
                onClick={() => setAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="p-5 space-y-4 text-xs overflow-y-auto dauto-scroll flex-1">
              {prodError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                  {prodError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tên sản phẩm
                  </label>
                  <input
                    type="text"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="VD: Nước tẩy trang Micellar 400ml"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Danh mục
                  </label>
                  <input
                    type="text"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    Danh sách biến thể (Màu sắc / Kích thước / SKU)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setModalVariants((prev) => [
                        ...prev,
                        { sku: '', color: '', size: '', price: 250000, stock: 10 },
                      ])
                    }
                    className="px-2.5 py-1 rounded-md bg-[#4A69BB]/10 text-[#4A69BB] font-semibold inline-flex items-center gap-1 hover:bg-[#4A69BB]/15"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm biến thể</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {modalVariants.map((variant, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-6 gap-2 items-center"
                    >
                      <input
                        type="text"
                        value={variant.sku}
                        onChange={(e) =>
                          setModalVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, sku: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Mã SKU"
                        className="h-8 px-2.5 rounded border border-slate-200 bg-white font-mono"
                      />
                      <input
                        type="text"
                        value={variant.color}
                        onChange={(e) =>
                          setModalVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, color: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Màu sắc"
                        className="h-8 px-2.5 rounded border border-slate-200 bg-white"
                      />
                      <input
                        type="text"
                        value={variant.size}
                        onChange={(e) =>
                          setModalVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, size: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Kích thước"
                        className="h-8 px-2.5 rounded border border-slate-200 bg-white"
                      />
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={variant.price}
                        onChange={(e) =>
                          setModalVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, price: Number(e.target.value) || 0 }
                                : row
                            )
                          )
                        }
                        placeholder="Giá bán"
                        className="h-8 px-2.5 rounded border border-slate-200 bg-white font-mono tabular-nums"
                      />
                      <input
                        type="number"
                        min={0}
                        value={variant.stock}
                        onChange={(e) =>
                          setModalVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, stock: Number(e.target.value) || 0 }
                                : row
                            )
                          )
                        }
                        placeholder="Tồn kho"
                        className="h-8 px-2.5 rounded border border-slate-200 bg-white font-mono tabular-nums"
                      />
                      <div className="flex justify-end">
                        {modalVariants.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Xóa dòng biến thể ${idx + 1}`}
                            onClick={() =>
                              setModalVariants((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#4A69BB] text-white font-semibold"
                >
                  Lưu sản phẩm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable A5 Waybill Modal */}
      {printingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="waybill-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="dauto-print-sheet bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="dauto-no-print px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 id="waybill-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-4 h-4 text-[#4A69BB]" />
                Phiếu giao hàng A5 · {printingOrder.code}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  In ngay (A5)
                </button>
                <button
                  type="button"
                  aria-label="Đóng phiếu in"
                  onClick={() => setPrintingOrder(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-800">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <p className="text-base font-extrabold text-[#4A69BB]">
                    {workspace?.name || 'dauto Omnichannel'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Phiếu gửi hàng & Thu hộ COD
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-sm text-slate-900">
                    {printingOrder.code}
                  </p>
                  <p className="font-mono text-[11px] text-slate-600">
                    {printingOrder.carrier} · {printingOrder.trackingCode}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                  Người nhận hàng
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {printingOrder.customerName} ·{' '}
                  <span className="font-mono">{printingOrder.customerPhone}</span>
                </p>
                <p className="text-slate-700 leading-relaxed">
                  {printingOrder.shippingAddress || 'Chưa cập nhật địa chỉ giao hàng'}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
                  Chi tiết sản phẩm ({printingOrder.items.reduce((s, i) => s + i.quantity, 0)} SP)
                </p>
                <table className="w-full border border-slate-200 text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                      <th className="py-1.5 px-2.5">Sản phẩm</th>
                      <th className="py-1.5 px-2.5 text-center">SL</th>
                      <th className="py-1.5 px-2.5 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printingOrder.items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-2.5">
                          <span className="font-semibold">{item.productName}</span>{' '}
                          <span className="text-slate-500">({item.variantLabel})</span>
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums">
                          {formatVND(item.price * item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-end justify-between border-t border-slate-200 pt-3">
                <div className="text-[11px] text-slate-600 max-w-[55%]">
                  <p>
                    <strong>Ghi chú:</strong> {printingOrder.note || 'Cho xem hàng, không thử'}
                  </p>
                  <p className="mt-0.5 tabular-nums">
                    Phí ship: {formatVND(printingOrder.shippingFee)} · Giảm giá:{' '}
                    {formatVND(printingOrder.discount)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-slate-500">
                    TIỀN THU HỘ (COD)
                  </p>
                  <p className="text-xl font-extrabold font-mono text-slate-900 tabular-nums">
                    {formatVND(printingOrder.codTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
