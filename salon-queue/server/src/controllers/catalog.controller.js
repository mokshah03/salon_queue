import Service from '../models/Service.js';
import Stylist from '../models/Stylist.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CATEGORIES } from '../utils/validators.js';
import { getSettings } from '../services/queueService.js';
import { isOpenAt } from '../utils/dateKey.js';

export const toService = (s) => ({
  id: String(s._id),
  name: s.name,
  category: s.category,
  description: s.description,
  price: s.price,
  durationMinutes: s.durationMinutes,
  available: s.available,
});

export const toStylist = (s) => ({
  id: String(s._id),
  name: s.name,
  specialties: s.specialties,
  serviceIds: (s.serviceIds || []).map(String),
  status: s.status,
});

export const listServices = asyncHandler(async (req, res) => {
  const services = await Service.find().lean();
  services.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
  res.json({ services: services.map(toService), categories: CATEGORIES });
});

export const listStylists = asyncHandler(async (req, res) => {
  const stylists = await Stylist.find().sort({ name: 1 }).lean();
  res.json({ stylists: stylists.map(toStylist) });
});

export const getPublicSettings = asyncHandler(async (req, res) => {
  const s = await getSettings();
  res.json({
    salonName: 'Lumière Salon',
    openTime: s.openTime,
    closeTime: s.closeTime,
    isOpen: isOpenAt(s),
    enforceHours: s.enforceHours,
    warnAfterMinutes: s.warnAfterMinutes,
  });
});
