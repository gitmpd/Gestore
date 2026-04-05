import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2, ShoppingBag, Eye, XCircle, Search, ArrowLeft, Download, Printer, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, UserPlus, CreditCard, CheckCircle2 } from 'lucide-react';
import { db } from '@/db';
import type { Customer, PaymentMethod, Sale, SaleItem as SaleItemType, SaleStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, generateReference, nowISO, formatCurrency, formatDateTime, normalizeForSearch } from '@/lib/utils';
import { exportCSV } from '@/lib/export';
import { printReceipt } from '@/lib/receipt';
import { getShopNameOrDefault } from '@/lib/shop';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { customerSchema, validate } from '@/lib/validation';

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  maxStock: number;
}

type QuickDateFilter = 'all' | 'today' | '7d' | 'month';
type SaleSortKey = 'date' | 'total' | 'customer' | 'paymentMethod' | 'status';
type SortDirection = 'asc' | 'desc';

const SALES_LIST_STATE_KEY = 'sales-page-list-state';

const paymentLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  credit: 'Crédit',
  mobile: 'Mobile Money',
};

const emptyQuickCustomer = (): Pick<Customer, 'name' | 'phone'> => ({
  name: '',
  phone: '',
});

function getQuickDateRange(filter: QuickDateFilter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (filter === 'today') {
    const iso = today.toISOString().slice(0, 10);
    return { from: iso, to: iso };
  }

  if (filter === '7d') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  }

  if (filter === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: start.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  }

  return { from: '', to: '' };
}

