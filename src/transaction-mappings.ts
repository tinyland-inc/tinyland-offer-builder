/**
 * Mapping configuration for all 15 transaction types
 */

import type { TransactionMapping } from './types.js';

export const TRANSACTION_MAPPINGS: Record<string, TransactionMapping> = {
	inquiry: {
		transactionType: 'inquiry',
		schemaType: 'Offer',
		paymentMethods: [],
		defaultAvailability: 'InStock',
		requiresExternalUrl: false,
		isMonetary: false,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	ebay: {
		transactionType: 'ebay',
		schemaType: 'Offer',
		paymentMethods: ['CreditCard', 'PaymentService'],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	etsy: {
		transactionType: 'etsy',
		schemaType: 'Offer',
		paymentMethods: ['CreditCard', 'PaymentService'],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	amazon: {
		transactionType: 'amazon',
		schemaType: 'Offer',
		paymentMethods: ['CreditCard', 'PaymentService'],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	'snail-mail': {
		transactionType: 'snail-mail',
		schemaType: 'Offer',
		paymentMethods: ['Cash', 'BankTransfer'],
		defaultAvailability: 'InStock',
		requiresExternalUrl: false,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	monero: {
		transactionType: 'monero',
		schemaType: 'Offer',
		paymentMethods: ['Cryptocurrency'],
		defaultAvailability: 'InStock',
		requiresExternalUrl: false,
		isMonetary: true,
		isCryptocurrency: true,
		isSubscription: false,
		isDonation: false
	},
	stripe: {
		transactionType: 'stripe',
		schemaType: 'Offer',
		paymentMethods: ['CreditCard', 'PaymentService'],
		defaultAvailability: 'InStock',
		requiresExternalUrl: false,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	polar: {
		transactionType: 'polar',
		schemaType: 'Offer',
		paymentMethods: ['Subscription', 'PaymentService'],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: true,
		isDonation: false
	},
	talar: {
		transactionType: 'talar',
		schemaType: 'Offer',
		paymentMethods: ['BankTransfer', 'PaymentService'],
		defaultAvailability: 'InStock',
		requiresExternalUrl: false,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	repository: {
		transactionType: 'repository',
		schemaType: 'Offer',
		paymentMethods: [],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: false,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	documentation: {
		transactionType: 'documentation',
		schemaType: 'Offer',
		paymentMethods: [],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: false,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	booking: {
		transactionType: 'booking',
		schemaType: 'ReserveAction',
		paymentMethods: ['PaymentService', 'CreditCard'],
		defaultAvailability: 'LimitedAvailability',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	},
	liberapay: {
		transactionType: 'liberapay',
		schemaType: 'DonateAction',
		paymentMethods: ['Donation', 'PaymentService'],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: true,
		isDonation: true
	},
	kofi: {
		transactionType: 'kofi',
		schemaType: 'DonateAction',
		paymentMethods: ['Donation', 'PaymentService'],
		defaultAvailability: 'OnlineOnly',
		requiresExternalUrl: true,
		isMonetary: true,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: true
	},
	'contribute-to-consume': {
		transactionType: 'contribute-to-consume',
		schemaType: 'Offer',
		paymentMethods: ['Exchange'],
		defaultAvailability: 'InStock',
		requiresExternalUrl: false,
		isMonetary: false,
		isCryptocurrency: false,
		isSubscription: false,
		isDonation: false
	}
};

/**
 * Get transaction mapping configuration
 */
export function getTransactionMapping(type: string): TransactionMapping | undefined {
	return TRANSACTION_MAPPINGS[type];
}

/**
 * Check if transaction type requires external URL
 */
export function requiresExternalUrl(type: string): boolean {
	return TRANSACTION_MAPPINGS[type]?.requiresExternalUrl ?? false;
}

/**
 * Check if transaction type is monetary
 */
export function isMonetary(type: string): boolean {
	return TRANSACTION_MAPPINGS[type]?.isMonetary ?? false;
}

/**
 * Get all supported transaction types
 */
export function getSupportedTransactionTypes(): string[] {
	return Object.keys(TRANSACTION_MAPPINGS);
}
