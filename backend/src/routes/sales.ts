import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/', async (req, res) => {
  const { from, to } = req.query;
  const where: Record<string, unknown> = { deleted: false };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from as string);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to as string);
  }

  const sales = await prisma.sale.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { items: true, customer: true },
  });
  res.json(sales);
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { items, customerId, paymentMethod } = req.body as {
      items: Array<{ productId: string; quantity: number; unitPrice: number }>;
      customerId?: string;
      paymentMethod: 'cash' | 'credit' | 'mobile';
    };

    if (!req.userId) {
      res.status(401).json({ error: 'Utilisateur non authentifie' });
      return;
    }
    const currentUserId = req.userId;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Aucun article de vente' });
      return;
    }

    const invalid = items.find((item) => !item.productId || item.quantity <= 0 || item.unitPrice < 0);
    if (invalid) {
      res.status(400).json({ error: 'Articles de vente invalides' });
      return;
    }

    const productIds = Array.from(new Set(items.map((item) => item.productId)));

    const sale = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deleted: false },
        select: { id: true, name: true, quantity: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Produit introuvable: ${item.productId}`);
        }
        if (product.quantity < item.quantity) {
          throw new Error(`Stock insuffisant pour ${product.name}`);
        }
      }

      const normalizedItems = items.map((item) => {
        const product = productMap.get(item.productId)!;
        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        };
      });

      const total = normalizedItems.reduce((sum, item) => sum + item.total, 0);

      const createdSale = await tx.sale.create({
        data: {
          userId: currentUserId,
          customerId: customerId || null,
          total,
          paymentMethod,
          items: { create: normalizedItems },
        },
        include: { items: true },
      });

      for (const item of createdSale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            productName: item.productName,
            type: 'sortie',
            quantity: item.quantity,
            reason: `Vente #${createdSale.id.slice(0, 8)}`,
            userId: currentUserId,
          },
        });
      }

      if (paymentMethod === 'credit' && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { creditBalance: { increment: total } },
        });
        await tx.creditTransaction.create({
          data: {
            customerId,
            saleId: createdSale.id,
            amount: total,
            type: 'credit',
            note: `Vente #${createdSale.id.slice(0, 8)}`,
          },
        });
      }

      return createdSale;
    });

    res.status(201).json(sale);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('Stock insuffisant') || message.includes('Produit introuvable')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Erreur lors de la creation de la vente' });
  }
});

export { router as salesRouter };
