import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { IPaymentModuleService, PaymentSessionDTO } from '@medusajs/framework/types';
import { OrderQueryResult, defaultCreatePayOrderFields } from '@webbers/pay-payments-medusa/utils/createPayOrder';
import { getPayServiceByProviderId } from '@webbers/pay-payments-medusa/providers/pay/services';
import {ProviderOptions} from "../../../../../providers/pay/types"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const paymentModuleService = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT);

  const configModule = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)

  const payModuleConfig = (configModule.modules!
    .payment as any)!.options!.providers!.find((p) => p.id === "pay")
  const payProviderId = payModuleConfig.id as string
  const payProviderOptions = payModuleConfig.options as ProviderOptions

  const hostedCheckout = 'pp_pay-hosted-'+payProviderId;

  // Check if payment collection already has a payment session with the provider
  const { data: checkPaymentCollections } = await query.graph({
    entity: 'payment_collection',
    fields: ['id', 'amount', 'currency_code', 'payment_sessions.provider_id', 'payment_sessions.data'],
    filters: { id },
  });

  if (checkPaymentCollections.length === 0) {
    return res.json({});
  }

  const existingPaymentCollection = checkPaymentCollections?.[0]?.payment_sessions?.find(
    ps => ps?.provider_id === hostedCheckout
  );

  if (existingPaymentCollection) {
    return res.json({ checkout_url: (existingPaymentCollection?.data as any)?.links?.checkout });
  }

  // Create payment session for provider
  await paymentModuleService.createPaymentSession(id, {
    provider_id: hostedCheckout,
    amount: checkPaymentCollections?.[0]?.amount,
    currency_code: checkPaymentCollections?.[0]?.currency_code,
    data: {},
  });

  const { data: paymentCollections } = await query.graph({
    entity: 'payment_collection',
    fields: [
      'id',
      'order.id',
      'payment_sessions.id',
      'payment_sessions.currency_code',
      'payment_sessions.provider_id',
      'payment_sessions.data',
      'payment_sessions.amount',
      'payment_sessions.context',
      'payment_sessions.payment.*',
    ],
    filters: { id },
  });

  const paymentCollection = paymentCollections[0];

  if (!paymentCollection?.order?.id) {
    return res.status(404).json({ message: 'Order not found for payment collection' });
  }

  const paymentSession = paymentCollection?.payment_sessions?.find(
    ps => ps?.provider_id === hostedCheckout
  ) as unknown as PaymentSessionDTO;

  if (!paymentSession) {
    return res.status(404).json({ message: 'Payment session not found for payment collection' });
  }

  const payServiceProvider = getPayServiceByProviderId(hostedCheckout.replace("pp_", "").replace(`_${payProviderId}`, ""));
  if (!payServiceProvider) {
    return res.status(404).json({ message: 'Payment provider not found' });
  }

  const provider = new payServiceProvider(req.scope, payProviderOptions);

  const { data: orders } = await query.graph(
    {
      entity: 'order',
      fields: defaultCreatePayOrderFields,
      filters: { id: paymentCollection.order.id },
    },
    {
      throwIfKeyNotFound: true,
    }
  );

  const order = orders[0] as unknown as OrderQueryResult;

  const payment = await paymentModuleService.authorizePaymentSession(paymentSession.id, {});

  const payload = provider.createPayOrderPayload(order, paymentSession);

  const updatedPaymentSession = await paymentModuleService.updatePaymentSession({
    id: paymentSession.id,
    data: {
      ...(paymentSession.data ?? {}),
      payload,
    },
    currency_code: paymentSession.currency_code,
    amount: paymentSession.amount,
  });

  if (payment) {
    const updatedPayment = await paymentModuleService.updatePayment({
      id: payment.id,
      // @ts-ignore
      data: {
        ...updatedPaymentSession.data,
        ...payload,
      },
    });
  }

  return res.json({ checkout_url: (updatedPaymentSession?.data as any)?.links?.checkout });
};
