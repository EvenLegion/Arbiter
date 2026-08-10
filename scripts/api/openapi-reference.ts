import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import {
	API_V1_OPERATION_CONTRACTS,
	API_V1_ROUTES,
	apiV1OperationKey,
	buildApiV1OpenApiDocument,
	serializeApiV1OpenApiDocument,
	type ApiV1OperationContract
} from '../../packages/api-contracts/src/v1';

const repositoryRoot = resolve(process.cwd());
const jsonPath = resolve(repositoryRoot, 'website/static/openapi/arbiter-v1.openapi.json');
const markdownPath = resolve(repositoryRoot, 'website/docs/api/reference.md');
const mode = process.argv.includes('--write') ? 'write' : 'check';

async function main(): Promise<void> {
	await assertRuntimeSurfaceMatchesContracts();
	const document = buildApiV1OpenApiDocument();
	const prettierConfig = (await resolveConfig(jsonPath)) ?? {};
	const json = await format(serializeApiV1OpenApiDocument(document), { ...prettierConfig, filepath: jsonPath, parser: 'json' });
	const markdown = await format(renderMarkdownReference(document), { ...prettierConfig, filepath: markdownPath, parser: 'markdown' });
	assertSecretFree(json, markdown);

	if (mode === 'write') {
		await mkdir(resolve(repositoryRoot, 'website/static/openapi'), { recursive: true });
		await writeFile(jsonPath, json);
		await writeFile(markdownPath, markdown);
		console.log('Generated the Arbiter v1 OpenAPI artifact and Docusaurus reference.');
	} else {
		await assertFileMatches(jsonPath, json);
		await assertFileMatches(markdownPath, markdown);
		console.log('Arbiter v1 OpenAPI contracts, runtime routes, and published reference are in sync.');
	}
}

void main();

