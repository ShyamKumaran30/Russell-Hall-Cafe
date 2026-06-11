let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  // Stripe not installed in Vercel — will use simulated mode
  stripe = null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    payment_method_id,
    amount,
    currency = 'gbp',
    description,
    order,
    couponCode
  } = req.body || {};

  if (!payment_method_id || !amount || amount < 50) {
    return res.status(400).json({ error: 'Invalid payment details' });
  }

  // If Stripe is not configured, simulate success
  if (!stripe || !process.env.STRIPE_SECRET_KEY) {
    return res.json({
      success: true,
      simulated: true,
      paymentIntentId: 'sim_' + Date.now()
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency,
      description: description || 'Russell Hall Café order',
      payment_method: payment_method_id,
      confirm: true,
      return_url: `${req.headers.origin || 'https://russellhallcafe.vercel.app'}/?order=confirmed`,
      metadata: {
        customer_name: order?.name || '',
        customer_email: order?.email || '',
        order_type: order?.orderType || '',
        coupon: couponCode || ''
      }
    });

    if (paymentIntent.status === 'requires_action') {
      return res.json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret
      });
    }

    res.json({ success: true, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error('Payment error:', err.message);
    res.status(400).json({ error: err.message });
  }
};
