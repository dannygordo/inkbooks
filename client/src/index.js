import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  createHttpLink
} from "@apollo/client";
import { setContext } from '@apollo/client/link/context';
import { BrowserRouter } from 'react-router-dom';
import { CacheService } from './services/CacheService';
import SimpleReactLightbox from 'simple-react-lightbox';

const httpLink = createHttpLink({
  uri: 'http://localhost:5000/',
});
const authLink = setContext((_, { headers }) => {
  // get the authentication token from local storage if it exists
  const token = CacheService.getItem('token');
  // return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token.accessToken}` : "",
    }
  }
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  name: 'Inkbooks'
});

ReactDOM.render(
  <ApolloProvider client={client}>
    <BrowserRouter>
      <SimpleReactLightbox>
        <App />
      </SimpleReactLightbox>
    </BrowserRouter>
  </ApolloProvider>,
  document.getElementById('root')
);
