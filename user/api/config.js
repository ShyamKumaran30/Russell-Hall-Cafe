module.exports = (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    coupons: ['BRUNCH10', 'WELCOME15', 'RHC20', 'STUDENT5']
  });
};
