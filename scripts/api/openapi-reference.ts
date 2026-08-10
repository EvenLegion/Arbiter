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
	const runtimeOperations = new Map<string, RuntimeOperationEvidence>();

	assertIncludes(server, `if (path === API_V1_ROUTES.health)`, 'health route');
	assertIncludes(server, `if (path === API_V1_ROUTES.readiness)`, 'readiness route');
	assertIncludes(server, `if (request.method === 'GET' || request.method === 'HEAD') return;`, 'GET and HEAD read methods');
	assertIncludes(server, `response.setHeader('x-request-id', requestId);`, 'request ID response header');
	assertIncludes(server, `response.setHeader(API_CONTRACT_VERSION_HEADER, API_CONTRACT_VERSION);`, 'contract version response header');
	add(runtimeOperations, 'get', API_V1_ROUTES.health, 'anonymous');
	add(runtimeOperations, 'head', API_V1_ROUTES.health, 'anonymous');
	add(runtimeOperations, 'get', API_V1_ROUTES.readiness, 'anonymous');
	add(runtimeOperations, 'head', API_V1_ROUTES.readiness, 'anonymous');

	for (const [route, method] of [
		['authDiscordStart', `requireMethod(request, response, ['POST']);`],
		['authDiscordCallback', `requireMethod(request, response, ['GET']);`],
		['authSession', `requireMethod(request, response, ['GET']);`],
		['authIdentity', `requireMethod(request, response, ['GET']);`]
	] as const) {
		assertRouteBlock(auth, route, method);
	}
	const authStartBlock = sliceBetween(
		auth,
		'if (url.pathname === API_V1_ROUTES.authDiscordStart)',
		'if (url.pathname === API_V1_ROUTES.authDiscordCallback)'
	);
	const authCallbackBlock = sliceBetween(
		auth,
		'if (url.pathname === API_V1_ROUTES.authDiscordCallback)',
		'if (url.pathname === API_V1_ROUTES.authSession)'
	);
	const authSessionBlock = sliceBetween(
		auth,
		'if (url.pathname === API_V1_ROUTES.authSession)',
		'if (url.pathname === API_V1_ROUTES.authIdentity)'
	);
	const authIdentityBlock = sliceBetween(auth, 'if (url.pathname === API_V1_ROUTES.authIdentity)', "requireMethod(request, response, ['POST']);");
	assertIncludes(authStartBlock, 'authService.beginOAuth', 'anonymous OAuth start behavior');
	assertIncludes(authCallbackBlock, 'authService.completeOAuth', 'anonymous OAuth callback behavior');
	assertIncludes(authSessionBlock, 'authService.requireSession(sessionId, signal)', 'session route browser authorization');
	assertIncludes(authIdentityBlock, 'authService.requireSession(sessionId, signal)', 'identity route browser authorization');
	assertExcludes(authStartBlock, 'requireSession', 'OAuth start browser-session guard');
	assertExcludes(authCallbackBlock, 'requireSession', 'OAuth callback browser-session guard');
	assertIncludes(auth, `API_V1_ROUTES.authLogout`, 'logout route registration');
	const logoutIndex = auth.indexOf('await authService.logout');
	if (logoutIndex < 0 || !auth.slice(Math.max(0, logoutIndex - 120), logoutIndex).includes(`requireMethod(request, response, ['POST']);`)) {
		throw new Error('Runtime route drift detected: missing logout POST method.');
	}
	assertIncludes(auth.slice(logoutIndex - 240, logoutIndex + 240), "request.headers['x-csrf-token']", 'logout CSRF guard');
	add(runtimeOperations, 'post', API_V1_ROUTES.authDiscordStart, 'anonymous');
	add(runtimeOperations, 'get', API_V1_ROUTES.authDiscordCallback, 'anonymous');
	add(runtimeOperations, 'get', API_V1_ROUTES.authSession, 'browserSession');
	add(runtimeOperations, 'get', API_V1_ROUTES.authIdentity, 'browserSession');
	add(runtimeOperations, 'post', API_V1_ROUTES.authLogout, 'browserSessionCsrf');

	const collectionReadBlock = sliceBetween(
		integrations,
		`if (route.kind === 'collection' && request.method === 'GET')`,
		`if (route.kind === 'collection')`
	);
	const collectionWriteBlock = sliceBetween(integrations, `if (route.kind === 'collection')`, `if (route.kind === 'item')`);
	const itemBlock = sliceBetween(integrations, `if (route.kind === 'item')`, `if (route.kind === 'credentials')`);
	const credentialsBlock = sliceBetween(integrations, `if (route.kind === 'credentials')`, `if (route.kind === 'credential-revoke')`);
	const credentialsReadBlock = sliceBetween(
		credentialsBlock,
		`if (request.method === 'GET')`,
		`requireMethod(request, response, ['GET', 'POST']);`
	);
	const credentialsWriteBlock = credentialsBlock.slice(credentialsBlock.indexOf(`requireMethod(request, response, ['GET', 'POST']);`));
	const revokeBlock = sliceBetween(integrations, `if (route.kind === 'credential-revoke')`, `if (route.kind !== 'archive')`);
	const archiveBlock = integrations.slice(integrations.indexOf(`if (route.kind !== 'archive')`));
	assertBrowserGuard(collectionReadBlock, false, 'integration collection GET');
	assertBrowserGuard(collectionWriteBlock, true, 'integration collection POST');
	assertBrowserGuard(itemBlock, true, 'integration item PATCH');
	assertBrowserGuard(credentialsReadBlock, false, 'credential collection GET');
	assertBrowserGuard(credentialsWriteBlock, true, 'credential collection POST');
	assertBrowserGuard(revokeBlock, true, 'credential revoke POST');
	assertBrowserGuard(archiveBlock, true, 'integration archive POST');
	assertIncludes(collectionWriteBlock, `requireMethod(request, response, ['GET', 'POST']);`, 'integration collection methods');
	assertIncludes(itemBlock, `requireMethod(request, response, ['PATCH']);`, 'integration item method');
	assertIncludes(credentialsWriteBlock, `requireMethod(request, response, ['GET', 'POST']);`, 'credential collection methods');
	assertIncludes(revokeBlock, `requireMethod(request, response, ['POST']);`, 'credential revoke method');
	assertIncludes(archiveBlock, `requireMethod(request, response, ['POST']);`, 'integration archive method');
	assertIncludes(integrations, `segments.length === 1`, 'integration item path shape');
	assertIncludes(integrations, `segments.length === 2 && segments[1] === 'archive'`, 'integration archive path shape');
	assertIncludes(integrations, `segments.length === 2 && segments[1] === 'credentials'`, 'credential collection path shape');
	assertIncludes(
		integrations,
		`segments.length === 4 && segments[1] === 'credentials' && segments[3] === 'revoke'`,
		'credential revoke path shape'
	);
	add(runtimeOperations, 'get', API_V1_ROUTES.integrationRegistry, 'browserSession');
	add(runtimeOperations, 'post', API_V1_ROUTES.integrationRegistry, 'browserSessionCsrf');
	add(runtimeOperations, 'patch', `${API_V1_ROUTES.integrationRegistry}/{integrationId}`, 'browserSessionCsrf');
	add(runtimeOperations, 'post', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/archive`, 'browserSessionCsrf');
	add(runtimeOperations, 'get', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/credentials`, 'browserSession');
	add(runtimeOperations, 'post', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/credentials`, 'browserSessionCsrf');
	add(runtimeOperations, 'post', `${API_V1_ROUTES.integrationRegistry}/{integrationId}/credentials/{credentialId}/revoke`, 'browserSessionCsrf');

	assertIncludes(directory, `route.kind === 'direct' ? ['GET'] : ['POST']`, 'directory GET and POST methods');
	assertIncludes(directory, `API_V1_ROUTES.directoryUsers}/:discordUserId`, 'direct directory route');
	assertIncludes(directory, `pathname === API_V1_ROUTES.directoryQuery`, 'directory query route');
	const directoryGuardBlock = sliceBetween(directory, `const secret = parseBearerCredential`, `if (route.kind === 'direct')`);
	assertIncludes(directoryGuardBlock, `parseBearerCredential(request.headers.authorization)`, 'API credential bearer boundary');
	assertIncludes(directoryGuardBlock, `hasScope(authentication.value.scopes, 'users:read')`, 'users:read scope boundary');
	assertIncludes(directoryGuardBlock, `writeRateLimitHeaders(response, rate)`, 'directory rate-limit response headers');
	assertIncludes(directoryGuardBlock, `response.setHeader('retry-after'`, 'directory retry response header');
	const cors = await readFile(resolve(repositoryRoot, 'apps/api/src/http/cors.ts'), 'utf8');
	assertIncludes(cors, 'access-control-expose-headers', 'CORS-visible response headers');
	add(runtimeOperations, 'get', `${API_V1_ROUTES.directoryUsers}/{discordUserId}`, 'apiCredential', ['users:read'], true);
	add(runtimeOperations, 'post', API_V1_ROUTES.directoryQuery, 'apiCredential', ['users:read'], true);

	const documentedOperations = new Map(API_V1_OPERATION_CONTRACTS.map((operation) => [apiV1OperationKey(operation), operation]));
	const missingFromReference = [...runtimeOperations.keys()].filter((key) => !documentedOperations.has(key));
	const missingFromRuntime = [...documentedOperations.keys()].filter((key) => !runtimeOperations.has(key));
	if (missingFromReference.length || missingFromRuntime.length) {
		throw new Error(
			`Runtime/reference route drift detected. Missing from reference: ${missingFromReference.join(', ') || 'none'}. Missing from runtime: ${missingFromRuntime.join(', ') || 'none'}.`
		);
	}
	for (const [key, runtime] of runtimeOperations) {
		const documented = documentedOperations.get(key);
		if (!documented) continue;
		const expected: RuntimeOperationEvidence = {
			security: documented.security,
			requiredScopes: [...(documented.requiredScopes ?? [])],
			rateLimited: documented.rateLimited === true
		};
		if (JSON.stringify(runtime) !== JSON.stringify(expected)) {
			throw new Error(
				`Runtime/reference security drift detected for ${key}: runtime=${JSON.stringify(runtime)} reference=${JSON.stringify(expected)}.`
			);
		}
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
		...Object.entries(components.schemas)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.flatMap(([name, schema]) => renderReusableSchema(name, schema as JsonSchemaNode)),
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
	const paths = document.paths as Record<
		string,
		Record<
			string,
			{
				responses: Record<string, { content?: { 'application/json'?: { schema: JsonSchemaNode } }; description: string }>;
			}
		>
	>;
	const responses = Object.entries(paths[operation.path][operation.method].responses)
		.map(([status, response]) => ({
			contract: response.content?.['application/json']?.schema ? schemaTypeLabel(response.content['application/json'].schema) : 'none',
			detail: response.description,
			status: Number(status)
		}))
		.sort((left, right) => left.status - right.status)
		.map(({ status, detail, contract }) => `| \`${status}\` | ${contract} | ${escapeCell(detail)} |`);
	const lines = [
		`### ${operation.summary} {#${operation.operationId.toLowerCase()}}`,
		'',
		`\`${operation.method.toUpperCase()} ${operation.path}\``,
		'',
		operation.description,
		'',
		`- Security: ${securityLabel(operation.security)}${operation.requiredScopes ? `; required scope: \`${operation.requiredScopes.join('`, `')}\`` : ''}`,
		`- Request body: ${operation.requestSchema ? `${schemaLink(operation.requestSchema)}${operation.requestBodyRequired === false ? ' (optional)' : ''}` : 'none'}`,
		`- Rate-limit headers: ${operation.rateLimited ? 'yes, after credential authentication' : 'no'}`
	];
	if (operation.parameters?.length) {
		lines.push('', '| Parameter | Location | Required | Contract |', '| --- | --- | --- | --- |');
		for (const parameter of operation.parameters) {
			lines.push(
				`| \`${parameter.name}\` | ${parameter.location} | ${parameter.required ? 'yes' : 'no'} | ${escapeCell(parameter.description)}${parameter.schemaComponent ? ` (${schemaLink(parameter.schemaComponent)})` : ''} |`
			);
		}
	}
	lines.push('', '| Status | Response contract | Body or stable error codes |', '| --- | --- | --- |', ...responses);
	return lines;
}

