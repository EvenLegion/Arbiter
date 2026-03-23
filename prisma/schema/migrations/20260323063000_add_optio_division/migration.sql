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
VALUES (
	'OPT',
	'Optio',
	'SPECIAL',
	NULL,
	TRUE,
	NULL,
	NULL,
	NULL,
	NOW(),
	NOW()
)
ON CONFLICT ("code") DO UPDATE
SET
	"name" = EXCLUDED."name",
	"kind" = EXCLUDED."kind",
	"displayNamePrefix" = EXCLUDED."displayNamePrefix",
	"showRank" = EXCLUDED."showRank",
	"emojiName" = EXCLUDED."emojiName",
	"emojiId" = EXCLUDED."emojiId",
	"discordRoleId" = EXCLUDED."discordRoleId",
	"updatedAt" = NOW();
