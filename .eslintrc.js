module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // 允许console，因为使用logger
    'no-undef': 'error',
    'no-redeclare': 'error',
    'no-unreachable': 'warn',
    'no-var': 'error',
    'prefer-const': 'warn',
    'eqeqeq': ['warn', 'always'],
    'curly': ['warn', 'all'],
    'no-throw-literal': 'warn'
  }
};

