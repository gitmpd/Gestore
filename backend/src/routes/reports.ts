import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireRole('gerant'));

router.get('/summary', async (req, res) => {
  const { from, to } = req.query;
  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from as string);
  if (to) dateFilter.lte = new Date(to as string);

  const where = Object.keys(dateFilter).length > 0
    ? { date: dateFilter, status: 'completed' as const, deleted: false }
    : { status: 'completed' as const, deleted: false };

  const sales = await prisma.sale.findMany({
    where,
    include: { items: { where: { deleted: false } } },
  });

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalSales = sales.length;

  let totalProfit = 0;
  for (const sale of sales) {
    for (const item of sale.items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (product && !product.deleted) {
        totalProfit += (item.unitPrice - product.buyPrice) * item.quantity;
      }
    }
  }

  const totalCredit = await prisma.customer.aggregate({
    _sum: { creditBalance: true },
    where: { deleted: false },
  });

  const allProducts = await prisma.product.findMany({
    where: { deleted: false },
    select: { quantity: true, alertThreshold: true },
  });
  const lowStockCount = allProducts.filter((product) => product.quantity <= product.alertThreshold).length;

  res.json({
    totalRevenue,
    totalSales,
    totalProfit,
    totalCredit: totalCredit._sum.creditBalance || 0,
    lowStockCount,
  });
});

router.get('/sales-by-day', async (req, res) => {
  const { from, to } = req.query;
  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from as string);
  if (to) dateFilter.lte = new Date(to as string);

  const where = Object.keys(dateFilter).length > 0
    ? { date: dateFilter, status: 'completed' as const, deleted: false }
    : { status: 'completed' as const, deleted: false };

  const sales = await prisma.sale.findMany({ where, orderBy: { date: 'asc' } });

  const byDay = new Map<string, number>();
  sales.forEach((sale) => {
    const day = sale.date.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + sale.total);
  });

  res.json([...byDay.entries()].map(([date, total]) => ({ date, total })));
});

export { router as reportsRouter };
