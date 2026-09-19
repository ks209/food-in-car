import prisma from '../config/prisma.js';

// Find-or-create a customer keyed by PHONE NUMBER (the identity). Returns the User.
//
// Checkout phone numbers are typed in, not verified, so an EXISTING account is
// only linked to (the order lands in its history) — never modified. Otherwise
// anyone typing someone else's number could rename them or add vehicles to
// their profile. Name and saved vehicles are the owner's to change, via OTP
// login + Edit Profile. Only a brand-new customer gets the name/vehicle given.
export async function resolveCustomerByPhone(phoneNumber, customerName, vehicleNo) {
  const phone = String(phoneNumber).trim();

  const existing = await prisma.user.findFirst({ where: { phoneNumber: phone } });
  if (existing) return existing;

  const user = await prisma.user.create({
    data: { customerName: customerName || 'Customer', phoneNumber: phone, isActive: true },
  });

  if (vehicleNo?.trim()) {
    await prisma.userVehicle.create({
      data: { userId: user.id, vehicleNo: vehicleNo.trim().toUpperCase() },
    });
  }

  return user;
}
