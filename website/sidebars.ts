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
		'api/deployment-readiness',
		'features/event-system',
		'features/division-and-membership',
		'contributing/change-guide',
		'contributing/release-process',
		'operations/release-and-deploy',
		'operations/production-deployment',
		'operations/recovery',
		'operations/redis-and-queues',
		'operations/dependency-audits'
	]
};

export default sidebars;