async function assertRuntimeSurfaceMatchesContracts(): Promise<void> {
	const [server, auth, integrations, directory] = await Promise.all([
		readFile(resolve(repositoryRoot, 'apps/api/src/http/server.ts'), 'utf8'),
		readFile(resolve(repositoryRoot, 'apps/api/src/auth/http.ts'), 'utf8'),
		readFile(resolve(repositoryRoot, 'apps/api/src/integrations/http.ts'), 'utf8'),
		readFile(resolve(repositoryRoot, 'apps/api/src/directory/http.ts'), 'utf8')
	]);
	const runtimeOperations = new Set<string>();

	assertIncludes(server, `if (path === API_V1_ROUTES.health)`, 'health route');
	assertIncludes(server, `if (path === API_V1_ROUTES.readiness)`, 'readiness route');
	assertIncludes(server, `if (request.method === 'GET' || request.method === 'HEAD') return;`, 'GET and HEAD read methods');
	assertIncludes(server, `response.setHeader('x-request-id', requestId);`, 'request ID response header');
	assertIncludes(server, `response.setHeader(API_CONTRACT_VERSION_HEADER, API_CONTRACT_VERSION);`, 'contract version response header');
	add(runtimeOperations, 'get', API_V1_ROUTES.health);
	add(runtimeOperations, 'head', API_V1_ROUTES.health);
	add(runtimeOperations, 'get', API_V1_ROUTES.readiness);
	add(runtimeOperations, 'head', API_V1_ROUTES.readiness);

	for (const [route, method] of [
		['authDiscordStart', `requireMethod(request, response, ['POST']);`],
		['authDiscordCallback', `requireMethod(request, response, ['GET']);`],
		['authSession', `requireMethod(request, response, ['GET']);`],
		['authIdentity', `requireMethod(request, response, ['GET']);`]
	] as const) {
		assertRouteBlock(auth, route, method);
	}
	assertIncludes(auth, `API_V1_ROUTES.authLogout`, 'logout route registration');
	assertIncludes(auth, 'authService.requireSession(sessionId, signal)', 'browser session read authorization');
	assertIncludes(auth, 'authService.requireMutationSession(sessionId,', 'browser session CSRF authorization');
	const logoutIndex = auth.indexOf('await authService.logout');
	if (logoutIndex < 0 || !auth.slice(Math.max(0, logoutIndex - 120), logoutIndex).includes(`requireMethod(request, response, ['POST']);`)) {
		throw new Error('Runtime route drift detected: missing logout POST method.');
	}
	add(runtimeOperations, 'post', API_V1_ROUTES.authDiscordStart);
	add(runtimeOperations, 'get', API_V1_ROUTES.authDiscordCallback);
	add(runtimeOperations, 'get', API_V1_ROUTES.authSession);
	add(runtimeOperations, 'get', API_V1_ROUTES.authIdentity);
	add(runtimeOperations, 'post', API_V1_ROUTES.authLogout);

	assertIncludes(integrations, `route.kind === 'collection' && request.method === 'GET'`, 'integration collection GET method');
	assertEvidenceNear(integrations, `if (route.kind === 'collection')`, `requireMethod(request, response, ['GET', 'POST']);`, 180);
	assertEvidenceNear(integrations, `if (route.kind === 'item')`, `requireMethod(request, response, ['PATCH']);`, 180);
	assertEvidenceNear(integrations, `if (route.kind === 'credentials')`, `request.method === 'GET'`, 180);
	assertEvidenceNear(integrations, `if (route.kind === 'credentials')`, `requireMethod(request, response, ['GET', 'POST']);`, 1_000);
	assertEvidenceNear(integrations, `if (route.kind === 'credential-revoke')`, `requireMethod(request, response, ['POST']);`, 180);
	assertEvidenceNear(integrations, `if (route.kind !== 'archive')`, `requireMethod(request, response, ['POST']);`, 180);
	assertIncludes(integrations, 'requireCsrf: false', 'browser-session read boundary');
	assertIncludes(integrations, 'requireCsrf: true', 'browser-session mutation CSRF boundary');
	add(runtimeOperations, 'get', API_V1_ROUTES.integrationRegistry);
	add(runtimeOperations, 'post', API_V1_ROUTES.integrationRegistry);
	add(runtimeOperations, 'patch', `${API_V1_ROUTES.integrationRegistry}/{integrationId}`);
	add(runtimeOperations, 'post', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/archive`);
	add(runtimeOperations, 'get', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/credentials`);
	add(runtimeOperations, 'post', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/credentials`);
	add(runtimeOperations, 'post', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/credentials/{credentialId}/revoke`);

	assertIncludes(directory, `route.kind === 'direct' ? ['GET'] : ['POST']`, 'directory GET and POST methods');
	assertIncludes(directory, `API_V1_ROUTES.directoryUsers}/:discordUserId`, 'direct directory route');
	assertIncludes(directory, `pathname === API_V1_ROUTES.directoryQuery`, 'directory query route');
	assertIncludes(directory, `parseBearerCredential(request.headers.authorization)`, 'API credential bearer boundary');
	assertIncludes(directory, `hasScope(authentication.value.scopes, 'users:read')`, 'users:read scope boundary');
	assertIncludes(directory, `response.setHeader('x-ratelimit-limit'`, 'rate-limit response headers');
	assertIncludes(directory, `response.setHeader('retry-after'`, 'retry response header');
	const cors = await readFile(resolve(repositoryRoot, 'apps/api/src/http/cors.ts'), 'utf8');
	assertIncludes(cors, 'access-control-expose-headers', 'CORS-visible response headers');
	add(runtimeOperations, 'get', `${API_V1_ROUTES.directoryUsers}/{discordUserId}`);
	add(runtimeOperations, 'post', API_V1_ROUTES.directoryQuery);

	const documentedOperations = new Set(API_V1_OPERATION_CONTRACTS.map(apiV1OperationKey));
	const missingFromReference = [...runtimeOperations].filter((key) => !documentedOperations.has(key));
	const missingFromRuntime = [...documentedOperations].filter((key) => !runtimeOperations.has(key));
	if (missingFromReference.length || missingFromRuntime.length) {
		throw new Error(
			`Runtime/reference route drift detected. Missing from reference: ${missingFromReference.join(', ') || 'none'}. Missing from runtime: ${missingFromRuntime.join(', ') || 'none'}.`
		);
	}
}

