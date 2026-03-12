import { Pool } from 'pg';
import { redactConnectionString, requiredEnv } from './env';

type OwnedSequenceRow = {
	tableSchema: string;
	tableName: string;
	columnName: string;
	sequenceSchema: string;
	sequenceName: string;
};

type TextValueRow = {
	value: string | null;
};

const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);
const DRY_RUN = false;

function quoteIdent(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function toBigIntOrNull(value: string | null | undefined): bigint | null {
	if (!value) {
		return null;
	}

	try {
		return BigInt(value);
	} catch {
		return null;
	}
}

async function fetchOwnedSequences(pool: Pool): Promise<OwnedSequenceRow[]> {
	const result = await pool.query<OwnedSequenceRow>(
		`
		SELECT
			ns.nspname AS "tableSchema",
			tbl.relname AS "tableName",
			col.attname AS "columnName",
			seq_ns.nspname AS "sequenceSchema",
			seq.relname AS "sequenceName"
		FROM pg_class AS seq
		INNER JOIN pg_namespace AS seq_ns
			ON seq_ns.oid = seq.relnamespace
		INNER JOIN pg_depend AS dep
			ON dep.objid = seq.oid
			AND dep.deptype IN ('a', 'i')
		INNER JOIN pg_class AS tbl
			ON tbl.oid = dep.refobjid
		INNER JOIN pg_namespace AS ns
			ON ns.oid = tbl.relnamespace
		INNER JOIN pg_attribute AS col
			ON col.attrelid = tbl.oid
			AND col.attnum = dep.refobjsubid
		WHERE seq.relkind = 'S'
			AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
		ORDER BY ns.nspname, tbl.relname, col.attname;
		`
	);

	return result.rows;
}

async function fetchSequenceStartValue(pool: Pool, sequenceSchema: string, sequenceName: string): Promise<bigint> {
	const result = await pool.query<TextValueRow>(
		`
		SELECT start_value::text AS value
		FROM pg_sequences
		WHERE schemaname = $1 AND sequencename = $2
		LIMIT 1;
		`,
		[sequenceSchema, sequenceName]
	);

	return toBigIntOrNull(result.rows[0]?.value) ?? 1n;
}

async function fetchColumnMaxValue(pool: Pool, tableSchema: string, tableName: string, columnName: string): Promise<bigint | null> {
	const sql = `
		SELECT MAX(${quoteIdent(columnName)})::text AS value
		FROM ${quoteIdent(tableSchema)}.${quoteIdent(tableName)};
	`;
	const result = await pool.query<TextValueRow>(sql);
	return toBigIntOrNull(result.rows[0]?.value);
}

async function setSequenceValue(pool: Pool, sequenceSchema: string, sequenceName: string, setValue: bigint, isCalled: boolean): Promise<void> {
	const qualifiedSequence = `${quoteIdent(sequenceSchema)}.${quoteIdent(sequenceName)}`;

	await pool.query(`SELECT setval($1::regclass, $2::bigint, $3::boolean);`, [qualifiedSequence, setValue.toString(), isCalled]);
}

async function main() {
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);
	console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);

	const pool = new Pool({ connectionString: TARGET_DATABASE_URL });

	try {
		const ownedSequences = await fetchOwnedSequences(pool);
		console.log(`Found ${ownedSequences.length} owned sequences.`);

		let updatedCount = 0;
		let emptyTableCount = 0;

		for (const row of ownedSequences) {
			const maxValue = await fetchColumnMaxValue(pool, row.tableSchema, row.tableName, row.columnName);
			const startValue = await fetchSequenceStartValue(pool, row.sequenceSchema, row.sequenceName);

			const isEmptyTable = maxValue === null;
			const setValue = isEmptyTable ? startValue : maxValue;
			const isCalled = !isEmptyTable;
			const nextValue = isCalled ? setValue + 1n : setValue;

			if (isEmptyTable) {
				emptyTableCount += 1;
			}

			if (!DRY_RUN) {
				await setSequenceValue(pool, row.sequenceSchema, row.sequenceName, setValue, isCalled);
				updatedCount += 1;
			}

			console.log(
				[
					`${row.tableSchema}.${row.tableName}.${row.columnName}`,
					`-> ${row.sequenceSchema}.${row.sequenceName}`,
					`set=${setValue.toString()}`,
					`isCalled=${isCalled ? 'true' : 'false'}`,
					`next=${nextValue.toString()}`
				].join(' ')
			);
		}

		console.table({
			totalSequences: ownedSequences.length,
			updated: updatedCount,
			emptyTables: emptyTableCount,
			dryRun: DRY_RUN ? 'yes' : 'no'
		});
	} finally {
		await pool.end();
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
