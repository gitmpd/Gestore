import { PrismaClient } from '@prisma/client'; 
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@store.com' },
  });

  if (!existingAdmin) {
    const adminPassword = await bcrypt.hash('admin123', 10);

    await prisma.user.create({
      data: {
        name: 'Gérant',
        email: 'admin@store.com',
        password: adminPassword,
        role: 'gerant',
        active: true,
        mustChangePassword: true,
      },
    });

    console.log('Gérant créé.');
  } else {
    console.log('Gérant déjà existant. Aucun changement effectué.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());