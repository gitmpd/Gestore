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
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { expenseCategoryLabels } from '@/pages/ExpensesPage';
import type { ExpenseCategory } from '@/types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

type Period = '7d' | '30d' | '90d';

function getStartDate(period: Period): Date {
  const d = new Date();
  if (period === '7d') d.setDate(d.getDate() - 7);
  else if (period === '30d') d.setDate(d.getDate() - 30);
  else d.setDate(d.getDate() - 90);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('30d');

  const sales = useLiveQuery(() => db.sales.toArray()) ?? [];
  const saleItems = useLiveQuery(async () => (await db.saleItems.toArray()).filter((s) => !(s as any).deleted)) ?? [];
  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => !p.deleted)) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray()) ?? [];

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const startDate = useMemo(() => getStartDate(period), [period]);

  const filteredSales = useMemo(
    () => sales.filter((s) => new Date(s.date) >= startDate && s.status === 'completed' && !s.deleted),
    [sales, startDate]
  );

  const filteredExpenses = useMemo(
    () => allExpenses.filter((e) => new Date(e.date) >= startDate),
    [allExpenses, startDate]
  );

  const totalRevenue = useMemo(
    () => filteredSales.reduce((sum, s) => sum + s.total, 0),
    [filteredSales]
  );

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

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const netProfit = totalGrossProfit - totalExpenses;

  const totalCredit = useMemo(
    () => customers.reduce((sum, c) => sum + c.creditBalance, 0),
    [customers]
  );

  const salesByDay = useMemo(() => {
    const salesMap = new Map<string, number>();
    const expMap = new Map<string, number>();
    filteredSales.forEach((s) => {
      const day = s.date.slice(0, 10);
      salesMap.set(day, (salesMap.get(day) ?? 0) + s.total);
    });
    filteredExpenses.forEach((e) => {
      const day = e.date.slice(0, 10);
      expMap.set(day, (expMap.get(day) ?? 0) + e.amount);
    });
    const allDays = new Set([...salesMap.keys(), ...expMap.keys()]);
    return [...allDays]
      .sort()
      .map((day) => ({
        date: new Date(day).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        ventes: salesMap.get(day) ?? 0,
        depenses: expMap.get(day) ?? 0,
      }));
  }, [filteredSales, filteredExpenses]);

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

  const expensesByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of filteredExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([cat, value]) => ({
        name: expenseCategoryLabels[cat],
        value,
      }));
  }, [filteredExpenses]);

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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <p className="text-sm text-text-muted">Chiffre d'affaires</p>
          <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-text-muted mt-1">{filteredSales.length} vente(s)</p>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">Marge brute</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalGrossProfit)}</p>
          <p className="text-xs text-text-muted mt-1">Ventes - coût achat</p>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">Dépenses</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalExpenses)}</p>
          <p className="text-xs text-text-muted mt-1">{filteredExpenses.length} dépense(s)</p>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">Bénéfice net</p>
          <p className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(netProfit)}
          </p>
          <Badge variant={netProfit >= 0 ? 'success' : 'danger'} className="mt-1">
            {netProfit >= 0 ? 'Rentable' : 'Déficitaire'}
          </Badge>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">Crédits clients</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(totalCredit)}</p>
          <p className="text-xs text-text-muted mt-1">
            {customers.filter((c) => c.creditBalance > 0).length} client(s)
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle>Ventes vs Dépenses par jour</CardTitle>
          {salesByDay.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Aucune donnée pour cette période</p>
          ) : (
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend />
                  <Bar dataKey="ventes" name="Ventes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="depenses" name="Dépenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Ventes par catégorie</CardTitle>
          {salesByCategory.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Aucune donnée pour cette période</p>
          ) : (
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesByCategory}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {salesByCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {expensesByCategory.length > 0 && (
        <Card>
          <CardTitle>Dépenses par catégorie</CardTitle>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
                  }
                >
                  {expensesByCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