type JsonSchemaNode = {
	$ref?: string;
	additionalProperties?: boolean;
	anyOf?: JsonSchemaNode[];
	default?: unknown;
	description?: string;
	enum?: unknown[];
	exclusiveMaximum?: number;
	exclusiveMinimum?: number;
	format?: string;
	items?: JsonSchemaNode;
	maxItems?: number;
	maxLength?: number;
	maximum?: number;
	minItems?: number;
	minLength?: number;
	minimum?: number;
	oneOf?: JsonSchemaNode[];
	pattern?: string;
	properties?: Record<string, JsonSchemaNode>;
	readOnly?: boolean;
	required?: string[];
	type?: string | string[];
	'x-returned-once'?: boolean;
};

function renderReusableSchema(name: string, schema: JsonSchemaNode): string[] {
	const rows = collectSchemaRows(schema);
	return [
		`### ${name} {#${schemaAnchor(name)}}`,
		'',
		...(schema.description ? [schema.description, ''] : []),
		'| Field | Required | Type | Constraints |',
		'| --- | --- | --- | --- |',
		...rows.map(
			(row) =>
				`| \`${escapeCell(row.path)}\` | ${row.required ? 'yes' : 'no'} | ${schemaTypeLabel(row.schema)} | ${escapeCell(schemaConstraints(row.schema))} |`
		),
		''
	];
}

