/**
 * Dependency injection configuration for the OfferBuilder package.
 * Provides a tracer interface compatible with OpenTelemetry
 * with a no-op default for framework-agnostic usage.
 */

export interface Span {
	setAttribute(key: string, value: string | number | boolean): void;
	setStatus(status: { code: number; message?: string }): void;
	recordException(error: Error): void;
	end(): void;
}

export interface Tracer {
	startActiveSpan<T>(name: string, fn: (span: Span) => T): T;
}

const noopSpan: Span = {
	setAttribute: () => {},
	setStatus: () => {},
	recordException: () => {},
	end: () => {},
};

const noopTracer: Tracer = {
	startActiveSpan: <T>(_name: string, fn: (span: Span) => T): T => fn(noopSpan),
};

export { noopTracer, noopSpan };

export interface OfferBuilderConfig {
	tracer?: Tracer;
}

let _config: OfferBuilderConfig = {};

export function configure(config: Partial<OfferBuilderConfig>): void {
	_config = { ..._config, ...config };
}

export function getConfig(): OfferBuilderConfig {
	return { ..._config };
}

export function resetConfig(): void {
	_config = {};
}
