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
    include: { creditTransactions: { orderBy: { date: 'desc' }, take: 10 } },
  });
  res.json(customers);
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      creditTransactions: { orderBy: { date: 'desc' } },
      sales: { orderBy: { date: 'desc' }, take: 20 },
    },
  });
  if (!customer || customer.deleted) {
    res.status(404).json({ error: 'Client non trouvé' });
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
    res.status(404).json({ error: 'Client non trouvé' });
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

// --- Customer Orders ---

router.get('/orders/all', async (_req, res) => {
  const orders = await prisma.customerOrder.findMany({
    orderBy: { date: 'desc' },
    include: { items: true, customer: true },
  });
  res.json(orders);
});

router.post('/:id/orders', async (req, res) => {
  const { items, deposit, note } = req.body;
  const total = items.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) =>
      sum + item.quantity * item.unitPrice,
    0
  );

  const order = await prisma.customerOrder.create({
    data: {
      customerId: req.params.id,
      total,
      deposit: deposit || 0,
      note: note || null,
      items: { create: items },
    },
    include: { items: true, customer: true },
  });

  res.status(201).json(order);
});

router.patch('/orders/:orderId/deliver', async (req: AuthRequest, res) => {
  const { paymentMethod } = req.body;
  const orderId = req.params.orderId as string;
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    res.status(404).json({ error: 'Commande non trouvée' });
    return;
  }
  if (order.status !== 'en_attente') {
    res.status(400).json({ error: 'Seule une commande en attente peut être livrée' });
    return;
  }

  const remaining = order.total - order.deposit;
  const orderItems = order.items;

  const sale = await prisma.sale.create({
    data: {
      userId: req.userId!,
      customerId: order.customerId,
      total: order.total,
      paymentMethod,
      items: {
        create: orderItems.map((item: { productId: string; productName: string; quantity: number; unitPrice: number; total: number }) => ({
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
    await prisma.product.update({
      where: { id: item.productId },
      data: { quantity: { decrement: item.quantity } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: item.productId,
        productName: item.productName,
        type: 'sortie',
        quantity: item.quantity,
        date: sale.date,
        userId: req.userId,
        reason: `Commande client #${order.id.slice(0, 8)}`,
      },
    });
  }

  if (paymentMethod === 'credit' && remaining > 0) {
    await prisma.customer.update({
      where: { id: order.customerId },
      data: { creditBalance: { increment: remaining } },
    });
    await prisma.creditTransaction.create({
      data: {
        customerId: order.customerId,
        saleId: sale.id,
        amount: remaining,
        type: 'credit',
        note: `Commande client #${order.id.slice(0, 8)} (reste après acompte)`,
      },
    });
  }

  const updated = await prisma.customerOrder.update({
    where: { id: orderId },
    data: { status: 'livree', saleId: sale.id },
    include: { items: true, customer: true },
  });

  res.json(updated);
});

router.patch('/orders/:orderId/cancel', async (req, res) => {
  const orderId = req.params.orderId as string;
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    res.status(404).json({ error: 'Commande non trouvée' });
    return;
  }
  if (order.status !== 'en_attente') {
    res.status(400).json({ error: 'Seule une commande en attente peut être annulée' });
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
