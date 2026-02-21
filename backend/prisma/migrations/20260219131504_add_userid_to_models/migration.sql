-- AlterTable
ALTER TABLE "CustomerOrder" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "userId" TEXT;
