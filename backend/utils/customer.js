import prisma from '../config/prisma.js';

// Find-or-create a customer keyed by PHONE NUMBER (the identity), keep their name fresh,
// and record the vehicle they used in their saved-vehicle list (deduped per user).
// Returns the User.
export async function resolveCustomerByPhone(phoneNumber, customerName, vehicleNo) {
  const phone = String(phoneNumber).trim();

  let user = await prisma.user.findFirst({ where: { phoneNumber: phone } });
  if (user) {
    if (customerName && user.customerName !== customerName) {
      user = await prisma.user.update({ where: { id: user.id }, data: { customerName } });
    }
  } else {
    user = await prisma.user.create({
      data: { customerName: customerName || 'Customer', phoneNumber: phone, isActive: true },
    });
  }

  // Save / refresh the vehicle in the user's list (no-op duplicate thanks to @@unique)
  if (vehicleNo) {
    const v = vehicleNo.trim().toUpperCase();
    await prisma.userVehicle.upsert({
      where: { userId_vehicleNo: { userId: user.id, vehicleNo: v } },
      update: {}, // lastUsedAt auto-updates via @updatedAt
      create: { userId: user.id, vehicleNo: v },
    });
  }

  return user;
}
