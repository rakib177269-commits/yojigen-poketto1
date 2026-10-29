// Error codes returned by the database RPCs, in words a customer understands.
const MESSAGES = {
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  invalid_name: 'Please enter your name (at least 2 letters).',
  invalid_phone: 'Please enter a valid Bangladeshi mobile number, e.g. 01712-345678.',
  invalid_address: 'Please enter your full address (house, road, area, district).',
  invalid_note: 'The note is too long (500 characters max).',
  invalid_email: 'That email address doesn\'t look right.',
  invalid_items: 'Your cart looks empty or out of date. Please refresh and try again.',
  cart_changed: 'Some items in your cart changed. Please review them below.',
  out_of_stock: 'Sorry, an item just sold out. Please review your cart.',
  coupon_invalid: 'That coupon code isn\'t valid.',
  coupon_expired: 'That coupon has expired.',
  coupon_not_started: 'That coupon isn\'t active yet.',
  coupon_used_up: 'That coupon has been fully used.',
  coupon_min_order: 'Your order doesn\'t reach the minimum for that coupon yet.',
  not_found: 'We couldn\'t find an order with that code and phone number.',
  maintenance: 'The shop is being updated right now, so we can\'t take orders. Please try again shortly.',
  server_error: 'Something went wrong on our side. Please try again in a moment.',
};

export function errorMessage(code) {
  return MESSAGES[code] || MESSAGES.server_error;
}

export const LINE_PROBLEMS = {
  unavailable: 'No longer available',
  choose_variant: 'Please choose a colour',
  out_of_stock: 'Sold out',
  insufficient_stock: 'Not enough in stock',
  too_many: 'Too many',
};
