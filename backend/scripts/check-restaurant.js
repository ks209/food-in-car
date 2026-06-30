import prisma from '../config/prisma.js';
await prisma.restaurant.update({ where: { id: 1 }, data: { paymentGateway: 'PHONEPE' } });
const r = await prisma.restaurant.findFirst();
console.log('Updated paymentGateway:', r?.paymentGateway);
await prisma.$disconnect();
