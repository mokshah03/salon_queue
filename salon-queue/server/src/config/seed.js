import Service from '../models/Service.js';
import Stylist from '../models/Stylist.js';

const SERVICES = [
  ['Hair Services', "Women's Haircut & Styling", 'Consultation, precision cut, wash and a finished blow-dry.', 800, 45, true],
  ['Hair Services', "Men's Haircut", 'Classic or modern cut with wash and styling.', 350, 30, true],
  ['Hair Services', 'Hair Spa & Treatment', 'Deep-conditioning spa with scalp massage for shine and strength.', 1500, 60, true],
  ['Hair Services', 'Global Hair Colour', 'Full colour with ammonia-free professional products.', 3500, 120, true],
  ['Hair Services', 'Blow Dry & Styling', 'Smooth blow-dry with heat protection, curls or waves.', 600, 30, true],
  ['Hair Services', 'Keratin Smoothening', 'Long-lasting frizz control and mirror shine.', 5500, 150, false],
  ['Skin Care', 'Classic Facial', 'Cleansing, exfoliation, massage and a hydrating mask.', 1200, 45, true],
  ['Skin Care', 'De-Tan Cleanup', 'Removes tan and dullness for an instantly brighter look.', 900, 30, true],
  ['Skin Care', 'Hydrating Gold Facial', 'Luxurious gold-infused facial for glow and firmness.', 2200, 60, true],
  ['Nail Services', 'Classic Manicure', 'Shaping, cuticle care, hand massage and polish.', 600, 40, true],
  ['Nail Services', 'Classic Pedicure', 'Foot soak, scrub, cuticle care and polish.', 800, 50, true],
  ['Nail Services', 'Gel Nail Extensions', 'Full set of gel extensions with your choice of colour.', 2500, 90, true],
  ['Grooming', 'Beard Trim & Shaping', 'Precision beard trim with hot-towel finish.', 250, 20, true],
  ['Grooming', 'Eyebrow & Upper Lip Threading', 'Quick, clean threading for brows and upper lip.', 100, 10, true],
  ['Grooming', 'Full Arms Waxing', 'Smooth, gentle waxing for full arms.', 500, 25, true],
  ['Grooming', 'Relaxing Head Massage', 'Oil head massage to relieve stress and tension.', 400, 20, true],
];

const STYLISTS = [
  { name: 'Aarti Sharma', specialties: ['Hair colour', 'Styling'], categories: ['Hair Services'] },
  { name: 'Rohan Mehta', specialties: ["Men's cuts", 'Beard grooming'], names: ["Men's Haircut", 'Blow Dry & Styling', 'Beard Trim & Shaping', 'Relaxing Head Massage'] },
  { name: 'Priya Nair', specialties: ['Facials', 'Skin care'], categories: ['Skin Care'], names: ['Eyebrow & Upper Lip Threading', 'Full Arms Waxing'] },
  { name: 'Kavita Joshi', specialties: ['Nail art', 'Manicure & pedicure'], categories: ['Nail Services'], names: ['Eyebrow & Upper Lip Threading'] },
];

// Seeds demo data only when both collections are empty.
export async function seedIfEmpty() {
  const [sCount, tCount] = await Promise.all([Service.countDocuments(), Stylist.countDocuments()]);
  if (sCount || tCount) return false;

  const services = await Service.insertMany(
    SERVICES.map(([category, name, description, price, durationMinutes, available]) => ({ category, name, description, price, durationMinutes, available }))
  );
  await Stylist.insertMany(
    STYLISTS.map((s) => ({
      name: s.name,
      specialties: s.specialties,
      status: 'AVAILABLE',
      serviceIds: services
        .filter((svc) => (s.categories || []).includes(svc.category) || (s.names || []).includes(svc.name))
        .map((svc) => svc._id),
    }))
  );
  console.log(`Seeded demo data: ${SERVICES.length} services, ${STYLISTS.length} stylists`);
  return true;
}
