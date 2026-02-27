import './lib/setup';

import { SapphireClient } from '@sapphire/framework';

import { GatewayIntentBits, Partials } from 'discord.js';
import { ENV_CONFIG, ENV_DISCORD } from './config/env';
import { SAPPHIRE_LOGGER } from './integrations/pino';

const client = new SapphireClient({
	baseUserDirectory: __dirname,
	logger: {
		instance: SAPPHIRE_LOGGER
	},
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
	partials: [Partials.GuildMember, Partials.User],
	defaultPrefix: null,
	loadMessageCommandListeners: false,
	tasks: {
		bull: {
			connection: {
				host: ENV_CONFIG.REDIS_HOST,
				port: ENV_CONFIG.REDIS_PORT,
				password: ENV_CONFIG.REDIS_PASSWORD,
				db: ENV_CONFIG.REDIS_DB
			}
		}
	}
});

const main = async () => {
	try {
		await client.login(ENV_DISCORD.DISCORD_TOKEN);
		client.logger.info('Logged in');
	} catch (err) {
		client.logger.fatal({
			err,
		}, 'Failed to log in');
		await client.destroy();
		process.exit(1);
	}
};

void main();
