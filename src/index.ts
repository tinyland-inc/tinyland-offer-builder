/**
 * @tinyland-inc/tinyland-offer-builder
 *
 * Schema.org Offer builder for ActivityPub commerce federation.
 * Framework-agnostic with dependency-injected tracing.
 */

// Types
export type {
	OfferAvailability,
	PaymentMethod,
	PriceSpecification,
	SchemaOffer,
	TransactionMapping,
	TransactionConfig,
	ValidationResult,
	ProductItem
} from './types.js';

// Config / DI
export type { Tracer, Span, OfferBuilderConfig } from './config.js';
export { configure, getConfig, resetConfig, noopTracer, noopSpan } from './config.js';

// Transaction mappings and helpers
export {
	TRANSACTION_MAPPINGS,
	getTransactionMapping,
	requiresExternalUrl,
	isMonetary,
	getSupportedTransactionTypes
} from './transaction-mappings.js';

// Service
export { OfferBuilderService, offerBuilderService } from './offer-builder.js';
