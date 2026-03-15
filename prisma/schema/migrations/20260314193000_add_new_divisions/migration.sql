INSERT INTO "Division" (
	"code",
	"name",
	"kind",
	"displayNamePrefix",
	"showRank",
	"emojiName",
	"emojiId",
	"discordRoleId",
	"createdAt",
	"updatedAt"
)
VALUES
	('AFK', 'On Leave of Absence', 'SPECIAL', 'AFK', TRUE, NULL, NULL, NULL, NOW(), NOW()),
	('TECHDEPT', 'Tech Department', 'STAFF', 'TECH', FALSE, NULL, NULL, NULL, NOW(), NOW()),
	('SOL', 'Staff on Leave', 'STAFF', 'SOL', FALSE, NULL, NULL, NULL, NOW(), NOW())
	('CMDN', 'Navy Commander', 'STAFF', 'CMD-N', FALSE, NULL, NULL, NULL, NOW(), NOW())
	('CMDM', 'Marines Commander', 'STAFF', 'CMD-M', FALSE, NULL, NULL, NULL, NOW(), NOW())
	('CMDS', 'Support Commander', 'STAFF', 'CMD-S', FALSE, NULL, NULL, NULL, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
