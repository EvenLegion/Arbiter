// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import '@sapphire/plugin-scheduled-tasks/register';
import '@sapphire/plugin-subcommands/register';
import '@sapphire/plugin-utilities-store/register';
import { setup } from '@skyra/env-utilities';
import * as colorette from 'colorette';
import { join } from 'node:path';
import { rootDir } from './constants';

setup({ path: join(rootDir, '.env') });

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);
if (process.env.DISCORD_GUILD_ID) {
	ApplicationCommandRegistries.setDefaultGuildIds([process.env.DISCORD_GUILD_ID]);
}

colorette.createColors({ useColor: true });
