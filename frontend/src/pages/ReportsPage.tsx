import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { db } from '@/db';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatCurrencyParts } from '@/lib/utils';
import { expenseCategoryLabels } from '@/pages/ExpensesPage';
import type { ExpenseCategory } from '@/types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

type Period = '7d' | '30d' | '90d';
type MetricDetailKey =
  | 'revenue'
  | 'grossProfit'
  | 'expenses'
  | 'net'
  | 'customerCredits'
  | 'supplierCredits';

function getStartDate(period: Period): Date {
  const d = new Date();
  if (period === '7d') d.setDate(d.getDate() - 7);
  else if (period === '30d') d.setDate(d.getDate() - 30);
  else d.setDate(d.getDate() - 90);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatAxisCompact(value: number): string {
  const abs = Math.abs(value);
  const clean = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1_000_000) return `${clean(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${clean(value / 1_000)}K`;
  return `${value}`;
}

function CurrencyValue({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  const { numberPart, currencyPart } = formatCurrencyParts(amount);
  const digitCount = Math.abs(Math.trunc(amount)).toString().length;
  const normalizedNumber = numberPart.replace(/\u202F|\u00A0/g, ' ');
  const numberSizeClass =
    digitCount > 10
      ? 'text-[0.56em]'
      : digitCount > 8
      ? 'text-[0.66em]'
      : digitCount > 6
      ? 'text-[0.76em]'
      : 'text-[1em]';

  return (
    <span className={`inline-flex min-w-0 max-w-full flex-col items-start leading-tight ${className ?? ''}`}>
      <span className={`max-w-full break-words leading-none tracking-tight ${numberSizeClass}`}>
        {normalizedNumber}
      </span>
      {currencyPart ? (
        <span className={`leading-none tracking-tight ${numberSizeClass}`}>
          {currencyPart}
        </span>
      ) : null}
    </span>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailModalKey, setDetailModalKey] = useState<MetricDetailKey | null>(null);
  const [activeBar, setActiveBar] = useState<string | null>(null);

  const sales = useLiveQuery(() => db.sales.toArray()) ?? [];
  const saleItems = useLiveQuery(async () => (await db.saleItems.toArray()).filter((s) => !(s as any).deleted)) ?? [];
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => !p.deleted)) ?? [];
  const customers = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deleted)) ?? [];
  const suppliers = useLiveQuery(async () => (await db.suppliers.toArray()).filter((s) => !s.deleted)) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray()) ?? [];
  const customerOrders = useLiveQuery(() => db.customerOrders.toArray()) ?? [];
  const customerCreditTransactions = useLiveQuery(() => db.creditTransactions.toArray()) ?? [];
  const supplierCreditTransactions = useLiveQuery(() => db.supplierCreditTransactions.toArray()) ?? [];

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const startDate = useMemo(() => getStartDate(period), [period]);
  const inSelectedRange = (isoDate: string) => {
    const hasExplicitRange = Boolean(dateFrom || dateTo);
    if (!hasExplicitRange && new Date(isoDate) < startDate) return false;
    if (dateFrom && isoDate < dateFrom) return false;
    if (dateTo && isoDate > dateTo + 'T23:59:59') return false;
    return true;
  };

  const filteredSales = useMemo(
    () => sales.filter((s) => inSelectedRange(s.date) && s.status === 'completed' && !s.deleted),
    [sales, startDate, dateFrom, dateTo]
  );

  const filteredExpenses = useMemo(
    () => allExpenses.filter((e) => !e.deleted && inSelectedRange(e.date)),
    [allExpenses, startDate, dateFrom, dateTo]
  );

  const saleById = useMemo(
    () => new Map(sales.map((s) => [s.id, s])),
    [sales]
  );

  // Customer order inflows not already covered by cash/mobile sales:
  // - en_attente: deposit only
  // - livree + sale credit: deposit only
  // - livree without saleId (fallback legacy): full total
  const customerOrderCashEntries = useMemo(
    () =>
      customerOrders
        .filter((o) => inSelectedRange(o.date) && o.status !== 'annulee')
        .map((o) => {
          if (o.status === 'en_attente') return { date: o.date, amount: o.deposit > 0 ? o.deposit : 0 };
          if (o.status === 'livree') {
            if (!o.saleId) return { date: o.date, amount: o.total };
            const linkedSale = saleById.get(o.saleId);
            if (linkedSale && linkedSale.paymentMethod === 'credit') {
              return { date: o.date, amount: o.deposit > 0 ? o.deposit : 0 };
            }
          }
          return { date: o.date, amount: 0 };
        })
        .filter((entry) => entry.amount > 0),
    [customerOrders, startDate, dateFrom, dateTo, saleById]
  );

  const totalSalesRevenue = useMemo(
    () =>
      filteredSales
        .filter((s) => s.paymentMethod !== 'credit')
        .reduce((sum, s) => sum + s.total, 0),
    [filteredSales]
  );

  const cashSalesCount = useMemo(
    () => filteredSales.filter((s) => s.paymentMethod !== 'credit').length,
    [filteredSales]
  );

  const filteredCustomerCreditPayments = useMemo(
    () =>
      customerCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'payment' && inSelectedRange(t.date)
      ),
    [customerCreditTransactions, startDate, dateFrom, dateTo]
  );

  const filteredCustomerCredits = useMemo(
    () =>
      customerCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'credit' && inSelectedRange(t.date)
      ),
    [customerCreditTransactions, startDate, dateFrom, dateTo]
  );

  const totalCustomerCreditPayments = useMemo(
    () => filteredCustomerCreditPayments.reduce((sum, t) => sum + t.amount, 0),
    [filteredCustomerCreditPayments]
  );

  const customerCreditNetById = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of customerCreditTransactions) {
      if (t.deleted || !inSelectedRange(t.date)) continue;
      const sign = t.type === 'credit' ? 1 : -1;
      map.set(t.customerId, (map.get(t.customerId) ?? 0) + sign * t.amount);
    }
    return map;
  }, [customerCreditTransactions, startDate, dateFrom, dateTo]);

  const totalCustomerOrderEntries = useMemo(
    () => customerOrderCashEntries.reduce((sum, e) => sum + e.amount, 0),
    [customerOrderCashEntries]
  );

  const totalRevenue = totalSalesRevenue + totalCustomerCreditPayments + totalCustomerOrderEntries;

  const totalGrossProfit = useMemo(() => {
    let profit = 0;
    for (const sale of filteredSales) {
      const items = saleItems.filter((si) => si.saleId === sale.id);
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          profit += (item.unitPrice - product.buyPrice) * item.quantity;
        }
      }
    }
    return profit;
  }, [filteredSales, saleItems, products]);

  const totalManualExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const filteredSupplierPayments = useMemo(
    () =>
      supplierCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'payment' && inSelectedRange(t.date)
      ),
    [supplierCreditTransactions, startDate, dateFrom, dateTo]
  );

  const filteredSupplierCredits = useMemo(
    () =>
      supplierCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'credit' && inSelectedRange(t.date)
      ),
    [supplierCreditTransactions, startDate, dateFrom, dateTo]
  );

  const supplierCreditNetById = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of supplierCreditTransactions) {
      if (t.deleted || !inSelectedRange(t.date)) continue;
      const sign = t.type === 'credit' ? 1 : -1;
      map.set(t.supplierId, (map.get(t.supplierId) ?? 0) + sign * t.amount);
    }
    return map;
  }, [supplierCreditTransactions, startDate, dateFrom, dateTo]);

  const totalSupplierPayments = useMemo(
    () => filteredSupplierPayments.reduce((sum, t) => sum + t.amount, 0),
    [filteredSupplierPayments]
  );

  const totalExpenses = totalManualExpenses + totalSupplierPayments;

  const netProfitSimple = totalRevenue - totalExpenses;

  const customersWhoOwe = useMemo(
    () =>
      customers
        .map((c) => ({ ...c, dueAmount: customerCreditNetById.get(c.id) ?? 0 }))
        .filter((c) => c.dueAmount > 0)
        .sort((a, b) => b.dueAmount - a.dueAmount),
    [customers, customerCreditNetById]
  );

  const suppliersToPay = useMemo(
    () =>
      suppliers
        .map((s) => ({ ...s, dueAmount: supplierCreditNetById.get(s.id) ?? 0 }))
        .filter((s) => s.dueAmount > 0)
        .sort((a, b) => b.dueAmount - a.dueAmount),
    [suppliers, supplierCreditNetById]
  );

  const totalCredit = useMemo(
    () => customersWhoOwe.reduce((sum, c) => sum + c.dueAmount, 0),
    [customersWhoOwe]
  );

  const totalSupplierCredit = useMemo(
    () => suppliersToPay.reduce((sum, s) => sum + s.dueAmount, 0),
    [suppliersToPay]
  );

 const salesByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        ventesDetail: number;
        remboursementsCredits: number;
        commandesClients: number;
        depensesManuelles: number;
        paiementsFournisseurs: number;
      }
    >();

    const ensureDay = (day: string) => {
      if (!map.has(day)) {
        map.set(day, {
          ventesDetail: 0,
          remboursementsCredits: 0,
          commandesClients: 0,
          depensesManuelles: 0,
          paiementsFournisseurs: 0,
        });
      }
      return map.get(day)!;
    };

    // 🔵 VENTES ENCAISSÉES
    filteredSales.forEach((s) => {
      if (s.paymentMethod === 'credit') return;
      const day = s.date.slice(0, 10);
      ensureDay(day).ventesDetail += s.total;
    });

    // 🔵 REMBOURSEMENTS CRÉDITS CLIENTS
    filteredCustomerCreditPayments.forEach((t) => {
      const day = t.date.slice(0, 10);
      ensureDay(day).remboursementsCredits += t.amount;
    });

    // 🔵 COMMANDES CLIENTS
    customerOrderCashEntries.forEach((entry) => {
      const day = entry.date.slice(0, 10);
      ensureDay(day).commandesClients += entry.amount;
    });

    // 🔴 DÉPENSES MANUELLES
    filteredExpenses.forEach((e) => {
      const day = e.date.slice(0, 10);
      ensureDay(day).depensesManuelles += e.amount;
    });

    // 🔴 PAIEMENTS FOURNISSEURS
    filteredSupplierPayments.forEach((t) => {
      const day = t.date.slice(0, 10);
      ensureDay(day).paiementsFournisseurs += t.amount;
    });

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, values]) => ({
        dayKey: day,
        date: new Date(day).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short',
        }),

        // Totaux
        ventes:
          values.ventesDetail +
          values.remboursementsCredits +
          values.commandesClients,

        depenses:
          values.depensesManuelles +
          values.paiementsFournisseurs,

        // Détails pour le tooltip
        ...values,
      }));
  }, [
    filteredSales,
    filteredCustomerCreditPayments,
    customerOrderCashEntries,
    filteredExpenses,
    filteredSupplierPayments,
  ]);
  const salesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const sale of filteredSales) {
      const items = saleItems.filter((si) => si.saleId === sale.id);
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          const catName = categoryMap.get(product.categoryId) ?? 'Sans catégorie';
          map.set(catName, (map.get(catName) ?? 0) + item.total);
        }
      }
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [filteredSales, saleItems, products, categoryMap]);

  const salesByCategoryDetailed = useMemo(() => {
    const total = salesByCategory.reduce((sum, row) => sum + row.value, 0);
    return salesByCategory
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((row) => ({
        ...row,
        percent: total > 0 ? (row.value / total) * 100 : 0,
      }));
  }, [salesByCategory]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    if (totalSupplierPayments > 0) {
      map.set('supplier_orders', (map.get('supplier_orders') ?? 0) + totalSupplierPayments);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([cat, value]) => ({
        name: cat === 'supplier_orders' ? 'Commandes fournisseurs' : expenseCategoryLabels[cat as ExpenseCategory],
        value,
      }));
  }, [filteredExpenses, totalSupplierPayments]);

  const expensesByCategoryDetailed = useMemo(() => {
    const total = expensesByCategory.reduce((sum, row) => sum + row.value, 0);
    return expensesByCategory
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((row) => ({
        ...row,
        percent: total > 0 ? (row.value / total) * 100 : 0,
      }));
  }, [expensesByCategory]);

  const openCreditList = (kind: 'customers' | 'suppliers') => {
    const elementId = kind === 'customers' ? 'clients-debiteurs-list' : 'fournisseurs-a-payer-list';
    document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const FocusedTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    // On récupère uniquement la donnée correspondant à la barre active
    const entry = payload.find((p: any) => p.dataKey === activeBar);
    if (!entry) return null;

    const data = entry.payload;

    return (
      <div className="bg-surface border border-border rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
        <p className="font-semibold mb-2">{label}</p>

        {activeBar === 'ventes' && (
          <>
            <p className="text-xs text-blue-600 font-semibold mb-1">
              Entrées de trésorerie
            </p>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Ventes encaissées:</span>
                <span>{formatCurrency(data.ventesDetail)}</span>
              </div>

              <div className="flex justify-between">
                <span>Remboursements crédits:</span>
                <span>{formatCurrency(data.remboursementsCredits)}</span>
              </div>

              <div className="flex justify-between">
                <span>Commandes clients:</span>
                <span>{formatCurrency(data.commandesClients)}</span>
              </div>

              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Total:</span>
                <span className="text-blue-600">
                  {formatCurrency(data.ventes)}
                </span>
              </div>
            </div>
          </>
        )}

        {activeBar === 'depenses' && (
          <>
            <p className="text-xs text-red-600 font-semibold mb-1">
              Sorties de trésorerie
            </p>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Dépenses manuelles:</span>
                <span>{formatCurrency(data.depensesManuelles)}</span>
              </div>

              <div className="flex justify-between">
                <span>Paiements fournisseurs:</span>
                <span>{formatCurrency(data.paiementsFournisseurs)}</span>
              </div>

              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Total:</span>
                <span className="text-red-600">
                  {formatCurrency(data.depenses)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Rapports</h1>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                period === p
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {p === '7d' ? '7 jours' : p === '30d' ? '30 jours' : '90 jours'}
            </button>
          ))}
          <input
            type="date"
            className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Date debut"
          />
          <input
            type="date"
            className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Date fin"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card
          className="cursor-pointer transition-colors hover:bg-primary/5"
          onClick={() => setDetailModalKey('revenue')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailModalKey('revenue');
            }
          }}
        >
          <p className="text-sm text-text-muted">Entrees de tresorerie</p>
          <p className="text-xl sm:text-2xl font-bold text-primary mt-1 leading-tight whitespace-normal">
            <CurrencyValue amount={totalRevenue} />
          </p>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-emerald-50/40"
          onClick={() => setDetailModalKey('grossProfit')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailModalKey('grossProfit');
            }
          }}
        >
          <p className="text-sm text-text-muted">Marge brute</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1 leading-tight whitespace-normal">
            <CurrencyValue amount={totalGrossProfit} />
          </p>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-red-50/40"
          onClick={() => setDetailModalKey('expenses')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailModalKey('expenses');
            }
          }}
        >
          <p className="text-sm text-text-muted">Sorties de tresorerie</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1 leading-tight whitespace-normal">
            <CurrencyValue amount={totalExpenses} />
          </p>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-slate-100/70"
          onClick={() => setDetailModalKey('net')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailModalKey('net');
            }
          }}
        >
          <p className="text-sm text-text-muted">Resultat net</p>
          <p className={`text-xl sm:text-2xl font-bold mt-1 leading-tight whitespace-normal ${netProfitSimple >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            <CurrencyValue amount={netProfitSimple} />
          </p>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-amber-50/40"
          onClick={() => setDetailModalKey('customerCredits')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailModalKey('customerCredits');
            }
          }}
        >
          <p className="text-sm text-text-muted">Credits clients</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1 leading-tight whitespace-normal">
            <CurrencyValue amount={totalCredit} />
          </p>
          <p className="text-xs text-text-muted mt-1">
            {new Set(filteredCustomerCredits.map((t) => t.customerId)).size} client(s) sur la periode
          </p>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-orange-50/40"
          onClick={() => setDetailModalKey('supplierCredits')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailModalKey('supplierCredits');
            }
          }}
        >
          <p className="text-sm text-text-muted">Credits fournisseurs</p>
          <p className="text-xl sm:text-2xl font-bold text-orange-600 mt-1 leading-tight whitespace-normal">
            <CurrencyValue amount={totalSupplierCredit} />
          </p>
          <p className="text-xs text-text-muted mt-1">
            {new Set(filteredSupplierCredits.map((t) => t.supplierId)).size} fournisseur(s) sur la periode
          </p>
        </Card>
      </div>

      <Modal
        open={detailModalKey !== null}
        onClose={() => setDetailModalKey(null)}
        title={
          detailModalKey === 'revenue'
            ? 'Detail des entrees de tresorerie'
            : detailModalKey === 'grossProfit'
            ? 'Detail de la marge brute'
            : detailModalKey === 'expenses'
            ? 'Detail des sorties de tresorerie'
            : detailModalKey === 'net'
            ? 'Detail du resultat net'
            : detailModalKey === 'customerCredits'
            ? 'Detail des credits clients'
            : 'Detail des credits fournisseurs'
        }
      >
        {detailModalKey === 'revenue' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Total: {formatCurrency(totalRevenue)}</p>
            <p className="text-text-muted">Ventes encaissees: {cashSalesCount} vente(s) ({formatCurrency(totalSalesRevenue)})</p>
            <p className="text-text-muted">Remboursements credits clients: {filteredCustomerCreditPayments.length} operation(s) ({formatCurrency(totalCustomerCreditPayments)})</p>
            <p className="text-text-muted">Entrees commandes clients: {customerOrderCashEntries.length} operation(s) ({formatCurrency(totalCustomerOrderEntries)})</p>
          </div>
        )}
        {detailModalKey === 'grossProfit' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Total: {formatCurrency(totalGrossProfit)}</p>
            <p className="text-text-muted">Calcul: somme de (prix de vente - prix d'achat) sur les ventes de la periode.</p>
          </div>
        )}
        {detailModalKey === 'expenses' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Total: {formatCurrency(totalExpenses)}</p>
            <p className="text-text-muted">Depenses manuelles: {formatCurrency(totalManualExpenses)}</p>
            <p className="text-text-muted">Commandes fournisseurs payees: {formatCurrency(totalSupplierPayments)}</p>
          </div>
        )}
        {detailModalKey === 'net' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Resultat net: {formatCurrency(netProfitSimple)}</p>
            <p className="text-text-muted">Calcul: Entrees de tresorerie ({formatCurrency(totalRevenue)}) - Sorties de tresorerie ({formatCurrency(totalExpenses)}).</p>
          </div>
        )}
        {detailModalKey === 'customerCredits' && (
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-text">Total du: {formatCurrency(totalCredit)}</p>
              <p className="text-text-muted">Clients debiteurs: {customersWhoOwe.length}</p>
              <p className="text-text-muted">Credits crees sur la periode: {filteredCustomerCredits.length}</p>
              <p className="text-text-muted">Remboursements sur la periode: {filteredCustomerCreditPayments.length}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setDetailModalKey(null); openCreditList('customers'); }}>
              Voir la liste des clients
            </Button>
          </div>
        )}
        {detailModalKey === 'supplierCredits' && (
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-text">Total du: {formatCurrency(totalSupplierCredit)}</p>
              <p className="text-text-muted">Fournisseurs a payer: {suppliersToPay.length}</p>
              <p className="text-text-muted">Credits fournisseurs crees: {filteredSupplierCredits.length}</p>
              <p className="text-text-muted">Paiements effectues: {filteredSupplierPayments.length}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setDetailModalKey(null); openCreditList('suppliers'); }}>
              Voir la liste des fournisseurs
            </Button>
          </div>
        )}
      </Modal>
      <Card>
        <CardTitle>Entrees/sorties d'argent par jour</CardTitle>
        {salesByDay.length === 0 ? (
          <p className="text-text-muted text-sm py-8 text-center">Aucune donnée pour cette période</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByDay} margin={{ top: 8, right: 8, left: 8, bottom: 16 }} onMouseLeave={() => setActiveBar(null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} minTickGap={14} />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    width={56}
                    tickFormatter={(value: number) => formatAxisCompact(value)}
                  />
                  <Tooltip
                    content={<FocusedTooltip />}
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    shared={false}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ventes" name="Entrees" fill="#3b82f6" radius={[4, 4, 0, 0]}  onMouseEnter={() => setActiveBar('ventes')} fillOpacity={activeBar && activeBar !== 'ventes' ? 0.2 : 1} isAnimationActive={false}  style={{ transition: 'opacity 0.2s ease' }}/>
                  <Bar dataKey="depenses" name="Sorties" fill="#ef4444" radius={[4, 4, 0, 0]} onMouseEnter={() => setActiveBar('depenses')} fillOpacity={activeBar && activeBar !== 'depenses' ? 0.2 : 1} isAnimationActive={false}  style={{ transition: 'opacity 0.2s ease' }}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-2">
              <div className="grid grid-cols-3 gap-2 px-1 pb-1 text-[11px] font-semibold text-text-muted">
                <span>Jour</span>
                <span className="text-right">Entrees</span>
                <span className="text-right">Sorties</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {salesByDay.map((row) => (
                  <div key={row.dayKey} className="grid grid-cols-3 gap-2 px-1 text-xs">
                    <span className="text-text">{row.date}</span>
                    <span className="text-right text-blue-600 font-medium">{formatCurrency(row.ventes)}</span>
                    <span className="text-right text-red-600 font-medium">{formatCurrency(row.depenses)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"> 
        {expensesByCategory.length > 0 && (
        <Card>
          <CardTitle>Dépenses par catégorie</CardTitle>
          <div className="mt-4 space-y-3">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategoryDetailed}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={false}
                    labelLine={false}
                  >
                    {expensesByCategoryDetailed.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-2">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-1 pb-1 text-[11px] font-semibold text-text-muted">
                <span>Categorie</span>
                <span className="text-right">Part</span>
                <span className="text-right">Montant</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {expensesByCategoryDetailed.map((row, i) => (
                  <div key={row.name} className="grid grid-cols-[1fr_auto_auto] gap-2 px-1 text-xs items-center">
                    <span className="text-text flex items-center gap-1.5 min-w-0">
                      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="text-right text-text-muted">{row.percent.toFixed(1)}%</span>
                    <span className="text-right font-medium text-text">{formatCurrency(row.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
        )}

        <Card>
          <CardTitle>Ventes par catégorie</CardTitle>
          {salesByCategory.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Aucune donnée pour cette période</p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={salesByCategoryDetailed}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={false}
                      labelLine={false}
                    >
                      {salesByCategoryDetailed.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border border-border bg-surface/60 p-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-1 pb-1 text-[11px] font-semibold text-text-muted">
                  <span>Categorie</span>
                  <span className="text-right">Part</span>
                  <span className="text-right">Montant</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {salesByCategoryDetailed.map((row, i) => (
                    <div key={row.name} className="grid grid-cols-[1fr_auto_auto] gap-2 px-1 text-xs items-center">
                      <span className="text-text flex items-center gap-1.5 min-w-0">
                        <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span className="text-right text-text-muted">{row.percent.toFixed(1)}%</span>
                      <span className="text-right font-medium text-text">{formatCurrency(row.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card id="clients-debiteurs-list">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Clients qui me doivent</CardTitle>
            <p className="text-lg font-extrabold text-amber-600">
              <CurrencyValue amount={customersWhoOwe.reduce((sum, c) => sum + c.dueAmount, 0)} />
            </p>
          </div>
          {customersWhoOwe.length === 0 ? (
            <p className="text-text-muted text-sm py-4">Aucun client debiteur</p>
          ) : (
            <div className="space-y-2 mt-3">
              {customersWhoOwe.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <p className="font-medium text-text">{c.name}</p>
                    <p className="text-xs text-text-muted">{c.phone}</p>
                  </div>
                  <p className="font-semibold text-amber-600">
                    <CurrencyValue amount={c.dueAmount} />
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="fournisseurs-a-payer-list">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Fournisseurs a payer</CardTitle>
            <p className="text-lg font-extrabold text-orange-600">
              <CurrencyValue amount={suppliersToPay.reduce((sum, s) => sum + s.dueAmount, 0)} />
            </p>
          </div>
          {suppliersToPay.length === 0 ? (
            <p className="text-text-muted text-sm py-4">Aucun fournisseur crediteur</p>
          ) : (
            <div className="space-y-2 mt-3">
              {suppliersToPay.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <p className="font-medium text-text">{s.name}</p>
                    <p className="text-xs text-text-muted">{s.phone}</p>
                  </div>
                  <p className="font-semibold text-orange-600">
                    <CurrencyValue amount={s.dueAmount} />
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

