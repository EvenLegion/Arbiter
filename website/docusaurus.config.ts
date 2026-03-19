import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
	title: 'Arbiter Docs',
	tagline: 'Onboarding, architecture, and contribution guide for the Even Legion Discord bot',
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
				}
			]
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'Start Here',
					items: [
						{
							label: 'Intro',
							to: '/'
						},
						{
							label: 'Getting Started',
							to: '/onboarding/getting-started'
						},
						{
							label: 'System Guide',
							to: '/architecture/system-guide'
						}
					]
				},
				{
					title: 'Workflows',
					items: [
						{
							label: 'Event And Merit',
							to: '/features/event-system'
						},
						{
							label: 'Membership And Identity',
							to: '/features/division-and-membership'
						}
					]
				},
				{
					title: 'Contributing',
					items: [
						{
							label: 'Contributor Guide',
							to: '/contributing/change-guide'
						},
						{
							label: 'Operations',
							to: '/operations/release-and-deploy'
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
