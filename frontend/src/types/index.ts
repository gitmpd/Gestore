export type SyncStatus = 'synced' | 'pending' | 'conflict';
export type UserRole = 'gerant' | 'vendeur';
export type PaymentMethod = 'cash' | 'credit' | 'mobile';
export type SaleStatus = 'completed' | 'cancelled';
export type OrderStatus = 'en_attente' | 'recue' | 'annulee';
export type CustomerOrderStatus = 'en_attente' | 'livree' | 'annulee';
export type StockMovementType = 'entree' | 'sortie' | 'ajustement' | 'retour';
export type ProductUsage = 'vente' | 'achat' | 'achat_vente';

interface SyncFields {
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
}

export interface User extends SyncFields {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  createdByUserId?: string;
  active: boolean;
  mustChangePassword?: boolean;
  deleted?: boolean;
}

export interface Category extends SyncFields {
  id: string;
  name: string;
  deleted?: boolean;
}

export interface Product extends SyncFields {
  id: string;
  name: string;
  barcode?: string;
  categoryId: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  alertThreshold: number;
  usage?: ProductUsage;
  deleted?: boolean;
}

export interface PriceHistory extends SyncFields {
  id: string;
  productId: string;
  oldBuyPrice: number;
  newBuyPrice: number;
  oldSellPrice: number;
  newSellPrice: number;
  userId?: string;
}

export interface Customer extends SyncFields {
  id: string;
  name: string;
  phone: string;
  creditBalance: number;
  deleted?: boolean;
}

export interface Supplier extends SyncFields {
  id: string;
  name: string;
  phone: string;
  address: string;
  creditBalance?: number;
  deleted?: boolean;
}

export interface Sale extends SyncFields {
  id: string;
  userId: string;
  customerId?: string;
  date: string;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  deleted?: boolean;
}

export interface SaleItem extends SyncFields {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  deleted?: boolean;
}

export interface SupplierOrder extends SyncFields {
  id: string;
  supplierId: string;
  date: string;
  total: number;
  status: OrderStatus;
  isCredit?: boolean;
  userId?: string;
}

export interface OrderItem extends SyncFields {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface StockMovement extends SyncFields {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  date: string;
  reason: string;
  userId?: string;
  deleted?: boolean;
}

export interface CreditTransaction extends SyncFields {
  id: string;
  customerId: string;
  saleId?: string;
  amount: number;
  type: 'credit' | 'payment';
  date: string;
  note?: string;
  deleted?: boolean;
}

export interface SupplierCreditTransaction extends SyncFields {
  id: string;
  supplierId: string;
  orderId?: string;
  amount: number;
  type: 'credit' | 'payment';
  date: string;
  note?: string;
  deleted?: boolean;
}

export interface CustomerOrder extends SyncFields {
  id: string;
  customerId: string;
  date: string;
  total: number;
  deposit: number;
  paymentMethod?: PaymentMethod;
  status: CustomerOrderStatus;
  saleId?: string;
  note?: string;
  userId?: string;
}

export interface CustomerOrderItem extends SyncFields {
  id: string;
  customerOrderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type ExpenseCategory =
  | 'loyer'
  | 'salaires'
  | 'transport'
  | 'electricite'
  | 'eau'
  | 'internet_telephone'
  | 'equipement'
  | 'entretien'
  | 'marketing'
  | 'taxes'
  | 'autre';

export interface Expense extends SyncFields {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  date: string;
  recurring: boolean;
  userId?: string;
  deleted?: boolean;
}

export type AuditAction =
  | 'connexion'
  | 'deconnexion'
  | 'creation'
  | 'modification'
  | 'suppression'
  | 'vente'
  | 'mouvement_stock'
  | 'credit'
  | 'paiement'
  | 'reception_commande'
  | 'creation_commande'
  | 'livraison_commande'
  | 'annulation_commande'
  | 'activation'
  | 'desactivation'
  | 'depense';

export type AuditEntity =
  | 'utilisateur'
  | 'produit'
  | 'categorie'
  | 'client'
  | 'fournisseur'
  | 'vente'
  | 'stock'
  | 'commande'
  | 'commande_client'
  | 'credit'
  | 'depense';

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  entityName?: string;
  details?: string;
  date: string;
  syncStatus: SyncStatus;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: Omit<User, 'password'>;
}
