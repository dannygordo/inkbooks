import React, {useReducer, createContext} from 'react';
import jwtDecode from 'jwt-decode';
import { CacheService } from '../services/CacheService';

const initialState = {
    user: null
}
if(CacheService.getItem('token')) {
    const token = jwtDecode(CacheService.getItem('token').accessToken);

    if(token.exp * 1000 < Date.now()) {
        CacheService.removeItem('token');
    } else {
        initialState.user = token;
    }
}

const AuthContext = createContext({
    user: null,
    login: (userData) => {

    },
    logout: () => {

    }
});

function authReducer(state, action) {
    switch(action.type) {
        case 'LOGIN':
            return {
                ...state,
                user: action.payload
            }
            case 'LOGOUT':
                return {
                    ...state,
                    user: null
                }
        default:
            return state;
    }
}

function AuthProvider(props) {
    const [state, dispatch] = useReducer(authReducer, initialState);

    const login = (userData) => {
        CacheService.setItem('token', JSON.stringify(userData));
        dispatch({
            type: 'LOGIN',
            payload: userData
        });
    }

    const logout = () => {
        CacheService.removeItem('token');
        dispatch({type: 'LOGOUT'});
    }

    return (
        <AuthContext.Provider
        value={{user: state.user, login, logout}}
        {...props} />
    )
}

export { AuthContext, AuthProvider };
