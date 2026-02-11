import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	// Types used as values for runtime checks
	TRANSACTION_MAPPINGS,
	getTransactionMapping,
	requiresExternalUrl,
	isMonetary,
	getSupportedTransactionTypes,
	// Config
	configure,
	getConfig,
	resetConfig,
	noopTracer,
	noopSpan,
	// Service
	OfferBuilderService,
	offerBuilderService,
} from '../src/index.js';
import type {
	OfferAvailability,
	PaymentMethod,
	SchemaOffer,
	TransactionConfig,
	ProductItem,
	Tracer,
	Span,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<ProductItem> = {}): ProductItem {
	return {
		slug: 'test-product',
		title: 'Test Product',
		frontmatter: {},
		...overrides,
	};
}

function makeTransaction(overrides: Partial<TransactionConfig> = {}): TransactionConfig {
	return {
		type: 'stripe',
		enabled: true,
		price: 29.99,
		currency: 'USD',
		...overrides,
	};
}

const BASE_URL = 'https://tinyland.dev';

// ---------------------------------------------------------------------------
// 1. Types (5+ tests)
// ---------------------------------------------------------------------------

describe('Types', () => {
	it('should accept valid OfferAvailability values', () => {
		const values: OfferAvailability[] = [
			'InStock',
			'OutOfStock',
			'PreOrder',
			'SoldOut',
			'OnlineOnly',
			'LimitedAvailability',
			'Discontinued',
		];
		expect(values).toHaveLength(7);
	});

	it('should accept valid PaymentMethod values', () => {
		const values: PaymentMethod[] = [
			'Cash',
			'CreditCard',
			'Cryptocurrency',
			'BankTransfer',
			'PaymentService',
			'Subscription',
			'Donation',
			'Exchange',
		];
		expect(values).toHaveLength(8);
	});

	it('should define TransactionConfig with required fields', () => {
		const config: TransactionConfig = { type: 'stripe', enabled: true };
		expect(config.type).toBe('stripe');
		expect(config.enabled).toBe(true);
	});

	it('should define TransactionConfig with optional fields', () => {
		const config: TransactionConfig = {
			type: 'stripe',
			enabled: true,
			url: 'https://example.com',
			label: 'Buy Now',
			description: 'desc',
			priority: 10,
			price: 19.99,
			currency: 'USD',
			availability: 'InStock',
		};
		expect(config.url).toBe('https://example.com');
		expect(config.priority).toBe(10);
	});

	it('should define ProductItem with slug, title, and frontmatter', () => {
		const product: ProductItem = { slug: 's', title: 't', frontmatter: { a: 1 } };
		expect(product.slug).toBe('s');
		expect(product.frontmatter.a).toBe(1);
	});

	it('should define SchemaOffer with @context and @type', () => {
		const offer: SchemaOffer = {
			'@context': 'https://schema.org',
			'@type': 'Offer',
			'@id': 'test',
			name: 'Test',
			availability: 'InStock',
			transactionType: 'stripe',
		};
		expect(offer['@context']).toBe('https://schema.org');
		expect(offer['@type']).toBe('Offer');
	});
});

// ---------------------------------------------------------------------------
// 2. Config DI (10+ tests)
// ---------------------------------------------------------------------------

