import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import {
	ApolloClient,
	InMemoryCache,
	ApolloProvider,
	createHttpLink,
	from,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { BrowserRouter } from "react-router-dom";
import { CacheService } from "./services/CacheService";
import { io } from "socket.io-client";
import { apiBaseUrl } from "./utils/apiUrl";
import { AuthProvider } from "./context/auth";
import ThemeModeProvider from "./theme/ThemeModeProvider";

// Error monitoring (Sentry) - see server/utils/error-reporting.js's own header comment for the
// same reasoning, mirrored here for the client. NO-OPS completely with no DSN set (Sentry.init is
// simply never called), so this is safe to ship before a Sentry project exists at all - see
// .env.development/vite.config.js for where VITE_SENTRY_DSN goes. The VITE_ prefix is required -
// Vite only exposes env vars to client code when they're prefixed this way, unlike the server's
// plain SENTRY_DSN.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
	Sentry.init({
		dsn: sentryDsn,
		environment: import.meta.env.MODE,
		tracesSampleRate: 0,
	});
}

// The four codes server/utils/errors.js's AuthenticationError/UserInputError/ForbiddenError/
// RateLimitError carry - same "expected outcome of normal use, not an incident" line the server's
// own formatError hook draws (see index.js there). A component's own onError handler (there are
// several already, e.g. Login.jsx) still owns showing the user something - this link is purely an
// additional monitoring tap, not a replacement for those.
const EXPECTED_ERROR_CODES = new Set(["UNAUTHENTICATED", "BAD_USER_INPUT", "FORBIDDEN", "RATE_LIMITED"]);

const errorReportingLink = onError(({ graphQLErrors, networkError }) => {
	if (!sentryDsn) {
		return;
	}
	(graphQLErrors || []).forEach((err) => {
		if (!EXPECTED_ERROR_CODES.has(err.extensions?.code)) {
			Sentry.captureException(err);
		}
	});
	if (networkError) {
		Sentry.captureException(networkError);
	}
});

const httpLink = createHttpLink({
	// Vite doesn't polyfill Node's process.env - it exposes mode via import.meta.env.MODE
	// instead, which is "development" under the dev server and "production" for a real build,
	// matching CRA's process.env.NODE_ENV values exactly, so this uppercased lookup still works
	// unchanged against APP_SETTINGS_CONSTANTS's PRODUCTION/DEVELOPMENT keys.
	// Through apiBaseUrl() like everywhere else. This one is the app entry point and is never
	// imported by a test, so the missing-mode crash could not reach it - but leaving one direct
	// lookup behind is how the pattern comes back.
	uri: apiBaseUrl(),
});
const authLink = setContext((_, { headers }) => {
	// get the authentication token from local storage if it exists
	const token = CacheService.getItem("token");
	// return the headers to the context so httpLink can read them
	return {
		headers: {
			...headers,
			authorization: token ? `Bearer ${token.accessToken}` : "",
		},
	};
});

const client = new ApolloClient({
	// errorReportingLink first - it only observes/reports, then passes the response through
	// unchanged, same as authLink already does for the request side. Order after that is
	// unchanged from before this file added monitoring.
	link: from([errorReportingLink, authLink, httpLink]),
	cache: new InMemoryCache(),
	name: "Inkbooks",
});

// const socket = io(APP_SETTINGS_CONSTANTS.SOCKET_IO_SERVER_URL);
// socket.on('connect', () => {
//   console.log(`You connected with id: ${socket.id}`);
// });

// ReactDOM.render was removed in React 18 in favor of createRoot - this also switches the app
// onto React 18's concurrent renderer (automatic batching of state updates across timeouts/
// promises/native event handlers, not just React event handlers as in React 17). No code here
// relied on synchronous update flushing between state updates, so this is a behind-the-scenes
// upgrade, not a rewrite.
// Plain inline styles, not MUI/theme tokens - this has to render correctly even if the crash that
// triggered it happened inside ThemeModeProvider itself, which sits INSIDE this boundary.
function CrashFallback() {
	return (
		<div style={{ padding: 48, textAlign: "center", fontFamily: "sans-serif" }}>
			<h1>Something went wrong</h1>
			<p style={{ color: "#666" }}>
				The page hit an unexpected error. Reloading usually fixes it.
			</p>
			<button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 20px" }}>
				Reload
			</button>
		</div>
	);
}

const root = createRoot(document.getElementById("root"));
root.render(
	// Sentry.ErrorBoundary behaves like a plain React error boundary (renders fallback, no-op)
	// when Sentry.init was never called above - it just also reports the catch when it was.
	<Sentry.ErrorBoundary fallback={<CrashFallback />}>
		<ApolloProvider client={client}>
			<BrowserRouter>
				<AuthProvider>
					<ThemeModeProvider>
						<App />
					</ThemeModeProvider>
				</AuthProvider>
			</BrowserRouter>
		</ApolloProvider>
	</Sentry.ErrorBoundary>
);
