import "./login.css";
// Explicit React import - the real `vite build`/`vite dev` pipeline uses @vitejs/plugin-react's
// automatic JSX runtime and never needed this, but Vitest renders this component via a transform
// path that doesn't pick up the automatic runtime the same way (confirmed: an esbuild.jsx config
// override in vite.config.js had no effect, since plugin-react transforms JSX via Babel, not
// esbuild), throwing "React is not defined" without this import. See Login.test.jsx.
import { useRef, useState, useContext } from "react";
import React from "react";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import { gql, useMutation } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/auth";
import { DialogContentText, CircularProgress } from "@mui/material";

const Login = () => {
	const context = useContext(AuthContext);
	const email = useRef();
	const password = useRef();
	const navigate = useNavigate();

	const LOGIN_USER = gql`
		mutation login($username: String!, $password: String!) {
			login(username: $username, password: $password) {
				id
				email
				username
				firstName
				lastName
				avatar
				role
				accessToken
				firebaseToken
				userType
				tagColor
				userInfo {
					... on Artist {
						avatar
						id
						firstName
						lastName
						hourlyRate
						shop {
							id
							name
							website
						}
					}
					... on Client {
						avatar
						id
						firstName
						lastName
					}
					... on Staff {
						avatar
						id
						firstName
						lastName
						title
						shop {
							id
							name
							website
						}
					}
				}
			}
		}
	`;

	const [loginUser, { data, loading, error }] = useMutation(LOGIN_USER, {
		update(_, { data: { login: userData } }) {
			context.login(userData);
			navigate(ROUTE_CONSTANTS.HOME);
		},
		onError(err) {
			console.log(err);
			context.setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
			//console.log(err.graphQLErrors[0].extensions.errors);
		},
	});

	const handleLogin = (e) => {
		e.preventDefault();
		loginUser({
			variables: {
				username: email.current.value,
				password: password.current.value,
			},
		});
	};

	return (
		<div className="login">
			<form className="loginForm" onSubmit={handleLogin}>
				<input
					type="text"
					placeholder="email"
					className="loginInput"
					ref={email}
				/>
				<input
					type="password"
					placeholder="password"
					className="loginInput"
					ref={password}
				/>
				<button className="loginButton" type="submit">
					{loading ? (
						<CircularProgress color="inherit" size="20px" />
					) : (
						"Login In"
					)}
				</button>
				<Link to="/resetPassword">
					<div className="loginForgotContainer">
						<div className="loginForgot">
							Forgot Password?
						</div>
					</div>
				</Link>
				<Link to="/register">
					<button className="loginRegisterButton">
						{loading ? (
							<CircularProgress color="inherit" size="20px" />
						) : (
							"Create a New Account"
						)}
					</button>
				</Link>
			</form>
		</div>
	);
};

export default Login;
