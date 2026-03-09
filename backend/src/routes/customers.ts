import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/', async (_req, res) => {
  const customers = await prisma.customer.findMany({
    where: { deleted: false },
    orderBy: { name: 'asc' },
    include: { creditTransactions: { where: { deleted: false }, orderBy: { date: 'desc' }, take: 10 } },
  });
  res.json(customers);
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      creditTransactions: { where: { deleted: false }, orderBy: { date: 'desc' } },
      sales: { where: { deleted: false }, orderBy: { date: 'desc' }, take: 20 },
    },
  });
  if (!customer || customer.deleted) {
    res.status(404).json({ error: 'Client non trouve' });
    return;
  }
  res.json(customer);
});

router.post('/', async (req, res) => {
  const customer = await prisma.customer.create({ data: req.body });
  res.status(201).json(customer);
});

router.put('/:id', async (req, res) => {
  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(customer);
});

router.delete('/:id', requireRole('gerant'), async (req, res) => {
  const id = req.params.id as string;
  await prisma.creditTransaction.updateMany({ where: { customerId: id }, data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' } });
  await prisma.customer.update({ where: { id }, data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' } });
  res.status(204).send();
});

router.post('/:id/credit', async (req, res) => {
  const { amount, type, note } = req.body;
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) {
    res.status(404).json({ error: 'Client non trouve' });
    return;
  }

  const newBalance =
    type === 'credit'
      ? customer.creditBalance + amount
      : Math.max(0, customer.creditBalance - amount);

  const [updatedCustomer, transaction] = await prisma.$transaction([
    prisma.customer.update({
      where: { id: req.params.id },
      data: { creditBalance: newBalance },
    }),
    prisma.creditTransaction.create({
      data: {
        customerId: req.params.id,
        amount,
        type,
        note,
        date: new Date(),
      },
    }),
  ]);

  res.json({ customer: updatedCustomer, transaction });
});

router.get('/orders/all', async (_req, res) => {
  const orders = await prisma.customerOrder.findMany({
    where: { deleted: false },
    orderBy: { date: 'desc' },
    include: { items: { where: { deleted: false } }, customer: true },
  });
  res.json(orders);
});

router.post('/:id/orders', async (req: AuthRequest, res) => {
  const { items, deposit, note } = req.body;
  const customerId = req.params.id as string;
  const total = items.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) =>
      sum + item.quantity * item.unitPrice,
    0
  );

  const order = await prisma.customerOrder.create({
    data: {
      customerId,
      total,
      deposit: deposit || 0,
      note: note || null,
      userId: req.userId ?? null,
      items: { create: items },
    },
    include: { items: true, customer: true },
  });

  res.status(201).json(order);
});

router.patch('/orders/:orderId/deliver', async (req: AuthRequest, res) => {
  try {
    const { paymentMethod } = req.body;
    const orderId = req.params.orderId as string;

    if (!req.userId) {
      res.status(401).json({ error: 'Utilisateur non authentifie' });
      return;
    }
    const currentUserId = req.userId;

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order || order.deleted) {
        throw new Error('Commande non trouvee');
      }
      if (order.status !== 'en_attente') {
        throw new Error('Seule une commande en attente peut etre livree');
      }

      const productIds = Array.from(new Set(order.items.map((item) => item.productId)));
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deleted: false },
        select: { id: true, name: true, quantity: true },
      });
      const productMap = new Map(products.map((product) => [product.id, product]));

      for (const item of order.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Produit introuvable: ${item.productId}`);
        }
        if (product.quantity < item.quantity) {
          throw new Error(`Stock insuffisant pour ${product.name}`);
        }
      }

      const remaining = order.total - order.deposit;

      const sale = await tx.sale.create({
        data: {
          userId: currentUserId,
          customerId: order.customerId,
          total: order.total,
          paymentMethod,
          items: {
            create: order.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of sale.items) {
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
            date: sale.date,
            userId: currentUserId,
            reason: `Commande client #${order.id.slice(0, 8)}`,
          },
        });
      }

      if (paymentMethod === 'credit' && remaining > 0) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { creditBalance: { increment: remaining } },
        });
        await tx.creditTransaction.create({
          data: {
            customerId: order.customerId,
            saleId: sale.id,
            amount: remaining,
            type: 'credit',
            note: `Commande client #${order.id} (reste après acompte)`,
          },
        });
      }

      return tx.customerOrder.update({
        where: { id: orderId },
        data: { status: 'livree', saleId: sale.id },
        include: { items: true, customer: true },
      });
    });

    res.json(updated);
  } catch (err) {
    const message = (err as Error).message;
    if (
      message === 'Commande non trouvee'
      || message === 'Seule une commande en attente peut etre livree'
      || message.includes('Stock insuffisant')
      || message.includes('Produit introuvable')
    ) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Erreur lors de la livraison de la commande' });
  }
});

router.patch('/orders/:orderId/cancel', async (req, res) => {
  const orderId = req.params.orderId as string;
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
  });

  if (!order || order.deleted) {
    res.status(404).json({ error: 'Commande non trouvee' });
    return;
  }
  if (order.status !== 'en_attente') {
    res.status(400).json({ error: 'Seule une commande en attente peut etre annulee' });
    return;
  }

  const updated = await prisma.customerOrder.update({
    where: { id: orderId },
    data: { status: 'annulee' },
    include: { items: true, customer: true },
  });

  res.json(updated);
});

export { router as customersRouter };
