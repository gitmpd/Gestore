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
    // On utilise une transaction pour éviter un reset partiel en cas d'erreur.
    await prisma.$transaction(async (tx) => {
      await tx.customerOrderItem.deleteMany();
      await tx.customerOrder.deleteMany();
      await tx.creditTransaction.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.orderItem.deleteMany();
      await tx.supplierOrder.deleteMany();
      await tx.saleItem.deleteMany();
      await tx.sale.deleteMany();
      await tx.priceHistory.deleteMany();
      await tx.supplierCreditTransaction.deleteMany();
      await tx.capitalEntry.deleteMany();
      await tx.expense.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();
      await tx.syncDeletion.deleteMany();
      await tx.user.deleteMany({
        where: {
          email: { not: 'admin@store.com' },
        },
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Erreur reset DB', detail });
  }
});

export { router as adminRouter };
