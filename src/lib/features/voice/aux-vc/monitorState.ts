export const monitorState = {
    initialized: false,
    busy: false,
    rerunRequested: false,
    pendingReconcileTimeout: null as NodeJS.Timeout | null,
    eligibleMemberDiscordUserIds: new Set<string>(),
};
