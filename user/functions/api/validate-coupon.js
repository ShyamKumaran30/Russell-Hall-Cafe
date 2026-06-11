const COUPONS = {
  BRUNCH10: { type: 'percent', value: 10, label: '10% off' },
  WELCOME15: { type: 'percent', value: 15, label: '15% off' },
  RHC20: { type: 'fixed', value: 2, label: '£2 off' },
  STUDENT5: { type: 'fixed', value: 5, label: '£5 off (min £20)', min: 20 }
};

export async function onRequestPost(context) {
  try {
    const { request } = context;
    const body = await request.json();
    const { code, subtotal } = body || {};
    const key = (code || '').trim().toUpperCase();
    const coupon = COUPONS[key];

    if (!coupon) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid coupon code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (coupon.min && subtotal < coupon.min) {
      return new Response(JSON.stringify({ valid: false, error: `Minimum order £${coupon.min} for this coupon` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let discount = 0;
    if (coupon.type === 'percent') {
      discount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
    } else {
      discount = Math.min(coupon.value, subtotal);
    }

    return new Response(JSON.stringify({ valid: true, code: key, discount, label: coupon.label }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
