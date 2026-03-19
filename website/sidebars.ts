import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
	docsSidebar: [
		'intro',
		{
			type: 'category',
			label: 'Onboarding',
			collapsed: false,
			items: ['onboarding/choose-your-task', 'onboarding/local-development', 'onboarding/repository-map']
		},
		{
			type: 'category',
			label: 'Architecture',
			collapsed: false,
			items: [
				'architecture/runtime-overview',
				'architecture/discord-execution-model',
				'architecture/data-and-storage',
				'architecture/logging-and-observability'
			]
		},
		{
			type: 'category',
			label: 'Workflows',
			collapsed: false,
			items: ['features/event-system', 'features/division-and-membership']
		},
		{
			type: 'category',
			label: 'Contributing',
			collapsed: false,
			items: ['contributing/adding-features', 'contributing/release-workflow', 'contributing/production-deployment']
		}
	]
};

export default sidebars;
