import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthRequest } from '../middleware/auth';
const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
// routes/admin.ts
router.delete('/reset-database', async (req, res) => {
  try {
    // ⚠️ ordre important si relations
    // For reset we perform physical deletes to fully clear DB
    await prisma.customerOrderItem.deleteMany();
    await prisma.customerOrder.deleteMany();
    await prisma.creditTransaction.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.supplierOrder.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.supplier.deleteMany();    
    await prisma.user.deleteMany({
      where: {
        email: { not: 'admin@store.com' } // garder l'admin si tu veux
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur reset DB' });
  }
});
export { router as adminRouter };