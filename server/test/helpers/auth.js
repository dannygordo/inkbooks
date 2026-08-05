// Mirrors resolvers/users.js's generateToken() exactly - same payload shape (id/email/role), same
// secret env var, same algorithm - so a test-signed token is indistinguishable from one the real
// login/register mutations would issue.
const jwt = require('jsonwebtoken');

function signTestToken(user) {
	return jwt.sign(
		{
			id: user.id || user._id.toString(),
			email: user.email,
			role: user.role,
		},
		process.env.SECRET_KEY,
		{ expiresIn: '5d', algorithm: 'HS256' },
	);
}

module.exports = { signTestToken };
