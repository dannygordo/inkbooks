import type { CodegenConfig } from "@graphql-codegen/cli";

// Schema source of truth is the server's real typeDefs - no separate SDL file to keep in sync.
// graphql-tag-pluck (codegen's default JS/TS schema loader) statically extracts the gql``
// tagged template from typeDefs.js without executing server code, so this package never needs
// the server's runtime dependencies installed.
const config: CodegenConfig = {
	schema: "../../server/graphql/typeDefs.js",
	documents: "src/operations/**/*.graphql",
	generates: {
		"src/generated/graphql.tsx": {
			plugins: [
				"typescript",
				"typescript-operations",
				"typescript-react-apollo",
			],
			config: {
				withHooks: true,
				withHOC: false,
				withComponent: false,
				// Field names come straight off Mongoose documents server-side (id, artistId, ...)
				// and are frequently optional/nullable in practice (see ProjectService.js's own
				// selections) - avoidOptionals off matches the schema's actual nullability rather
				// than forcing every field non-optional and fighting the generated types.
				scalars: {
					Date: "string",
					DateTime: "string",
				},
			},
		},
	},
};

export default config;
