import { useRef, useState, useContext } from "react";
import "./register.css";
import { useNavigate } from "react-router-dom";
import {CircularProgress} from "@material-ui/core";
import { ROUTE_CONSTANTS } from '../../constants';
import { gql, useMutation } from "@apollo/client";
import { AuthContext } from "../../context/auth";

const Register = () => {
  const context = useContext(AuthContext);
	const username = useRef();
	const email = useRef();
	const password = useRef();
	const confirmPassword = useRef();
	const navigate = useNavigate();
  const [errors, setErrors] = useState({});

  const REGISTER_USER = gql`
    mutation register(
      $username: String!
      $email: String!
      $password: String!
      $confirmPassword: String!
      $role: Int!
    ) {
      register(
        registerInput: {
          email: $email
          username: $username
          password: $password
          confirmPassword: $confirmPassword
          role: $role
        }
      ){
        id
        email
        username
        role
        accessToken
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
    confirmPassword.current.setCustomValidity("Passwords do not match!!");
  } else {
    const user = {
      username: username.current.value,
      email: email.current.value,
      password: password.current.value,
      role: 30 //TODO remove this hardcoded value
    };
    registerUser({variables: {
      username: username.current.value,
      email: email.current.value,
      password: password.current.value,
      confirmPassword: confirmPassword.current.value,
      role: 30
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
							placeholder="Username"
							ref={username}
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