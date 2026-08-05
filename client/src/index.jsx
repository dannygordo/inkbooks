import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {
	ApolloClient,
	InMemoryCache,
	ApolloProvider,
	createHttpLink,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { BrowserRouter } from "react-router-dom";
import { CacheService } from "./services/CacheService";
import { io } from "socket.io-client";
import { apiBaseUrl } from "./utils/apiUrl";
import { AuthProvider } from "./context/auth";

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
	link: authLink.concat(httpLink),
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
const root = createRoot(document.getElementById("root"));
root.render(
	<ApolloProvider client={client}>
		<BrowserRouter>
			<AuthProvider>
				<App />
			</AuthProvider>
		</BrowserRouter>
	</ApolloProvider>
);
