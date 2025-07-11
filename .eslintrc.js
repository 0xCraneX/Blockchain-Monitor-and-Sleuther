module.exports = {
  env: {
    node: true,
    es2022: true,
    browser: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Code Quality
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }],
    'no-console': ['warn', { 
      allow: ['warn', 'error'] 
    }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-void': 'error',
    'no-with': 'error',
    
    // Best Practices
    'curly': ['error', 'all'],
    'eqeqeq': ['error', 'always'],
    'no-duplicate-imports': 'error',
    'no-self-compare': 'error',
    'no-template-curly-in-string': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unreachable-loop': 'error',
    'prefer-const': 'error',
    'prefer-template': 'error',
    
    // Style
    'indent': ['error', 2, { 
      SwitchCase: 1 
    }],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single', { 
      allowTemplateLiterals: true 
    }],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'brace-style': ['error', '1tbs'],
    'keyword-spacing': 'error',
    'space-before-blocks': 'error',
    'space-infix-ops': 'error',
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', { 
      max: 2, 
      maxEOF: 1 
    }],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never']
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true,
        vitest: true
      },
      globals: {
        'describe': 'readonly',
        'it': 'readonly',
        'test': 'readonly',
        'expect': 'readonly',
        'beforeEach': 'readonly',
        'afterEach': 'readonly',
        'beforeAll': 'readonly',
        'afterAll': 'readonly',
        'vi': 'readonly'
      },
      rules: {
        'no-console': 'off'
      }
    },
    {
      files: ['*.config.js', 'scripts/**/*.js'],
      env: {
        node: true
      },
      rules: {
        'no-console': 'off'
      }
    }
  ]
};