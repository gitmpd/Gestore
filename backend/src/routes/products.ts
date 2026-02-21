import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/', async (_req, res) => {
  const products = await prisma.product.findMany({ where: { deleted: false }, orderBy: { name: 'asc' } });
  res.json(products);
});

router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product || product.deleted) {
    res.status(404).json({ error: 'Produit non trouvé' });
    return;
  }
  res.json(product);
});

router.post('/', async (req, res) => {
  const payload = { ...(req.body ?? {}) } as Record<string, unknown>;
  // Stock is managed by supplier receptions/returns, not by product creation.
  delete payload.quantity;
  delete payload.buyPrice;
  const product = await prisma.product.create({
    data: {
      ...(payload as object),
      quantity: 0,
      buyPrice: 0,
    } as any,
  });
  res.status(201).json(product);
});

router.put('/:id', async (req, res) => {
  const payload = { ...(req.body ?? {}) } as Record<string, unknown>;
  // Prevent direct stock/cost edits through product update endpoint.
  delete payload.quantity;
  delete payload.buyPrice;
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: payload as any,
  });
  res.json(product);
});

router.delete('/:id', requireRole('gerant'), async (req, res) => {
  const id = req.params.id as string;
  await prisma.product.update({ where: { id }, data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' } });
  res.status(204).send();
});

export { router as productsRouter };
