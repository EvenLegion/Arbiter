import { Utility } from '@sapphire/plugin-utilities-store';
import { findUniqueUser } from '../integrations/prisma';

type GetOrThrowParams =
	| {
			discordUserId: string;
			dbUserId?: never;
	  }
	| {
			dbUserId: string;
			discordUserId?: never;
	  };

export class UserDirectoryUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'userDirectory'
		});
	}

	public async getOrThrow(params: GetOrThrowParams) {
		const user = await findUniqueUser(params);

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
