const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
	{
		files: ['**/*.{ts,tsx,js,jsx}'],
		ignores: ['node_modules/**', 'dist/**', 'docs/**'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': tseslint
		},
		rules: {
			...tseslint.configs.recommended.rules
		}
	},
	{
		files: ['src/lib/services/**/*.{ts,tsx,js,jsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'../features/*',
								'../../features/*',
								'../../../features/*',
								'../../../../features/*',
								'../../../../../features/*'
							],
							message:
								'Shared service modules should not import from src/lib/features. Move shared logic into src/lib/services or another neutral module.'
						}
					]
				}
			]
		}
	}
];