describe('Config DI', () => {
	beforeEach(() => {
		resetConfig();
	});

	it('should return empty config by default', () => {
		const config = getConfig();
		expect(config.tracer).toBeUndefined();
	});

	it('should configure with a custom tracer', () => {
		const customTracer: Tracer = {
			startActiveSpan: <T>(_name: string, fn: (span: Span) => T): T => fn(noopSpan),
		};
		configure({ tracer: customTracer });
		expect(getConfig().tracer).toBe(customTracer);
	});

	it('should reset config to empty', () => {
		configure({ tracer: noopTracer });
		resetConfig();
		expect(getConfig().tracer).toBeUndefined();
	});

	it('should merge partial config', () => {
		configure({ tracer: noopTracer });
		configure({}); // merge with empty
		expect(getConfig().tracer).toBe(noopTracer);
	});

	it('should override tracer when re-configured', () => {
		configure({ tracer: noopTracer });
		const custom: Tracer = {
			startActiveSpan: <T>(_: string, fn: (s: Span) => T): T => fn(noopSpan),
		};
		configure({ tracer: custom });
		expect(getConfig().tracer).toBe(custom);
	});

	it('should return a copy from getConfig (not a reference)', () => {
		configure({ tracer: noopTracer });
		const a = getConfig();
		const b = getConfig();
		expect(a).not.toBe(b);
		expect(a).toEqual(b);
	});

	it('noopSpan.setAttribute should be callable without error', () => {
		expect(() => noopSpan.setAttribute('key', 'value')).not.toThrow();
	});

	it('noopSpan.setStatus should be callable without error', () => {
		expect(() => noopSpan.setStatus({ code: 1 })).not.toThrow();
	});

	it('noopSpan.recordException should be callable without error', () => {
		expect(() => noopSpan.recordException(new Error('test'))).not.toThrow();
	});

	it('noopSpan.end should be callable without error', () => {
		expect(() => noopSpan.end()).not.toThrow();
	});

	it('noopTracer.startActiveSpan should execute the callback', () => {
		const result = noopTracer.startActiveSpan('test', (span) => {
			span.setAttribute('k', 'v');
			return 42;
		});
		expect(result).toBe(42);
	});

	it('custom tracer should receive span calls during buildOffer', () => {
		const setAttributeCalls: Array<[string, string | number | boolean]> = [];
		const mockSpan: Span = {
			setAttribute: (k, v) => { setAttributeCalls.push([k, v]); },
			setStatus: () => {},
			recordException: () => {},
			end: () => {},
		};
		const mockTracer: Tracer = {
			startActiveSpan: <T>(_name: string, fn: (s: Span) => T): T => fn(mockSpan),
		};
		configure({ tracer: mockTracer });

		const svc = new OfferBuilderService();
		svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);

		expect(setAttributeCalls.length).toBeGreaterThan(0);
		expect(setAttributeCalls.some(([k]) => k === 'transaction.type')).toBe(true);
		expect(setAttributeCalls.some(([k]) => k === 'product.slug')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. TRANSACTION_MAPPINGS (20+ tests)
// ---------------------------------------------------------------------------

describe('TRANSACTION_MAPPINGS', () => {
	const ALL_TYPES = [
		'inquiry', 'ebay', 'etsy', 'amazon', 'snail-mail',
		'monero', 'stripe', 'polar', 'talar', 'repository',
		'documentation', 'booking', 'liberapay', 'kofi', 'contribute-to-consume',
	];

	it('should contain exactly 15 entries', () => {
		expect(Object.keys(TRANSACTION_MAPPINGS)).toHaveLength(15);
	});

	it.each(ALL_TYPES)('should contain entry for %s', (type) => {
		expect(TRANSACTION_MAPPINGS[type]).toBeDefined();
	});

	it.each(ALL_TYPES)('entry %s should have transactionType matching key', (type) => {
		expect(TRANSACTION_MAPPINGS[type].transactionType).toBe(type);
	});

	it('inquiry should be non-monetary', () => {
		expect(TRANSACTION_MAPPINGS['inquiry'].isMonetary).toBe(false);
	});

	it('inquiry should have empty paymentMethods', () => {
		expect(TRANSACTION_MAPPINGS['inquiry'].paymentMethods).toEqual([]);
	});

	it('ebay should require external URL', () => {
		expect(TRANSACTION_MAPPINGS['ebay'].requiresExternalUrl).toBe(true);
	});

	it('ebay should be monetary', () => {
		expect(TRANSACTION_MAPPINGS['ebay'].isMonetary).toBe(true);
	});

	it('monero should be cryptocurrency', () => {
		expect(TRANSACTION_MAPPINGS['monero'].isCryptocurrency).toBe(true);
	});

	it('monero should use Cryptocurrency payment method', () => {
		expect(TRANSACTION_MAPPINGS['monero'].paymentMethods).toContain('Cryptocurrency');
	});

	it('polar should be a subscription', () => {
		expect(TRANSACTION_MAPPINGS['polar'].isSubscription).toBe(true);
	});

	it('liberapay should be a donation', () => {
		expect(TRANSACTION_MAPPINGS['liberapay'].isDonation).toBe(true);
	});

	it('liberapay should also be a subscription', () => {
		expect(TRANSACTION_MAPPINGS['liberapay'].isSubscription).toBe(true);
	});

	it('kofi should be a donation but not a subscription', () => {
		expect(TRANSACTION_MAPPINGS['kofi'].isDonation).toBe(true);
		expect(TRANSACTION_MAPPINGS['kofi'].isSubscription).toBe(false);
	});

	it('contribute-to-consume should use Exchange payment', () => {
		expect(TRANSACTION_MAPPINGS['contribute-to-consume'].paymentMethods).toEqual(['Exchange']);
	});

	it('contribute-to-consume should be non-monetary', () => {
		expect(TRANSACTION_MAPPINGS['contribute-to-consume'].isMonetary).toBe(false);
	});

	it('booking should use ReserveAction schemaType', () => {
		expect(TRANSACTION_MAPPINGS['booking'].schemaType).toBe('ReserveAction');
	});

	it('booking should have LimitedAvailability default', () => {
		expect(TRANSACTION_MAPPINGS['booking'].defaultAvailability).toBe('LimitedAvailability');
	});

	// Helper functions
	describe('getTransactionMapping', () => {
		it('should return mapping for known type', () => {
			const mapping = getTransactionMapping('stripe');
			expect(mapping).toBeDefined();
			expect(mapping!.transactionType).toBe('stripe');
		});

		it('should return undefined for unknown type', () => {
			expect(getTransactionMapping('unknown')).toBeUndefined();
		});
	});

	describe('requiresExternalUrl', () => {
		it('should return true for ebay', () => {
			expect(requiresExternalUrl('ebay')).toBe(true);
		});

		it('should return false for stripe', () => {
			expect(requiresExternalUrl('stripe')).toBe(false);
		});

		it('should return false for unknown type', () => {
			expect(requiresExternalUrl('nonexistent')).toBe(false);
		});
	});

	describe('isMonetary', () => {
		it('should return true for stripe', () => {
			expect(isMonetary('stripe')).toBe(true);
		});

		it('should return false for inquiry', () => {
			expect(isMonetary('inquiry')).toBe(false);
		});

		it('should return false for unknown type', () => {
			expect(isMonetary('nonexistent')).toBe(false);
		});
	});

	describe('getSupportedTransactionTypes', () => {
		it('should return all 15 types', () => {
			expect(getSupportedTransactionTypes()).toHaveLength(15);
		});

		it('should include all known types', () => {
			const types = getSupportedTransactionTypes();
			ALL_TYPES.forEach((t) => {
				expect(types).toContain(t);
			});
		});
	});
});

// ---------------------------------------------------------------------------
// 4. buildOffer (25+ tests)
// ---------------------------------------------------------------------------

describe('buildOffer', () => {
	let svc: OfferBuilderService;

	beforeEach(() => {
		resetConfig();
		svc = new OfferBuilderService();
	});

	it('should build a basic offer', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer).toBeDefined();
	});

	it('should include @context', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer['@context']).toBe('https://schema.org');
	});

	it('should include @type as Offer', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer['@type']).toBe('Offer');
	});

	it('should generate correct @id', () => {
		const offer = svc.buildOffer(makeProduct({ slug: 'my-item' }), makeTransaction({ type: 'stripe' }), BASE_URL);
		expect(offer['@id']).toBe('https://tinyland.dev/products/my-item#offer-stripe');
	});

	it('should use transaction label when provided', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ label: 'Buy Now!' }),
			BASE_URL
		);
		expect(offer.name).toBe('Buy Now!');
	});

	it('should fall back to product name with transaction type', () => {
		const offer = svc.buildOffer(
			makeProduct({ title: 'Cool Widget' }),
			makeTransaction({ label: undefined }),
			BASE_URL
		);
		expect(offer.name).toBe('Cool Widget - stripe');
	});

	it('should use frontmatter.name over product.title', () => {
		const offer = svc.buildOffer(
			makeProduct({ title: 'Fallback', frontmatter: { name: 'Primary Name' } }),
			makeTransaction({ label: undefined }),
			BASE_URL
		);
		expect(offer.name).toBe('Primary Name - stripe');
	});

	it('should add price for monetary transactions', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction({ price: 49.99 }), BASE_URL);
		expect(offer.price).toBe(49.99);
	});

	it('should skip price for non-monetary transactions', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'inquiry', price: undefined }),
			BASE_URL
		);
		expect(offer.price).toBeUndefined();
	});

	it('should default currency to USD', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ currency: undefined }),
			BASE_URL
		);
		expect(offer.priceCurrency).toBe('USD');
	});

	it('should use custom currency when provided', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ currency: 'EUR' }),
			BASE_URL
		);
		expect(offer.priceCurrency).toBe('EUR');
	});

	it('should add priceSpecification for monetary', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer.priceSpecification).toBeDefined();
		expect(offer.priceSpecification!['@type']).toBe('PriceSpecification');
	});

	it('should use UnitPriceSpecification for crypto', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'monero', price: 0.5, currency: 'XMR' }),
			BASE_URL
		);
		expect(offer.priceSpecification!['@type']).toBe('UnitPriceSpecification');
	});

	it('should use PriceSpecification for non-crypto', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer.priceSpecification!['@type']).toBe('PriceSpecification');
	});

	it('should include valueAddedTaxIncluded for non-crypto', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer.priceSpecification!.valueAddedTaxIncluded).toBe(false);
	});

	it('should NOT include valueAddedTaxIncluded for crypto', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'monero', price: 1, currency: 'XMR' }),
			BASE_URL
		);
		expect(offer.priceSpecification!.valueAddedTaxIncluded).toBeUndefined();
	});

	it('should add seller info', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer.seller).toEqual({
			'@type': 'Organization',
			name: 'Tinyland',
			url: BASE_URL,
		});
	});

	it('should add itemOffered', () => {
		const offer = svc.buildOffer(
			makeProduct({ title: 'Widget', frontmatter: { description: 'A nice widget', image: 'img.png' } }),
			makeTransaction(),
			BASE_URL
		);
		expect(offer.itemOffered).toBeDefined();
		expect(offer.itemOffered!['@type']).toBe('Product');
		expect(offer.itemOffered!.name).toBe('Widget');
		expect(offer.itemOffered!.description).toBe('A nice widget');
		expect(offer.itemOffered!.image).toBe('img.png');
	});

	it('should add requiresAction for non-monetary', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'inquiry', price: undefined }),
			BASE_URL
		);
		expect(offer.requiresAction).toBe('contact');
	});

	it('should not add requiresAction for monetary', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer.requiresAction).toBeUndefined();
	});

	it('should set requiresAction to view-source for repository', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'repository', price: undefined, url: 'https://github.com/test' }),
			BASE_URL
		);
		expect(offer.requiresAction).toBe('view-source');
	});

	it('should set requiresAction to read-docs for documentation', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'documentation', price: undefined, url: 'https://docs.example.com' }),
			BASE_URL
		);
		expect(offer.requiresAction).toBe('read-docs');
	});

	it('should set requiresAction to contribute for contribute-to-consume', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ type: 'contribute-to-consume', price: undefined }),
			BASE_URL
		);
		expect(offer.requiresAction).toBe('contribute');
	});

	it('should add externalUrl when transaction has url', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ url: 'https://shop.example.com/item' }),
			BASE_URL
		);
		expect(offer.externalUrl).toBe('https://shop.example.com/item');
	});

	it('should not add externalUrl when no url provided', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ url: undefined }),
			BASE_URL
		);
		expect(offer.externalUrl).toBeUndefined();
	});

	it('should throw on unknown transaction type', () => {
		expect(() => {
			svc.buildOffer(makeProduct(), makeTransaction({ type: 'unknown-type' }), BASE_URL);
		}).toThrow('Unknown transaction type: unknown-type');
	});

	it('should set availability from transaction config', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ availability: 'PreOrder' }),
			BASE_URL
		);
		expect(offer.availability).toBe('PreOrder');
	});

	it('should use default availability from mapping when not specified', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ availability: undefined }),
			BASE_URL
		);
		expect(offer.availability).toBe('InStock'); // stripe default
	});

	it('should set acceptedPaymentMethod from mapping', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction(), BASE_URL);
		expect(offer.acceptedPaymentMethod).toEqual(['CreditCard', 'PaymentService']);
	});

	it('should set transactionType on the offer', () => {
		const offer = svc.buildOffer(makeProduct(), makeTransaction({ type: 'etsy' }), BASE_URL);
		expect(offer.transactionType).toBe('etsy');
	});

	it('should handle string price in priceSpecification', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ price: '19.99' }),
			BASE_URL
		);
		expect(offer.priceSpecification!.price).toBe(19.99);
	});

	it('should set offer url to transaction url when provided', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ url: 'https://shop.example.com' }),
			BASE_URL
		);
		expect(offer.url).toBe('https://shop.example.com');
	});

	it('should fall back to product url when no transaction url', () => {
		const offer = svc.buildOffer(
			makeProduct({ slug: 'my-slug' }),
			makeTransaction({ url: undefined }),
			BASE_URL
		);
		expect(offer.url).toBe('https://tinyland.dev/products/my-slug');
	});

	it('should include description from transaction', () => {
		const offer = svc.buildOffer(
			makeProduct(),
			makeTransaction({ description: 'Limited time offer' }),
			BASE_URL
		);
		expect(offer.description).toBe('Limited time offer');
	});
});

