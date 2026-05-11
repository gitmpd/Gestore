import { db } from '@/db';
import type { Expense } from '@/types';
import { generateId } from '@/lib/utils';

let running: Promise<number> | null = null;

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function expenseKey(expense: Pick<Expense, 'category' | 'amount' | 'description' | 'userId'>, date: Date) {
  return [
    expense.category,
    expense.amount,
    expense.description.trim().toLowerCase(),
    expense.userId ?? '',
    monthKey(date),
  ].join('|');
}

function scheduledMonthlyDate(sourceDate: Date, year: number, month: number) {
  const sourceDay = sourceDate.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(sourceDay, lastDayOfMonth);
  return new Date(year, month, day, 12, 0, 0, 0);
}

async function createMissingRecurringExpenses() {
  const allExpenses = await db.expenses.toArray();
  const activeExpenses = allExpenses.filter((expense) => !expense.deleted);
  const existingKeys = new Set(activeExpenses.map((expense) => expenseKey(expense, new Date(expense.date))));
  const recurringExpenses = activeExpenses
    .filter((expense) => expense.recurring)
    .sort((a, b) => a.date.localeCompare(b.date));

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const newExpenses: Expense[] = [];

  for (const source of recurringExpenses) {
    const sourceDate = new Date(source.date);
    let year = sourceDate.getFullYear();
    let month = sourceDate.getMonth() + 1;

    while (month > 11) {
      month -= 12;
      year += 1;
    }

    while (true) {
      const nextDate = scheduledMonthlyDate(sourceDate, year, month);
      if (nextDate > today) break;

      const key = expenseKey(source, nextDate);
      if (!existingKeys.has(key)) {
        const now = new Date().toISOString();
        newExpenses.push({
          id: generateId(),
          category: source.category,
          amount: source.amount,
          description: source.description,
          date: nextDate.toISOString(),
          recurring: true,
          userId: source.userId,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
        existingKeys.add(key);
      }

      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  if (newExpenses.length > 0) {
    await db.expenses.bulkAdd(newExpenses);
  }

  return newExpenses.length;
}

export function processRecurringExpenses() {
  if (running) return running;

  running = createMissingRecurringExpenses()
    .catch((error) => {
      console.error('Recurring expenses processing failed:', error);
      return 0;
    })
    .finally(() => {
      running = null;
    });

  return running;
}
