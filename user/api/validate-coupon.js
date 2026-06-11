const COUPONS = {
  BRUNCH10: { type: 'percent', value: 10, label: '10% off' },
  WELCOME15: { type: 'percent', value: 15, label: '15% off' },
  RHC20: { type: 'fixed', value: 2, label: '£2 off' },
  STUDENT5: { type: 'fixed', value: 5, label: '£5 off (min £20)', min: 20 }
};

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, subtotal } = req.body || {};
  const key = (code || '').trim().toUpperCase();
  const coupon = COUPONS[key];

  if (!coupon) {
    return res.status(400).json({ valid: false, error: 'Invalid coupon code' });
  }

  if (coupon.min && subtotal < coupon.min) {
    return res.status(400).json({ valid: false, error: `Minimum order £${coupon.min} for this coupon` });
  }

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
  } else {
    discount = Math.min(coupon.value, subtotal);
  }

  res.json({ valid: true, code: key, discount, label: coupon.label });
};
