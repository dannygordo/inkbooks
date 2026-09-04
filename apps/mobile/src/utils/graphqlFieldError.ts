import type { ApolloError } from '@apollo/client';

/**
 * Reads a per-field validation message off an ApolloError, for the `UserInputError('Errors', {
 * errors: { <field>: '...' } })` shape this server uses on account-creation and booking-slug
 * collisions (server/graphql/mutations/accounts.js's assertEmailAvailable/createArtistAccount,
 * server/utils/booking-slug.js's assertSlugAvailable). The top-level `err.message` in that shape
 * is the literal, useless word "Errors" - the real message lives in
 * `graphQLErrors[0].extensions.errors[field]`, same place `settings/your-link.tsx` (X42) already
 * reads it from for the same server-side error shape on the same field.
 *
 * Third call site for this exact read (your-link.tsx's inline copy was the first two, on the same
 * bookingSlug field) - pulled out once a third caller needed the identical few lines, same
 * "extract once a second/third caller shows up" reasoning as PillRow's own X37 extraction. Falls
 * back to `err.message` when the named field has no specific message, so a genuinely different
 * failure (network error, an unrelated server error) still shows something rather than nothing.
 */
export function fieldError(err: unknown, field: string): string {
	const apolloError = err as ApolloError;
	const fieldErrors = apolloError?.graphQLErrors?.[0]?.extensions?.errors as
		| Record<string, string>
		| undefined;
	return fieldErrors?.[field] ?? apolloError?.message ?? 'Something went wrong.';
}

/**
 * The full field-error map, when a caller needs to check more than one field at once (the
 * account-creation mutations only ever set one key today - `email` - but a form with several
 * validated fields shouldn't assume that stays true).
 */
export function fieldErrors(err: unknown): Record<string, string> | undefined {
	const apolloError = err as ApolloError;
	return apolloError?.graphQLErrors?.[0]?.extensions?.errors as Record<string, string> | undefined;
}
