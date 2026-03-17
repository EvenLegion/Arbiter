import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
	docsSidebar: [
		'intro',
		{
			type: 'category',
			label: 'Onboarding',
			items: ['onboarding/choose-your-task', 'onboarding/local-development', 'onboarding/repository-map']
		},
		{
			type: 'category',
			label: 'Architecture',
			items: [
				'architecture/runtime-overview',
				'architecture/discord-execution-model',
				'architecture/discord-extension-patterns',
				'architecture/data-and-storage',
				'architecture/logging-and-observability',
				'architecture/prisma-integration',
				'architecture/service-dependency-design'
			]
		},
		{
			type: 'category',
			label: 'Features',
			items: [
				{
					type: 'category',
					label: 'Event System',
					items: [
						'features/event-system',
						'features/event-session-lifecycle',
						'features/event-review-and-finalization',
						'features/event-attendance-tracking',
						'features/event-discord-presentation'
					]
				},
				'features/merit-system',
				'features/name-change-workflow',
				'features/division-and-membership',
				'features/guild-member-automation',
				'features/operational-tooling'
			]
		},
		{
			type: 'category',
			label: 'Reference',
			items: ['architecture/vocabulary', 'reference/command-and-interaction-catalog', 'reference/aggregate-reference']
		},
		{
			type: 'category',
			label: 'Contributing',
			items: [
				'contributing/adding-features',
				'contributing/testing-and-refactors',
				'contributing/release-workflow',
				'contributing/production-deployment',
				'contributing/maintaining-docs'
			]
		}
	]
};

export default sidebars;
