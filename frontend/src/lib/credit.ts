import type { CreditTransaction, Customer, Sale } from '@/types';

type CreditEvent =
  | {
      kind: 'credit';
      customerId: string;
      saleId: string;
      amount: number;
      date: string;
    }
  | {
      kind: 'payment';
      customerId: string;
      saleId?: string;
      amount: number;
      date: string;
    };

export function getCreditRemainingBySale(transactions: CreditTransaction[], creditSales: Sale[] = []) {
  const map = new Map<string, number>();
  const debtsByCustomer = new Map<string, { saleId: string; remaining: number }[]>();
  const activeTransactions = transactions.filter((tx) => !tx.deleted);
  const creditTransactionSaleIds = new Set(
    activeTransactions
      .filter((tx) => tx.type === 'credit' && Boolean(tx.saleId))
      .map((tx) => tx.saleId!)
  );

  const events: CreditEvent[] = [];

  activeTransactions.forEach((tx) => {
    if (tx.type === 'credit') {
      if (tx.saleId) {
        events.push({
          kind: 'credit',
          customerId: tx.customerId,
          saleId: tx.saleId,
          amount: tx.amount,
          date: tx.date,
        });
      }
      return;
    }

    events.push({
      kind: 'payment',
      customerId: tx.customerId,
      saleId: tx.saleId,
      amount: tx.amount,
      date: tx.date,
    });
  });

  creditSales
    .filter(
      (sale) =>
        !sale.deleted &&
        sale.status === 'completed' &&
        sale.paymentMethod === 'credit' &&
        Boolean(sale.customerId) &&
        !creditTransactionSaleIds.has(sale.id)
    )
    .forEach((sale) => {
      events.push({
        kind: 'credit',
        customerId: sale.customerId!,
        saleId: sale.id,
        amount: sale.total,
        date: sale.date,
      });
    });

  events
    .sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) return dateComparison;
      if (a.kind === b.kind) return 0;
      return a.kind === 'credit' ? -1 : 1;
    })
    .forEach((event) => {
      const debts = debtsByCustomer.get(event.customerId) ?? [];

      if (event.kind === 'credit') {
        debts.push({ saleId: event.saleId, remaining: event.amount });
        map.set(event.saleId, event.amount);
        debtsByCustomer.set(event.customerId, debts);
        return;
      }

      let paymentRemaining = event.amount;
      if (event.saleId) {
        const targetedDebt = debts.find((debt) => debt.saleId === event.saleId && debt.remaining > 0);
        if (targetedDebt) {
          const paid = Math.min(targetedDebt.remaining, paymentRemaining);
          targetedDebt.remaining -= paid;
          paymentRemaining -= paid;
          map.set(targetedDebt.saleId, targetedDebt.remaining);
        }
      }

      for (const debt of debts) {
        if (paymentRemaining <= 0) break;
        if (debt.remaining <= 0) continue;

        const paid = Math.min(debt.remaining, paymentRemaining);
        debt.remaining -= paid;
        paymentRemaining -= paid;
        map.set(debt.saleId, debt.remaining);
      }
    });

  return map;
}

export function getCustomerDisplayCreditBalances(
  customers: Customer[],
  sales: Sale[],
  transactions: CreditTransaction[]
) {
  const activeCreditSales = sales.filter(
    (sale) => !sale.deleted && sale.status === 'completed' && sale.paymentMethod === 'credit' && Boolean(sale.customerId)
  );
  const remainingBySale = getCreditRemainingBySale(transactions, activeCreditSales);
  const saleCreditByCustomer = new Map<string, number>();
  const transactionBalanceByCustomer = new Map<string, number>();

  activeCreditSales.forEach((sale) => {
    const remaining = Math.max(0, remainingBySale.get(sale.id) ?? sale.total);
    saleCreditByCustomer.set(sale.customerId!, (saleCreditByCustomer.get(sale.customerId!) ?? 0) + remaining);
  });

  transactions
    .filter((tx) => !tx.deleted)
    .forEach((tx) => {
      const current = transactionBalanceByCustomer.get(tx.customerId) ?? 0;
      transactionBalanceByCustomer.set(tx.customerId, current + (tx.type === 'credit' ? tx.amount : -tx.amount));
    });

  return new Map(
    customers.map((customer) => [
      customer.id,
      Math.max(
        0,
        customer.creditBalance ?? 0,
        saleCreditByCustomer.get(customer.id) ?? 0,
        transactionBalanceByCustomer.get(customer.id) ?? 0
      ),
    ])
  );
}