function getInitialListState() {
  const todayRange = getQuickDateRange('today');

  if (typeof window === 'undefined') {
    return {
      saleSearch: '',
      paymentFilter: 'all' as PaymentMethod | 'all',
      statusFilter: 'all' as SaleStatus | 'all',
      dateFrom: todayRange.from,
      dateTo: todayRange.to,
      quickDateFilter: 'today' as QuickDateFilter,
      sortKey: 'date' as SaleSortKey,
      sortDirection: 'desc' as SortDirection,
      page: 1,
      selectedSaleIds: [] as string[],
    };
  }

  try {
    const raw = window.localStorage.getItem(SALES_LIST_STATE_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as Partial<{
      saleSearch: string;
      paymentFilter: PaymentMethod | 'all';
      statusFilter: SaleStatus | 'all';
      dateFrom: string;
      dateTo: string;
      quickDateFilter: QuickDateFilter;
      sortKey: SaleSortKey;
      sortDirection: SortDirection;
      page: number;
      selectedSaleIds: string[];
    }>;

    return {
      saleSearch: parsed.saleSearch ?? '',
      paymentFilter: parsed.paymentFilter ?? 'all',
      statusFilter: parsed.statusFilter ?? 'all',
      dateFrom: todayRange.from,
      dateTo: todayRange.to,
      quickDateFilter: 'today' as QuickDateFilter,
      sortKey: parsed.sortKey ?? 'date',
      sortDirection: parsed.sortDirection ?? 'desc',
      page: typeof parsed.page === 'number' && parsed.page > 0 ? parsed.page : 1,
      selectedSaleIds: Array.isArray(parsed.selectedSaleIds) ? parsed.selectedSaleIds.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return {
      saleSearch: '',
      paymentFilter: 'all' as PaymentMethod | 'all',
      statusFilter: 'all' as SaleStatus | 'all',
      dateFrom: todayRange.from,
      dateTo: todayRange.to,
      quickDateFilter: 'today' as QuickDateFilter,
      sortKey: 'date' as SaleSortKey,
      sortDirection: 'desc' as SortDirection,
      page: 1,
      selectedSaleIds: [] as string[],
    };
  }
}

export function SalesPage() {
  const initialListState = getInitialListState();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isGerant = user?.role === 'gerant';
  const [modalOpen, setModalOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerId, setCustomerId] = useState('');
  const [quickCustomerForm, setQuickCustomerForm] = useState<Pick<Customer, 'name' | 'phone'>>(emptyQuickCustomer());
  const [quickCustomerErrors, setQuickCustomerErrors] = useState<Record<string, string>>({});
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedItems, setSelectedItems] = useState<SaleItemType[]>([]);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>(initialListState.selectedSaleIds);
  const [salesToCancel, setSalesToCancel] = useState<Sale[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelAmount, setCancelAmount] = useState(0);

  const [saleSearch, setSaleSearch] = useState(initialListState.saleSearch);
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | 'all'>(initialListState.paymentFilter);
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>(initialListState.statusFilter);
  const [dateFrom, setDateFrom] = useState(initialListState.dateFrom);
  const [dateTo, setDateTo] = useState(initialListState.dateTo);
  const [quickDateFilter, setQuickDateFilter] = useState<QuickDateFilter>(initialListState.quickDateFilter);
  const [sortKey, setSortKey] = useState<SaleSortKey>(initialListState.sortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialListState.sortDirection);
  const [page, setPage] = useState(initialListState.page);

  const allProducts = useLiveQuery(() => db.products.orderBy('name').toArray()) ?? [];
  const saleProducts = allProducts.filter((p) => !p.usage || p.usage === 'vente' || p.usage === 'achat_vente');
  const productMap = useMemo(
    () => new Map(allProducts.map((product) => [product.id, product])),
    [allProducts]
  );
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray()) ?? [];
  const users = useLiveQuery(() => db.users.toArray()) ?? [];
  const saleAuditMap = useLiveQuery(async () => {
    const logs = await db.auditLogs.where('entity').equals('vente').toArray();
    const map = new Map<string, string>();
    logs.forEach((log) => {
      if (log.action === 'vente' && log.entityId && !map.has(log.entityId)) {
        map.set(log.entityId, log.userName);
      }
    });
    return map;
  }) ?? new Map<string, string>();
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const getSellerName = (sale: Sale) => {
    if (sale.userName?.trim()) return sale.userName;
    if (userMap.has(sale.userId)) return userMap.get(sale.userId) ?? '-';
    if (saleAuditMap.has(sale.id)) return saleAuditMap.get(sale.id) ?? '-';
    if (user?.id === sale.userId) return user.name;
    return '-';
  };

  const recentSales = useLiveQuery(async () => {
    const all = await db.sales.orderBy('date').reverse().limit(200).toArray();
    return all.filter((s) => !s.deleted);
  }) ?? [];

  const saleItemsMap = useLiveQuery(async () => {
  const items = await db.saleItems.toArray();
  const map = new Map<string, SaleItemType[]>();

  items.forEach((item) => {
    if (!map.has(item.saleId)) {
      map.set(item.saleId, []);
    }
    map.get(item.saleId)!.push(item);
  });

  return map;
}, []) ?? new Map();

  const getSaleProfit = (sale: Sale) => {
    const items = saleItemsMap.get(sale.id) ?? [];
    return items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      const buyPrice = product?.buyPrice ?? 0;
      return sum + ((item.unitPrice - buyPrice) * item.quantity);
    }, 0);
  };

  const filteredSales = useMemo(() => {
    return recentSales.filter((s) => {
      if (paymentFilter !== 'all' && s.paymentMethod !== paymentFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (dateFrom && s.date < dateFrom) return false;
      if (dateTo && s.date > dateTo + 'T23:59:59') return false;
      if (saleSearch) {
        const q = normalizeForSearch(saleSearch);
        const clientName = s.customerId ? normalizeForSearch(customerMap.get(s.customerId) ?? '') : '';
        const sellerName = normalizeForSearch(getSellerName(s));
        const paymentText = normalizeForSearch(paymentLabels[s.paymentMethod]);
        const paymentCode = normalizeForSearch(s.paymentMethod);
        const statusText = normalizeForSearch(s.status === 'completed' ? 'Terminee' : 'Annulee');
        const statusCode = normalizeForSearch(s.status);
        const productText = (saleItemsMap.get(s.id) ?? [])
          .map((item: SaleItemType) => normalizeForSearch(item.productName))
          .join(' ');
        return (
          normalizeForSearch(s.id).includes(q) ||
          clientName.includes(q) ||
          sellerName.includes(q) ||
          paymentText.includes(q) ||
          paymentCode.includes(q) ||
          statusText.includes(q) ||
          statusCode.includes(q) ||
          productText.includes(q)
        );
      }
      return true;
    });
  }, [recentSales, saleSearch, paymentFilter, statusFilter, customerMap, userMap, saleItemsMap, dateFrom, dateTo]);

  const completedSales = useMemo(
    () => filteredSales.filter((sale) => sale.status === 'completed'),
    [filteredSales]
  );

  const cancelledSales = useMemo(
    () => filteredSales.filter((sale) => sale.status === 'cancelled'),
    [filteredSales]
  );

  const selectedFilteredSales = useMemo(
    () => filteredSales.filter((sale) => selectedSaleIds.includes(sale.id)),
    [filteredSales, selectedSaleIds]
  );

  const filteredSalesTotal = useMemo(
    () => filteredSales.reduce((sum, sale) => sum + sale.total, 0),
    [filteredSales]
  );

  const selectedSalesTotal = useMemo(
    () => selectedFilteredSales.reduce((sum, sale) => sum + sale.total, 0),
    [selectedFilteredSales]
  );

  const hasActiveFilters = Boolean(
    saleSearch || paymentFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo
  );

  const itemsPerPage = 12;

  const sortedSales = useMemo(() => {
    const sales = [...filteredSales];
    sales.sort((a, b) => {
      let left = '';
      let right = '';

      switch (sortKey) {
        case 'total':
          return sortDirection === 'asc' ? a.total - b.total : b.total - a.total;
        case 'customer':
          left = a.customerId ? customerMap.get(a.customerId) ?? 'Anonyme' : 'Anonyme';
          right = b.customerId ? customerMap.get(b.customerId) ?? 'Anonyme' : 'Anonyme';
          break;
        case 'paymentMethod':
          left = paymentLabels[a.paymentMethod];
          right = paymentLabels[b.paymentMethod];
          break;
        case 'status':
          left = a.status;
          right = b.status;
          break;
        case 'date':
        default:
          left = a.date;
          right = b.date;
          break;
      }

      const comparison = left.localeCompare(right, 'fr', { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sales;
  }, [filteredSales, sortKey, sortDirection, customerMap]);

  const totalPages = Math.max(1, Math.ceil(sortedSales.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedSales.slice(start, start + itemsPerPage);
  }, [sortedSales, currentPage]);

  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const filteredProducts = saleProducts.filter(
    (p) =>
      p.quantity > 0 &&
      normalizeForSearch(productSearch).length >= 2 &&
      (normalizeForSearch(p.name).includes(normalizeForSearch(productSearch)) ||
        (p.barcode && p.barcode.includes(productSearch)))
  );

  const total = cart.reduce((s, item) => s + item.quantity * item.unitPrice, 0);

  const resetQuickCustomerForm = () => {
    setQuickCustomerForm(emptyQuickCustomer());
    setQuickCustomerErrors({});
    setQuickCustomerOpen(false);
    setCreatingCustomer(false);
  };

  const openNewSaleModal = () => {
    resetQuickCustomerForm();
    setModalOpen(true);
  };

  const closeNewSaleModal = () => {
    setModalOpen(false);
    setProductDropdownOpen(false);
    resetQuickCustomerForm();
  };

  const addToCart = (productId: string) => {
    const product = saleProducts.find((p) => p.id === productId);
    if (!product) return;

    const existing = cart.find((c) => c.productId === productId);
    if (existing) {
      if (existing.quantity < product.quantity) {
        setCart(
          cart.map((c) =>
            c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c
          )
        );
      }
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellPrice,
          maxStock: product.quantity,
        },
      ]);
    }
  };

  const updateCartQuantity = (productId: string, qty: number) => {
    const currentItem = cart.find((c) => c.productId === productId);
    const nextQty = Math.min(Math.max(0, qty), currentItem?.maxStock ?? 0);

    if (nextQty <= 0) {
      setCart(cart.filter((c) => c.productId !== productId));
      return;
    }

    setCart(
      cart.map((c) =>
        c.productId === productId
          ? { ...c, quantity: nextQty }
          : c
      )
    );
  };

  const updateCartUnitPrice = (productId: string, unitPrice: number) => {
    setCart(
      cart.map((c) =>
        c.productId === productId
          ? { ...c, unitPrice: Math.max(0, unitPrice) }
          : c
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const clearSaleFilters = () => {
    setSaleSearch('');
    setPaymentFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setQuickDateFilter('all');
    setPage(1);
  };

  const applyQuickDateFilter = (filter: QuickDateFilter) => {
    const range = getQuickDateRange(filter);
    setQuickDateFilter(filter);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPage(1);
  };

  const handleSort = (key: SaleSortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'date' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const renderSortIcon = (key: SaleSortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className="text-text-muted" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-primary" />
      : <ArrowDown size={14} className="text-primary" />;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      SALES_LIST_STATE_KEY,
      JSON.stringify({
        saleSearch,
        paymentFilter,
        statusFilter,
        dateFrom,
        dateTo,
        quickDateFilter,
        sortKey,
        sortDirection,
        page: currentPage,
        selectedSaleIds,
      })
    );
  }, [
    saleSearch,
    paymentFilter,
    statusFilter,
    dateFrom,
    dateTo,
    quickDateFilter,
    sortKey,
    sortDirection,
    currentPage,
    selectedSaleIds,
  ]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !user) return;
    if (paymentMethod === 'credit' && !customerId) {
      toast.error('Selectionnez un client pour une vente a credit');
      return;
    }

    try {
      const now = nowISO();
      const saleId = generateReference();
      await db.transaction(
        'rw',
        [db.sales, db.saleItems, db.products, db.stockMovements, db.customers, db.creditTransactions],
        async () => {
          const productRecords = await Promise.all(cart.map((item) => db.products.get(item.productId)));
          const productMap = new Map(
            productRecords
              .filter((product): product is NonNullable<typeof product> => Boolean(product))
              .map((product) => [product.id, product])
          );

          for (const item of cart) {
            const product = productMap.get(item.productId);
            if (!product || product.deleted) {
              throw new Error(`Le produit "${item.productName}" est introuvable. Rechargez la liste puis recommencez.`);
            }
            if (item.quantity > product.quantity) {
              throw new Error(`Stock insuffisant pour "${product.name}" (${product.quantity} disponible(s)).`);
            }
          }

          await db.sales.add({
            id: saleId,
            userId: user.id,
            userName: user.name,
            customerId: customerId || undefined,
            date: now,
            total,
            paymentMethod,
            status: 'completed',
            createdAt: now,
            updatedAt: now,
            syncStatus: 'pending',
          });

          for (const item of cart) {
            const product = productMap.get(item.productId)!;

            await db.saleItems.add({
              id: generateId(),
              saleId,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            });

            await db.products.update(item.productId, {
              quantity: product.quantity - item.quantity,
              updatedAt: now,
              syncStatus: 'pending',
            });

            await db.stockMovements.add({
              id: generateId(),
              productId: item.productId,
              productName: item.productName,
              type: 'sortie',
              quantity: item.quantity,
              date: now,
              reason: `Vente #${saleId}`,
              userId: user.id,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            });
          }

          if (paymentMethod === 'credit' && customerId) {
            const customer = await db.customers.get(customerId);
            if (customer) {
              await db.customers.update(customerId, {
                creditBalance: customer.creditBalance + total,
                updatedAt: now,
                syncStatus: 'pending',
              });

              await db.creditTransactions.add({
                id: generateId(),
                customerId,
                saleId,
                amount: total,
                type: 'credit',
                date: now,
                note: `Vente #${saleId}`,
                createdAt: now,
                updatedAt: now,
                syncStatus: 'pending',
              });
            }
          }
        }
      );

      const itemsSummary = cart.map((i) => `${i.productName} x${i.quantity}`).join(', ');
      await logAction({
        action: 'vente',
        entity: 'vente',
        entityId: saleId,
        details: `${formatCurrency(total)} — ${paymentLabels[paymentMethod]} — ${itemsSummary}`,
      });

      setCart([]);
      setCustomerId('');
      setPaymentMethod('cash');
      closeNewSaleModal();
      toast.success('Vente enregistrée avec succès');
    } catch (err) {
      toast.error('Erreur lors de l\'enregistrement : ' + (err as Error).message);
    }
  };

  const handleQuickCustomerSubmit = async () => {
    if (!user || creatingCustomer) return;

    const payload = {
      name: quickCustomerForm.name.trim(),
      phone: quickCustomerForm.phone.trim(),
    };
    const validation = validate(customerSchema, payload);
    if (!validation.success) {
      setQuickCustomerErrors(validation.errors);
      return;
    }

    setCreatingCustomer(true);
    try {
      const now = nowISO();
      const id = generateId();

      await db.customers.add({
        id,
        name: payload.name,
        phone: payload.phone,
        creditBalance: 0,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });

      await logAction({
        action: 'creation',
        entity: 'client',
        entityId: id,
        entityName: payload.name,
        details: `Créé depuis la page de vente - Téléphone: ${payload.phone}`,
      });

      setCustomerId(id);
      setQuickCustomerErrors({});
      setQuickCustomerForm(emptyQuickCustomer());
      setQuickCustomerOpen(false);
      toast.success('Client créé et sélectionné');
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'ajouter le client");
    } finally {
      setCreatingCustomer(false);
    }
  };

  const viewSaleDetails = async (sale: Sale) => {
    const items = (await db.saleItems.where('saleId').equals(sale.id).toArray()).filter((i) => !(i as any).deleted);
    setSelectedSale(sale);
    setSelectedItems(items);
    setDetailModalOpen(true);
  };

  const handleDeleteSale = (sale: Sale) => {
    openCancelSalesModal([sale]);
  };

  const openCancelSalesModal = (sales: Sale[]) => {
    const filtered = sales.filter((sale) => sale.status !== 'cancelled');
    setSalesToCancel(filtered);
    setCancelReason('');
    setCancelAmount(filtered.length === 1 ? filtered[0].total : filtered.reduce((sum, sale) => sum + sale.total, 0));
    setCancelModalOpen(true);
  };

  const cancelSales = async (sales: Sale[], reason: string, amountOverride?: number) => {
    if (!user || sales.length === 0) return;

    const now = nowISO();
    const normalizedReason = reason.trim();

    await db.transaction(
      'rw',
      [db.sales, db.saleItems, db.products, db.stockMovements, db.customers, db.creditTransactions],
      async () => {
        for (const sale of sales) {
          const effectiveAmount = sales.length === 1 && typeof amountOverride === 'number' ? Math.max(0, amountOverride) : sale.total;
          const items = (await db.saleItems.where('saleId').equals(sale.id).toArray()).filter((i) => !(i as any).deleted);

          for (const item of items) {
            const product = await db.products.get(item.productId);
            if (!product || product.deleted) continue;

            await db.products.update(item.productId, {
              quantity: product.quantity + item.quantity,
              updatedAt: now,
              syncStatus: 'pending',
            });

            await db.stockMovements.add({
              id: generateId(),
              productId: item.productId,
              productName: item.productName,
              type: 'retour',
              quantity: item.quantity,
              date: now,
              reason: normalizedReason ? `Annulation vente #${sale.id} - ${normalizedReason}` : `Annulation vente #${sale.id}`,
              userId: user.id,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            });
          }

          if (sale.paymentMethod === 'credit' && sale.customerId) {
            const customer = await db.customers.get(sale.customerId);
            const creditTxs = (await db.creditTransactions.where('saleId').equals(sale.id).toArray()).filter(
              (tx) => !tx.deleted && tx.type === 'credit'
            );

            for (const tx of creditTxs) {
              await db.creditTransactions.update(tx.id, {
                deleted: true,
                updatedAt: now,
                syncStatus: 'pending',
              });
            }

            if (customer) {
              await db.customers.update(sale.customerId, {
                creditBalance: Math.max(0, customer.creditBalance - effectiveAmount),
                updatedAt: now,
                syncStatus: 'pending',
              });
            }
          }

          await db.sales.update(sale.id, {
            total: effectiveAmount,
            status: 'cancelled',
            updatedAt: now,
            syncStatus: 'pending',
          });

          const itemsSummary = items.map((i) => `${i.productName} x${i.quantity}`).join(', ');
          await logAction({
            action: 'suppression',
            entity: 'vente',
            entityId: sale.id,
            entityName: `#${sale.id}`,
            details: `${formatCurrency(effectiveAmount)} - ${paymentLabels[sale.paymentMethod]} - ${itemsSummary}${normalizedReason ? ` - Motif: ${normalizedReason}` : ''}`,
          });
        }
      }
    );
  };

  const handleConfirmCancelSales = async () => {
    if (salesToCancel.length === 0) {
      setCancelModalOpen(false);
      return;
    }
    if (salesToCancel.length === 1 && cancelAmount < 0) {
      toast.error("Le montant d'annulation ne peut pas etre negatif");
      return;
    }

    const ok = await confirmAction({
      title: salesToCancel.length === 1 ? 'Annuler la vente' : 'Annuler les ventes',
      message:
        salesToCancel.length === 1
          ? `Voulez-vous vraiment annuler la vente #${salesToCancel[0].id} ? Le stock sera remis en place.`
          : `Voulez-vous vraiment annuler ${salesToCancel.length} vente(s) ? Le stock sera remis en place.`,
      confirmLabel: 'Confirmer',
      variant: 'danger',
    });
    if (!ok) return;

    const loadingToast = toast.loading('Annulation en cours...');
    try {
      await cancelSales(salesToCancel, cancelReason, cancelAmount);
      setCancelModalOpen(false);
      setCancelReason('');
      setCancelAmount(0);
      setSalesToCancel([]);
      setSelectedSaleIds([]);
      toast.dismiss(loadingToast);
      toast.success(salesToCancel.length === 1 ? 'Vente annulée' : 'Ventes annulées');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Erreur lors de l\'annulation : ' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Ventes</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = filteredSales.map((s) => [
                s.id,
                new Date(s.date).toLocaleDateString('fr-FR'),
                formatCurrency(s.total),
                formatCurrency(getSaleProfit(s)),
                s.paymentMethod,
                s.status === 'completed' ? 'Terminée' : 'Annulée',
              ]);
              exportCSV('ventes', ['Réf.', 'Date', 'Total', 'Paiement', 'Statut'], rows);
              toast.success('Export CSV téléchargé');
            }}
            disabled={filteredSales.length === 0}
          >
            <Download size={16} /> CSV
          </Button>
          <Button onClick={openNewSaleModal}>
            <ShoppingBag size={18} /> Nouvelle vente
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Rechercher par réf., client ou vendeur..."
            value={saleSearch}
            onChange={(e) => {
              setSaleSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={paymentFilter}
          onChange={(e) => {
            setPaymentFilter(e.target.value as PaymentMethod | 'all');
            setPage(1);
          }}
        >
          <option value="all">Tous les paiements</option>          <option value="mobile">Mobile Money</option>        </select>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SaleStatus | 'all');
            setPage(1);
          }}
        >
          <option value="all">Tous les statuts</option>
          <option value="completed">Terminée</option>
          <option value="cancelled">Annulée</option>
        </select>
        <input
          type="date"
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setQuickDateFilter('all');
            setPage(1);
          }}
          title="Date debut"
        />
        <input
          type="date"
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setQuickDateFilter('all');
            setPage(1);
          }}
          title="Date fin"
        />
        {hasActiveFilters && (
          <Button variant="secondary" size="sm" onClick={clearSaleFilters}>
            Effacer filtres
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all' as const, label: 'Tout' },
          { key: 'today' as const, label: "Aujourd'hui" },
          { key: '7d' as const, label: '7 jours' },
          { key: 'month' as const, label: 'Ce mois' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => applyQuickDateFilter(option.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              quickDateFilter === option.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-text-muted hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        {isGerant && (
          <div className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary/80">
              Ventes total
            </span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(filteredSalesTotal)}
            </span>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${selectedFilteredSales.length > 0 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Resultats</p>
          <p className="mt-1 text-2xl font-bold text-text">{filteredSales.length}</p>
          <p className="text-sm text-text-muted">
            vente(s)
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Terminees</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{completedSales.length}</p>
          <p className="text-sm text-text-muted">
            {isGerant ? formatCurrency(completedSales.reduce((sum, sale) => sum + sale.total, 0)) : 'vente(s) validée(s)'}
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-900/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Annulees</p>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">{cancelledSales.length}</p>
          <p className="text-sm text-text-muted">
            {isGerant ? formatCurrency(cancelledSales.reduce((sum, sale) => sum + sale.total, 0)) : 'vente(s) annulée(s)'}
          </p>
        </div>
        {selectedFilteredSales.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Selection</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{selectedFilteredSales.length}</p>
          <p className="text-sm text-text-muted">
            {isGerant ? formatCurrency(selectedSalesTotal) : 'vente(s) cochée(s)'}
          </p>
          </div>
        )}
      </div>

      {selectedFilteredSales.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/10">
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {selectedFilteredSales.length} vente(s) selectionnée(s)
            </p>
            {isGerant && (
              <p className="text-sm text-text-muted">
                Montant cumule: {formatCurrency(selectedSalesTotal)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelectedSaleIds([])}>
              Deselectionner
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => openCancelSalesModal(selectedFilteredSales)}
            >
              <Trash2 size={16} /> Annuler les ventes
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex items-center gap-1">
              {visiblePageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    pageNumber === currentPage
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-surface text-text hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={currentPage >= totalPages}
            >
              {'>>'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {sortedSales.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-text-muted">
          <div className="space-y-2">
            <p>{recentSales.length === 0 ? 'Aucune vente enregistrée' : 'Aucune vente ne correspond aux filtres'}</p>
            {hasActiveFilters && (
              <Button variant="secondary" size="sm" onClick={clearSaleFilters}>
                Effacer les filtres
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:hidden">
          {paginatedSales.map((s) => {
            const items = saleItemsMap.get(s.id) ?? [];
            return (
              <div
                key={s.id}
                className={`rounded-xl border px-4 py-3 shadow-sm ${
                  selectedSaleIds.includes(s.id) ? 'border-primary bg-primary/5' : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">{formatCurrency(s.total)}</p>
                    <p className="text-xs text-text-muted">Ref: {s.id}</p>
                    <p className="text-sm text-text-muted">{formatDateTime(s.date)}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedSaleIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedSaleIds((r) => [...r, s.id]);
                      else setSelectedSaleIds((r) => r.filter((id) => id !== s.id));
                    }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={s.paymentMethod === 'credit' ? 'warning' : 'default'}>
                    {paymentLabels[s.paymentMethod]}
                  </Badge>
                  <Badge variant={s.status === 'completed' ? 'success' : 'danger'}>
                    {s.status === 'completed' ? 'Terminée' : 'Annulée'}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  <p><span className="text-text-muted">Client:</span> {s.customerId ? customerMap.get(s.customerId) ?? 'â€”' : 'Anonyme'}</p>
                  {isGerant && <p><span className="text-text-muted">Vendeur:</span> {getSellerName(s)}</p>}
                  {isGerant && <p><span className="text-text-muted">Gain:</span> <span className="font-medium">{formatCurrency(getSaleProfit(s))}</span></p>}
                  <div>
                    <p className="text-text-muted">Produits</p>
                    <div className="space-y-1">
                      {items.length === 0 ? (
                        <span className="text-text-muted">-</span>
                      ) : (
                        items.slice(0, 3).map((i: SaleItemType) => (
                          <div key={i.id} className="leading-tight">
                            <span className="font-medium">{i.productName}</span>
                            <span className="text-text-muted"> ({i.quantity})</span>
                          </div>
                        ))
                      )}
                      {items.length > 3 ? <div className="text-xs text-text-muted">+{items.length - 3} autre(s)</div> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm"
                    onClick={() => viewSaleDetails(s)}
                    className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-primary"
                    title="Voir le détail"
                  >
                    <Eye size={16} /> Voir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const itemsForPrint = (await db.saleItems.where('saleId').equals(s.id).toArray()).filter((i) => !(i as any).deleted);
                      printReceipt({
                        saleId: s.id,
                        date: s.date,
                        items: itemsForPrint,
                        total: s.total,
                        paymentMethod: paymentLabels[s.paymentMethod],
                        customerName: s.customerId ? customerMap.get(s.customerId) : undefined,
                        vendorName: userMap.get(s.userId),
                        shopName: getShopNameOrDefault(),
                      });
                    }}
                  >
                    <Printer size={16} /> Imprimer
                  </Button>
                  {s.status === 'completed' && (
                    <Button variant="danger" size="sm" className="col-span-2"
                      onClick={() => handleDeleteSale(s)}
                      
                    >
                        <XCircle size={16} /> Annuler
                      </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={`${sortedSales.length === 0 ? 'hidden' : 'hidden lg:block'} bg-surface rounded-xl border border-border`}>
        <Table>
          <Thead className="sticky top-0 z-10 bg-surface">
            <Tr>
              <Th>
                <input
                  type="checkbox"
                  checked={paginatedSales.length > 0 && paginatedSales.every((s) => selectedSaleIds.includes(s.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSaleIds((prev) => Array.from(new Set([...prev, ...paginatedSales.map((s) => s.id)])));
                    } else {
                      setSelectedSaleIds((prev) => prev.filter((id) => !paginatedSales.some((s) => s.id === id)));
                    }
                  }}
                />
              </Th>
              <Th>Produits</Th>
              <Th>
                <button type="button" onClick={() => handleSort('date')} className="inline-flex items-center gap-1">
                  Date {renderSortIcon('date')}
                </button>
              </Th>
              {isGerant && <Th>Vendeur</Th>}
              <Th>
                <button type="button" onClick={() => handleSort('customer')} className="inline-flex items-center gap-1">
                  Client {renderSortIcon('customer')}
                </button>
              </Th>
              <Th>
                <button type="button" onClick={() => handleSort('total')} className="inline-flex items-center gap-1">
                  Montant {renderSortIcon('total')}
                </button>
              </Th>
              {isGerant && <Th>Gain</Th>}
              <Th>
                <button type="button" onClick={() => handleSort('paymentMethod')} className="inline-flex items-center gap-1">
                  Paiement {renderSortIcon('paymentMethod')}
                </button>
              </Th>
              <Th>
                <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-1">
                  Statut {renderSortIcon('status')}
                </button>
              </Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {sortedSales.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 9 : 7} className="text-center text-text-muted py-8">
                  <div className="space-y-2">
                  {recentSales.length === 0 ? 'Aucune vente enregistrée' : 'Aucune vente ne correspond aux filtres'}
                  </div>
                </Td>
              </Tr>
            ) : (
              paginatedSales.map((s) => (
                <Tr key={s.id} className={selectedSaleIds.includes(s.id) ? 'bg-primary/5' : undefined}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedSaleIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSaleIds((r) => [...r, s.id]);
                        else setSelectedSaleIds((r) => r.filter((id) => id !== s.id));
                      }}
                    />
                  </Td>
                  <Td className="text-sm">
                    <div className="space-y-1">
                      {(() => {
                        const items = saleItemsMap.get(s.id) ?? [];
                        if (items.length === 0) {
                          return <span className="text-text-muted">-</span>;
                        }
                        return items.slice(0, 3).map((i: SaleItemType) => (
                          <div key={i.id} className="leading-tight">
                            <span className="font-medium">{i.productName}</span>
                            <span className="text-text-muted"> ({i.quantity})</span>
                          </div>
                        ));
                      })()}
                      {(() => {
                        const items = saleItemsMap.get(s.id) ?? [];
                        return items.length > 3 ? <div className="text-xs text-text-muted">+{items.length - 3} autre(s)</div> : null;
                      })()}
                    </div>
                  </Td>

                  <Td>
                    <div className="space-y-1">
                      <div className="font-medium text-text">{formatDateTime(s.date)}</div>
                      <div className="text-xs text-text-muted">Ref: {s.id}</div>
                    </div>
                  </Td>
                  {isGerant && (
                    <Td className="text-sm">{getSellerName(s)}</Td>
                  )}
                  <Td>{s.customerId ? customerMap.get(s.customerId) ?? '—' : '—'}</Td>
                  <Td className="font-semibold whitespace-nowrap">{formatCurrency(s.total)}</Td>
                  {isGerant && (
                    <Td className="font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(getSaleProfit(s))}
                    </Td>
                  )}
                  <Td>
                    <Badge variant={s.paymentMethod === 'credit' ? 'warning' : 'default'}>
                      {paymentLabels[s.paymentMethod]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={s.status === 'completed' ? 'success' : 'danger'}>
                      {s.status === 'completed' ? 'Terminée' : 'Annulée'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => viewSaleDetails(s)}
                        className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-primary"
                        title="Voir le détail"
                      >
                        <Eye size={16} />
                      </button>
                      {s.status === 'completed' && (
                        <button
                          onClick={() => handleDeleteSale(s)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-danger"
                          title="Annuler"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </div>

      {sortedSales.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-text-muted">
            Page {currentPage} sur {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(1)}
              disabled={currentPage <= 1}
            >
              {'<<'}
            </Button>
            <div className="flex items-center gap-1">
              {visiblePageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    pageNumber === currentPage
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-surface text-text hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={currentPage >= totalPages}
            >
              {'>>'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeNewSaleModal}
        title="Nouvelle vente"
        className="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="text-sm font-medium text-text mb-1 block">Ajouter un produit</label>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-colors">
              <Search size={14} className="text-text-muted shrink-0" />
              <input
                type="text"
                className="flex-1 bg-transparent outline-none text-text placeholder:text-text-muted min-w-0"
                placeholder="Tapez au moins 2 lettres ou un code-barres..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setProductDropdownOpen(true); }}
                onFocus={() => setProductDropdownOpen(true)}
                onBlur={() => setTimeout(() => setProductDropdownOpen(false), 150)}
              />
            </div>
            {productDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg divide-y divide-border/50">
                {normalizeForSearch(productSearch).length < 2 ? (
                  <p className="px-3 py-2 text-sm text-text-muted">
                    Commencez par saisir au moins 2 lettres pour afficher les produits.
                  </p>
                ) : filteredProducts.length > 0 ? (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        addToCart(p.id);
                        setProductSearch('');
                        setProductDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/10 text-sm text-text text-left transition-colors"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-text-muted">
                        {formatCurrency(p.sellPrice)} · Stock: {p.quantity}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-text-muted">Aucun produit trouvé</p>
                )}
              </div>
            )}
          </div>

          {cart.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-text">Panier vide</p>
              <p className="mt-1 text-xs text-text-muted">
                Recherchez un produit par nom ou code-barres pour commencer la vente.
              </p>
            </div>
          )}

          {cart.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-text">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left">Produit</th>
                    <th className="px-3 py-2 text-center w-24">Qté</th>
                    <th className="px-3 py-2 text-right">Prix</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cart.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={item.maxStock}
                          value={item.quantity}
                          onChange={(e) =>
                            updateCartQuantity(item.productId, Number(e.target.value) || 0)
                          }
                          className="w-16 text-center rounded border border-border bg-surface text-text px-1 py-0.5"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateCartUnitPrice(item.productId, Number(e.target.value) || 0) } className="w-24 text-right rounded border border-border bg-surface text-text px-1 py-0.5"/>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.productId)}
                          className="p-1 text-danger hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right text-lg font-bold text-primary">
                      {formatCurrency(total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text">Mode de paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'cash' as const, label: 'Espèces' },
                  { value: 'mobile' as const, label: 'Mobile Money' },
                  { value: 'credit' as const, label: 'Crédit' },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      paymentMethod === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-text-muted hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="rounded-2xl border border-border bg-gradient-to-br from-slate-50 via-white to-slate-100/80 p-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <CreditCard size={18} />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-text">Client</label>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickCustomerOpen((open) => !open);
                      setQuickCustomerErrors({});
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      quickCustomerOpen
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-text-muted hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <UserPlus size={14} />
                    {quickCustomerOpen ? 'Fermer' : 'Nouveau client'}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      if (e.target.value) {
                        setQuickCustomerOpen(false);
                        setQuickCustomerErrors({});
                      }
                    }}
                  >
                    <option value="">— Aucun —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                      customerId
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-slate-100 text-text-muted dark:bg-slate-800'
                    }`}>
                      <CheckCircle2 size={14} />
                      {customerId ? 'Client selectionne pour cette vente' : 'Aucun client selectionne'}
                    </div>

                    {!quickCustomerOpen && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickCustomerOpen(true);
                          setQuickCustomerErrors({});
                        }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Le client n'apparait pas ?
                      </button>
                    )}
                  </div>

                  {paymentMethod === 'credit' && (
                    <div className={`rounded-xl border px-3 py-2 text-xs ${
                      customerId
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300'
                    }`}>
                      {customerId
                        ? 'Le client est bien renseigne. La vente a credit peut etre enregistree.'
                        : 'Une vente a credit doit obligatoirement etre rattachée a un client.'}
                    </div>
                  )}
                </div>
              </div>

              {quickCustomerOpen && (
                <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-white to-sky-50 shadow-sm dark:from-primary/10 dark:via-slate-900 dark:to-slate-800">
                  <div className="border-b border-primary/10 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                        <UserPlus size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text">Creation du client</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        id="saleQuickCustomerName"
                        label="Nom du client"
                        value={quickCustomerForm.name}
                        onChange={(e) => {
                          setQuickCustomerForm((prev) => ({ ...prev, name: e.target.value }));
                          if (quickCustomerErrors.name) {
                            setQuickCustomerErrors((prev) => ({ ...prev, name: '' }));
                          }
                        }}
                        placeholder="Ex : Mamadou Traore"
                        error={quickCustomerErrors.name}
                        required
                      />
                      <Input
                        id="saleQuickCustomerPhone"
                        label="Telephone"
                        value={quickCustomerForm.phone}
                        onChange={(e) => {
                          setQuickCustomerForm((prev) => ({ ...prev, phone: e.target.value }));
                          if (quickCustomerErrors.phone) {
                            setQuickCustomerErrors((prev) => ({ ...prev, phone: '' }));
                          }
                        }}
                        placeholder="Ex : 76 12 34 56"
                        error={quickCustomerErrors.phone}
                        required
                      />
                    </div>

                    <div className="rounded-xl bg-slate-100/80 px-3 py-2 text-xs text-text-muted dark:bg-slate-800/80">
                      Conseil: ce client pourra etre reutilise plus tard pour ses prochaines ventes et pour le suivi du credit.
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" type="button" onClick={resetQuickCustomerForm}>
                        Annuler
                      </Button>
                      <Button type="button" onClick={handleQuickCustomerSubmit} disabled={creatingCustomer}>
                        <UserPlus size={16} />
                        {creatingCustomer ? 'Creation...' : 'Creer et selectionner'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={closeNewSaleModal}>
              Annuler
            </Button>
            <Button type="submit" disabled={cart.length === 0 || cart.some((c) => c.quantity <= 0)}>
              Valider la vente ({formatCurrency(total)})
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Vente #${selectedSale?.id ?? ''}`}
        className="max-w-lg"
      >
        {selectedSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted">Date</p>
                <p className="font-medium text-text">{formatDateTime(selectedSale.date)}</p>
              </div>
              <div>
                <p className="text-text-muted">Paiement</p>
                <p className="font-medium text-text">{paymentLabels[selectedSale.paymentMethod]}</p>
              </div>
              <div>
                <p className="text-text-muted">Client</p>
                <p className="font-medium text-text">
                  {selectedSale.customerId ? customerMap.get(selectedSale.customerId) ?? '—' : 'Anonyme'}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Statut</p>
                <Badge variant={selectedSale.status === 'completed' ? 'success' : 'danger'}>
                  {selectedSale.status === 'completed' ? 'Terminée' : 'Annulée'}
                </Badge>
              </div>
              {isGerant && (
                <div>
                  <p className="text-text-muted">Vendeur</p>
                  <p className="font-medium text-text">{getSellerName(selectedSale)}</p>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-text">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left">Produit</th>
                    <th className="px-3 py-2 text-center">Qté</th>
                    <th className="px-3 py-2 text-right">Prix unit.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                    <td className="px-3 py-2 text-right text-lg font-bold text-primary">
                      {formatCurrency(selectedSale.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  printReceipt({
                    saleId: selectedSale.id,
                    date: selectedSale.date,
                    items: selectedItems,
                    total: selectedSale.total,
                    paymentMethod: paymentLabels[selectedSale.paymentMethod],
                    customerName: selectedSale.customerId
                      ? customerMap.get(selectedSale.customerId)
                      : undefined,
                    vendorName: userMap.get(selectedSale.userId),
                    shopName: getShopNameOrDefault(),
                  });
                }}
              >
                <Printer size={16} /> Imprimer le reçu
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title={salesToCancel.length > 1 ? 'Annuler les ventes' : `Annuler la vente #${salesToCancel[0]?.id ?? ''}`}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            L'annulation remettra le stock en place et corrigera le crédit client si la vente était à crédit.
          </p>

          <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-text">
            <p className="font-medium mb-1">Produits concernes</p>
            <div className="space-y-1 text-text-muted">
              {salesToCancel.length === 0 ? (
                <p>-</p>
              ) : salesToCancel.length === 1 ? (
                (saleItemsMap.get(salesToCancel[0].id) ?? []).length > 0 ? (
                  (saleItemsMap.get(salesToCancel[0].id) ?? []).map((item: SaleItemType) => (
                    <p key={item.id}>
                      {item.productName} x{item.quantity}
                    </p>
                  ))
                ) : (
                  <p>-</p>
                )
              ) : (
                salesToCancel.map((sale) => {
                  const items = saleItemsMap.get(sale.id) ?? [];
                  const names = items.map((item: SaleItemType) => item.productName).slice(0, 2).join(', ');
                  return (
                    <p key={sale.id}>
                      #{sale.id}: {names || '-'}{items.length > 2 ? '...' : ''}
                    </p>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cancelAmount" className="text-sm font-medium text-text">
              Montant a annuler
            </label>
            <input
              id="cancelAmount"
              type="number"
              min={0}
              step="0.01"
              value={cancelAmount}
              onChange={(e) => setCancelAmount(Number(e.target.value) || 0)}
              disabled={salesToCancel.length > 1}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
            />
            {salesToCancel.length > 1 && (
              <p className="text-xs text-text-muted">
                La modification du montant est disponible pour une annulation unitaire.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cancelReason" className="text-sm font-medium text-text">
              Motif d'annulation (optionnel)
            </label>
            <textarea
              id="cancelReason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Ex : erreur de saisie, vente doublonnée..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCancelModalOpen(false)}>
              Fermer
            </Button>
            <Button variant="danger" type="button" onClick={handleConfirmCancelSales}>
              Confirmer l'annulation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

