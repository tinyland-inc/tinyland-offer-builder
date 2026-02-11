/**
 * OfferBuilderService - Builds Schema.org Offers from transaction configurations.
 * Framework-agnostic: uses DI for tracing instead of SvelteKit imports.
 */

import { getConfig, noopTracer } from './config.js';
import { TRANSACTION_MAPPINGS } from './transaction-mappings.js';
import type {
	SchemaOffer,
	TransactionMapping,
	PriceSpecification,
	PaymentMethod,
	TransactionConfig,
	ValidationResult,
	ProductItem
} from './types.js';

export class OfferBuilderService {
	private get tracer() {
		return getConfig().tracer ?? noopTracer;
	}

	/**
	 * Build schema.org Offer from transaction config
	 */
	buildOffer(
		product: ProductItem,
		transaction: TransactionConfig,
		baseUrl: string
	): SchemaOffer {
		return this.tracer.startActiveSpan('OfferBuilderService.buildOffer', (span) => {
			try {
				span.setAttribute('transaction.type', transaction.type);
				span.setAttribute('product.slug', product.slug);

				const mapping = TRANSACTION_MAPPINGS[transaction.type];
				if (!mapping) {
					throw new Error(`Unknown transaction type: ${transaction.type}`);
				}

				const fm = product.frontmatter;
				const productName = (fm.name as string) || product.title;
				const offerId = `${baseUrl}/products/${product.slug}#offer-${transaction.type}`;

				// Build price specification if monetary
				const priceSpec =
					mapping.isMonetary && transaction.price
						? this.buildPriceSpec(
								transaction.price,
								transaction.currency || 'USD',
								mapping
							)
						: undefined;

				// Determine availability
				const availability =
					transaction.availability || mapping.defaultAvailability;

				// Build offer
				const offer: SchemaOffer = {
					'@context': 'https://schema.org',
					'@type': 'Offer',
					'@id': offerId,
					name: transaction.label || `${productName} - ${transaction.type}`,
					description: transaction.description,
					url: transaction.url || `${baseUrl}/products/${product.slug}`,
					availability,
					acceptedPaymentMethod: mapping.paymentMethods,
					transactionType: transaction.type
				};

				// Add price info if monetary
				if (mapping.isMonetary && transaction.price) {
					offer.price = transaction.price;
					offer.priceCurrency = transaction.currency || 'USD';
					offer.priceSpecification = priceSpec;
				}

				// Add external URL if present
				if (transaction.url) {
					offer.externalUrl = transaction.url;
				}

				// Add seller info
				offer.seller = {
					'@type': 'Organization',
					name: 'Tinyland',
					url: baseUrl
				};

				// Add item offered
				offer.itemOffered = {
					'@type': 'Product',
					name: productName,
					description: fm.description as string | undefined,
					url: `${baseUrl}/products/${product.slug}`,
					image: fm.image as string | undefined
				};

				// Add required action hints
				if (!mapping.isMonetary) {
					offer.requiresAction = this.getRequiredAction(transaction.type);
				}

				span.setStatus({ code: 1 }); // OK
				return offer;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
				throw error;
			} finally {
				span.end();
			}
		});
	}

	/**
	 * Build all Offers for a product
	 */
	buildAllOffers(product: ProductItem, baseUrl: string): SchemaOffer[] {
		return this.tracer.startActiveSpan('OfferBuilderService.buildAllOffers', (span) => {
			try {
				span.setAttribute('product.slug', product.slug);

				const fm = product.frontmatter;
				const transactions = (fm.transactions as TransactionConfig[]) || [];

				// Filter enabled transactions and sort by priority
				const enabledTransactions = transactions
					.filter((t) => t.enabled)
					.sort((a, b) => (b.priority || 0) - (a.priority || 0));

				const offers = enabledTransactions.map((t) =>
					this.buildOffer(product, t, baseUrl)
				);

				span.setAttribute('offers.count', offers.length);
				span.setStatus({ code: 1 }); // OK
				return offers;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
				throw error;
			} finally {
				span.end();
			}
		});
	}

	/**
	 * Convert Offer to ActivityPub attachment
	 */
	offerToActivityPubAttachment(offer: SchemaOffer): {
		type: 'PropertyValue';
		name: string;
		value: string;
	} {
		const mapping = TRANSACTION_MAPPINGS[offer.transactionType];
		let value = offer.name;

		// Add price if monetary
		if (mapping?.isMonetary && offer.price) {
			value += ` - ${offer.price} ${offer.priceCurrency}`;
		}

		// Add external link if present
		if (offer.externalUrl) {
			value += ` (${offer.externalUrl})`;
		}

		return {
			type: 'PropertyValue',
			name: this.getTransactionDisplayName(offer.transactionType),
			value
		};
	}