function renderMarkdownReference(document: Record<string, unknown>): string {
	const components = document.components as { headers: Record<string, unknown>; schemas: Record<string, unknown> };
	const lines = [
		'---',
		'title: API Reference',
		'description: Contract-derived reference for every supported Arbiter v1 HTTP operation.',
		'---',
		'',
		'<!-- Generated by pnpm api:reference:generate. Do not edit by hand. -->',
		'',
		'# Arbiter v1 API Reference',
		'',
		'This page is generated from the Zod transport contracts in `packages/api-contracts`. The generated artifact is validated against the API runtime route and method surface before it can be published.',
		'',
		'[Download the OpenAPI 3.1 JSON artifact](pathname:///openapi/arbiter-v1.openapi.json)',
		'',
		'All examples use placeholders. Never place a credential, browser cookie, CSRF value, OAuth code, environment value, or production hostname in this reference.',
		'',
		'## Authentication boundaries',
		'',
		'| Boundary | Applies to | Requirement |',
		'| --- | --- | --- |',
		'| Anonymous | Health and OAuth start/callback | No established session or API credential. The callback relies on its one-use browser binding. |',
		'| Browser session | Staff reads | HttpOnly `arbiter_session` cookie. |',
		'| Browser session + CSRF | Staff mutations | Session cookie plus `X-CSRF-Token`. |',
		'| API credential | Directory reads | `Authorization: Bearer <api-credential>` with `users:read`; a browser session never substitutes for it. |',
		'',
		'## Operation index',
		'',
		'| Method | Path | Security | Operation |',
		'| --- | --- | --- | --- |',
		...API_V1_OPERATION_CONTRACTS.map(
			(operation) =>
				`| \`${operation.method.toUpperCase()}\` | \`${operation.path}\` | ${securityLabel(operation.security)} | [${escapeCell(operation.summary)}](#${operation.operationId.toLowerCase()}) |`
		),
		''
	];

	for (const tag of ['Health', 'Authentication', 'Integrations', 'Directory'] as const) {
		lines.push(`## ${tag}`, '');
		for (const operation of API_V1_OPERATION_CONTRACTS.filter((candidate) => candidate.tag === tag)) {
			lines.push(...renderOperation(operation, document), '');
		}
	}

	lines.push(
		'## Shared response headers',
		'',
		'Every operation returns `X-Request-Id` and `x-arbiter-api-contract-version`. Allowed browser origins also receive the documented CORS response headers. Authenticated directory responses add fixed-window rate-limit headers; a `429` response adds `Retry-After`.',
		'',
		`The machine-readable artifact defines ${Object.keys(components.headers).length} reusable response-header contracts.`,
		'',
		'## Reusable schemas',
		'',
		'The artifact derives these JSON Schemas mechanically from the Zod contracts, including strict-object rejection, nullability, enums, regexes, defaults, and numeric or collection bounds:',
		'',
		...Object.keys(components.schemas)
			.sort()
			.map((name) => `- \`${name}\``),
		'',
		'`MintApiCredentialResponse` is the only response that contains a newly generated API secret. It is returned exactly once and the reference deliberately provides no secret example.',
		'',
		'## Contributor extension pattern',
		'',
		'When a future API ticket adds or changes a route, method, scope, request, response, stable error, bound, or response header:',
		'',
		'1. Update the Zod transport contract and `API_V1_OPERATION_CONTRACTS` in the same change.',
		'2. Update the runtime handler using the shared route and schema contracts.',
		'3. Run `pnpm api:reference:generate` and review both generated files.',
		'4. Run `pnpm api:reference:check`, the contract tests, the affected API tests, and `pnpm docs:build`.',
		'5. Keep examples placeholder-only. Do not add a live-request playground or production values to the static reference.',
		''
	);
	return `${lines.join('\n')}\n`;
}

