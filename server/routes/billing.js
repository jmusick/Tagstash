import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { processBillingWebhookEvent } from '../services/billing.js';

const router = express.Router();

router.post('/webhook', async (req, res) => {
  const expectedSecret = process.env.BILLING_WEBHOOK_SECRET;
  const providedSecret = req.headers['x-tagstash-webhook-secret'];

  if (expectedSecret && providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  try {
    const result = await processBillingWebhookEvent(req.body);
    return res.json({ received: true, result });
  } catch (error) {
    console.error('Billing webhook error:', error);
    return res.status(500).json({ error: 'Server error handling billing webhook' });
  }
});

router.post('/checkout-session', authenticateToken, async (req, res) => {
  res.status(501).json({
    error: 'Billing provider not configured yet',
    message: 'Create checkout session is a placeholder until payment provider integration is added',
    suggestedProviderFields: ['providerCustomerId', 'providerPriceId', 'successUrl', 'cancelUrl'],
  });
});

router.post('/portal-session', authenticateToken, async (req, res) => {
  res.status(501).json({
    error: 'Billing provider not configured yet',
    message: 'Create billing portal session is a placeholder until payment provider integration is added',
    suggestedProviderFields: ['providerCustomerId', 'returnUrl'],
  });
});

export default router;
