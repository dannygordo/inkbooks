module.exports.validateRegisterInput = (
  username,
  email,
  password,
  confirmPassowrd,
  role
) => {
  const errors = {};
  if (username.trim() === "") {
    errors.username = "Username must not be empty";
  }
  if (email.trim() === "") {
    errors.email = "Email must not be empty.";
  } else {
    const regEx =
      /^([0-9a-zA-Z]([-.\w]*[0-9a-zA-Z])*@([0-9a-zA-Z][-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,9})$/;
    if (!email.match(regEx)) {
      errors.email =
        "Email must be a valid email address, jonsnow@kingofthenorth.com";
    }
  }
  if (password.trim() === "") {
    errors.password = "Password must not be empty";
  } else if (password !== confirmPassowrd) {
    errors.confirmPassowrd = "Passwords must match";
  }
  if (!role || role < 1) {
    errors.role = "Invalid role assignment";
  }

  return {
    errors,
    valid: Object.keys(errors).length < 1,
  };
};

module.exports.validateLoginInput = (username, password) => {
  const errors = {};
  if (username.trim() === "") {
    errors.username = "Username must not be empty";
  }
  if (password.trim() === "") {
    errors.password = "Password must not be empty";
  }
  return {
    errors,
    valid: Object.keys(errors).length < 1,
  };
};
