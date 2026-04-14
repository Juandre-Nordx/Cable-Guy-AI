const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const checks = [
  {
    name: 'Login form submit wiring',
    file: 'client/login.js',
    includes: ["getElementById('login-form')", "form.addEventListener('submit'", "fetch('/auth/login'" ]
  },
  {
    name: 'Register form submit wiring',
    file: 'client/register.js',
    includes: ["getElementById('register-form')", "form.addEventListener('submit'", "fetch('/auth/register'", 'redirectAfterAuth(payload);' ],
    exactCounts: [
      { pattern: "form.addEventListener('submit'", count: 1 }
    ]
  },
  {
    name: 'Store details modal controls',
    file: 'client/store.js',
    includes: ["#close-details-modal", "#cancel-details-modal", "add-to-cart-btn", 'openDetails(']
  },
  {
    name: 'Cart checkout flow controls',
    file: 'client/cart.js',
    includes: ["#checkout-btn", "#confirm-checkout-btn", "fetch('/orders'", 'openCheckoutModal()']
  },
  {
    name: 'Dashboard wizard controls',
    file: 'client/dashboard.js',
    includes: ['loadWizardTree()', "getElementById('wizard-reset')", 'renderCurrentWizardNode']
  },
  {
    name: 'AI wizard + booking controls',
    file: 'client/ai.js',
    includes: ["getElementById('booking-form')", "fetch('/ai/wizard/tree')", "fetch('/bookings'", "id=\"book-teck\""],
    source: 'composed'
  }
];

let failures = 0;

for (const check of checks) {
  const content = read(check.file);
  let localFailures = 0;

  for (const token of check.includes || []) {
    if (!content.includes(token)) {
      console.error(`✗ ${check.name}: missing token ${token} in ${check.file}`);
      failures += 1;
      localFailures += 1;
    }
  }

  for (const rule of check.exactCounts || []) {
    const actual = content.split(rule.pattern).length - 1;
    if (actual !== rule.count) {
      console.error(
        `✗ ${check.name}: expected ${rule.count} occurrence(s) of ${rule.pattern} in ${check.file}, found ${actual}`
      );
      failures += 1;
      localFailures += 1;
    }
  }

  if (!localFailures) {
    console.log(`✓ ${check.name}`);
  }
}

const htmlChecks = [
  {
    name: 'Store modal buttons exist in HTML',
    file: 'client/store.html',
    includes: ['id="close-details-modal"', 'id="cancel-details-modal"', 'id="detailsModal"']
  },
  {
    name: 'Cart modal buttons exist in HTML',
    file: 'client/cart.html',
    includes: ['id="checkout-btn"', 'id="confirm-checkout-btn"', 'id="cancel-checkout-btn"']
  },
  {
    name: 'AI booking controls exist in HTML',
    file: 'client/ai.html',
    includes: ['id="booking-form"', 'id="booking-submit-button"', 'id="wizard-reset"']
  }
];

for (const check of htmlChecks) {
  const content = read(check.file);
  let localFailures = 0;

  for (const token of check.includes) {
    if (!content.includes(token)) {
      console.error(`✗ ${check.name}: missing token ${token} in ${check.file}`);
      failures += 1;
      localFailures += 1;
    }
  }

  if (!localFailures) {
    console.log(`✓ ${check.name}`);
  }
}

if (failures > 0) {
  console.error(`\nSmoke check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nSmoke check passed. Key button/process wiring is present.');
