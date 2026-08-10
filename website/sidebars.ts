import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
	docsSidebar: [
		'intro',
		'onboarding/getting-started',
		{
			type: 'category',
			label: 'Local Development',
			items: [
				'local-development/environment-and-services',
				'local-development/database-and-data',
				'local-development/testing-and-validation',
				'local-development/troubleshooting'
			]
		},
		'architecture/system-guide',
		'api/standalone-api',
		'api/staff-portal',
		'features/event-system',
		'features/division-and-membership',
		'contributing/change-guide',
		'operations/release-and-deploy'
	]
};

export default sidebars;
