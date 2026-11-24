import { AppError } from './errors.js';

export const CATEGORIES = ['Hair Services', 'Skin Care', 'Nail Services', 'Grooming'];
export const STYLIST_STATUSES = ['AVAILABLE', 'BUSY', 'BREAK'];

export const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

export function normalizePhone(raw) {
  const p = String(raw ?? '').replace(/[\s-]/g, '');
  return p.replace(/^(\+91|91|0)(?=\d{10}$)/, '');
}

export function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

const fail = (errors) => {
  throw new AppError(400, 'Please fix the highlighted fields.', { errors });
};

export function validateCheckIn(body = {}) {
  const errors = {};
  const customerName = String(body.customerName ?? '').trim().replace(/\s+/g, ' ');
  if (customerName.length < 2 || customerName.length > 60) errors.customerName = 'Enter your name (2-60 characters).';
  else if (!/^[\p{L}][\p{L}\p{M}\s.'-]*$/u.test(customerName)) errors.customerName = 'Name can only contain letters, spaces, . \' and -.';

  const phone = normalizePhone(body.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';

  let serviceIds = Array.isArray(body.serviceIds) ? [...new Set(body.serviceIds)] : [];
  if (!serviceIds.length) errors.serviceIds = 'Select at least one service.';
  else if (serviceIds.length > 6) errors.serviceIds = 'You can select up to 6 services.';
  else if (!serviceIds.every(isObjectId)) errors.serviceIds = 'Invalid service selection.';

  let preferredStylistId = body.preferredStylistId || null;
  if (preferredStylistId && !isObjectId(preferredStylistId)) errors.preferredStylistId = 'Invalid stylist.';

  const clientRequestId = String(body.clientRequestId ?? '').trim();
  if (!clientRequestId || clientRequestId.length > 80) errors.clientRequestId = 'Missing request id. Please reload and try again.';

  if (Object.keys(errors).length) fail(errors);
  return { customerName, phone, serviceIds, preferredStylistId, clientRequestId };
}

export function validateService(body = {}) {
  const errors = {};
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2-80 characters.';
  const category = body.category;
  if (!CATEGORIES.includes(category)) errors.category = 'Choose a valid category.';
  const description = String(body.description ?? '').trim();
  if (description.length > 300) errors.description = 'Description can be at most 300 characters.';
  const price = toNumber(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) errors.price = 'Price must be a number between 0 and 100000.';
  const durationMinutes = toNumber(body.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) errors.durationMinutes = 'Duration must be a whole number of minutes (5-480).';
  const available = body.available === undefined ? true : body.available === true;
  if (body.available !== undefined && typeof body.available !== 'boolean') errors.available = 'Availability must be true or false.';
  if (Object.keys(errors).length) fail(errors);
  return { name, category, description, price: Math.round(price * 100) / 100, durationMinutes, available };
}

export function validateStylist(body = {}) {
  const errors = {};
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 60) errors.name = 'Name must be 2-60 characters.';
  const specialties = Array.isArray(body.specialties)
    ? [...new Set(body.specialties.map((s) => String(s).trim()).filter(Boolean))]
    : [];
  if (specialties.length > 10 || specialties.some((s) => s.length > 40)) errors.specialties = 'Up to 10 specialties, 40 characters each.';
  const serviceIds = Array.isArray(body.serviceIds) ? [...new Set(body.serviceIds)] : [];
  if (!serviceIds.every(isObjectId)) errors.serviceIds = 'Invalid service selection.';
  const status = body.status ?? 'AVAILABLE';
  if (!STYLIST_STATUSES.includes(status)) errors.status = 'Invalid availability.';
  if (Object.keys(errors).length) fail(errors);
  return { name, specialties, serviceIds, status };
}
