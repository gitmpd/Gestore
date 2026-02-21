import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireRole('gerant'));

router.get('/', async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { deleted: false }, orderBy: { name: 'asc' } });
  res.json(suppliers);
});

router.get('/:id', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
    include: { orders: { orderBy: { date: 'desc' }, include: { items: true } } },
  });
  if (!supplier || supplier.deleted) {
    res.status(404).json({ error: 'Fournisseur non trouvé' });
    return;
  }
  res.json(supplier);
});

router.post('/', async (req, res) => {
  const supplier = await prisma.supplier.create({ data: req.body });
  res.status(201).json(supplier);
});

router.put('/:id', async (req, res) => {
  const supplier = await prisma.supplier.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(supplier);
});

router.delete('/:id', async (req, res) => {
  await prisma.supplier.update({ where: { id: req.params.id }, data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' } });
  res.status(204).send();
});

router.post('/:id/orders', async (req, res) => {
  const { items } = req.body;
  const total = items.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) =>
      sum + item.quantity * item.unitPrice,
    0
  );

  const order = await prisma.supplierOrder.create({
    data: {
      supplierId: req.params.id,
      total,
      items: { create: items },
    },
    include: { items: true },
  });

  res.status(201).json(order);
});

router.post('/orders/:orderId/receive', async (req, res) => {
  const order = await prisma.supplierOrder.findUnique({
    where: { id: req.params.orderId },
    include: { items: true },
  });

  if (!order) {
    res.status(404).json({ error: 'Commande non trouvée' });
    return;
  }

  for (const item of order.items) {
    await prisma.product.update({
      where: { id: item.productId },
      data: { quantity: { increment: item.quantity } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: item.productId,
        productName: item.productName,
        type: 'entree',
        quantity: item.quantity,
        reason: `Réception commande #${order.id.slice(0, 8)}`,
      },
    });
  }

  const updated = await prisma.supplierOrder.update({
    where: { id: req.params.orderId },
    data: { status: 'recue' },
    include: { items: true },
  });

  res.json(updated);
});

export { router as suppliersRouter };
