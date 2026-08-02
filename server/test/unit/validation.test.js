// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
const {
	loginInputSchema,
	registerInputSchema,
	changePasswordInputSchema,
	createAppointmentInputSchema,
	updateAppointmentInputSchema,
	validate,
} = require('../../utils/validation');

const validObjectId = '507f1f77bcf86cd799439011';

describe('validate() helper', () => {
	it('returns { valid: true, data } for a schema that passes', () => {
		const result = validate(loginInputSchema, { username: 'gordo', password: 'hunter2' });
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual({});
		expect(result.data).toEqual({ username: 'gordo', password: 'hunter2' });
	});

	it('returns { valid: false, errors } keyed by field for a schema that fails', () => {
		const result = validate(loginInputSchema, { username: '', password: '' });
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveProperty('username');
		expect(result.errors).toHaveProperty('password');
		expect(result.data).toBeNull();
	});
});

describe('loginInputSchema', () => {
	it('rejects an empty username or password', () => {
		expect(validate(loginInputSchema, { username: '', password: 'x' }).valid).toBe(false);
		expect(validate(loginInputSchema, { username: 'x', password: '' }).valid).toBe(false);
	});
});

describe('registerInputSchema', () => {
	const base = {
		username: 'newartist',
		email: 'artist@example.com',
		firstName: 'Jon',
		lastName: 'Snow',
		password: 'longenoughpassword',
		confirmPassword: 'longenoughpassword',
	};

	it('accepts a fully valid registration payload', () => {
		expect(validate(registerInputSchema, base).valid).toBe(true);
	});

	it('rejects a password under 8 characters, even though the old validator never checked this', () => {
		const result = validate(registerInputSchema, { ...base, password: 'short1', confirmPassword: 'short1' });
		expect(result.valid).toBe(false);
	});

	it('rejects mismatched password/confirmPassword', () => {
		const result = validate(registerInputSchema, { ...base, confirmPassword: 'somethingElse123' });
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveProperty('confirmPassword');
	});

	it('rejects an invalid email address', () => {
		expect(validate(registerInputSchema, { ...base, email: 'not-an-email' }).valid).toBe(false);
	});

	it('does not accept a client-supplied role or userType (they are not part of this schema at all)', () => {
		// registerInputSchema intentionally has no `role`/`userType` fields - register() in
		// resolvers/users.js hardcodes both server-side. Passing extra fields through .safeParse
		// should not make them appear in validated output.
		const result = validate(registerInputSchema, { ...base, role: 1, userType: 'artist' });
		expect(result.valid).toBe(true);
		expect(result.data).not.toHaveProperty('role');
		expect(result.data).not.toHaveProperty('userType');
	});
});

describe('changePasswordInputSchema', () => {
	it('rejects a new password under 8 characters', () => {
		const result = validate(changePasswordInputSchema, {
			currentPassword: 'whatever',
			newPassword: 'short',
		});
		expect(result.valid).toBe(false);
	});

	it('accepts a valid current/new password pair', () => {
		const result = validate(changePasswordInputSchema, {
			currentPassword: 'whatever',
			newPassword: 'longenoughnewpassword',
		});
		expect(result.valid).toBe(true);
	});
});

describe('createAppointmentInputSchema / updateAppointmentInputSchema', () => {
	const validCreate = {
		appointmentDate: new Date().toISOString(),
		appointmentType: 'session',
		appointmentStatus: 'scheduled',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	it('accepts a minimal valid create payload (no shopId - independent artist)', () => {
		expect(validate(createAppointmentInputSchema, validCreate).valid).toBe(true);
	});

	it('rejects an appointmentType value the UI dropdown would never produce', () => {
		const result = validate(createAppointmentInputSchema, {
			...validCreate,
			appointmentType: 'literally-anything',
		});
		expect(result.valid).toBe(false);
	});

	it('rejects a shopCutStatus value outside the real enum', () => {
		const result = validate(createAppointmentInputSchema, {
			...validCreate,
			shopCutStatus: 'definitely_not_a_real_status',
		});
		expect(result.valid).toBe(false);
	});

	it('rejects a negative shopCutAmount', () => {
		const result = validate(createAppointmentInputSchema, {
			...validCreate,
			shopCutAmount: -50,
		});
		expect(result.valid).toBe(false);
	});

	it('update schema requires a valid ObjectId in id', () => {
		expect(
			validate(updateAppointmentInputSchema, {
				...validCreate,
				id: 'not-a-valid-id',
			}).valid,
		).toBe(false);
		expect(
			validate(updateAppointmentInputSchema, {
				...validCreate,
				id: validObjectId,
			}).valid,
		).toBe(true);
	});
});
