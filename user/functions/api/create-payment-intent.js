export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const stripeKey = env.STRIPE_SECRET_KEY;
    const body = await request.json();
    
    const {
      payment_method_id,
      amount,
      currency = 'gbp',
      description,
      order,
      couponCode
    } = body || {};

    if (!payment_method_id || !amount || amount < 50) {
      return new Response(JSON.stringify({ error: 'Invalid payment details' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If Stripe is not configured in env, simulate success
    if (!stripeKey) {
      return new Response(JSON.stringify({
        success: true,
        simulated: true,
        paymentIntentId: 'sim_' + Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const origin = request.headers.get('origin') || 'https://russellhallcafe.vercel.app';
    
    // Construct urlencoded form params for Stripe API
    const params = new URLSearchParams();
    params.append('amount', Math.round(amount));
    params.append('currency', currency);
    params.append('description', description || 'Russell Hall Café order');
    params.append('payment_method', payment_method_id);
    params.append('confirm', 'true');
    params.append('return_url', `${origin}/?order=confirmed`);
    params.append('metadata[customer_name]', order?.name || '');
    params.append('metadata[customer_email]', order?.email || '');
    params.append('metadata[order_type]', order?.orderType || '');
    params.append('metadata[coupon]', couponCode || '');

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const paymentIntent = await stripeRes.json();

    if (paymentIntent.error) {
      throw new Error(paymentIntent.error.message);
    }

    if (paymentIntent.status === 'requires_action') {
      return new Response(JSON.stringify({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, paymentIntentId: paymentIntent.id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Payment error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
