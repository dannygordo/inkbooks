// Explicit React import - the real `vite build`/`vite dev` pipeline uses @vitejs/plugin-react's
// automatic JSX runtime and never needed this, but Vitest renders this component via a transform
// path that doesn't pick up the automatic runtime the same way (confirmed: an esbuild.jsx config
// override in vite.config.js had no effect, since plugin-react transforms JSX via Babel, not
// esbuild), throwing "React is not defined" without this import. See Register.test.jsx.
import { useRef, useState, useContext } from "react";
import React from "react";
import "./register.css";
import { useNavigate } from "react-router-dom";
import {CircularProgress} from "@mui/material";
import { ROUTE_CONSTANTS } from '../../constants';
import { gql, useMutation } from "@apollo/client";
import { AuthContext } from "../../context/auth";

const Register = () => {
  const context = useContext(AuthContext);
	const email = useRef();
	const password = useRef();
	const confirmPassword = useRef();
  const firstName = useRef();
  const lastName = useRef();
  const avatar = useRef();
	const navigate = useNavigate();
  const [errors, setErrors] = useState({});

  const REGISTER_USER = gql`
    mutation register(
      $email: String!
      $firstName: String!
      $lastName: String!
      $avatar: String
      $password: String!
      $confirmPassword: String!
      $role: Int!
      $userType: String!
    ) {
      register(
        registerInput: {
          email: $email
          firstName: $firstName
          lastName: $lastName
          avatar: $avatar
          password: $password
          confirmPassword: $confirmPassword
          role: $role
          userType: $userType
        }
      ){
        id
        email
        firstName
        lastName
        avatar
        role
        accessToken
        firebaseToken
        userType
        tagColor
      }
    }
  `;

const [registerUser, {data, loading, error}] = useMutation(REGISTER_USER, {
  update(_, {data: {register: userData } }) {
    console.log(userData);
    context.login(userData);
    navigate(ROUTE_CONSTANTS.HOME);
  },
  onError(err) {
    console.log(err.graphQLErrors[0].extensions);
    setErrors(err.graphQLErrors[0].extensions.errors);
  }
});

const handleClick =  (e) => {
  e.preventDefault();
  if (confirmPassword.current.value !== password.current.value) {
    console.log(confirmPassword.current.value);
    console.log(password.current.value);
    confirmPassword.current.setCustomValidity("Passwords do not match!!");
  } else {
    // role/userType are sent here for schema completeness, but the server now hardcodes both
    // to Client for public self-registration regardless of what's sent (see
    // server/graphql/resolvers/users.js register()) - this was a real vulnerability (client-
    // supplied role let anyone register as Admin) and is fixed server-side, not by this
    // client-side value. Don't rely on this being the security boundary.
    //
    // tagColor is no longer sent at all - it used to be hardcoded to the literal '#fff' here,
    // which is exactly why every self-registered account's calendar label rendered invisibly
    // (white on white). register() now always assigns a real default itself (purple, since a
    // self-registered account has no shop - see utils/tag-color.js) regardless of what's sent, so
    // there's nothing useful for the client to contribute here either.
    registerUser({variables: {
      email: email.current.value,
      firstName: firstName.current.value,
      lastName: lastName.current.value,
      avatar: avatar.current.value,
      password: password.current.value,
      confirmPassword: confirmPassword.current.value,
      role: 30,
      userType: 'client',
    }
  });
  }
};

	return (
		<div className="register">
			<div className="registerWrapper">
				<div className="registerLeft">
					<h3 className="registerLogo">Inkbooks</h3>
					<span className="registerDesc">
            The #1 way to manage your tattoo schedule, clients, and projects
          </span>
				</div>
				<div className="registerRight">
					<form className="registerBox" onSubmit={handleClick}>
            <input
							placeholder="First Name"
							ref={firstName}
							className="registerInput"
						/>
            <input
							placeholder="Last Name"
							ref={lastName}
							className="registerInput"
						/>
            <input
							placeholder="Avatar"
							ref={avatar}
							className="registerInput"
						/>
						<input
							placeholder="Email"
							ref={email}
							className="registerInput"
							type="email"
						/>
						<input
							placeholder="Password"
							ref={password}
							className="registerInput"
							type="password"
							minLength="6"
						/>
						<input
							placeholder="Confirm Password"
							ref={confirmPassword}
							className="registerInput"
							type="password"
						/>
						<button
							className="registerButton"
							type="submit"
						>
							{ loading ? <CircularProgress color="inherit" size="20px"/> : 'Sign Up'}
						</button>
					</form>
          {/* TODO extract this functionality out into a component */}
          { Object.keys(errors).length > 0 && (
            <div className="errors">
             <ul className="list">
              {Object.values(errors).map((value) => (
                  <li key={value}>{value}</li>
                ))}
             </ul>
            </div>
          )}
				</div>
			</div>
		</div>
	);
};
export default Register;