	/**
	 * Build price specification
	 */
	private buildPriceSpec(
		price: number | string,
		currency: string,
		mapping: TransactionMapping
	): PriceSpecification {
		const priceValue = typeof price === 'string' ? parseFloat(price) : price;

		const spec: PriceSpecification = {
			'@type': mapping.isCryptocurrency
				? 'UnitPriceSpecification'
				: 'PriceSpecification',
			price: priceValue,
			priceCurrency: currency
		};

		// Add VAT info for non-crypto
		if (!mapping.isCryptocurrency) {
			spec.valueAddedTaxIncluded = false;
		}

		return spec;
	}

	/**
	 * Get payment methods for transaction type
	 */
	getPaymentMethods(transactionType: string): PaymentMethod[] {
		const mapping = TRANSACTION_MAPPINGS[transactionType];
		return mapping?.paymentMethods || [];
	}

	/**
	 * Validate transaction configuration
	 */
	validateTransaction(transaction: TransactionConfig): ValidationResult {
		const errors: string[] = [];

		// Check if type exists
		const mapping = TRANSACTION_MAPPINGS[transaction.type];
		if (!mapping) {
			errors.push(`Unknown transaction type: ${transaction.type}`);
			return { valid: false, errors };
		}

		// Check if external URL is required
		if (mapping.requiresExternalUrl && !transaction.url) {
			errors.push(
				`Transaction type "${transaction.type}" requires an external URL`
			);
		}

		// Validate URL format if present
		if (transaction.url) {
			try {
				new URL(transaction.url);
			} catch {
				errors.push(`Invalid URL format: ${transaction.url}`);
			}
		}

		// Check if monetary transaction has price
		if (mapping.isMonetary && !transaction.price) {
			errors.push(
				`Monetary transaction type "${transaction.type}" requires a price`
			);
		}

		// Validate price if present
		if (transaction.price !== undefined) {
			const priceValue =
				typeof transaction.price === 'string'
					? parseFloat(transaction.price)
					: transaction.price;

			if (isNaN(priceValue) || priceValue < 0) {
				errors.push(`Invalid price: ${transaction.price}`);
			}
		}

		// Validate currency for monetary transactions
		if (mapping.isMonetary && transaction.currency) {
			const validCurrencies = [
				'USD',
				'EUR',
				'GBP',
				'CAD',
				'AUD',
				'XMR',
				'BTC',
				'ETH'
			];
			if (!validCurrencies.includes(transaction.currency)) {
				errors.push(
					`Invalid currency: ${transaction.currency}. Must be one of: ${validCurrencies.join(', ')}`
				);
			}
		}

		// Validate cryptocurrency currency
		if (mapping.isCryptocurrency && transaction.currency) {
			const cryptoCurrencies = ['XMR', 'BTC', 'ETH'];
			if (!cryptoCurrencies.includes(transaction.currency)) {
				errors.push(
					`Cryptocurrency transaction requires crypto currency (XMR, BTC, ETH), got: ${transaction.currency}`
				);
			}
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Get required action hint for non-monetary transactions
	 */
	private getRequiredAction(transactionType: string): string {
		const actions: Record<string, string> = {
			inquiry: 'contact',
			repository: 'view-source',
			documentation: 'read-docs',
			'contribute-to-consume': 'contribute'
		};
		return actions[transactionType] || 'visit';
	}

	/**
	 * Get display name for transaction type
	 */
	private getTransactionDisplayName(transactionType: string): string {
		const names: Record<string, string> = {
			inquiry: 'Contact',
			ebay: 'eBay',
			etsy: 'Etsy',
			amazon: 'Amazon',
			'snail-mail': 'Mail Order',
			monero: 'Monero',
			stripe: 'Credit Card',
			polar: 'Polar Subscription',
			talar: 'GNU Taler',
			repository: 'Source Code',
			documentation: 'Documentation',
			booking: 'Book Appointment',
			liberapay: 'Liberapay',
			kofi: 'Ko-fi',
			'contribute-to-consume': 'Contribute to Access'
		};
		return names[transactionType] || transactionType;
	}

	/**
	 * Get all transaction types with metadata
	 */
	getAllTransactionTypes(): Array<{
		type: string;
		displayName: string;
		isMonetary: boolean;
		isDonation: boolean;
		isSubscription: boolean;
		requiresExternalUrl: boolean;
	}> {
		return Object.entries(TRANSACTION_MAPPINGS).map(([type, mapping]) => ({
			type,
			displayName: this.getTransactionDisplayName(type),
			isMonetary: mapping.isMonetary,
			isDonation: mapping.isDonation,
			isSubscription: mapping.isSubscription,
			requiresExternalUrl: mapping.requiresExternalUrl
		}));
	}
}

// Singleton instance
export const offerBuilderService = new OfferBuilderService();