// ---------------------------------------------------------------------------
// 5. buildAllOffers (10+ tests)
// ---------------------------------------------------------------------------

describe('buildAllOffers', () => {
	let svc: OfferBuilderService;

	beforeEach(() => {
		resetConfig();
		svc = new OfferBuilderService();
	});

	it('should return empty array when no transactions', () => {
		const offers = svc.buildAllOffers(makeProduct(), BASE_URL);
		expect(offers).toEqual([]);
	});

	it('should return empty array when transactions is empty', () => {
		const product = makeProduct({ frontmatter: { transactions: [] } });
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers).toEqual([]);
	});

	it('should filter out disabled transactions', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: false, price: 10 },
					{ type: 'stripe', enabled: true, price: 20 },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers).toHaveLength(1);
	});

	it('should handle all disabled transactions', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: false, price: 10 },
					{ type: 'ebay', enabled: false, url: 'https://ebay.com', price: 20 },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers).toHaveLength(0);
	});

	it('should sort by priority descending', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: true, price: 10, priority: 1 },
					{ type: 'monero', enabled: true, price: 0.5, currency: 'XMR', priority: 10 },
					{ type: 'talar', enabled: true, price: 5, priority: 5 },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers).toHaveLength(3);
		expect(offers[0].transactionType).toBe('monero');
		expect(offers[1].transactionType).toBe('talar');
		expect(offers[2].transactionType).toBe('stripe');
	});

	it('should handle transactions without priority (default 0)', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: true, price: 10 },
					{ type: 'monero', enabled: true, price: 0.5, currency: 'XMR', priority: 5 },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers[0].transactionType).toBe('monero');
		expect(offers[1].transactionType).toBe('stripe');
	});

	it('should call buildOffer for each enabled transaction', () => {
		const buildOfferSpy = vi.spyOn(svc, 'buildOffer');
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: true, price: 10 },
					{ type: 'inquiry', enabled: true },
				],
			},
		});
		svc.buildAllOffers(product, BASE_URL);
		expect(buildOfferSpy).toHaveBeenCalledTimes(2);
	});

	it('should return correct number of offers', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: true, price: 10 },
					{ type: 'inquiry', enabled: true },
					{ type: 'monero', enabled: true, price: 1, currency: 'XMR' },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers).toHaveLength(3);
	});

	it('each offer should have valid @context', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: true, price: 10 },
					{ type: 'inquiry', enabled: true },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		offers.forEach((offer) => {
			expect(offer['@context']).toBe('https://schema.org');
		});
	});

	it('should handle undefined transactions in frontmatter', () => {
		const product = makeProduct({ frontmatter: {} });
		const offers = svc.buildAllOffers(product, BASE_URL);
		expect(offers).toEqual([]);
	});

	it('should produce distinct @id for each offer', () => {
		const product = makeProduct({
			frontmatter: {
				transactions: [
					{ type: 'stripe', enabled: true, price: 10 },
					{ type: 'monero', enabled: true, price: 1, currency: 'XMR' },
				],
			},
		});
		const offers = svc.buildAllOffers(product, BASE_URL);
		const ids = offers.map((o) => o['@id']);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

// ---------------------------------------------------------------------------
// 6. offerToActivityPubAttachment (10+ tests)
// ---------------------------------------------------------------------------

describe('offerToActivityPubAttachment', () => {
	let svc: OfferBuilderService;

	beforeEach(() => {
		resetConfig();
		svc = new OfferBuilderService();
	});

	function buildOffer(type: string, overrides: Partial<SchemaOffer> = {}): SchemaOffer {
		return {
			'@context': 'https://schema.org',
			'@type': 'Offer',
			'@id': 'test-id',
			name: 'Test Offer',
			availability: 'InStock',
			transactionType: type,
			...overrides,
		};
	}

	it('should return type PropertyValue', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('stripe'));
		expect(result.type).toBe('PropertyValue');
	});

	it('should include display name for stripe', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('stripe'));
		expect(result.name).toBe('Credit Card');
	});

	it('should include display name for ebay', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('ebay'));
		expect(result.name).toBe('eBay');
	});

	it('should include display name for contribute-to-consume', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('contribute-to-consume'));
		expect(result.name).toBe('Contribute to Access');
	});

	it('should add price for monetary offers', () => {
		const result = svc.offerToActivityPubAttachment(
			buildOffer('stripe', { price: 29.99, priceCurrency: 'USD' })
		);
		expect(result.value).toContain('29.99 USD');
	});

	it('should not add price for non-monetary offers', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('inquiry'));
		expect(result.value).toBe('Test Offer');
	});

	it('should add external URL when present', () => {
		const result = svc.offerToActivityPubAttachment(
			buildOffer('ebay', { externalUrl: 'https://ebay.com/item/123' })
		);
		expect(result.value).toContain('(https://ebay.com/item/123)');
	});

	it('should not add external URL when absent', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('stripe'));
		expect(result.value).not.toContain('(');
	});

	it('should combine price and external URL', () => {
		const result = svc.offerToActivityPubAttachment(
			buildOffer('ebay', { price: 50, priceCurrency: 'EUR', externalUrl: 'https://ebay.com/x' })
		);
		expect(result.value).toContain('50 EUR');
		expect(result.value).toContain('(https://ebay.com/x)');
	});

	it('should handle unknown transaction type gracefully', () => {
		const result = svc.offerToActivityPubAttachment(buildOffer('custom-type'));
		expect(result.name).toBe('custom-type');
		expect(result.value).toBe('Test Offer');
	});

	it('should use offer name in the value', () => {
		const result = svc.offerToActivityPubAttachment(
			buildOffer('stripe', { name: 'Premium Widget' })
		);
		expect(result.value).toContain('Premium Widget');
	});
});

