import { Utility } from '@sapphire/plugin-utilities-store';
import { findManyUsers, findUniqueUser } from '../integrations/prisma';

type GetParams =
	| {
			discordUserId: string;
			dbUserId?: never;
	  }
	| {
			dbUserId: string;
			discordUserId?: never;
	  };

type FindManyParams = {
	dbUserIds?: string[];
	discordUserIds?: string[];
};

export class UserDirectoryUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'userDirectory'
		});
	}

	public async get(params: GetParams) {
		const user = await findUniqueUser(params);
		return user ?? null;
	}

	public async findMany(params: FindManyParams = {}) {
		return findManyUsers(params);
	}

	public async getOrThrow(params: GetParams) {
		const user = await this.get(params);
		if (!user) {
			const identifier = 'discordUserId' in params ? `discordUserId=${params.discordUserId}` : `dbUserId=${params.dbUserId}`;
			throw new Error(`User not found in database: ${identifier}`);
		}

		return user;
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		userDirectory: UserDirectoryUtility;
	}
}