function collectSchemaRows(schema: JsonSchemaNode, path = '(value)', required = true): { path: string; required: boolean; schema: JsonSchemaNode }[] {
	if (!schema.properties) return [{ path, required, schema }];
	const requiredFields = new Set(schema.required ?? []);
	const rows: { path: string; required: boolean; schema: JsonSchemaNode }[] = [];
	for (const [name, property] of Object.entries(schema.properties).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
		const propertyPath = path === '(value)' ? name : `${path}.${name}`;
		rows.push({ path: propertyPath, required: requiredFields.has(name), schema: property });
		if (property.properties) rows.push(...collectSchemaRows(property, propertyPath, requiredFields.has(name)));
		if (property.items?.properties) rows.push(...collectSchemaRows(property.items, `${propertyPath}[]`, requiredFields.has(name)));
	}
	return rows;
}

function schemaTypeLabel(schema: JsonSchemaNode): string {
	if (schema.$ref) return schemaLink(schema.$ref.split('/').at(-1) ?? schema.$ref);
	const alternatives = schema.anyOf ?? schema.oneOf;
	if (alternatives) return alternatives.map(schemaTypeLabel).join(' or ');
	const type = Array.isArray(schema.type) ? schema.type.join(' or ') : (schema.type ?? 'schema');
	if (type === 'array' && schema.items) return `array of ${schemaTypeLabel(schema.items)}`;
	return `\`${type}\``;
}

