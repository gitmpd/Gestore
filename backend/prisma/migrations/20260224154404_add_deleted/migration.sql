-- Ajouter paymentMethod à SupplierOrder
ALTER TABLE "SupplierOrder" ADD COLUMN "paymentMethod" "PaymentMethod";

-- Ajouter paymentMethod à CustomerOrder
ALTER TABLE "CustomerOrder" ADD COLUMN "paymentMethod" "PaymentMethod";

-- Créer la table SyncDeletion
CREATE TABLE "SyncDeletion" (
  "id" TEXT NOT NULL,
  "table" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncDeletion_table_recordId_key" ON "SyncDeletion"("table", "recordId");
CREATE INDEX "SyncDeletion_deletedAt_idx" ON "SyncDeletion"("deletedAt");

-- Créer la table SupplierCreditTransaction
CREATE TABLE "SupplierCreditTransaction" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "orderId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "type" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "syncStatus" "SyncStatus" NOT NULL DEFAULT 'synced',
  "lastSyncedAt" TIMESTAMP(3),
  PRIMARY KEY ("id")
);

ALTER TABLE "SupplierCreditTransaction" ADD CONSTRAINT "SupplierCreditTransaction_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ajouter des index pour les performances
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_deleted_idx" ON "Product"("deleted");
CREATE INDEX "Product_syncStatus_idx" ON "Product"("syncStatus");

CREATE INDEX "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
CREATE INDEX "Sale_deleted_idx" ON "Sale"("deleted");
CREATE INDEX "Sale_syncStatus_idx" ON "Sale"("syncStatus");

-- Ajouter des index pour toutes les tables avec syncStatus
CREATE INDEX "Category_syncStatus_idx" ON "Category"("syncStatus");
CREATE INDEX "Customer_syncStatus_idx" ON "Customer"("syncStatus");
CREATE INDEX "Supplier_syncStatus_idx" ON "Supplier"("syncStatus");
CREATE INDEX "SaleItem_syncStatus_idx" ON "SaleItem"("syncStatus");
CREATE INDEX "SupplierOrder_syncStatus_idx" ON "SupplierOrder"("syncStatus");
CREATE INDEX "OrderItem_syncStatus_idx" ON "OrderItem"("syncStatus");
CREATE INDEX "StockMovement_syncStatus_idx" ON "StockMovement"("syncStatus");
CREATE INDEX "CreditTransaction_syncStatus_idx" ON "CreditTransaction"("syncStatus");
CREATE INDEX "AuditLog_syncStatus_idx" ON "AuditLog"("syncStatus");
CREATE INDEX "Expense_syncStatus_idx" ON "Expense"("syncStatus");
CREATE INDEX "CustomerOrder_syncStatus_idx" ON "CustomerOrder"("syncStatus");
CREATE INDEX "CustomerOrderItem_syncStatus_idx" ON "CustomerOrderItem"("syncStatus");
CREATE INDEX "PriceHistory_syncStatus_idx" ON "PriceHistory"("syncStatus");
CREATE INDEX "SupplierCreditTransaction_syncStatus_idx" ON "SupplierCreditTransaction"("syncStatus");