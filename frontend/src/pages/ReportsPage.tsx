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

type Period = 'today' | 'week' | 'last_week' | 'month' | 'last_month' | '90d' | 'all';
type MetricDetailKey =
  | 'revenue'
  | 'grossProfit'
  | 'expenses'
  | 'net'
  | 'customerCredits'
  | 'supplierCredits'
  | 'cashBalance';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getWeekStart(date: Date): Date {
  const day = date.getDay();
  const offset = (day + 6) % 7; // Monday as week start
  return addDays(startOfDay(date), -offset);
}

function getPeriodRange(period: Period): { start: Date; end: Date } | null {
  const today = startOfDay(new Date());

  if (period === 'all') return null;
  if (period === 'today') return { start: today, end: endOfDay(today) };

  if (period === 'week') {
    return { start: getWeekStart(today), end: endOfDay(today) };
  }

  if (period === 'last_week') {
    const currentWeekStart = getWeekStart(today);
    const start = addDays(currentWeekStart, -7);
    const end = endOfDay(addDays(currentWeekStart, -1));
    return { start, end };
  }

  if (period === 'month') {
    const start = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
    return { start, end: endOfDay(today) };
  }

  if (period === 'last_month') {
    const start = startOfDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
    return { start, end };
  }

  const start = addDays(today, -89);
  return { start, end: endOfDay(today) };
}

function formatPercentChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1).replace(/\.0$/, '')}%`;
}

const periodOptions: Array<{ key: Period; label: string }> = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'last_week', label: 'Semaine dernière' },
  { key: 'month', label: 'Ce mois' },
  { key: 'last_month', label: 'Mois dernier' },
  { key: '90d', label: '90 jours' },
  { key: 'all', label: 'Tout' },
];

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
  const [period, setPeriod] = useState<Period>('month');
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
  const capitalEntries = useLiveQuery(() => db.capitalEntries.toArray()) ?? [];
  const customerOrders = useLiveQuery(() => db.customerOrders.toArray()) ?? [];
  const customerCreditTransactions = useLiveQuery(() => db.creditTransactions.toArray()) ?? [];
  const supplierCreditTransactions = useLiveQuery(() => db.supplierCreditTransactions.toArray()) ?? [];

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const periodRange = useMemo(() => getPeriodRange(period), [period]);
  const inSelectedRange = (isoDate: string) => {
    const dayKey = isoDate.slice(0, 10);
    if (dateFrom && dayKey < dateFrom) return false;
    if (dateTo && dayKey > dateTo) return false;

    if (!dateFrom && !dateTo && periodRange) {
      const periodStart = toLocalDateKey(periodRange.start);
      const periodEnd = toLocalDateKey(periodRange.end);
      if (dayKey < periodStart || dayKey > periodEnd) return false;
    }

    return true;
  };

  const filteredSales = useMemo(
    () => sales.filter((s) => inSelectedRange(s.date) && s.status === 'completed' && !s.deleted),
    [sales, period, dateFrom, dateTo]
  );

  const filteredExpenses = useMemo(
    () => allExpenses.filter((e) => !e.deleted && inSelectedRange(e.date)),
    [allExpenses, period, dateFrom, dateTo]
  );

  const filteredCapitalEntries = useMemo(
    () => capitalEntries.filter((entry) => !entry.deleted && inSelectedRange(entry.date)),
    [capitalEntries, period, dateFrom, dateTo]
  );

  const saleById = useMemo(
    () => new Map(sales.map((s) => [s.id, s])),
    [sales]
  );

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const saleItemsBySaleId = useMemo(() => {
    const map = new Map<string, typeof saleItems>();
    for (const item of saleItems) {
      const group = map.get(item.saleId);
      if (group) group.push(item);
      else map.set(item.saleId, [item]);
    }
    return map;
  }, [saleItems]);

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
    [customerOrders, period, dateFrom, dateTo, saleById]
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
    [customerCreditTransactions, period, dateFrom, dateTo]
  );

  const filteredCustomerCredits = useMemo(
    () =>
      customerCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'credit' && inSelectedRange(t.date)
      ),
    [customerCreditTransactions, period, dateFrom, dateTo]
  );

  const totalCustomerCreditPayments = useMemo(
    () => filteredCustomerCreditPayments.reduce((sum, t) => sum + t.amount, 0),
    [filteredCustomerCreditPayments]
  );

  const customerCreditNetById = useMemo(() => {
    const map = new Map<string, number>();
    for (const customer of customers) {
      map.set(customer.id, Math.max(0, customer.creditBalance ?? 0));
    }
    return map;
  }, [customers]);

  const totalCustomerOrderEntries = useMemo(
    () => customerOrderCashEntries.reduce((sum, e) => sum + e.amount, 0),
    [customerOrderCashEntries]
  );

  const totalCapitalEntries = useMemo(
    () => filteredCapitalEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [filteredCapitalEntries]
  );

  const totalRevenue = totalSalesRevenue + totalCustomerCreditPayments + totalCustomerOrderEntries + totalCapitalEntries;

  const totalGrossProfit = useMemo(() => {
    let profit = 0;
    for (const sale of filteredSales) {
      const items = saleItemsBySaleId.get(sale.id) ?? [];
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (product) {
          profit += (item.unitPrice - product.buyPrice) * item.quantity;
        }
      }
    }
    return profit;
  }, [filteredSales, saleItemsBySaleId, productMap]);

  const totalManualExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const filteredSupplierPayments = useMemo(
    () =>
      supplierCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'payment' && inSelectedRange(t.date)
      ),
    [supplierCreditTransactions, period, dateFrom, dateTo]
  );

  const filteredSupplierCredits = useMemo(
    () =>
      supplierCreditTransactions.filter(
        (t) => !t.deleted && t.type === 'credit' && inSelectedRange(t.date)
      ),
    [supplierCreditTransactions, period, dateFrom, dateTo]
  );

  const supplierCreditNetById = useMemo(() => {
    const map = new Map<string, number>();
    for (const supplier of suppliers) {
      map.set(supplier.id, Math.max(0, supplier.creditBalance ?? 0));
    }
    return map;
  }, [suppliers]);

  const totalSupplierPayments = useMemo(
    () => filteredSupplierPayments.reduce((sum, t) => sum + t.amount, 0),
    [filteredSupplierPayments]
  );

  const totalExpenses = totalManualExpenses + totalSupplierPayments;

  const netProfitSimple = totalRevenue - totalExpenses;

  // Récupérer la date de la première vente (la plus ancienne)
const firstSaleDate = useMemo(() => {
  const completedSales = sales.filter(s => s.status === 'completed' && !s.deleted);
  if (completedSales.length === 0) return null;
  const firstSale = completedSales.reduce((earliest, sale) => 
    new Date(sale.date) < new Date(earliest.date) ? sale : earliest
  );
  return firstSale.date; // string ISO
}, [sales]);

// Calculer le capital initial = somme des achats effectués avant la première vente
const initialCapital = useMemo(() => {
  if (!firstSaleDate) return 0;

  // 1. Dépenses manuelles (achats de produits) avant la première vente
  const manualAchats = allExpenses
    .filter(e => !e.deleted && e.date < firstSaleDate)
    .reduce((sum, e) => sum + e.amount, 0);

  // 2. Paiements aux fournisseurs (commandes) avant la première vente
  const supplierPaymentsBefore = supplierCreditTransactions
    .filter(t => !t.deleted && t.type === 'payment' && t.date < firstSaleDate)
    .reduce((sum, t) => sum + t.amount, 0);

  // 3. Éventuellement, les apports en capital spécifiques à l'achat initial
  //    Si vous utilisez capitalEntries pour cela, vous pouvez les ajouter :
  const capitalForAchats = capitalEntries
    .filter(e => !e.deleted && e.date < firstSaleDate)
    .reduce((sum, e) => sum + e.amount, 0);

  // Retourner la somme de tous ces achats initiaux
  return manualAchats + supplierPaymentsBefore + capitalForAchats;
}, [firstSaleDate, allExpenses, supplierCreditTransactions, capitalEntries]);

  // Solde de caisse = résultat net + capital initial
  const cashBalance = netProfitSimple + initialCapital;

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

  const activeDateLabel = useMemo(() => {
    if (dateFrom || dateTo) {
      const fromLabel = dateFrom || 'debut';
      const toLabel = dateTo || "aujourd'hui";
      return `Du ${fromLabel} au ${toLabel}`;
    }

    const labels: Record<Period, string> = {
      today: "Aujourd'hui",
      week: 'Cette semaine',
      last_week: 'Semaine dernière',
      month: 'Ce mois',
      last_month: 'Mois dernier',
      '90d': 'Les 90 derniers jours',
      all: 'Toute la periode',
    };

    return labels[period];
  }, [period, dateFrom, dateTo]);

  const reportSummary = useMemo(
    () => [
      { label: 'Ventes validees', value: `${filteredSales.length}` },
      { label: 'Depenses enregistrees', value: `${filteredExpenses.length}` },
      { label: 'Clients debiteurs', value: `${customersWhoOwe.length}` },
      { label: 'Fournisseurs a payer', value: `${suppliersToPay.length}` },
    ],
    [filteredSales.length, filteredExpenses.length, customersWhoOwe.length, suppliersToPay.length]
  );

  const comparisonRange = useMemo(() => {
    if (dateFrom && dateTo) {
      const currentStart = startOfDay(parseDateInput(dateFrom));
      const currentEnd = endOfDay(parseDateInput(dateTo));
      const durationDays = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1);
      const previousEnd = endOfDay(addDays(currentStart, -1));
      const previousStart = startOfDay(addDays(currentStart, -durationDays));
      return { currentStart, currentEnd, previousStart, previousEnd };
    }

    if (dateFrom || dateTo || period === 'all') {
      return null;
    }

    const currentRange = getPeriodRange(period);
    if (!currentRange) {
      return null;
    }
    const currentEnd = currentRange.end;
    const currentStart = currentRange.start;
    const durationDays = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1);
    const previousEnd = endOfDay(addDays(currentStart, -1));
    const previousStart = startOfDay(addDays(currentStart, -durationDays));
    return { currentStart, currentEnd, previousStart, previousEnd };
  }, [period, dateFrom, dateTo]);

  const isInComparisonRange = (isoDate: string, start: Date, end: Date) => {
    const date = new Date(isoDate);
    return date >= start && date <= end;
  };

  const previousPeriodMetrics = useMemo(() => {
    if (!comparisonRange) return null;

    const previousSales = sales.filter(
      (sale) =>
        !sale.deleted &&
        sale.status === 'completed' &&
        isInComparisonRange(sale.date, comparisonRange.previousStart, comparisonRange.previousEnd)
    );
    const previousCustomerCreditPayments = customerCreditTransactions.filter(
      (transaction) =>
        !transaction.deleted &&
        transaction.type === 'payment' &&
        isInComparisonRange(transaction.date, comparisonRange.previousStart, comparisonRange.previousEnd)
    );
    const previousCustomerOrderEntries = customerOrders
      .filter(
        (order) =>
          order.status !== 'annulee' &&
          isInComparisonRange(order.date, comparisonRange.previousStart, comparisonRange.previousEnd)
      )
      .map((order) => {
        if (order.status === 'en_attente') return order.deposit > 0 ? order.deposit : 0;
        if (order.status === 'livree') {
          if (!order.saleId) return order.total;
          const linkedSale = saleById.get(order.saleId);
          if (linkedSale && linkedSale.paymentMethod === 'credit') {
            return order.deposit > 0 ? order.deposit : 0;
          }
        }
        return 0;
      })
      .reduce((sum, amount) => sum + amount, 0);
    const previousCapitalEntries = capitalEntries
      .filter(
        (entry) =>
          !entry.deleted && isInComparisonRange(entry.date, comparisonRange.previousStart, comparisonRange.previousEnd)
      )
      .reduce((sum, entry) => sum + entry.amount, 0);
    const previousRevenue =
      previousSales.filter((sale) => sale.paymentMethod !== 'credit').reduce((sum, sale) => sum + sale.total, 0) +
      previousCustomerCreditPayments.reduce((sum, transaction) => sum + transaction.amount, 0) +
      previousCustomerOrderEntries +
      previousCapitalEntries;

    const previousExpenses =
      allExpenses
        .filter(
          (expense) =>
            !expense.deleted && isInComparisonRange(expense.date, comparisonRange.previousStart, comparisonRange.previousEnd)
        )
        .reduce((sum, expense) => sum + expense.amount, 0) +
      supplierCreditTransactions
        .filter(
          (transaction) =>
            !transaction.deleted &&
            transaction.type === 'payment' &&
            isInComparisonRange(transaction.date, comparisonRange.previousStart, comparisonRange.previousEnd)
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      revenue: previousRevenue,
      expenses: previousExpenses,
      net: previousRevenue - previousExpenses,
    };
  }, [
    comparisonRange,
    sales,
    customerCreditTransactions,
    customerOrders,
    saleById,
    capitalEntries,
    allExpenses,
    supplierCreditTransactions,
  ]);

  const comparisonCards = useMemo(() => {
    if (!previousPeriodMetrics) return [];

    const buildChange = (current: number, previous: number) => {
      if (previous === 0) {
        if (current === 0) return 'Stable';
        return '';
      }
      return formatPercentChange(((current - previous) / previous) * 100);
    };

    return [
      {
        label: 'Encaissements',
        value: totalRevenue,
        previous: previousPeriodMetrics.revenue,
        change: buildChange(totalRevenue, previousPeriodMetrics.revenue),
        tone: 'text-primary',
      },
      {
        label: 'Decaissements',
        value: totalExpenses,
        previous: previousPeriodMetrics.expenses,
        change: buildChange(totalExpenses, previousPeriodMetrics.expenses),
        tone: 'text-red-600',
      },
      {
        label: 'Solde net',
        value: netProfitSimple,
        previous: previousPeriodMetrics.net,
        change: buildChange(netProfitSimple, previousPeriodMetrics.net),
        tone: netProfitSimple >= 0 ? 'text-emerald-600' : 'text-red-600',
      },
    ];
  }, [previousPeriodMetrics, totalRevenue, totalExpenses, netProfitSimple]);

  const topProducts = useMemo(() => {
    const aggregated = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();

    for (const sale of filteredSales) {
      const items = saleItemsBySaleId.get(sale.id) ?? [];
      for (const item of items) {
        const existing = aggregated.get(item.productId) ?? {
          name: item.productName,
          quantity: 0,
          revenue: 0,
          profit: 0,
        };
        const product = productMap.get(item.productId);
        existing.quantity += item.quantity;
        existing.revenue += item.total;
        existing.profit += ((item.unitPrice - (product?.buyPrice ?? 0)) * item.quantity);
        aggregated.set(item.productId, existing);
      }
    }

    return [...aggregated.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredSales, saleItemsBySaleId, productMap]);

 const salesByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        ventesDetail: number;
        remboursementsCredits: number;
        commandesClients: number;
        capital: number;
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
          capital: 0,
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

    filteredCapitalEntries.forEach((entry) => {
      const day = entry.date.slice(0, 10);
      ensureDay(day).capital += entry.amount;
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
          values.commandesClients +
          values.capital,

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
    filteredCapitalEntries,
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
      <div className="bg-surface border border-border rounded-lg shadow-lg p-3 text-sm text-text min-w-[190px]">
        <p className="font-semibold mb-2 text-text">{label}</p>

        {activeBar === 'ventes' && (
          <>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">
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

              <div className="flex justify-between">
                <span>Apports en capital:</span>
                <span>{formatCurrency(data.capital)}</span>
              </div>

              <div className="flex justify-between font-bold border-t border-border pt-1 mt-1">
                <span>Total:</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {formatCurrency(data.ventes)}
                </span>
              </div>
            </div>
          </>
        )}

        {activeBar === 'depenses' && (
          <>
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold mb-1">
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

              <div className="flex justify-between font-bold border-t border-border pt-1 mt-1">
                <span>Total:</span>
                <span className="text-red-600 dark:text-red-400">
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
      </div>

      <div className="rounded-2xl border border-border bg-gradient-to-r from-slate-50 via-white to-slate-100 px-4 py-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text">Lecture des rapports</p>
            <p className="text-sm text-text-muted">
              Vue active: <span className="font-medium text-text">{activeDateLabel}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {periodOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setPeriod(option.key);
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    !dateFrom && !dateTo && period === option.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px]">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              <span>Du</span>
              <input
                type="date"
                className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  if (e.target.value) setPeriod('all');
                }}
                title="Date debut"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              <span>Au</span>
              <input
                type="date"
                className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  if (e.target.value) setPeriod('all');
                }}
                title="Date fin"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setPeriod('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Voir tout
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {reportSummary.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-surface/80 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{item.label}</p>
              <p className="mt-1 text-xl font-bold text-text">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <Card className="bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Resume financier</CardTitle>
          </div>
          {comparisonCards.length > 0 && (
            <span className="self-start rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted">
              Comparé a la periode précedente
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          {/* Carte Solde de caisse - toujours affichée */}
          <Card
            className="cursor-pointer transition-colors hover:bg-teal-50/40"
            onClick={() => setDetailModalKey('cashBalance')}
          >
            <p className="text-sm text-text-muted">Solde de caisse</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 leading-tight whitespace-normal ${
              cashBalance >= 0 ? 'text-teal-600' : 'text-red-600'
            }`}>
              <CurrencyValue amount={cashBalance} />
            </p>
            <p className="text-xs text-text-muted mt-1">
              Capital de départ : {formatCurrency(initialCapital)}
            </p>
          </Card>

          {/* En mode comparaison : afficher les 3 cartes de comparaison */}
          {comparisonCards.length > 0 ? (
            comparisonCards.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-surface/90 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{item.label}</p>
                <p className={`mt-2 text-2xl font-bold ${item.tone}`}>
                  <CurrencyValue amount={item.value} />
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  Periode precedente: {formatCurrency(item.previous)}
                </p>
                <p className={`mt-1 text-sm font-semibold ${item.change.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {item.change}
                </p>
              </div>
            ))
          ) : (
            // En mode normal : afficher les 3 cartes classiques
            <>
              <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Encaissements</p>
                <p className="mt-2 text-2xl font-bold text-primary">
                  <CurrencyValue amount={totalRevenue} />
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Decaissements</p>
                <p className="mt-2 text-2xl font-bold text-red-600">
                  <CurrencyValue amount={totalExpenses} />
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Solde net</p>
                <p className={`mt-2 text-2xl font-bold ${netProfitSimple >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <CurrencyValue amount={netProfitSimple} />
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Top produits</CardTitle>
            </div>
          </div>

          {topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Aucune vente produit sur cette periode</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {topProducts.map((product, index) => (
                <div key={`${product.name}-${index}`} className="rounded-xl border border-border bg-surface/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">#{index + 1}</p>
                      <p className="truncate font-semibold text-text">{product.name}</p>
                    </div>
                    <p className="text-sm font-semibold text-primary">{formatCurrency(product.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
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
            ? 'Detail des entrées de tresorerie'
            : detailModalKey === 'grossProfit'
            ? 'Detail de la marge brute'
            : detailModalKey === 'expenses'
            ? 'Detail des sorties de tresorerie'
            : detailModalKey === 'net'
            ? 'Detail du resultat net'
            : detailModalKey === 'customerCredits'
            ? 'Detail des credits clients'
            : detailModalKey === 'supplierCredits'
            ? 'Detail des credits fournisseurs'
            : detailModalKey === 'cashBalance'
            ? 'Detail du solde de caisse'
            : ''
        }
      >
        {detailModalKey === 'revenue' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Total: {formatCurrency(totalRevenue)}</p>
            <p className="text-text-muted">Ventes encaissées: {cashSalesCount} vente(s) ({formatCurrency(totalSalesRevenue)})</p>
            <p className="text-text-muted">Remboursements credits clients: {filteredCustomerCreditPayments.length} operation(s) ({formatCurrency(totalCustomerCreditPayments)})</p>
            <p className="text-text-muted">Entrées commandes clients: {customerOrderCashEntries.length} operation(s) ({formatCurrency(totalCustomerOrderEntries)})</p>
            <p className="text-text-muted">Apports en capital: {filteredCapitalEntries.length} operation(s) ({formatCurrency(totalCapitalEntries)})</p>
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
            <p className="text-text-muted">Commandes fournisseurs payées: {formatCurrency(totalSupplierPayments)}</p>
          </div>
        )}
        {detailModalKey === 'net' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Resultat net: {formatCurrency(netProfitSimple)}</p>
            <p className="text-text-muted">Calcul: Entrées de tresorerie ({formatCurrency(totalRevenue)}) - Sorties de tresorerie ({formatCurrency(totalExpenses)}).</p>
          </div>
        )}
        {detailModalKey === 'customerCredits' && (
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-text">Total du: {formatCurrency(totalCredit)}</p>
              <p className="text-text-muted">Clients debiteurs: {customersWhoOwe.length}</p>
              <p className="text-text-muted">Credits crées sur la periode: {filteredCustomerCredits.length}</p>
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
              <p className="text-text-muted">Credits fournisseurs crées: {filteredSupplierCredits.length}</p>
              <p className="text-text-muted">Paiements effectués: {filteredSupplierPayments.length}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setDetailModalKey(null); openCreditList('suppliers'); }}>
              Voir la liste des fournisseurs
            </Button>
          </div>
        )}
        {detailModalKey === 'cashBalance' && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-text">Solde de caisse : {formatCurrency(cashBalance)}</p>
            <p className="text-text-muted">
              Formule = Solde net ({formatCurrency(netProfitSimple)}) + Capital initial ({formatCurrency(initialCapital)})
            </p>
            <p className="text-text-muted">
              Le capital initial est le premier apport en capital enregistré (achats avant la première vente).
            </p>
          </div>
        )}
      </Modal>

      <Card>
        <CardTitle>Entrées/sorties d'argent par jour</CardTitle>
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
                <span className="text-right">Entrées</span>
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