function renderOperation(operation: ApiV1OperationContract, document: Record<string, unknown>): string[] {
	const paths = document.paths as Record<string, Record<string, { responses: Record<string, { description: string }> }>>;
	const responses = Object.entries(paths[operation.path][operation.method].responses)
		.map(([status, response]) => ({ status: Number(status), detail: response.description }))
		.sort((left, right) => left.status - right.status)
		.map(({ status, detail }) => `| \`${status}\` | ${escapeCell(detail)} |`);
	const lines = [
		`### ${operation.summary} {#${operation.operationId.toLowerCase()}}`,
		'',
		`\`${operation.method.toUpperCase()} ${operation.path}\``,
		'',
		operation.description,
		'',
		`- Security: ${securityLabel(operation.security)}${operation.requiredScopes ? `; required scope: \`${operation.requiredScopes.join('`, `')}\`` : ''}`,
		`- Request body: ${operation.requestSchema ? `\`${operation.requestSchema}\`` : 'none'}`,
		`- Rate-limit headers: ${operation.rateLimited ? 'yes, after credential authentication' : 'no'}`
	];
	if (operation.parameters?.length) {
		lines.push('', '| Parameter | Location | Required | Contract |', '| --- | --- | --- | --- |');
		for (const parameter of operation.parameters) {
			lines.push(
				`| \`${parameter.name}\` | ${parameter.location} | ${parameter.required ? 'yes' : 'no'} | ${escapeCell(parameter.description)}${parameter.schemaComponent ? ` (\`${parameter.schemaComponent}\`)` : ''} |`
			);
		}
	}
	lines.push('', '| Status | Body or stable error codes |', '| --- | --- |', ...responses);
	return lines;
}

function securityLabel(security: ApiV1OperationContract['security']): string {
	return {
		anonymous: 'Anonymous',
		apiCredential: 'API credential',
		browserSession: 'Browser session',
		browserSessionCsrf: 'Browser session + CSRF'
	}[security];
}

function assertSecretFree(...artifacts: string[]): void {
	const combined = artifacts.join('\n');
	const forbidden: readonly [RegExp, string][] = [
		[/arb_v1_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}/, 'API credential'],
		[/-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/, 'private key'],
		[/https:\/\/(?!api\.example\.invalid)[A-Za-z0-9.-]+\.(?:com|net|org)\/api\/v1/, 'non-placeholder API hostname']
	];
	for (const [pattern, label] of forbidden) {
		if (pattern.test(combined)) throw new Error(`Generated API reference contains a forbidden ${label} pattern.`);
	}
}

async function assertFileMatches(path: string, expected: string): Promise<void> {
	let actual: string;
	try {
		actual = await readFile(path, 'utf8');
	} catch {
		throw new Error(`${path} is missing. Run pnpm api:reference:generate.`);
	}
	if (actual !== expected) throw new Error(`${path} is stale. Run pnpm api:reference:generate and commit the result.`);
}

function assertRouteBlock(source: string, route: string, methodEvidence: string): void {
	const routeIndex = source.indexOf(`url.pathname === API_V1_ROUTES.${route}`);
	if (routeIndex < 0) throw new Error(`Runtime route evidence is missing for ${route}.`);
	const nextBlock = source.slice(routeIndex, routeIndex + 600);
	assertIncludes(nextBlock, methodEvidence, `${route} method`);
}

function assertIncludes(source: string, evidence: string, label: string): void {
	if (!source.includes(evidence)) throw new Error(`Runtime route drift detected: missing ${label}.`);
}

function assertEvidenceNear(source: string, marker: string, evidence: string, window: number): void {
	const markerIndex = source.indexOf(marker);
	if (markerIndex < 0 || !source.slice(markerIndex, markerIndex + window).includes(evidence)) {
		throw new Error(`Runtime route drift detected: ${marker} no longer proves ${evidence}.`);
	}
}

function add(target: Set<string>, method: ApiV1OperationContract['method'], path: string): void {
	target.add(apiV1OperationKey({ method, path }));
}

function escapeCell(value: string): string {
	return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
