import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth';

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
    include: { orders: { where: { deleted: false }, orderBy: { date: 'desc' }, include: { items: true } } },
  });
  if (!supplier || supplier.deleted) {
    res.status(404).json({ error: 'Fournisseur non trouve' });
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

router.post('/:id/orders', async (req: AuthRequest, res) => {
  const { items } = req.body;
  const supplierId = req.params.id as string;
  const total = items.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) =>
      sum + item.quantity * item.unitPrice,
    0
  );

  const order = await prisma.supplierOrder.create({
    data: {
      supplierId,
      total,
      userId: req.userId ?? null,
      items: { create: items },
    },
    include: { items: true },
  });

  res.status(201).json(order);
});

router.post('/orders/:orderId/receive', async (req: AuthRequest, res) => {
  try {
    const orderId = req.params.orderId as string;

    const updated = await prisma.$transaction(async (tx) => {
      const lock = await tx.supplierOrder.updateMany({
        where: { id: orderId, status: 'en_attente', deleted: false },
        data: { status: 'recue' },
      });

      if (lock.count === 0) {
        const existing = await tx.supplierOrder.findUnique({ where: { id: orderId }, select: { status: true, deleted: true } });
        if (!existing || existing.deleted) {
          throw new Error('Commande non trouvee');
        }
        if (existing.status === 'recue') {
          throw new Error('Commande deja recue');
        }
        throw new Error('Seule une commande en attente peut etre recue');
      }

      const order = await tx.supplierOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Commande non trouvee');
      }

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            productName: item.productName,
            type: 'entree',
            quantity: item.quantity,
            reason: `Reception commande #${order.id.slice(0, 8)}`,
            userId: req.userId ?? null,
          },
        });
      }

      return tx.supplierOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
    });

    res.json(updated);
  } catch (err) {
    const message = (err as Error).message;
    if (
      message === 'Commande non trouvee'
      || message === 'Commande deja recue'
      || message === 'Seule une commande en attente peut etre recue'
    ) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Erreur lors de la reception de la commande' });
  }
});

export { router as suppliersRouter };
