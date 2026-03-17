import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
	title: 'Arbiter Docs',
	tagline: 'Architecture and onboarding guide for the Even Legion Discord bot',
	url: 'https://evenlegion.github.io',
	baseUrl: '/Arbiter/',
	onBrokenLinks: 'throw',
	favicon: 'img/arbiter-mark.svg',
	organizationName: 'EvenLegion',
	projectName: 'Arbiter',
	trailingSlash: false,
	markdown: {
		mermaid: true,
		hooks: {
			onBrokenMarkdownLinks: 'throw'
		}
	},
	themes: ['@docusaurus/theme-mermaid'],
	presets: [
		[
			'classic',
			{
				docs: {
					routeBasePath: '/',
					sidebarPath: './sidebars.ts',
					editUrl: 'https://github.com/EvenLegion/Arbiter/tree/main/website/'
				},
				blog: false,
				theme: {}
			} satisfies Preset.Options
		]
	],
	themeConfig: {
		image: 'img/arbiter-mark.svg',
		navbar: {
			title: 'Arbiter Docs',
			items: [
				{
					type: 'docSidebar',
					sidebarId: 'docsSidebar',
					position: 'left',
					label: 'Docs'
				},
				{
					href: 'https://github.com/EvenLegion/Arbiter',
					label: 'GitHub',
					position: 'right'
				},
				{
					href: 'https://github.com/EvenLegion/Arbiter/tree/main/docs-old',
					label: 'Legacy Notes',
					position: 'right'
				}
			]
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'Onboarding',
					items: [
						{
							label: 'Choose Your Task',
							to: '/onboarding/choose-your-task'
						},
						{
							label: 'Intro',
							to: '/'
						},
						{
							label: 'Local Development',
							to: '/onboarding/local-development'
						},
						{
							label: 'Repository Map',
							to: '/onboarding/repository-map'
						}
					]
				},
				{
					title: 'Architecture',
					items: [
						{
							label: 'Runtime Overview',
							to: '/architecture/runtime-overview'
						},
						{
							label: 'Discord Execution Model',
							to: '/architecture/discord-execution-model'
						},
						{
							label: 'Data and Storage',
							to: '/architecture/data-and-storage'
						},
						{
							label: 'Vocabulary',
							to: '/architecture/vocabulary'
						}
					]
				},
				{
					title: 'Reference',
					items: [
						{
							label: 'Vocabulary',
							to: '/architecture/vocabulary'
						},
						{
							label: 'Command Catalog',
							to: '/reference/command-and-interaction-catalog'
						},
						{
							label: 'Aggregate Reference',
							to: '/reference/aggregate-reference'
						}
					]
				},
				{
					title: 'Contributing',
					items: [
						{
							label: 'Adding Features',
							to: '/contributing/adding-features'
						},
						{
							label: 'Maintaining Docs',
							to: '/contributing/maintaining-docs'
						},
						{
							label: 'Testing and Refactors',
							to: '/contributing/testing-and-refactors'
						}
					]
				}
			],
			copyright: `Copyright ${new Date().getFullYear()} Even Legion`
		},
		prism: {
			additionalLanguages: ['bash', 'diff', 'json', 'yaml']
		}
	} satisfies Preset.ThemeConfig
};

export default config;
