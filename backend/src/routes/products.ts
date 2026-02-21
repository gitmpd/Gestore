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
  const product = await prisma.product.create({ data: req.body });
  res.status(201).json(product);
});

router.put('/:id', async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(product);
});

router.delete('/:id', requireRole('gerant'), async (req, res) => {
  const id = req.params.id as string;
  await prisma.product.update({ where: { id }, data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' } });
  res.status(204).send();
});

export { router as productsRouter };
