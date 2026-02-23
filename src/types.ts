





export type OfferAvailability =
	| 'InStock'
	| 'OutOfStock'
	| 'PreOrder'
	| 'SoldOut'
	| 'OnlineOnly'
	| 'LimitedAvailability'
	| 'Discontinued';

export type PaymentMethod =
	| 'Cash'
	| 'CreditCard'
	| 'Cryptocurrency'
	| 'BankTransfer'
	| 'PaymentService'
	| 'Subscription'
	| 'Donation'
	| 'Exchange';

export interface PriceSpecification {
	'@type': 'PriceSpecification' | 'UnitPriceSpecification';
	price: number | string;
	priceCurrency: string;
	valueAddedTaxIncluded?: boolean;
	validFrom?: string;
	validThrough?: string;
	minPrice?: number;
	maxPrice?: number;
}

export interface SchemaOffer {
	'@context': 'https://schema.org';
	'@type': 'Offer';
	'@id': string;
	name: string;
	description?: string;
	url?: string;
	price?: number | string;
	priceCurrency?: string;
	priceSpecification?: PriceSpecification;
	availability: OfferAvailability;
	availabilityStarts?: string;
	availabilityEnds?: string;
	seller?: {
		'@type': 'Person' | 'Organization';
		name: string;
		url?: string;
	};
	itemOffered?: {
		'@type': 'Product' | 'Service' | 'CreativeWork';
		name: string;
		description?: string;
		url?: string;
		image?: string;
	};
	acceptedPaymentMethod?: PaymentMethod[];
	transactionType: string;
	externalUrl?: string;
	requiresAction?: string;
}

export interface TransactionMapping {
	transactionType: string;
	schemaType: 'Offer' | 'DonateAction' | 'BuyAction' | 'ReserveAction';
	paymentMethods: PaymentMethod[];
	defaultAvailability: OfferAvailability;
	requiresExternalUrl: boolean;
	isMonetary: boolean;
	isCryptocurrency: boolean;
	isSubscription: boolean;
	isDonation: boolean;
}

export interface TransactionConfig {
	type: string;
	enabled: boolean;
	url?: string;
	label?: string;
	description?: string;
	priority?: number;
	price?: number | string;
	currency?: string;
	availability?: OfferAvailability;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}





export interface ProductItem {
	slug: string;
	title: string;
	frontmatter: Record<string, unknown>;
}
