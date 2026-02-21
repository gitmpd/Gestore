import { PrismaClient } from '@prisma/client'; 
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Hash du mot de passe par défaut
  const adminPassword = await bcrypt.hash('admin123', 10);

  // Upsert pour créer ou mettre à jour l'admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: {
      password: adminPassword,       // <--- met à jour le mot de passe existant
      mustChangePassword: true,      // force le changement à la première connexion
      active: true,
      role: 'gerant',
      name: 'Gérant',
    },
    create: {
      name: 'Gérant',
      email: 'admin@store.com',
      password: adminPassword,
      role: 'gerant',
      active: true,
      mustChangePassword: true,
    },
  });

  console.log('Gérant créé ou mis à jour:', admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());