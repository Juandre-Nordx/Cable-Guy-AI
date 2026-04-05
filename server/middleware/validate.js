function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateEmail(email) {
  return requiredString(email) && /^\S+@\S+\.\S+$/.test(email.trim());
}

function validateEnum(value, allowed) {
  return typeof value === 'string' && allowed.includes(value);
}

function validateNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

module.exports = {
  requiredString,
  validateEmail,
  validateEnum,
  validateNumber
};
