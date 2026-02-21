const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== AUDIT LOGS (Recent 20 entries) ===\n');
  
  const logs = await prisma.auditLog.findMany({
    orderBy: { date: 'desc' },
    take: 20,
  });

  if (logs.length === 0) {
    console.log('No audit logs found.');
  } else {
    logs.forEach((log, idx) => {
      console.log(`${idx + 1}. [${log.date.toISOString()}]`);
      console.log(`   User: ${log.userName}`);
      console.log(`   Action: ${log.action}`);
      console.log(`   Entity: ${log.entity}`);
      console.log(`   Entity Name: ${log.entityName || 'N/A'}`);
      console.log(`   Details: ${log.details || 'N/A'}`);
      console.log('');
    });
  }

  console.log('\n=== SALES (Recent 10 entries) ===\n');
  
  const sales = await prisma.sale.findMany({
    orderBy: { date: 'desc' },
    take: 10,
  });

  if (sales.length === 0) {
    console.log('No sales found.');
  } else {
    sales.forEach((sale, idx) => {
      console.log(`${idx + 1}. Sale #${sale.id.slice(0, 8)}`);
      console.log(`   Date: ${sale.date.toISOString()}`);
      console.log(`   Total: ${sale.total}`);
      console.log(`   Status: ${sale.status}`);
      console.log(`   Payment: ${sale.paymentMethod}`);
      console.log('');
    });
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
