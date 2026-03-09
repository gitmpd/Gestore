import { db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';

type SeedCategoryKey =
  | 'alimentation'
  | 'boissons'
  | 'hygiene'
  | 'menage'
  | 'papeterie';

type SeedProduct = {
  name: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  alertThreshold: number;
  category: SeedCategoryKey;
};

const CATEGORY_KEYS: SeedCategoryKey[] = [
  'alimentation',
  'boissons',
  'hygiene',
  'menage',
  'papeterie',
];

const CATEGORY_LABELS: Record<SeedCategoryKey, string> = {
  alimentation: 'Alimentation',
  boissons: 'Boissons',
  hygiene: 'Hygiene & Entretien',
  menage: 'Menage & Quincaillerie',
  papeterie: 'Papeterie & Fournitures',
};

const PRODUCTS: SeedProduct[] = [
  { name: 'RIZ 50KG', buyPrice: 21000, sellPrice: 22500, quantity: 14, alertThreshold: 3, category: 'alimentation' },
  { name: 'SUCRE 1KG', buyPrice: 650, sellPrice: 750, quantity: 120, alertThreshold: 25, category: 'alimentation' },
  { name: 'HUILE 1L', buyPrice: 1300, sellPrice: 1500, quantity: 60, alertThreshold: 15, category: 'alimentation' },
  { name: 'TOMATE CONCENTRE 70G', buyPrice: 175, sellPrice: 200, quantity: 200, alertThreshold: 40, category: 'alimentation' },
  { name: 'SPAGHETTI 500G', buyPrice: 250, sellPrice: 300, quantity: 110, alertThreshold: 20, category: 'alimentation' },
  { name: 'SEL FIN 500G', buyPrice: 175, sellPrice: 200, quantity: 90, alertThreshold: 20, category: 'alimentation' },
  { name: 'BISCUITS 100', buyPrice: 60, sellPrice: 100, quantity: 180, alertThreshold: 35, category: 'alimentation' },
  { name: 'BONBON 50', buyPrice: 25, sellPrice: 50, quantity: 260, alertThreshold: 50, category: 'alimentation' },
  { name: 'THE 100', buyPrice: 60, sellPrice: 100, quantity: 140, alertThreshold: 30, category: 'alimentation' },
  { name: 'LAIT EN POUDRE 400G', buyPrice: 1500, sellPrice: 1800, quantity: 45, alertThreshold: 10, category: 'alimentation' },
  { name: 'SARDINE 125G', buyPrice: 300, sellPrice: 350, quantity: 85, alertThreshold: 20, category: 'alimentation' },
  { name: 'VINAIGRE 25', buyPrice: 15, sellPrice: 25, quantity: 200, alertThreshold: 30, category: 'alimentation' },

  { name: 'EAU 50CL', buyPrice: 120, sellPrice: 150, quantity: 280, alertThreshold: 60, category: 'boissons' },
  { name: 'EAU 1.5L', buyPrice: 250, sellPrice: 300, quantity: 150, alertThreshold: 30, category: 'boissons' },
  { name: 'JUS 1L', buyPrice: 650, sellPrice: 800, quantity: 40, alertThreshold: 10, category: 'boissons' },
  { name: 'JUS 25CL', buyPrice: 220, sellPrice: 300, quantity: 120, alertThreshold: 25, category: 'boissons' },
  { name: 'CANETTE 33CL', buyPrice: 300, sellPrice: 400, quantity: 95, alertThreshold: 20, category: 'boissons' },
  { name: 'BOISSON ENERGISANTE 25CL', buyPrice: 450, sellPrice: 550, quantity: 55, alertThreshold: 12, category: 'boissons' },
  { name: 'NECTAR MANGUE 1L', buyPrice: 700, sellPrice: 900, quantity: 28, alertThreshold: 8, category: 'boissons' },
  { name: 'LAIT UHT 1L', buyPrice: 700, sellPrice: 850, quantity: 35, alertThreshold: 10, category: 'boissons' },

  { name: 'SAVON DE TOILETTE 200G', buyPrice: 150, sellPrice: 200, quantity: 220, alertThreshold: 40, category: 'hygiene' },
  { name: 'SAVON LESSIVE 400G', buyPrice: 300, sellPrice: 400, quantity: 130, alertThreshold: 25, category: 'hygiene' },
  { name: 'EAU DE JAVEL 1L', buyPrice: 550, sellPrice: 700, quantity: 55, alertThreshold: 12, category: 'hygiene' },
  { name: 'DETERGENT LIQUIDE 1L', buyPrice: 800, sellPrice: 1000, quantity: 40, alertThreshold: 10, category: 'hygiene' },
  { name: 'PATE A DENTS 100ML', buyPrice: 300, sellPrice: 500, quantity: 80, alertThreshold: 15, category: 'hygiene' },
  { name: 'BROSSE A DENTS', buyPrice: 350, sellPrice: 600, quantity: 85, alertThreshold: 18, category: 'hygiene' },
  { name: 'RASOIR JETABLE', buyPrice: 60, sellPrice: 100, quantity: 160, alertThreshold: 30, category: 'hygiene' },
  { name: 'PAPIER HYGIENIQUE', buyPrice: 120, sellPrice: 200, quantity: 150, alertThreshold: 25, category: 'hygiene' },
  { name: 'SERVIETTE HYGIENIQUE', buyPrice: 450, sellPrice: 600, quantity: 70, alertThreshold: 15, category: 'hygiene' },
  { name: 'COUCHE BEBE TAILLE M', buyPrice: 70, sellPrice: 100, quantity: 240, alertThreshold: 40, category: 'hygiene' },

  { name: 'AMPOULE LED 12W', buyPrice: 900, sellPrice: 1200, quantity: 32, alertThreshold: 8, category: 'menage' },
  { name: 'RALLONGE 3 PRISES', buyPrice: 1600, sellPrice: 2200, quantity: 15, alertThreshold: 4, category: 'menage' },
  { name: 'MULTIPRISE 5 PRISES', buyPrice: 2500, sellPrice: 3200, quantity: 10, alertThreshold: 3, category: 'menage' },
  { name: 'CHARGEUR USB', buyPrice: 800, sellPrice: 1200, quantity: 45, alertThreshold: 10, category: 'menage' },
  { name: 'CABLE USB', buyPrice: 500, sellPrice: 800, quantity: 65, alertThreshold: 15, category: 'menage' },
  { name: 'PILE AA (PAIRE)', buyPrice: 250, sellPrice: 400, quantity: 110, alertThreshold: 25, category: 'menage' },
  { name: 'EPONGE VAISSELLE', buyPrice: 100, sellPrice: 150, quantity: 120, alertThreshold: 25, category: 'menage' },
  { name: 'SAC POUBELLE 50L', buyPrice: 200, sellPrice: 300, quantity: 100, alertThreshold: 20, category: 'menage' },
  { name: 'BOITE ALLUMETTES', buyPrice: 150, sellPrice: 250, quantity: 140, alertThreshold: 30, category: 'menage' },
  { name: 'PINCE A LINGE (LOT)', buyPrice: 450, sellPrice: 700, quantity: 38, alertThreshold: 8, category: 'menage' },

  { name: 'CAHIER 100 PAGES', buyPrice: 350, sellPrice: 500, quantity: 90, alertThreshold: 20, category: 'papeterie' },
  { name: 'CAHIER 200 PAGES', buyPrice: 550, sellPrice: 750, quantity: 70, alertThreshold: 15, category: 'papeterie' },
  { name: 'STYLO BLEU', buyPrice: 100, sellPrice: 150, quantity: 220, alertThreshold: 50, category: 'papeterie' },
  { name: 'CRAYON A PAPIER', buyPrice: 75, sellPrice: 100, quantity: 200, alertThreshold: 40, category: 'papeterie' },
  { name: 'GOMME', buyPrice: 50, sellPrice: 100, quantity: 120, alertThreshold: 25, category: 'papeterie' },
  { name: 'TAILLE-CRAYON', buyPrice: 80, sellPrice: 150, quantity: 90, alertThreshold: 20, category: 'papeterie' },
  { name: 'REGLE 30CM', buyPrice: 150, sellPrice: 250, quantity: 75, alertThreshold: 18, category: 'papeterie' },
  { name: 'CRAIE BLANCHE (BOITE)', buyPrice: 400, sellPrice: 600, quantity: 45, alertThreshold: 10, category: 'papeterie' },
];

function buildBarcode(index: number): string {
  return `60099${String(index + 1).padStart(7, '0')}`;
}

export async function seedTestData(userId: string) {
  const now = nowISO();
  const s = { createdAt: now, updatedAt: now, syncStatus: 'pending' as const };

  if ((await db.users.count()) === 0) {
    await db.users.add({
      id: userId,
      name: 'Gerant',
      email: 'admin@store.com',
      role: 'gerant',
      active: true,
      mustChangePassword: true,
      ...s,
    });
  }

  await db.saleItems.clear();
  await db.sales.clear();
  await db.orderItems.clear();
  await db.supplierOrders.clear();
  await db.customerOrderItems.clear();
  await db.customerOrders.clear();
  await db.stockMovements.clear();
  await db.creditTransactions.clear();
  await db.supplierCreditTransactions.clear();
  await db.expenses.clear();
  await db.auditLogs.clear();
  await db.priceHistory.clear();
  await db.customers.clear();
  await db.suppliers.clear();
  await db.products.clear();
  await db.categories.clear();
  await db.syncDeletions.clear();

  const categories = CATEGORY_KEYS.map((key) => ({
    id: generateId(),
    name: CATEGORY_LABELS[key],
    ...s,
  }));
  await db.categories.bulkAdd(categories);

  const categoryMap = new Map<SeedCategoryKey, string>();
  CATEGORY_KEYS.forEach((key, index) => {
    categoryMap.set(key, categories[index].id);
  });

  const products = PRODUCTS.map((product, index) => ({
    id: generateId(),
    name: product.name,
    barcode: buildBarcode(index),
    buyPrice: 0,
    sellPrice: 0,
    quantity: 0,
    alertThreshold: 5,
    usage: 'achat_vente' as const,
    categoryId: categoryMap.get(product.category) as string,
    ...s,
  }));

  await db.products.bulkAdd(products);

  console.log(`Catalogue charge: ${CATEGORY_KEYS.length} categories, ${PRODUCTS.length} produits.`);
}
