import { db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';

function past(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60));
  return d.toISOString();
}

export async function seedTestData(userId: string) {
  const now = nowISO();
  const s = { createdAt: now, updatedAt: now, syncStatus: 'pending' as const };

  // --- Utilisateurs ---
  const existingUsers = await db.users.count();
  if (existingUsers === 0) {
    await db.users.bulkAdd([
      { id: userId, name: 'Gérant', email: 'admin@store.com', role: 'gerant', active: true, mustChangePassword: true, ...s },
    ]);
  }

  // --- Catégories ---
  const catAlimentation = { id: generateId(), name: 'Alimentation', ...s };
  const catBoissons     = { id: generateId(), name: 'Boissons', ...s };
  const catHygiene      = { id: generateId(), name: 'Hygiène & Entretien', ...s };
  const catMenage       = { id: generateId(), name: 'Ménage & Quincaillerie', ...s };
  const catPapeterie    = { id: generateId(), name: 'Papeterie & Fournitures', ...s };
  const catDettes       = { id: generateId(), name: 'Dettes & Comptes', ...s };

  const categories = [catAlimentation, catBoissons, catHygiene, catMenage, catPapeterie, catDettes];
  await db.categories.bulkAdd(categories);

  // --- Produits d'Alimentation ---
  const alimentationProducts = [
    { name: 'EAU JAVEL 500', barcode: '6001234500101', buyPrice: 250, sellPrice: 500, quantity: 41, alertThreshold: 10 },
    { name: 'EAU 25', barcode: '6001234500102', buyPrice: 12, sellPrice: 25, quantity: 200, alertThreshold: 50 },
    { name: 'SAVON 200', barcode: '6001234500103', buyPrice: 100, sellPrice: 200, quantity: 118, alertThreshold: 30 },
    { name: 'SAVON 550', barcode: '6001234500104', buyPrice: 275, sellPrice: 550, quantity: 8, alertThreshold: 5 },
    { name: 'SAVON 100', barcode: '6001234500105', buyPrice: 50, sellPrice: 100, quantity: 285, alertThreshold: 50 },
    { name: 'SAVON 400', barcode: '6001234500106', buyPrice: 200, sellPrice: 400, quantity: 11, alertThreshold: 5 },
    { name: 'SAVON 500', barcode: '6001234500107', buyPrice: 250, sellPrice: 500, quantity: 33, alertThreshold: 10 },
    { name: 'MADAR 1000', barcode: '6001234500108', buyPrice: 500, sellPrice: 1000, quantity: 22, alertThreshold: 5 },
    { name: 'KLIN 25', barcode: '6001234500109', buyPrice: 12, sellPrice: 25, quantity: 640, alertThreshold: 100 },
    { name: 'CORNE BŒUF 500', barcode: '6001234500110', buyPrice: 250, sellPrice: 500, quantity: 36, alertThreshold: 10 },
    { name: 'CORNE BŒUF 750', barcode: '6001234500111', buyPrice: 375, sellPrice: 750, quantity: 18, alertThreshold: 5 },
    { name: 'NESCAFE 50', barcode: '6001234500112', buyPrice: 25, sellPrice: 50, quantity: 50, alertThreshold: 15 },
    { name: 'MOUSTICAIRE PAPILLER 500', barcode: '6001234500113', buyPrice: 250, sellPrice: 500, quantity: 6, alertThreshold: 3 },
    { name: 'KETCHUP 500', barcode: '6001234500114', buyPrice: 250, sellPrice: 500, quantity: 21, alertThreshold: 5 },
    { name: 'FATALA 1000', barcode: '6001234500115', buyPrice: 500, sellPrice: 1000, quantity: 41, alertThreshold: 10 },
    { name: 'MOUSTICAIE 500', barcode: '6001234500116', buyPrice: 250, sellPrice: 500, quantity: 100, alertThreshold: 20 },
    { name: 'MOUSTICAIE 250', barcode: '6001234500117', buyPrice: 125, sellPrice: 250, quantity: 51, alertThreshold: 10 },
    { name: 'LOTUS 100', barcode: '6001234500118', buyPrice: 50, sellPrice: 100, quantity: 91, alertThreshold: 20 },
    { name: 'BISCUITS 100', barcode: '6001234500119', buyPrice: 50, sellPrice: 100, quantity: 331, alertThreshold: 50 },
    { name: 'DOLI 25', barcode: '6001234500120', buyPrice: 12, sellPrice: 25, quantity: 222, alertThreshold: 50 },
    { name: 'CHEEPS 50', barcode: '6001234500121', buyPrice: 25, sellPrice: 50, quantity: 535, alertThreshold: 100 },
    { name: 'CHEEPS 100', barcode: '6001234500122', buyPrice: 50, sellPrice: 100, quantity: 122, alertThreshold: 30 },
    { name: 'THE 200', barcode: '6001234500123', buyPrice: 100, sellPrice: 200, quantity: 170, alertThreshold: 30 },
    { name: 'THE 100', barcode: '6001234500124', buyPrice: 50, sellPrice: 100, quantity: 700, alertThreshold: 100 },
    { name: 'BOUBIE 50', barcode: '6001234500125', buyPrice: 25, sellPrice: 50, quantity: 5, alertThreshold: 5 },
    { name: 'JUMBO 30', barcode: '6001234500126', buyPrice: 15, sellPrice: 30, quantity: 447, alertThreshold: 100 },
    { name: 'JUMBO 25', barcode: '6001234500127', buyPrice: 12, sellPrice: 25, quantity: 820, alertThreshold: 150 },
    { name: 'BARAMOUSO 25', barcode: '6001234500128', buyPrice: 12, sellPrice: 25, quantity: 318, alertThreshold: 50 },
    { name: 'MOUTARDE 50', barcode: '6001234500129', buyPrice: 25, sellPrice: 50, quantity: 274, alertThreshold: 50 },
    { name: 'VINAICRE 25', barcode: '6001234500130', buyPrice: 12, sellPrice: 25, quantity: 72, alertThreshold: 20 },
    { name: 'MOUTARDE 400', barcode: '6001234500131', buyPrice: 200, sellPrice: 400, quantity: 6, alertThreshold: 3 },
    { name: 'LAIT 100', barcode: '6001234500132', buyPrice: 50, sellPrice: 100, quantity: 72, alertThreshold: 20 },
    { name: 'LAIT BOITE 1100', barcode: '6001234500133', buyPrice: 550, sellPrice: 1100, quantity: 21, alertThreshold: 5 },
    { name: 'BRIQUETS 100', barcode: '6001234500134', buyPrice: 50, sellPrice: 100, quantity: 88, alertThreshold: 20 },
    { name: 'SARDINE 350', barcode: '6001234500135', buyPrice: 175, sellPrice: 350, quantity: 45, alertThreshold: 10 },
    { name: 'MACORONI 550', barcode: '6001234500136', buyPrice: 275, sellPrice: 550, quantity: 40, alertThreshold: 10 },
    { name: 'MACORONI 500', barcode: '6001234500137', buyPrice: 250, sellPrice: 500, quantity: 15, alertThreshold: 5 },
    { name: 'COTON 500', barcode: '6001234500138', buyPrice: 250, sellPrice: 500, quantity: 10, alertThreshold: 5 },
    { name: 'COTON 600', barcode: '6001234500139', buyPrice: 300, sellPrice: 600, quantity: 24, alertThreshold: 5 },
    { name: 'CHOCOLA 750', barcode: '6001234500140', buyPrice: 375, sellPrice: 750, quantity: 12, alertThreshold: 5 },
    { name: 'LAIT 32000', barcode: '6001234500141', buyPrice: 16000, sellPrice: 32000, quantity: 1, alertThreshold: 1 },
    { name: 'CHOCOLAT 25', barcode: '6001234500142', buyPrice: 12, sellPrice: 25, quantity: 380, alertThreshold: 50 },
    { name: 'PATTES A DENTS SIGNAL 750', barcode: '6001234500143', buyPrice: 375, sellPrice: 750, quantity: 2, alertThreshold: 1 },
    { name: 'PATTES A DENTS 500', barcode: '6001234500144', buyPrice: 250, sellPrice: 500, quantity: 41, alertThreshold: 10 },
    { name: 'BROCHES A DENTS 600', barcode: '6001234500145', buyPrice: 300, sellPrice: 600, quantity: 100, alertThreshold: 20 },
    { name: 'GARI 50', barcode: '6001234500146', buyPrice: 25, sellPrice: 50, quantity: 14, alertThreshold: 5 },
    { name: 'LIPTON 650', barcode: '6001234500147', buyPrice: 325, sellPrice: 650, quantity: 1, alertThreshold: 1 },
    { name: 'LIPTON CHAYA 1250', barcode: '6001234500148', buyPrice: 625, sellPrice: 1250, quantity: 24, alertThreshold: 5 },
    { name: 'BONBON 25', barcode: '6001234500149', buyPrice: 12, sellPrice: 25, quantity: 429, alertThreshold: 50 },
    { name: 'SUCRE VANILLE 125', barcode: '6001234500150', buyPrice: 62, sellPrice: 125, quantity: 117, alertThreshold: 20 },
    { name: 'CHIGOMME PAQ 300', barcode: '6001234500151', buyPrice: 150, sellPrice: 300, quantity: 32, alertThreshold: 10 },
    { name: 'BONBON PAQ 250', barcode: '6001234500152', buyPrice: 125, sellPrice: 250, quantity: 31, alertThreshold: 10 },
    { name: 'BONBON 50', barcode: '6001234500153', buyPrice: 25, sellPrice: 50, quantity: 154, alertThreshold: 30 },
    { name: 'CHIGOMME 2400', barcode: '6001234500154', buyPrice: 1200, sellPrice: 2400, quantity: 1, alertThreshold: 1 },
    { name: 'LAMES 100', barcode: '6001234500155', buyPrice: 50, sellPrice: 100, quantity: 15, alertThreshold: 5 },
    { name: 'BOITE CHIGOME 2500', barcode: '6001234500156', buyPrice: 1250, sellPrice: 2500, quantity: 9, alertThreshold: 3 },
    { name: 'VERRE THE 200', barcode: '6001234500157', buyPrice: 100, sellPrice: 200, quantity: 1, alertThreshold: 1 },
    { name: 'ZIRANI 25', barcode: '6001234500158', buyPrice: 12, sellPrice: 25, quantity: 30, alertThreshold: 10 },
    { name: 'BONBON 100', barcode: '6001234500159', buyPrice: 50, sellPrice: 100, quantity: 10, alertThreshold: 5 },
    { name: 'CHAUSURES 1000', barcode: '6001234500160', buyPrice: 500, sellPrice: 1000, quantity: 2, alertThreshold: 1 },
    { name: 'COLE 1000', barcode: '6001234500161', buyPrice: 500, sellPrice: 1000, quantity: 9, alertThreshold: 3 },
    { name: 'COLE 200', barcode: '6001234500162', buyPrice: 100, sellPrice: 200, quantity: 2, alertThreshold: 1 },
    { name: 'ALLUMETS 250', barcode: '6001234500163', buyPrice: 125, sellPrice: 250, quantity: 15, alertThreshold: 5 },
    { name: 'BONBON PAQUET 1250', barcode: '6001234500164', buyPrice: 625, sellPrice: 1250, quantity: 17, alertThreshold: 5 },
    { name: 'SACHET 100', barcode: '6001234500165', buyPrice: 50, sellPrice: 100, quantity: 108, alertThreshold: 30 },
    { name: 'SACHET 50', barcode: '6001234500166', buyPrice: 25, sellPrice: 50, quantity: 264, alertThreshold: 50 },
    { name: 'SACHET 500', barcode: '6001234500167', buyPrice: 250, sellPrice: 500, quantity: 32, alertThreshold: 10 },
    { name: 'SACHET 25', barcode: '6001234500168', buyPrice: 12, sellPrice: 25, quantity: 16, alertThreshold: 5 },
    { name: 'SACHET 200', barcode: '6001234500169', buyPrice: 100, sellPrice: 200, quantity: 40, alertThreshold: 10 },
    { name: 'SACHET 125', barcode: '6001234500170', buyPrice: 62, sellPrice: 125, quantity: 30, alertThreshold: 10 },
    { name: 'BIG RASOIR 100', barcode: '6001234500171', buyPrice: 50, sellPrice: 100, quantity: 94, alertThreshold: 20 },
    { name: 'COUCHE BB 100', barcode: '6001234500172', buyPrice: 50, sellPrice: 100, quantity: 286, alertThreshold: 50 },
    { name: 'SUCRE DETAIL 100', barcode: '6001234500173', buyPrice: 50, sellPrice: 100, quantity: 128, alertThreshold: 30 },
    { name: 'SUCRE DEMI 300', barcode: '6001234500174', buyPrice: 150, sellPrice: 300, quantity: 60, alertThreshold: 15 },
    { name: 'SACS SUCRE 36000', barcode: '6001234500175', buyPrice: 18000, sellPrice: 36000, quantity: 1, alertThreshold: 1 },
  ];

  // --- Produits Boissons ---
  const boissonsProducts = [
    { name: 'CANETTE 350', barcode: '6001234500201', buyPrice: 175, sellPrice: 350, quantity: 73, alertThreshold: 20 },
    { name: 'CANETTE 500', barcode: '6001234500202', buyPrice: 250, sellPrice: 500, quantity: 94, alertThreshold: 20 },
    { name: 'DOLIMA 250', barcode: '6001234500203', buyPrice: 125, sellPrice: 250, quantity: 9, alertThreshold: 5 },
    { name: 'DOLIMA 300', barcode: '6001234500204', buyPrice: 150, sellPrice: 300, quantity: 7, alertThreshold: 3 },
    { name: 'DOLIMA 100', barcode: '6001234500205', buyPrice: 50, sellPrice: 100, quantity: 133, alertThreshold: 30 },
    { name: 'CANETTE 600', barcode: '6001234500206', buyPrice: 300, sellPrice: 600, quantity: 37, alertThreshold: 10 },
    { name: 'DIAGO GRAND 300', barcode: '6001234500207', buyPrice: 150, sellPrice: 300, quantity: 98, alertThreshold: 20 },
    { name: 'DIAGO PETIT 100', barcode: '6001234500208', buyPrice: 50, sellPrice: 100, quantity: 341, alertThreshold: 50 },
    { name: 'JUS 1000', barcode: '6001234500209', buyPrice: 500, sellPrice: 1000, quantity: 9, alertThreshold: 3 },
    { name: 'JUS 50', barcode: '6001234500210', buyPrice: 25, sellPrice: 50, quantity: 335, alertThreshold: 50 },
    { name: 'JUS 100', barcode: '6001234500211', buyPrice: 50, sellPrice: 100, quantity: 168, alertThreshold: 30 },
    { name: 'VADAM 300', barcode: '6001234500212', buyPrice: 150, sellPrice: 300, quantity: 1, alertThreshold: 1 },
    { name: 'LAIT BOITE 300', barcode: '6001234500213', buyPrice: 150, sellPrice: 300, quantity: 50, alertThreshold: 15 },
    { name: 'MALI LAIT 200', barcode: '6001234500214', buyPrice: 100, sellPrice: 200, quantity: 8, alertThreshold: 3 },
    { name: 'JUS 200', barcode: '6001234500215', buyPrice: 100, sellPrice: 200, quantity: 60, alertThreshold: 15 },
    { name: 'JUS 250', barcode: '6001234500216', buyPrice: 125, sellPrice: 250, quantity: 105, alertThreshold: 20 },
    { name: 'X PLUS 300', barcode: '6001234500217', buyPrice: 150, sellPrice: 300, quantity: 45, alertThreshold: 10 },
    { name: 'BOISSON 200', barcode: '6001234500218', buyPrice: 100, sellPrice: 200, quantity: 246, alertThreshold: 50 },
    { name: 'BOISSON 250', barcode: '6001234500219', buyPrice: 125, sellPrice: 250, quantity: 12, alertThreshold: 5 },
    { name: 'BOISSON 300', barcode: '6001234500220', buyPrice: 150, sellPrice: 300, quantity: 7, alertThreshold: 3 },
  ];

  // --- Produits Ménage & Quincaillerie ---
  const menageProducts = [
    { name: 'CABLE 500', barcode: '6001234500301', buyPrice: 250, sellPrice: 500, quantity: 50, alertThreshold: 10 },
    { name: 'CABLE 3 TETE 750', barcode: '6001234500302', buyPrice: 375, sellPrice: 750, quantity: 10, alertThreshold: 3 },
    { name: 'CABLE 3 TETE 500', barcode: '6001234500303', buyPrice: 250, sellPrice: 500, quantity: 5, alertThreshold: 2 },
    { name: 'AMPOULE 2000', barcode: '6001234500304', buyPrice: 1000, sellPrice: 2000, quantity: 4, alertThreshold: 2 },
    { name: 'AMPOULE 1000', barcode: '6001234500305', buyPrice: 500, sellPrice: 1000, quantity: 5, alertThreshold: 2 },
    { name: 'ECOUTEUR 1000', barcode: '6001234500306', buyPrice: 500, sellPrice: 1000, quantity: 4, alertThreshold: 2 },
    { name: 'MASQUE 100', barcode: '6001234500307', buyPrice: 50, sellPrice: 100, quantity: 44, alertThreshold: 10 },
    { name: 'ARRALONGIE 2000', barcode: '6001234500308', buyPrice: 1000, sellPrice: 2000, quantity: 2, alertThreshold: 1 },
    { name: 'ECOUTEUR 750', barcode: '6001234500309', buyPrice: 375, sellPrice: 750, quantity: 3, alertThreshold: 1 },
    { name: 'ECOUTEUR 500', barcode: '6001234500310', buyPrice: 250, sellPrice: 500, quantity: 3, alertThreshold: 1 },
    { name: 'TETE 1000', barcode: '6001234500311', buyPrice: 500, sellPrice: 1000, quantity: 4, alertThreshold: 2 },
    { name: 'TETE 500', barcode: '6001234500312', buyPrice: 250, sellPrice: 500, quantity: 1, alertThreshold: 1 },
    { name: 'BATTERY 1000', barcode: '6001234500313', buyPrice: 500, sellPrice: 1000, quantity: 4, alertThreshold: 2 },
    { name: 'BATTERY 2000', barcode: '6001234500314', buyPrice: 1000, sellPrice: 2000, quantity: 2, alertThreshold: 1 },
    { name: 'CABLE ORIGINAL 1000', barcode: '6001234500315', buyPrice: 500, sellPrice: 1000, quantity: 20, alertThreshold: 5 },
    { name: 'CHARGEUR 1500', barcode: '6001234500316', buyPrice: 750, sellPrice: 1500, quantity: 10, alertThreshold: 3 },
    { name: 'CHARGEUR 2000', barcode: '6001234500317', buyPrice: 1000, sellPrice: 2000, quantity: 4, alertThreshold: 2 },
    { name: 'OMO 1500', barcode: '6001234500318', buyPrice: 750, sellPrice: 1500, quantity: 1, alertThreshold: 1 },
    { name: 'COTON 100', barcode: '6001234500319', buyPrice: 50, sellPrice: 100, quantity: 22, alertThreshold: 10 },
    { name: 'BEURE BOITE 2000', barcode: '6001234500320', buyPrice: 1000, sellPrice: 2000, quantity: 2, alertThreshold: 1 },
    { name: 'CHAUSURE 1500', barcode: '6001234500321', buyPrice: 750, sellPrice: 1500, quantity: 2, alertThreshold: 1 },
    { name: 'CHAUSURE 1250', barcode: '6001234500322', buyPrice: 625, sellPrice: 1250, quantity: 4, alertThreshold: 2 },
    { name: 'LAMES 100', barcode: '6001234500323', buyPrice: 50, sellPrice: 100, quantity: 200, alertThreshold: 50 },
    { name: 'CRAIE 25', barcode: '6001234500324', buyPrice: 12, sellPrice: 25, quantity: 70, alertThreshold: 20 },
    { name: 'BROCHE 200', barcode: '6001234500325', buyPrice: 100, sellPrice: 200, quantity: 10, alertThreshold: 5 },
    { name: 'PILE 100', barcode: '6001234500326', buyPrice: 50, sellPrice: 100, quantity: 36, alertThreshold: 10 },
    { name: 'CARTE JOUER 200', barcode: '6001234500327', buyPrice: 100, sellPrice: 200, quantity: 19, alertThreshold: 5 },
    { name: 'TAILLANT 25', barcode: '6001234500328', buyPrice: 12, sellPrice: 25, quantity: 66, alertThreshold: 20 },
    { name: 'SUPER COOL 200', barcode: '6001234500329', buyPrice: 100, sellPrice: 200, quantity: 6, alertThreshold: 3 },
  ];

  // --- Dettes & Comptes ---
  const dettesProducts = [
    { name: 'DETTE NBA 5000', barcode: '6001234500401', buyPrice: 2500, sellPrice: 5000, quantity: 1, alertThreshold: 1 },
    { name: 'DETTE G 3500', barcode: '6001234500402', buyPrice: 1750, sellPrice: 3500, quantity: 1, alertThreshold: 1 },
    { name: 'DETTE DJELIBA 1000', barcode: '6001234500403', buyPrice: 500, sellPrice: 1000, quantity: 1, alertThreshold: 1 },
    { name: 'DETTE KIATOU 3800', barcode: '6001234500404', buyPrice: 1900, sellPrice: 3800, quantity: 1, alertThreshold: 1 },
    { name: 'MC 34350', barcode: '6001234500405', buyPrice: 17175, sellPrice: 34350, quantity: 1, alertThreshold: 1 },
  ];

  // Assemblage de tous les produits
  const allProducts = [
    ...alimentationProducts.map(p => ({ ...p, id: generateId(), categoryId: catAlimentation.id, ...s })),
    ...boissonsProducts.map(p => ({ ...p, id: generateId(), categoryId: catBoissons.id, ...s })),
    ...menageProducts.map(p => ({ ...p, id: generateId(), categoryId: catMenage.id, ...s })),
    ...dettesProducts.map(p => ({ ...p, id: generateId(), categoryId: catDettes.id, ...s })),
  ];

  await db.products.bulkAdd(allProducts);
  console.log(`${allProducts.length} produits créés`);

  // --- Clients (avec les dettes de tes fichiers) ---
  const clients = [
    { id: generateId(), name: 'Amadou Diallo', phone: '76 12 34 56', creditBalance: 5200, ...s },
    { id: generateId(), name: 'Fatoumata Traoré', phone: '66 23 45 67', creditBalance: 0, ...s },
    { id: generateId(), name: 'Moussa Konaté', phone: '78 34 56 78', creditBalance: 12000, ...s },
    { id: generateId(), name: 'Awa Coulibaly', phone: '65 45 67 89', creditBalance: 3500, ...s },
    { id: generateId(), name: 'Ibrahim Sanogo', phone: '76 56 78 90', creditBalance: 0, ...s },
    { id: generateId(), name: 'Mariam Sidibé', phone: '66 67 89 01', creditBalance: 8000, ...s },
    { id: generateId(), name: 'Oumar Keita', phone: '78 78 90 12', creditBalance: 0, ...s },
    { id: generateId(), name: 'Kadiatou Bah', phone: '65 89 01 23', creditBalance: 1500, ...s },
    { id: generateId(), name: 'Ali', phone: '76 11 22 33', creditBalance: 1400, ...s },
    { id: generateId(), name: 'Camara', phone: '76 44 55 66', creditBalance: 1100, ...s },
  ];
  await db.customers.bulkAdd(clients);

  // --- Fournisseurs ---
  const suppliers = [
    { id: generateId(), name: 'Grossiste Bamako Central', phone: '20 22 33 44', address: 'Marché de Medine, Bamako', ...s },
    { id: generateId(), name: 'SODIBAF Distribution', phone: '20 33 44 55', address: 'Zone Industrielle, Bamako', ...s },
    { id: generateId(), name: 'Sahelienne Import', phone: '20 44 55 66', address: 'Badalabougou, Bamako', ...s },
  ];
  await db.suppliers.bulkAdd(suppliers);

  // --- Transactions de crédit pour les clients avec crédit ---
  const creditTransactions = [
    { id: generateId(), customerId: clients[0].id, amount: 5200, type: 'credit' as const, date: past(5), note: 'Achat à crédit', ...s },
    { id: generateId(), customerId: clients[2].id, amount: 15000, type: 'credit' as const, date: past(12), note: 'Achat à crédit gros', ...s },
    { id: generateId(), customerId: clients[2].id, amount: 3000, type: 'payment' as const, date: past(7), note: 'Paiement partiel', ...s },
    { id: generateId(), customerId: clients[3].id, amount: 3500, type: 'credit' as const, date: past(3), note: 'Achat à crédit', ...s },
    { id: generateId(), customerId: clients[5].id, amount: 10000, type: 'credit' as const, date: past(15), note: 'Achat mensuel à crédit', ...s },
    { id: generateId(), customerId: clients[5].id, amount: 2000, type: 'payment' as const, date: past(8), note: 'Versement', ...s },
    { id: generateId(), customerId: clients[7].id, amount: 1500, type: 'credit' as const, date: past(2), note: 'Petit crédit', ...s },
    { id: generateId(), customerId: clients[8].id, amount: 1400, type: 'credit' as const, date: past(4), note: 'Crédit Ali', ...s },
    { id: generateId(), customerId: clients[9].id, amount: 1100, type: 'credit' as const, date: past(4), note: 'Crédit Camara', ...s },
  ];
  await db.creditTransactions.bulkAdd(creditTransactions);

  console.log('Seed terminé avec succès !');
}
