const { z } = require('zod');

// Replaces the hand-rolled utils/validators.js. That file had a real, silent bug: register()
// called validateRegisterInput(...) with 10 arguments (including tagColor), but the function's
// signature only accepted 9 - the extra argument was dropped with no error, and tagColor went
// completely unvalidated. A schema-based approach like this doesn't have that failure mode: an
// unexpected/extra field either has an explicit place in the schema or it doesn't exist at all.

const loginInputSchema = z.object({
  username: z.string().trim().min(1, 'Username must not be empty'),
  password: z.string().min(1, 'Password must not be empty'),
});

// NOTE: role/userType are deliberately not part of this schema. Public self-registration always
// hardcodes both to Client server-side (see resolvers/users.js register()) - see
// PRODUCTION_ROADMAP.md Phase 1, item 3 for why that's a security fix, not an oversight.
const registerInputSchema = z
  .object({
    username: z.string().trim().min(1, 'Username must not be empty'),
    email: z
      .string()
      .trim()
      .min(1, 'Email must not be empty.')
      .email('Email must be a valid email address, e.g. jonsnow@kingofthenorth.com'),
    firstName: z.string().trim().min(1, 'First name must not be empty'),
    lastName: z.string().trim().min(1, 'Last name must not be empty'),
    avatar: z.string().optional(),
    // The old validator never enforced a minimum password length at all - only a cosmetic
    // minLength="6" on the client's HTML input, which does nothing against a direct API call.
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    tagColor: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });

const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password must not be empty'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

/**
 * Runs a zod schema against input and returns { valid, errors } - the same shape
 * utils/validators.js used to produce by hand, and the shape the client already expects to read
 * off err.graphQLErrors[0].extensions.errors (see client/src/pages/register/Register.js). Keeps
 * every call site that used the old validators working the same way; only the validation logic
 * itself changed.
 */
function validate(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) {
    return { valid: true, errors: {}, data: result.data };
  }
  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] || 'general';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { valid: false, errors, data: null };
}

module.exports = {
  loginInputSchema,
  registerInputSchema,
  changePasswordInputSchema,
  validate,
};
