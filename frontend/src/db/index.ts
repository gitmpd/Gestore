import Dexie, { type EntityTable } from 'dexie';
import type {
  User,
  Category,
  Product,
  PriceHistory,
  Customer,
  Supplier,
  Sale,
  SaleItem,
  SupplierOrder,
  OrderItem,
  StockMovement,
  CreditTransaction,
  AuditLog,
  Expense,
  CustomerOrder,
  CustomerOrderItem,
} from '@/types';

class StoreDB extends Dexie {
  users!: EntityTable<User, 'id'>;
  auditLogs!: EntityTable<AuditLog, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  products!: EntityTable<Product, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  suppliers!: EntityTable<Supplier, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  saleItems!: EntityTable<SaleItem, 'id'>;
  supplierOrders!: EntityTable<SupplierOrder, 'id'>;
  orderItems!: EntityTable<OrderItem, 'id'>;
  stockMovements!: EntityTable<StockMovement, 'id'>;
  creditTransactions!: EntityTable<CreditTransaction, 'id'>;
  customerOrders!: EntityTable<CustomerOrder, 'id'>;
  customerOrderItems!: EntityTable<CustomerOrderItem, 'id'>;
  priceHistory!: EntityTable<PriceHistory, 'id'>;
  syncDeletions!: EntityTable<{ id: string; table: string; recordId: string; deletedAt: string }, 'id'>;

  constructor() {
    super('GestionStoreDB');

    this.version(1).stores({
      products: 'id, name, barcode, category, syncStatus',
      customers: 'id, name, phone, syncStatus',
      suppliers: 'id, name, syncStatus',
      sales: 'id, userId, customerId, date, status, syncStatus',
      saleItems: 'id, saleId, productId, syncStatus',
      supplierOrders: 'id, supplierId, date, status, syncStatus',
      orderItems: 'id, orderId, productId, syncStatus',
      stockMovements: 'id, productId, type, date, syncStatus',
      creditTransactions: 'id, customerId, type, date, syncStatus',
    });

    this.version(2).stores({
      categories: 'id, name, syncStatus',
      products: 'id, name, barcode, categoryId, syncStatus',
    });

    this.version(3).stores({
      users: 'id, email, role, active, syncStatus',
    });

    this.version(4).stores({
      users: 'id, name, email, role, active, syncStatus',
    });

    this.version(5).stores({
      auditLogs: 'id, userId, action, entity, date, syncStatus',
    });

    this.version(6).stores({
      expenses: 'id, category, date, recurring, syncStatus',
    });

    this.version(7).stores({
      users: 'id, name, email, role, active, deleted, syncStatus',
    });

    this.version(8).stores({
      sales: 'id, userId, customerId, date, status, deleted, syncStatus',
    });

    this.version(9).stores({
      users: 'id, name, email, role, active, deleted, mustChangePassword, syncStatus',
    });

    this.version(10).stores({
      products: 'id, name, barcode, categoryId, usage, syncStatus',
    });

    this.version(11).stores({
      customerOrders: 'id, customerId, date, status, saleId, syncStatus',
      customerOrderItems: 'id, customerOrderId, productId, syncStatus',
    });

    this.version(12).stores({
      syncDeletions: 'id, table, recordId',
    });

    this.version(13).stores({
      priceHistory: 'id, productId, createdAt, syncStatus',
    });

    this.version(14).stores({
      categories: 'id, name, syncStatus, deleted',
      products: 'id, name, barcode, categoryId, usage, deleted, syncStatus',
      customers: 'id, name, phone, deleted, syncStatus',
      suppliers: 'id, name, deleted, syncStatus',
      expenses: 'id, category, date, deleted, syncStatus',
      saleItems: 'id, saleId, productId, deleted, syncStatus',
      stockMovements: 'id, productId, type, date, deleted, syncStatus',
      creditTransactions: 'id, customerId, type, date, deleted, syncStatus',
    });
  }
}

export const db = new StoreDB();

db.open().catch(async (err) => {
  console.error('DB open failed, deleting and retrying:', err);
  await Dexie.delete('GestionStoreDB');
  window.location.reload();
});
