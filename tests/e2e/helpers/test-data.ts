export const TEST_BASE_URL = 'http://localhost:5000';

export const TEST_CREDENTIALS = {
  owner: { username: 'owner', password: 'demo123' },
  manager: { username: 'manager', password: 'demo123' },
  waiter: { username: 'waiter', password: 'demo123' },
  kitchen: { username: 'kitchen', password: 'demo123' },
  accountant: { username: 'accountant', password: 'demo123' },
};

export const INVALID_CREDENTIALS = {
  username: 'owner',
  password: 'wrongpassword123',
};
