import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireRole('gerant'));

router.delete('/reset-database', async (_req, res) => {
  try {
    // Certaines installations ont une table Feedback legacy avec FK -> User.
    // On purge d'abord cette table si elle existe pour éviter le blocage FK.
    try {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Feedback" RESTART IDENTITY CASCADE;');
    } catch {
      // ignore si la table n'existe pas
    }

    // Ordre important pour respecter les contraintes de relations.
    await prisma.customerOrderItem.deleteMany();
    await prisma.customerOrder.deleteMany();
    await prisma.creditTransaction.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.supplierOrder.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { not: 'admin@store.com' },
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur reset DB' });
  }
});

export { router as adminRouter };
