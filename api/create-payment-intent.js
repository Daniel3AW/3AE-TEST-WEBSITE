import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Server-side source of truth for prices (cents, AUD). Never trust prices from the client.
const CATALOG = {
  'table-numbers': { name: 'Engraved Table Numbers', price: 4500 },
  'coaster-set':   { name: 'Modular Coaster Set',     price: 2800 },
  'menu-stand':    { name: 'Freestanding Menu Stand', price: 6500 },
  'fidget-cube':   { name: 'Fidget Cube',              price: 1400 },
  'camera-mount':  { name: 'Universal Phone Camera Mount', price: 2400 },
  'cable-clips':   { name: 'Cable Organizer Clip Set', price: 1200 },
};

const FLAT_SHIPPING_CENTS = 800;
const MAX_QTY_PER_ITEM = 50;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { items, email, shipping } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart is empty' });
      return;
    }
    if (!shipping || !shipping.name || !shipping.line1 || !shipping.city || !shipping.state || !shipping.postalCode) {
      res.status(400).json({ error: 'Missing shipping address' });
      return;
    }

    let amount = 0;
    for (const item of items) {
      const product = CATALOG[item.id];
      if (!product) {
        res.status(400).json({ error: `Unknown product: ${item.id}` });
        return;
      }
      const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(item.qty, 10) || 0));
      amount += product.price * qty;
    }
    amount += FLAT_SHIPPING_CENTS;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      receipt_email: email || undefined,
      shipping: {
        name: shipping.name,
        address: {
          line1: shipping.line1,
          line2: shipping.line2 || undefined,
          city: shipping.city,
          state: shipping.state,
          postal_code: shipping.postalCode,
          country: shipping.country || 'AU',
        },
      },
      metadata: {
        items: JSON.stringify(items),
      },
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret, amount });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    res.status(500).json({ error: 'Unable to create payment' });
  }
}