function schemaConstraints(schema: JsonSchemaNode): string {
	const constraints: string[] = [];
	if (schema.description) constraints.push(schema.description);
	if (schema.enum) constraints.push(`enum: ${schema.enum.map((value) => `\`${String(value)}\``).join(', ')}`);
	if (schema.format) constraints.push(`format: \`${schema.format}\``);
	if (schema.pattern) constraints.push(`pattern: \`${schema.pattern}\``);
	for (const key of ['minimum', 'exclusiveMinimum', 'maximum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
		if (schema[key] !== undefined) constraints.push(`${key}: \`${String(schema[key])}\``);
	}
	if (schema.default !== undefined) constraints.push(`default: \`${JSON.stringify(schema.default)}\``);
	if (schema.additionalProperties === false) constraints.push('unknown fields rejected');
	if (schema.readOnly) constraints.push('read only');
	if (schema['x-returned-once']) constraints.push('returned once');
	return constraints.join('; ') || 'none';
}

function schemaLink(name: string): string {
	return `[\`${name}\`](#${schemaAnchor(name)})`;
}

function schemaAnchor(name: string): string {
	return `schema-${name.toLowerCase()}`;
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
		[/-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/, 'private key']
	];
	for (const [pattern, label] of forbidden) {
		if (pattern.test(combined)) throw new Error(`Generated API reference contains a forbidden ${label} pattern.`);
	}
	for (const match of combined.matchAll(/https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?/g)) {
		if (match[1] !== 'api.example.invalid') throw new Error('Generated API reference contains a forbidden non-placeholder API hostname pattern.');
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

function assertExcludes(source: string, evidence: string, label: string): void {
	if (source.includes(evidence)) throw new Error(`Runtime route drift detected: unexpected ${label}.`);
}

function assertBrowserGuard(source: string, requireCsrf: boolean, label: string): void {
	assertIncludes(
		source,
		`requireBrowserSession({ request, response, config, authService, requireCsrf: ${String(requireCsrf)}, signal })`,
		`${label} guard`
	);
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	if (start < 0 || end < 0) throw new Error(`Runtime route drift detected: cannot locate block between ${startMarker} and ${endMarker}.`);
	return source.slice(start, end);
}

type RuntimeOperationEvidence = {
	security: ApiV1OperationContract['security'];
	requiredScopes: string[];
	rateLimited: boolean;
};

function add(
	target: Map<string, RuntimeOperationEvidence>,
	method: ApiV1OperationContract['method'],
	path: string,
	security: ApiV1OperationContract['security'],
	requiredScopes: string[] = [],
	rateLimited = false
): void {
	target.set(apiV1OperationKey({ method, path }), { security, requiredScopes, rateLimited });
}

function escapeCell(value: string): string {
	return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
