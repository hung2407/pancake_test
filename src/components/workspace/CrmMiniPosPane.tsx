import { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  MapPin,
  AlertTriangle,
  ShieldCheck,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Truck,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  calculateOrderTotals,
  computeCustomerDeliveryRisk,
  extractCustomerInfoFromMessages,
  formatVND,
  formatRelativeTime,
} from '../../utils/omnichannel';
import type {
  Conversation,
  Customer,
  Message,
  Order,
  Product,
  ShippingCarrier,
} from '../../types/schema';

interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

const CARRIERS: ShippingCarrier[] = ['GHN', 'GHTK', 'Viettel Post', 'J&T Express'];

export function CrmMiniPosPane({
  conversation,
  customer,
  messages,
  products,
  customerOrders,
}: {
  conversation: Conversation | null;
  customer: Customer | null;
  messages: Message[];
  products: Product[];
  customerOrders: Order[];
}) {
  const { updateCustomer, createOrder } = useAppStore();

  const [phoneInput, setPhoneInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [crmSavedMsg, setCrmSavedMsg] = useState(false);

  // Mini-POS state
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [selectedVariantId, setSelectedVariantId] = useState(
    products[0]?.variants[0]?.id || ''
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [shippingFee, setShippingFee] = useState(30000);
  const [discount, setDiscount] = useState(0);
  const [carrier, setCarrier] = useState<ShippingCarrier>('GHN');
  const [orderNote, setOrderNote] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrderCode, setCreatedOrderCode] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Auto-detect phone & address via Regex from conversation messages
  const extracted = useMemo(
    () => extractCustomerInfoFromMessages(messages),
    [messages]
  );

  // Sync CRM form when active customer or extracted info changes
  useEffect(() => {
    if (!customer) return;
    setPhoneInput(customer.phone || extracted.phone || '');
    setAddressInput(customer.address || extracted.address || '');
    setNoteInput(customer.note || '');
    setOrderError(null);
    setCreatedOrderCode(null);
  }, [customer?.id, extracted.phone, extracted.address]);

  // Keep variant synced when product changes
  useEffect(() => {
    const prod = products.find((p) => p.id === selectedProductId) ?? products[0];
    if (prod) {
      if (prod.id !== selectedProductId) setSelectedProductId(prod.id);
      if (!prod.variants.some((v) => v.id === selectedVariantId)) {
        setSelectedVariantId(prod.variants[0]?.id || '');
      }
    }
  }, [products, selectedProductId]);

  if (!conversation || !customer) {
    return (
      <aside className="hidden lg:flex lg:w-[30%] bg-white border-l border-slate-200 items-center justify-center p-6 text-xs text-slate-400">
        Thông tin CRM & Mini-POS sẽ hiển thị tại đây
      </aside>
    );
  }

  const risk = computeCustomerDeliveryRisk(
    customer.totalOrders,
    customer.deliveredOrders,
    customer.returnedOrders
  );

  const resolvedCartItems = cart
    .map((line) => {
      const prod = products.find((p) => p.id === line.productId);
      const variant = prod?.variants.find((v) => v.id === line.variantId);
      if (!prod || !variant) return null;
      return {
        ...line,
        product: prod,
        variant,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const { subtotal, codTotal } = calculateOrderTotals(
    resolvedCartItems.map((c) => ({ price: c.variant.price, quantity: c.quantity })),
    shippingFee,
    discount
  );

  const handleAddToCart = () => {
    if (!selectedProductId || !selectedVariantId) return;
    setOrderError(null);
    setCreatedOrderCode(null);
    setCart((prev) => {
      const existing = prev.find(
        (l) => l.productId === selectedProductId && l.variantId === selectedVariantId
      );
      if (existing) {
        return prev.map((l) =>
          l.productId === selectedProductId && l.variantId === selectedVariantId
            ? { ...l, quantity: l.quantity + 1 }
            : l
        );
      }
      return [
        ...prev,
        { productId: selectedProductId, variantId: selectedVariantId, quantity: 1 },
      ];
    });
  };

  const handleSaveCrm = async () => {
    await updateCustomer(customer.id, {
      phone: phoneInput,
      address: addressInput,
      note: noteInput,
    });
    setCrmSavedMsg(true);
    setTimeout(() => setCrmSavedMsg(false), 2000);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    setCreatedOrderCode(null);

    if (!phoneInput.trim()) {
      setOrderError('Vui lòng nhập số điện thoại khách hàng');
      return;
    }
    if (!addressInput.trim()) {
      setOrderError('Vui lòng nhập địa chỉ giao hàng');
      return;
    }
    if (cart.length === 0) {
      setOrderError('Vui lòng thêm ít nhất 1 sản phẩm vào đơn hàng');
      return;
    }

    setSubmittingOrder(true);
    try {
      const order = await createOrder({
        conversationId: conversation.id,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: phoneInput.trim(),
        shippingAddress: addressInput.trim(),
        items: cart,
        shippingFee,
        discount,
        carrier,
        note: orderNote,
      });
      setCreatedOrderCode(`${order.code} (${order.trackingCode})`);
      setCart([]);
      setOrderNote('');
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Lỗi tạo đơn hàng');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const currentProd = products.find((p) => p.id === selectedProductId);

  return (
    <aside
      aria-label="Hồ sơ khách hàng CRM và Tạo đơn hàng nhanh"
      className="w-full lg:w-[30%] lg:min-w-[330px] bg-white border-l border-slate-200 flex flex-col h-full overflow-y-auto dauto-scroll"
    >
      {/* 1. Customer CRM & Delivery Warning */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Hồ sơ khách hàng (CRM)</h3>
          <button
            type="button"
            onClick={handleSaveCrm}
            className="text-xs font-semibold text-[#4A69BB] hover:underline"
          >
            {crmSavedMsg ? 'Đã lưu CRM' : 'Lưu hồ sơ'}
          </button>
        </div>

        {/* Auto-extraction Regex notice */}
        {(extracted.phone || extracted.address) && (
          <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-[#4A69BB] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold">Tự động trích xuất từ hội thoại</p>
              <p className="text-[11px] text-blue-800 mt-0.5 truncate">
                {extracted.phone ? `SĐT: ${extracted.phone}` : ''}{' '}
                {extracted.address ? `· ĐC: ${extracted.address}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Delivery Success & Return Risk Warning */}
        <div
          className={`px-3 py-2 rounded-lg border text-xs flex items-start gap-2 ${
            risk.riskLevel === 'danger'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : risk.riskLevel === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {risk.riskLevel === 'danger' || risk.riskLevel === 'warning' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="font-semibold tabular-nums">{risk.label}</p>
            <p className="text-[11px] opacity-90 mt-0.5 tabular-nums">
              Tổng {customer.totalOrders} đơn · Thành công {customer.deliveredOrders} · Hoàn{' '}
              {customer.returnedOrders}
            </p>
          </div>
        </div>

        {/* CRM Fields */}
        <div className="space-y-2">
          <div>
            <label
              htmlFor="crm-phone"
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 mb-1"
            >
              <Phone className="w-3 h-3" />
              Số điện thoại
            </label>
            <input
              id="crm-phone"
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Nhập hoặc tự động bắt SĐT..."
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-[#4A69BB]"
            />
          </div>

          <div>
            <label
              htmlFor="crm-address"
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 mb-1"
            >
              <MapPin className="w-3 h-3" />
              Địa chỉ giao hàng
            </label>
            <textarea
              id="crm-address"
              rows={2}
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP..."
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:border-[#4A69BB] resize-none"
            />
          </div>

          <div>
            <label
              htmlFor="crm-note"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Ghi chú khách hàng
            </label>
            <input
              id="crm-note"
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Ghi chú CSKH..."
              className="w-full h-8 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-800 focus:outline-none focus:border-[#4A69BB]"
            />
          </div>
        </div>
      </div>

      {/* 2. Mini-POS Quick Order Form */}
      <form onSubmit={handleCreateOrder} className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-[#4A69BB]" />
            Tạo đơn hàng nhanh (Mini-POS)
          </h3>
        </div>

        {/* Product & Variant Picker */}
        <div className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div>
            <label
              htmlFor="pos-product"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Chọn sản phẩm
            </label>
            <select
              id="pos-product"
              value={selectedProductId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedProductId(nextId);
                const prod = products.find((p) => p.id === nextId);
                if (prod && prod.variants[0]) {
                  setSelectedVariantId(prod.variants[0].id);
                }
              }}
              className="w-full h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-[#4A69BB]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="pos-variant"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Phân loại / Tồn kho
              </label>
              <select
                id="pos-variant"
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-[#4A69BB]"
              >
                {currentProd?.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.color} · {v.size} — {formatVND(v.price)} (Còn {v.stock})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm
            </button>
          </div>
        </div>

        {/* Cart Items */}
        {resolvedCartItems.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {resolvedCartItems.map((line) => (
              <div
                key={`${line.productId}-${line.variantId}`}
                className="px-3 py-2 bg-white flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {line.product.name}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {line.variant.color} · {line.variant.size} ·{' '}
                    {formatVND(line.variant.price)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label="Giảm số lượng"
                    onClick={() =>
                      setCart((prev) =>
                        prev
                          .map((x) =>
                            x.productId === line.productId &&
                            x.variantId === line.variantId
                              ? { ...x, quantity: x.quantity - 1 }
                              : x
                          )
                          .filter((x) => x.quantity > 0)
                      )
                    }
                    className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Tăng số lượng"
                    onClick={() =>
                      setCart((prev) =>
                        prev.map((x) =>
                          x.productId === line.productId &&
                          x.variantId === line.variantId
                            ? { ...x, quantity: x.quantity + 1 }
                            : x
                        )
                      )
                    }
                    className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Xóa sản phẩm khỏi đơn"
                    onClick={() =>
                      setCart((prev) =>
                        prev.filter(
                          (x) =>
                            !(
                              x.productId === line.productId &&
                              x.variantId === line.variantId
                            )
                        )
                      )
                    }
                    className="w-6 h-6 rounded text-slate-400 hover:text-rose-600 flex items-center justify-center ml-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Shipping Fee, Discount, Carrier */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="pos-ship"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Phí vận chuyển (đ)
            </label>
            <input
              id="pos-ship"
              type="number"
              min={0}
              step={5000}
              value={shippingFee}
              onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
              className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="pos-discount"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Giảm giá (đ)
            </label>
            <input
              id="pos-discount"
              type="number"
              min={0}
              step={5000}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="pos-carrier"
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 mb-1"
            >
              <Truck className="w-3 h-3" />
              Đơn vị vận chuyển
            </label>
            <select
              id="pos-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value as ShippingCarrier)}
              className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white"
            >
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="pos-note"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Ghi chú đơn
            </label>
            <input
              id="pos-note"
              type="text"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Cho xem hàng..."
              className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
          <div className="flex justify-between text-slate-500">
            <span>Tiền hàng:</span>
            <span className="font-mono tabular-nums">{formatVND(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-slate-900">
            <span>Tổng thu hộ (COD):</span>
            <span className="font-mono tabular-nums text-[#4A69BB]">
              {formatVND(codTotal)}
            </span>
          </div>
        </div>

        {orderError && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {orderError}
          </div>
        )}

        {createdOrderCode && (
          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Đã đẩy đơn {createdOrderCode} thành công!</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submittingOrder}
          className="w-full h-10 rounded-lg bg-[#4A69BB] hover:bg-[#3d59a3] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
        >
          {submittingOrder ? 'Đang đẩy đơn...' : 'Tạo đơn hàng'}
        </button>
      </form>

      {/* 3. Customer Purchase History */}
      <div className="p-4 space-y-2.5">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Lịch sử mua hàng ({customerOrders.length})
        </h3>
        {customerOrders.length === 0 ? (
          <p className="text-xs text-slate-500">Khách hàng chưa có đơn hàng nào.</p>
        ) : (
          <div className="space-y-2">
            {customerOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold font-mono text-slate-900">
                    {ord.code} · {ord.carrier}
                  </span>
                  <span
                    className={`font-semibold ${
                      ord.status === 'delivered'
                        ? 'text-emerald-700'
                        : ord.status === 'returned'
                          ? 'text-rose-600'
                          : 'text-amber-700'
                    }`}
                  >
                    {ord.status === 'delivered'
                      ? 'Giao thành công'
                      : ord.status === 'returned'
                        ? 'Hoàn đơn'
                        : ord.status === 'shipping'
                          ? 'Đang giao'
                          : 'Chờ xác nhận'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 truncate">
                  {ord.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                  <span>{formatRelativeTime(ord.createdAt)}</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {formatVND(ord.codTotal)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
