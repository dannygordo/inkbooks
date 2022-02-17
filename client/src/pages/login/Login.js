import './login.css';
import { useRef, useState, useContext } from "react";
import {CircularProgress} from "@material-ui/core";
import { ROUTE_CONSTANTS } from '../../constants';
import { gql, useMutation } from "@apollo/client";
import {Link, useNavigate} from "react-router-dom";
import { AuthContext } from '../../context/auth';

const Login = () => {
  const context = useContext(AuthContext);
	const email = useRef();
	const password = useRef();
	const navigate = useNavigate();

  const [errors, setErrors] = useState({});

  const LOGIN_USER = gql`
    mutation login(
      $username: String!
      $password: String!
    ) {
      login(
          username: $username
          password: $password
      ){
        id
        email
        username
        role
        accessToken
      }
    }
  `;

const [loginUser, {data, loading, error}] = useMutation(LOGIN_USER, {
  update(_, {data: {login: userData } }) {
    console.log(userData);
    context.login(userData);
    navigate(ROUTE_CONSTANTS.HOME);
  },
  onError(err) {
    console.log(err);
    //console.log(err.graphQLErrors[0].extensions.errors);
    setErrors(err.graphQLErrors[0].extensions.errors);
  }
});

	const handleLogin = (e) => {
		e.preventDefault();
    loginUser({variables: {
      username: email.current.value,
      password: password.current.value,
      }
    });
	};


	return (
		<div className="login">
			<form className="loginForm" 
					onSubmit={handleLogin}>
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
					{loading ? <CircularProgress color="inherit" size="20px"/> : 'Login In'}
				</button>
        {/* TODO hook up Forgot Password functionality */}
				<span className="loginForgot">Forgot Password?</span>
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
      <div>
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
	);
};

export default Login;