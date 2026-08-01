import React from "react";
import ReactDOM from "react-dom";
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
import SimpleReactLightbox from "simple-react-lightbox";
import { io } from "socket.io-client";
import { APP_SETTINGS_CONSTANTS } from "./constants";
import { AuthProvider } from "./context/auth";

const httpLink = createHttpLink({
	// Vite doesn't polyfill Node's process.env - it exposes mode via import.meta.env.MODE
	// instead, which is "development" under the dev server and "production" for a real build,
	// matching CRA's process.env.NODE_ENV values exactly, so this uppercased lookup still works
	// unchanged against APP_SETTINGS_CONSTANTS's PRODUCTION/DEVELOPMENT keys.
	uri: APP_SETTINGS_CONSTANTS[`${import.meta.env.MODE.toUpperCase()}`].GRAPHQL_SERVER_URL,
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

ReactDOM.render(
	<ApolloProvider client={client}>
		<BrowserRouter>
			<AuthProvider>
				<SimpleReactLightbox>
					<App />
				</SimpleReactLightbox>
			</AuthProvider>
		</BrowserRouter>
	</ApolloProvider>,
	document.getElementById("root")
);
