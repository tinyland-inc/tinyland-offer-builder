




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

				
				const priceSpec =
					mapping.isMonetary && transaction.price
						? this.buildPriceSpec(
								transaction.price,
								transaction.currency || 'USD',
								mapping
							)
						: undefined;

				
				const availability =
					transaction.availability || mapping.defaultAvailability;

				
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

				
				if (mapping.isMonetary && transaction.price) {
					offer.price = transaction.price;
					offer.priceCurrency = transaction.currency || 'USD';
					offer.priceSpecification = priceSpec;
				}

				
				if (transaction.url) {
					offer.externalUrl = transaction.url;
				}

				
				offer.seller = {
					'@type': 'Organization',
					name: 'Tinyland',
					url: baseUrl
				};

				
				offer.itemOffered = {
					'@type': 'Product',
					name: productName,
					description: fm.description as string | undefined,
					url: `${baseUrl}/products/${product.slug}`,
					image: fm.image as string | undefined
				};

				
				if (!mapping.isMonetary) {
					offer.requiresAction = this.getRequiredAction(transaction.type);
				}

				span.setStatus({ code: 1 }); 
				return offer;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: 2, message: (error as Error).message }); 
				throw error;
			} finally {
				span.end();
			}
		});
	}

	


	buildAllOffers(product: ProductItem, baseUrl: string): SchemaOffer[] {
		return this.tracer.startActiveSpan('OfferBuilderService.buildAllOffers', (span) => {
			try {
				span.setAttribute('product.slug', product.slug);

				const fm = product.frontmatter;
				const transactions = (fm.transactions as TransactionConfig[]) || [];

				
				const enabledTransactions = transactions
					.filter((t) => t.enabled)
					.sort((a, b) => (b.priority || 0) - (a.priority || 0));

				const offers = enabledTransactions.map((t) =>
					this.buildOffer(product, t, baseUrl)
				);

				span.setAttribute('offers.count', offers.length);
				span.setStatus({ code: 1 }); 
				return offers;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: 2, message: (error as Error).message }); 
				throw error;
			} finally {
				span.end();
			}
		});
	}

	


	offerToActivityPubAttachment(offer: SchemaOffer): {
		type: 'PropertyValue';
		name: string;
		value: string;
	} {
		const mapping = TRANSACTION_MAPPINGS[offer.transactionType];
		let value = offer.name;

		
		if (mapping?.isMonetary && offer.price) {
			value += ` - ${offer.price} ${offer.priceCurrency}`;
		}

		
		if (offer.externalUrl) {
			value += ` (${offer.externalUrl})`;
		}

		return {
			type: 'PropertyValue',
			name: this.getTransactionDisplayName(offer.transactionType),
			value
		};
	}

	


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

		
		if (!mapping.isCryptocurrency) {
			spec.valueAddedTaxIncluded = false;
		}

		return spec;
	}

	


	getPaymentMethods(transactionType: string): PaymentMethod[] {
		const mapping = TRANSACTION_MAPPINGS[transactionType];
		return mapping?.paymentMethods || [];
	}

	


	validateTransaction(transaction: TransactionConfig): ValidationResult {
		const errors: string[] = [];

		
		const mapping = TRANSACTION_MAPPINGS[transaction.type];
		if (!mapping) {
			errors.push(`Unknown transaction type: ${transaction.type}`);
			return { valid: false, errors };
		}

		
		if (mapping.requiresExternalUrl && !transaction.url) {
			errors.push(
				`Transaction type "${transaction.type}" requires an external URL`
			);
		}

		
		if (transaction.url) {
			try {
				new URL(transaction.url);
			} catch {
				errors.push(`Invalid URL format: ${transaction.url}`);
			}
		}

		
		if (mapping.isMonetary && !transaction.price) {
			errors.push(
				`Monetary transaction type "${transaction.type}" requires a price`
			);
		}

		
		if (transaction.price !== undefined) {
			const priceValue =
				typeof transaction.price === 'string'
					? parseFloat(transaction.price)
					: transaction.price;

			if (isNaN(priceValue) || priceValue < 0) {
				errors.push(`Invalid price: ${transaction.price}`);
			}
		}

		
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

	


	private getRequiredAction(transactionType: string): string {
		const actions: Record<string, string> = {
			inquiry: 'contact',
			repository: 'view-source',
			documentation: 'read-docs',
			'contribute-to-consume': 'contribute'
		};
		return actions[transactionType] || 'visit';
	}

	


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


export const offerBuilderService = new OfferBuilderService();
