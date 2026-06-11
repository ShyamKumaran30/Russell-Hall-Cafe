export async function onRequestGet(context) {
  const env = context.env;
  const data = {
    publishableKey: env.STRIPE_PUBLISHABLE_KEY || '',
    coupons: ['BRUNCH10', 'WELCOME15', 'RHC20', 'STUDENT5']
  };
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}