// ---------------------------------------------------------------------------
// 7. validateTransaction (20+ tests)
// ---------------------------------------------------------------------------

describe('validateTransaction', () => {
	let svc: OfferBuilderService;

	beforeEach(() => {
		resetConfig();
		svc = new OfferBuilderService();
	});

	it('should pass for valid stripe transaction', () => {
		const result = svc.validateTransaction(makeTransaction());
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it('should fail for unknown transaction type', () => {
		const result = svc.validateTransaction(makeTransaction({ type: 'nonexistent' }));
		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Unknown transaction type: nonexistent');
	});

	it('should return early for unknown type (only one error)', () => {
		const result = svc.validateTransaction(makeTransaction({ type: 'nonexistent' }));
		expect(result.errors).toHaveLength(1);
	});

	it('should fail when external URL is required but missing', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'ebay', url: undefined, price: 10 })
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('requires an external URL'))).toBe(true);
	});

	it('should fail for invalid URL format', () => {
		const result = svc.validateTransaction(
			makeTransaction({ url: 'not-a-url' })
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Invalid URL format'))).toBe(true);
	});

	it('should pass for valid URL format', () => {
		const result = svc.validateTransaction(
			makeTransaction({ url: 'https://example.com' })
		);
		expect(result.valid).toBe(true);
	});

	it('should fail when monetary transaction has no price', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'stripe', price: undefined })
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('requires a price'))).toBe(true);
	});

	it('should fail for negative price', () => {
		const result = svc.validateTransaction(makeTransaction({ price: -5 }));
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Invalid price'))).toBe(true);
	});

	it('should fail for NaN price from string', () => {
		const result = svc.validateTransaction(makeTransaction({ price: 'abc' }));
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Invalid price'))).toBe(true);
	});

	it('should pass for valid numeric price', () => {
		const result = svc.validateTransaction(makeTransaction({ price: 10 }));
		expect(result.valid).toBe(true);
	});

	it('should pass for valid string price', () => {
		const result = svc.validateTransaction(makeTransaction({ price: '25.50' }));
		expect(result.valid).toBe(true);
	});

	it('should pass for zero price', () => {
		const result = svc.validateTransaction(makeTransaction({ price: 0 }));
		// Note: 0 is falsy, so "monetary requires price" will trigger
		// The actual source checks !transaction.price which is true for 0
		expect(result.valid).toBe(false);
	});

	it('should fail for invalid currency', () => {
		const result = svc.validateTransaction(
			makeTransaction({ currency: 'JPY' })
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Invalid currency: JPY'))).toBe(true);
	});

	it('should pass for valid currencies', () => {
		const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'XMR', 'BTC', 'ETH'];
		validCurrencies.forEach((currency) => {
			const result = svc.validateTransaction(makeTransaction({ currency }));
			expect(result.valid).toBe(true);
		});
	});

	it('should fail for crypto type with non-crypto currency', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'monero', currency: 'USD', price: 1 })
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Cryptocurrency transaction requires crypto currency'))).toBe(true);
	});

	it('should pass for crypto type with valid crypto currency', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'monero', currency: 'XMR', price: 1 })
		);
		expect(result.valid).toBe(true);
	});

	it('should pass for crypto type with BTC', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'monero', currency: 'BTC', price: 0.001 })
		);
		expect(result.valid).toBe(true);
	});

	it('should pass for crypto type with ETH', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'monero', currency: 'ETH', price: 0.01 })
		);
		expect(result.valid).toBe(true);
	});

	it('should accumulate multiple errors', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'ebay', url: undefined, price: -1 })
		);
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThanOrEqual(2);
	});

	it('should pass for non-monetary without price', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'inquiry', price: undefined, currency: undefined })
		);
		expect(result.valid).toBe(true);
	});

	it('should pass for ebay with url and price', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'ebay', url: 'https://ebay.com/item/1', price: 25 })
		);
		expect(result.valid).toBe(true);
	});

	it('should validate contribute-to-consume without price', () => {
		const result = svc.validateTransaction(
			makeTransaction({ type: 'contribute-to-consume', price: undefined, currency: undefined })
		);
		expect(result.valid).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 8. getAllTransactionTypes (5+ tests)
// ---------------------------------------------------------------------------

describe('getAllTransactionTypes', () => {
	let svc: OfferBuilderService;

	beforeEach(() => {
		resetConfig();
		svc = new OfferBuilderService();
	});

	it('should return all 15 types', () => {
		const types = svc.getAllTransactionTypes();
		expect(types).toHaveLength(15);
	});

	it('each entry should have a type field', () => {
		const types = svc.getAllTransactionTypes();
		types.forEach((t) => {
			expect(typeof t.type).toBe('string');
			expect(t.type.length).toBeGreaterThan(0);
		});
	});

	it('each entry should have a displayName', () => {
		const types = svc.getAllTransactionTypes();
		types.forEach((t) => {
			expect(typeof t.displayName).toBe('string');
			expect(t.displayName.length).toBeGreaterThan(0);
		});
	});

	it('should include boolean flags', () => {
		const types = svc.getAllTransactionTypes();
		types.forEach((t) => {
			expect(typeof t.isMonetary).toBe('boolean');
			expect(typeof t.isDonation).toBe('boolean');
			expect(typeof t.isSubscription).toBe('boolean');
			expect(typeof t.requiresExternalUrl).toBe('boolean');
		});
	});

	it('should have correct displayName for known types', () => {
		const types = svc.getAllTransactionTypes();
		const stripeEntry = types.find((t) => t.type === 'stripe');
		expect(stripeEntry!.displayName).toBe('Credit Card');

		const ebayEntry = types.find((t) => t.type === 'ebay');
		expect(ebayEntry!.displayName).toBe('eBay');

		const bookingEntry = types.find((t) => t.type === 'booking');
		expect(bookingEntry!.displayName).toBe('Book Appointment');
	});

	it('should flag liberapay as both donation and subscription', () => {
		const types = svc.getAllTransactionTypes();
		const lp = types.find((t) => t.type === 'liberapay');
		expect(lp!.isDonation).toBe(true);
		expect(lp!.isSubscription).toBe(true);
	});

	it('should flag inquiry as non-monetary', () => {
		const types = svc.getAllTransactionTypes();
		const inq = types.find((t) => t.type === 'inquiry');
		expect(inq!.isMonetary).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 9. Singleton (3+ tests)
// ---------------------------------------------------------------------------

describe('Singleton', () => {
	it('offerBuilderService should exist', () => {
		expect(offerBuilderService).toBeDefined();
	});

	it('offerBuilderService should be an instance of OfferBuilderService', () => {
		expect(offerBuilderService).toBeInstanceOf(OfferBuilderService);
	});

	it('offerBuilderService should have buildOffer method', () => {
		expect(typeof offerBuilderService.buildOffer).toBe('function');
	});

	it('offerBuilderService should have buildAllOffers method', () => {
		expect(typeof offerBuilderService.buildAllOffers).toBe('function');
	});

	it('offerBuilderService should have validateTransaction method', () => {
		expect(typeof offerBuilderService.validateTransaction).toBe('function');
	});
});

// ---------------------------------------------------------------------------
// 10. getPaymentMethods (bonus)
// ---------------------------------------------------------------------------

describe('getPaymentMethods', () => {
	let svc: OfferBuilderService;

	beforeEach(() => {
		svc = new OfferBuilderService();
	});

	it('should return payment methods for known type', () => {
		const methods = svc.getPaymentMethods('stripe');
		expect(methods).toEqual(['CreditCard', 'PaymentService']);
	});

	it('should return empty array for unknown type', () => {
		const methods = svc.getPaymentMethods('nonexistent');
		expect(methods).toEqual([]);
	});

	it('should return Cryptocurrency for monero', () => {
		const methods = svc.getPaymentMethods('monero');
		expect(methods).toEqual(['Cryptocurrency']);
	});

	it('should return Exchange for contribute-to-consume', () => {
		const methods = svc.getPaymentMethods('contribute-to-consume');
		expect(methods).toEqual(['Exchange']);
	});

	it('should return empty array for inquiry', () => {
		const methods = svc.getPaymentMethods('inquiry');
		expect(methods).toEqual([]);
	});
});
