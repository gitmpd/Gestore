import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

function past(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60));
  return d;
}

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: {},
    create: {
      name: 'Gérant',
      email: 'admin@store.com',
      password: adminPassword,
      role: 'gerant',
      active: true,
      mustChangePassword: true,
    },
  });
  console.log('Utilisateur admin:', admin.email);

  // Création des catégories
  const catAlimentation = await prisma.category.create({ data: { id: uuid(), name: 'Alimentation' } });
  const catBoissons = await prisma.category.create({ data: { id: uuid(), name: 'Boissons' } });
  const catHygiene = await prisma.category.create({ data: { id: uuid(), name: 'Hygiène & Entretien' } });
  const catMenage = await prisma.category.create({ data: { id: uuid(), name: 'Ménage & Quincaillerie' } });
  const catPapeterie = await prisma.category.create({ data: { id: uuid(), name: 'Papeterie & Fournitures' } });
  const catDettes = await prisma.category.create({ data: { id: uuid(), name: 'Dettes & Comptes' } });
  console.log('6 catégories créées');

  // Produits d'Alimentation (sans unités de mesure)
  const alimentationProducts = [
    { name: 'EAU JAVEL 500', buyPrice: 250, sellPrice: 500, quantity: 41, alertThreshold: 10 },
    { name: 'EAU 25', buyPrice: 12, sellPrice: 25, quantity: 200, alertThreshold: 50 },
    { name: 'SAVON 200', buyPrice: 100, sellPrice: 200, quantity: 118, alertThreshold: 30 },
    { name: 'SAVON 550', buyPrice: 275, sellPrice: 550, quantity: 8, alertThreshold: 5 },
    { name: 'SAVON 100', buyPrice: 50, sellPrice: 100, quantity: 285, alertThreshold: 50 },
    { name: 'SAVON 400', buyPrice: 200, sellPrice: 400, quantity: 11, alertThreshold: 5 },
    { name: 'SAVON 500', buyPrice: 250, sellPrice: 500, quantity: 33, alertThreshold: 10 },
    { name: 'MADAR 1000', buyPrice: 500, sellPrice: 1000, quantity: 22, alertThreshold: 5 },
    { name: 'KLIN 25', buyPrice: 12, sellPrice: 25, quantity: 640, alertThreshold: 100 },
    { name: 'CORNE BŒUF 500', buyPrice: 250, sellPrice: 500, quantity: 36, alertThreshold: 10 },
    { name: 'CORNE BŒUF 750', buyPrice: 375, sellPrice: 750, quantity: 18, alertThreshold: 5 },
    { name: 'NESCAFE 50', buyPrice: 25, sellPrice: 50, quantity: 50, alertThreshold: 15 },
    { name: 'MOUSTICAIRE PAPILLER 500', buyPrice: 250, sellPrice: 500, quantity: 6, alertThreshold: 3 },
    { name: 'KETCHUP 500', buyPrice: 250, sellPrice: 500, quantity: 21, alertThreshold: 5 },
    { name: 'FATALA 1000', buyPrice: 500, sellPrice: 1000, quantity: 41, alertThreshold: 10 },
    { name: 'MOUSTICAIE 500', buyPrice: 250, sellPrice: 500, quantity: 100, alertThreshold: 20 },
    { name: 'MOUSTICAIE 250', buyPrice: 125, sellPrice: 250, quantity: 51, alertThreshold: 10 },
    { name: 'LOTUS 100', buyPrice: 50, sellPrice: 100, quantity: 91, alertThreshold: 20 },
    { name: 'BISCUITS 100', buyPrice: 50, sellPrice: 100, quantity: 331, alertThreshold: 50 },
    { name: 'DOLI 25', buyPrice: 12, sellPrice: 25, quantity: 222, alertThreshold: 50 },
    { name: 'CHEEPS 50', buyPrice: 25, sellPrice: 50, quantity: 535, alertThreshold: 100 },
    { name: 'CHEEPS 100', buyPrice: 50, sellPrice: 100, quantity: 122, alertThreshold: 30 },
    { name: 'THE 200', buyPrice: 100, sellPrice: 200, quantity: 170, alertThreshold: 30 },
    { name: 'THE 100', buyPrice: 50, sellPrice: 100, quantity: 700, alertThreshold: 100 },
    { name: 'BOUBIE 50', buyPrice: 25, sellPrice: 50, quantity: 5, alertThreshold: 5 },
    { name: 'JUMBO 30', buyPrice: 15, sellPrice: 30, quantity: 447, alertThreshold: 100 },
    { name: 'JUMBO 25', buyPrice: 12, sellPrice: 25, quantity: 820, alertThreshold: 150 },
    { name: 'BARAMOUSO 25', buyPrice: 12, sellPrice: 25, quantity: 318, alertThreshold: 50 },
    { name: 'MOUTARDE 50', buyPrice: 25, sellPrice: 50, quantity: 274, alertThreshold: 50 },
    { name: 'VINAICRE 25', buyPrice: 12, sellPrice: 25, quantity: 72, alertThreshold: 20 },
    { name: 'MOUTARDE 400', buyPrice: 200, sellPrice: 400, quantity: 6, alertThreshold: 3 },
    { name: 'LAIT 100', buyPrice: 50, sellPrice: 100, quantity: 72, alertThreshold: 20 },
    { name: 'LAIT BOITE 1100', buyPrice: 550, sellPrice: 1100, quantity: 21, alertThreshold: 5 },
    { name: 'BRIQUETS 100', buyPrice: 50, sellPrice: 100, quantity: 88, alertThreshold: 20 },
    { name: 'SARDINE 350', buyPrice: 175, sellPrice: 350, quantity: 45, alertThreshold: 10 },
    { name: 'MACORONI 550', buyPrice: 275, sellPrice: 550, quantity: 40, alertThreshold: 10 },
    { name: 'MACORONI 500', buyPrice: 250, sellPrice: 500, quantity: 15, alertThreshold: 5 },
    { name: 'COTON 500', buyPrice: 250, sellPrice: 500, quantity: 10, alertThreshold: 5 },
    { name: 'COTON 600', buyPrice: 300, sellPrice: 600, quantity: 24, alertThreshold: 5 },
    { name: 'CHOCOLA 750', buyPrice: 375, sellPrice: 750, quantity: 12, alertThreshold: 5 },
    { name: 'LAIT 32000', buyPrice: 16000, sellPrice: 32000, quantity: 1, alertThreshold: 1 },
    { name: 'CHOCOLAT 25', buyPrice: 12, sellPrice: 25, quantity: 380, alertThreshold: 50 },
    { name: 'PATTES A DENTS SIGNAL 750', buyPrice: 375, sellPrice: 750, quantity: 2, alertThreshold: 1 },
    { name: 'PATTES A DENTS 500', buyPrice: 250, sellPrice: 500, quantity: 41, alertThreshold: 10 },
    { name: 'BROCHES A DENTS 600', buyPrice: 300, sellPrice: 600, quantity: 100, alertThreshold: 20 },
    { name: 'GARI 50', buyPrice: 25, sellPrice: 50, quantity: 14, alertThreshold: 5 },
    { name: 'LIPTON 650', buyPrice: 325, sellPrice: 650, quantity: 1, alertThreshold: 1 },
    { name: 'LIPTON CHAYA 1250', buyPrice: 625, sellPrice: 1250, quantity: 24, alertThreshold: 5 },
    { name: 'BONBON 25', buyPrice: 12, sellPrice: 25, quantity: 429, alertThreshold: 50 },
    { name: 'SUCRE VANILLE 125', buyPrice: 62, sellPrice: 125, quantity: 117, alertThreshold: 20 },
    { name: 'CHIGOMME PAQ 300', buyPrice: 150, sellPrice: 300, quantity: 32, alertThreshold: 10 },
    { name: 'BONBON PAQ 250', buyPrice: 125, sellPrice: 250, quantity: 31, alertThreshold: 10 },
    { name: 'BONBON 50', buyPrice: 25, sellPrice: 50, quantity: 154, alertThreshold: 30 },
    { name: 'CHIGOMME 2400', buyPrice: 1200, sellPrice: 2400, quantity: 1, alertThreshold: 1 },
    { name: 'LAMES 100', buyPrice: 50, sellPrice: 100, quantity: 15, alertThreshold: 5 },
    { name: 'BOITE CHIGOME 2500', buyPrice: 1250, sellPrice: 2500, quantity: 9, alertThreshold: 3 },
    { name: 'VERRE THE 200', buyPrice: 100, sellPrice: 200, quantity: 1, alertThreshold: 1 },
    { name: 'ZIRANI 25', buyPrice: 12, sellPrice: 25, quantity: 30, alertThreshold: 10 },
    { name: 'BONBON 100', buyPrice: 50, sellPrice: 100, quantity: 10, alertThreshold: 5 },
    { name: 'CHAUSURES 1000', buyPrice: 500, sellPrice: 1000, quantity: 2, alertThreshold: 1 },
    { name: 'COLE 1000', buyPrice: 500, sellPrice: 1000, quantity: 9, alertThreshold: 3 },
    { name: 'COLE 200', buyPrice: 100, sellPrice: 200, quantity: 2, alertThreshold: 1 },
    { name: 'ALLUMETS 250', buyPrice: 125, sellPrice: 250, quantity: 15, alertThreshold: 5 },
    { name: 'BONBON PAQUET 1250', buyPrice: 625, sellPrice: 1250, quantity: 17, alertThreshold: 5 },
    { name: 'SACHET 100', buyPrice: 50, sellPrice: 100, quantity: 108, alertThreshold: 30 },
    { name: 'SACHET 50', buyPrice: 25, sellPrice: 50, quantity: 264, alertThreshold: 50 },
    { name: 'SACHET 500', buyPrice: 250, sellPrice: 500, quantity: 32, alertThreshold: 10 },
    { name: 'SACHET 25', buyPrice: 12, sellPrice: 25, quantity: 16, alertThreshold: 5 },
    { name: 'SACHET 200', buyPrice: 100, sellPrice: 200, quantity: 40, alertThreshold: 10 },
    { name: 'SACHET 125', buyPrice: 62, sellPrice: 125, quantity: 30, alertThreshold: 10 },
    { name: 'BIG RASOIR 100', buyPrice: 50, sellPrice: 100, quantity: 94, alertThreshold: 20 },
    { name: 'COUCHE BB 100', buyPrice: 50, sellPrice: 100, quantity: 286, alertThreshold: 50 },
    { name: 'SUCRE DETAIL 100', buyPrice: 50, sellPrice: 100, quantity: 128, alertThreshold: 30 },
    { name: 'SUCRE DEMI 300', buyPrice: 150, sellPrice: 300, quantity: 60, alertThreshold: 15 },
    { name: 'SACS SUCRE 36000', buyPrice: 18000, sellPrice: 36000, quantity: 1, alertThreshold: 1 },
  ];

  // Produits Boissons
  const boissonsProducts = [
    { name: 'CANETTE 350', buyPrice: 175, sellPrice: 350, quantity: 73, alertThreshold: 20 },
    { name: 'CANETTE 500', buyPrice: 250, sellPrice: 500, quantity: 94, alertThreshold: 20 },
    { name: 'DOLIMA 250', buyPrice: 125, sellPrice: 250, quantity: 9, alertThreshold: 5 },
    { name: 'DOLIMA 300', buyPrice: 150, sellPrice: 300, quantity: 7, alertThreshold: 3 },
    { name: 'DOLIMA 100', buyPrice: 50, sellPrice: 100, quantity: 133, alertThreshold: 30 },
    { name: 'CANETTE 600', buyPrice: 300, sellPrice: 600, quantity: 37, alertThreshold: 10 },
    { name: 'DIAGO GRAND 300', buyPrice: 150, sellPrice: 300, quantity: 98, alertThreshold: 20 },
    { name: 'DIAGO PETIT 100', buyPrice: 50, sellPrice: 100, quantity: 341, alertThreshold: 50 },
    { name: 'JUS 1000', buyPrice: 500, sellPrice: 1000, quantity: 9, alertThreshold: 3 },
    { name: 'JUS 50', buyPrice: 25, sellPrice: 50, quantity: 335, alertThreshold: 50 },
    { name: 'JUS 100', buyPrice: 50, sellPrice: 100, quantity: 168, alertThreshold: 30 },
    { name: 'VADAM 300', buyPrice: 150, sellPrice: 300, quantity: 1, alertThreshold: 1 },
    { name: 'LAIT BOITE 300', buyPrice: 150, sellPrice: 300, quantity: 50, alertThreshold: 15 },
    { name: 'MALI LAIT 200', buyPrice: 100, sellPrice: 200, quantity: 8, alertThreshold: 3 },
    { name: 'JUS 200', buyPrice: 100, sellPrice: 200, quantity: 60, alertThreshold: 15 },
    { name: 'JUS 250', buyPrice: 125, sellPrice: 250, quantity: 105, alertThreshold: 20 },
    { name: 'X PLUS 300', buyPrice: 150, sellPrice: 300, quantity: 45, alertThreshold: 10 },
    { name: 'BOISSON 200', buyPrice: 100, sellPrice: 200, quantity: 246, alertThreshold: 50 },
    { name: 'BOISSON 250', buyPrice: 125, sellPrice: 250, quantity: 12, alertThreshold: 5 },
    { name: 'BOISSON 300', buyPrice: 150, sellPrice: 300, quantity: 7, alertThreshold: 3 },
  ];

  // Produits Hygiène & Entretien
  const hygieneProducts = [
    { name: 'SAVON LIQUIDE 500', buyPrice: 250, sellPrice: 500, quantity: 30, alertThreshold: 10 },
    { name: 'EAU DE JAVEL 1000', buyPrice: 500, sellPrice: 1000, quantity: 15, alertThreshold: 5 },
    { name: 'PAPIER HYGIÉNIQUE 200', buyPrice: 100, sellPrice: 200, quantity: 40, alertThreshold: 10 },
    { name: 'DÉTERGENT 750', buyPrice: 375, sellPrice: 750, quantity: 20, alertThreshold: 5 },
    { name: 'SAVON POUDRE 400', buyPrice: 200, sellPrice: 400, quantity: 25, alertThreshold: 8 },
    { name: 'GEL DÉSINFECTANT 250', buyPrice: 125, sellPrice: 250, quantity: 18, alertThreshold: 5 },
    { name: 'SERVIETTES 100', buyPrice: 50, sellPrice: 100, quantity: 60, alertThreshold: 15 },
    { name: 'BROSSE À DENTS 200', buyPrice: 100, sellPrice: 200, quantity: 35, alertThreshold: 10 },
    { name: 'DENTIFRICE 300', buyPrice: 150, sellPrice: 300, quantity: 22, alertThreshold: 7 },
    { name: 'SAVON DE MARSEILLE 500', buyPrice: 250, sellPrice: 500, quantity: 12, alertThreshold: 4 },
  ];

  // Produits Ménage & Quincaillerie
  const menageProducts = [
    { name: 'CABLE 500', buyPrice: 250, sellPrice: 500, quantity: 50, alertThreshold: 10 },
    { name: 'CABLE 3 TETE 750', buyPrice: 375, sellPrice: 750, quantity: 10, alertThreshold: 3 },
    { name: 'CABLE 3 TETE 500', buyPrice: 250, sellPrice: 500, quantity: 5, alertThreshold: 2 },
    { name: 'AMPOULE 2000', buyPrice: 1000, sellPrice: 2000, quantity: 4, alertThreshold: 2 },
    { name: 'AMPOULE 1000', buyPrice: 500, sellPrice: 1000, quantity: 5, alertThreshold: 2 },
    { name: 'ECOUTEUR 1000', buyPrice: 500, sellPrice: 1000, quantity: 4, alertThreshold: 2 },
    { name: 'MASQUE 100', buyPrice: 50, sellPrice: 100, quantity: 44, alertThreshold: 10 },
    { name: 'ARRALONGIE 2000', buyPrice: 1000, sellPrice: 2000, quantity: 2, alertThreshold: 1 },
    { name: 'ECOUTEUR 750', buyPrice: 375, sellPrice: 750, quantity: 3, alertThreshold: 1 },
    { name: 'ECOUTEUR 500', buyPrice: 250, sellPrice: 500, quantity: 3, alertThreshold: 1 },
    { name: 'TETE 1000', buyPrice: 500, sellPrice: 1000, quantity: 4, alertThreshold: 2 },
    { name: 'TETE 500', buyPrice: 250, sellPrice: 500, quantity: 1, alertThreshold: 1 },
    { name: 'BATTERY 1000', buyPrice: 500, sellPrice: 1000, quantity: 4, alertThreshold: 2 },
    { name: 'BATTERY 2000', buyPrice: 1000, sellPrice: 2000, quantity: 2, alertThreshold: 1 },
    { name: 'CABLE ORIGINAL 1000', buyPrice: 500, sellPrice: 1000, quantity: 20, alertThreshold: 5 },
    { name: 'CHARGEUR 1500', buyPrice: 750, sellPrice: 1500, quantity: 10, alertThreshold: 3 },
    { name: 'CHARGEUR 2000', buyPrice: 1000, sellPrice: 2000, quantity: 4, alertThreshold: 2 },
    { name: 'OMO 1500', buyPrice: 750, sellPrice: 1500, quantity: 1, alertThreshold: 1 },
    { name: 'COTON 100', buyPrice: 50, sellPrice: 100, quantity: 22, alertThreshold: 10 },
    { name: 'BEURE BOITE 2000', buyPrice: 1000, sellPrice: 2000, quantity: 2, alertThreshold: 1 },
    { name: 'CHAUSURE 1500', buyPrice: 750, sellPrice: 1500, quantity: 2, alertThreshold: 1 },
    { name: 'CHAUSURE 1250', buyPrice: 625, sellPrice: 1250, quantity: 4, alertThreshold: 2 },
    { name: 'LAMES 100', buyPrice: 50, sellPrice: 100, quantity: 200, alertThreshold: 50 },
    { name: 'CRAIE 25', buyPrice: 12, sellPrice: 25, quantity: 70, alertThreshold: 20 },
    { name: 'BROCHE 200', buyPrice: 100, sellPrice: 200, quantity: 10, alertThreshold: 5 },
    { name: 'PILE 100', buyPrice: 50, sellPrice: 100, quantity: 36, alertThreshold: 10 },
    { name: 'CARTE JOUER 200', buyPrice: 100, sellPrice: 200, quantity: 19, alertThreshold: 5 },
    { name: 'TAILLANT 25', buyPrice: 12, sellPrice: 25, quantity: 66, alertThreshold: 20 },
    { name: 'SUPER COOL 200', buyPrice: 100, sellPrice: 200, quantity: 6, alertThreshold: 3 },
  ];

  // Dettes
  const dettesProducts = [
    { name: 'DETTE NBA 5000', buyPrice: 2500, sellPrice: 5000, quantity: 1, alertThreshold: 1 },
    { name: 'DETTE G 3500', buyPrice: 1750, sellPrice: 3500, quantity: 1, alertThreshold: 1 },
    { name: 'DETTE DJELIBA 1000', buyPrice: 500, sellPrice: 1000, quantity: 1, alertThreshold: 1 },
    { name: 'DETTE KIATOU 3800', buyPrice: 1900, sellPrice: 3800, quantity: 1, alertThreshold: 1 },
    { name: 'MC 34350', buyPrice: 17175, sellPrice: 34350, quantity: 1, alertThreshold: 1 },
  ];

  const products: { id: string; name: string; sellPrice: number; buyPrice: number; quantity: number }[] = [];

  // Création des produits avec leur catégorie respective
  for (const p of alimentationProducts) {
    products.push(await prisma.product.create({ 
      data: { 
        id: uuid(), 
        ...p, 
        barcode: `600${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        categoryId: catAlimentation.id 
      } 
    }));
  }

  for (const p of boissonsProducts) {
    products.push(await prisma.product.create({ 
      data: { 
        id: uuid(), 
        ...p, 
        barcode: `600${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        categoryId: catBoissons.id 
      } 
    }));
  }

  for (const p of hygieneProducts) {
    products.push(await prisma.product.create({ 
      data: { 
        id: uuid(), 
        ...p, 
        barcode: `600${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        categoryId: catHygiene.id 
      } 
    }));
  }

  for (const p of menageProducts) {
    products.push(await prisma.product.create({ 
      data: { 
        id: uuid(), 
        ...p, 
        barcode: `600${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        categoryId: catMenage.id 
      } 
    }));
  }

  for (const p of dettesProducts) {
    products.push(await prisma.product.create({ 
      data: { 
        id: uuid(), 
        ...p, 
        barcode: `600${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        categoryId: catDettes.id 
      } 
    }));
  }

  console.log(products.length + ' produits créés');

  // Création des clients
  const clientsData = [
    { name: 'Amadou Diallo', phone: '76 12 34 56', creditBalance: 5200 },
    { name: 'Fatoumata Traoré', phone: '66 23 45 67', creditBalance: 0 },
    { name: 'Moussa Konaté', phone: '78 34 56 78', creditBalance: 12000 },
    { name: 'Awa Coulibaly', phone: '65 45 67 89', creditBalance: 3500 },
    { name: 'Ibrahim Sanogo', phone: '76 56 78 90', creditBalance: 0 },
    { name: 'Mariam Sidibé', phone: '66 67 89 01', creditBalance: 8000 },
    { name: 'Oumar Keita', phone: '78 78 90 12', creditBalance: 0 },
    { name: 'Kadiatou Bah', phone: '65 89 01 23', creditBalance: 1500 },
    { name: 'Ali', phone: '76 11 22 33', creditBalance: 1400 },
    { name: 'Camara', phone: '76 44 55 66', creditBalance: 1100 },
  ];
  
  const clients = [];
  for (const c of clientsData) {
    clients.push(await prisma.customer.create({ data: { id: uuid(), ...c } }));
  }
  console.log(clients.length + ' clients créés');

  // Création des fournisseurs
  const suppliersData = [
    { name: 'Grossiste Bamako Central', phone: '20 22 33 44', address: 'Marché de Medine, Bamako' },
    { name: 'SODIBAF Distribution', phone: '20 33 44 55', address: 'Zone Industrielle, Bamako' },
    { name: 'Sahelienne Import', phone: '20 44 55 66', address: 'Badalabougou, Bamako' },
  ];
  
  const suppliers = [];
  for (const s of suppliersData) {
    suppliers.push(await prisma.supplier.create({ data: { id: uuid(), ...s } }));
  }
  console.log(suppliers.length + ' fournisseurs créés');

  // Création de quelques ventes
  const salesData = [
    { daysAgo: 0, items: [{ pIdx: 0, qty: 2 }, { pIdx: 8, qty: 5 }], method: 'cash' as const },
    { daysAgo: 0, items: [{ pIdx: 27, qty: 3 }, { pIdx: 28, qty: 6 }], method: 'mobile' as const },
    { daysAgo: 1, items: [{ pIdx: 1, qty: 1 }, { pIdx: 2, qty: 3 }], method: 'cash' as const },
    { daysAgo: 2, items: [{ pIdx: 3, qty: 2 }, { pIdx: 9, qty: 4 }], method: 'cash' as const, clientIdx: 1 },
    { daysAgo: 3, items: [{ pIdx: 10, qty: 2 }, { pIdx: 11, qty: 1 }], method: 'credit' as const, clientIdx: 3 },
    { daysAgo: 5, items: [{ pIdx: 29, qty: 5 }, { pIdx: 0, qty: 2 }], method: 'cash' as const },
    { daysAgo: 7, items: [{ pIdx: 27, qty: 4 }, { pIdx: 28, qty: 3 }], method: 'mobile' as const },
    { daysAgo: 10, items: [{ pIdx: 1, qty: 3 }, { pIdx: 2, qty: 2 }], method: 'cash' as const, clientIdx: 5 },
  ];

  let salesCount = 0;
  for (const sale of salesData) {
    const saleId = uuid();
    const date = past(sale.daysAgo);
    const saleItems = sale.items.map((item) => {
      const product = products[item.pIdx];
      return {
        id: uuid(),
        productId: product.id,
        productName: product.name,
        quantity: item.qty,
        unitPrice: product.sellPrice,
        total: item.qty * product.sellPrice,
      };
    });
    const total = saleItems.reduce((acc, i) => acc + i.total, 0);

    await prisma.sale.create({
      data: {
        id: saleId,
        userId: admin.id,
        customerId: sale.clientIdx !== undefined ? clients[sale.clientIdx].id : null,
        date,
        total,
        paymentMethod: sale.method,
        status: 'completed',
        items: { create: saleItems },
      },
    });

    for (const item of saleItems) {
      await prisma.stockMovement.create({
        data: {
          id: uuid(),
          productId: item.productId,
          productName: item.productName,
          type: 'sortie',
          quantity: item.quantity,
          date,
          reason: `Vente #${saleId.slice(0, 8)}`,
        },
      });
    }
    salesCount++;
  }
  console.log(salesCount + ' ventes créées');

  // Création d'une commande fournisseur
  const order1Id = uuid();
  const order1Date = past(10);
  await prisma.supplierOrder.create({
    data: {
      id: order1Id,
      supplierId: suppliers[0].id,
      date: order1Date,
      total: 87500,
      status: 'recue',
      items: {
        create: [
          { id: uuid(), productId: products[0].id, productName: products[0].name, quantity: 20, unitPrice: products[0].buyPrice, total: 20 * products[0].buyPrice },
          { id: uuid(), productId: products[1].id, productName: products[1].name, quantity: 15, unitPrice: products[1].buyPrice, total: 15 * products[1].buyPrice },
          { id: uuid(), productId: products[2].id, productName: products[2].name, quantity: 25, unitPrice: products[2].buyPrice, total: 25 * products[2].buyPrice },
        ],
      },
    },
  });

  for (const item of [
    { pIdx: 0, qty: 20 }, { pIdx: 1, qty: 15 }, { pIdx: 2, qty: 25 }
  ]) {
    await prisma.stockMovement.create({
      data: {
        id: uuid(),
        productId: products[item.pIdx].id,
        productName: products[item.pIdx].name,
        type: 'entree',
        quantity: item.qty,
        date: order1Date,
        reason: `Réception commande #${order1Id.slice(0, 8)}`,
      },
    });
  }

  console.log('1 commande fournisseur créée');
  console.log('\n=== Seed complet terminé ===');
  console.log(`${products.length} produits au total dans la base de données`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());