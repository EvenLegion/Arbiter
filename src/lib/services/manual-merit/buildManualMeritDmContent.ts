export function buildManualMeritDmContent({
	meritAmount,
	linkedEventName,
	reason,
	awarderNickname
}: {
	meritAmount: number;
	linkedEventName: string | null;
	reason: string | null;
	awarderNickname: string;
}) {
	const meritChangeLabel = `${formatSignedMeritAmount(meritAmount)} ${Math.abs(meritAmount) === 1 ? 'merit' : 'merits'}`;
	const dmEventLine = linkedEventName ? `\nEvent: ${linkedEventName}` : '';
	const dmReasonLine = reason ? `\nReason: ${reason}` : '';

	return `Your merits were adjusted by **${meritChangeLabel}** by **${awarderNickname}**.${dmEventLine}${dmReasonLine}`;
}

function formatSignedMeritAmount(amount: number) {
	return amount >= 0 ? `+${amount}` : `${amount}`;
}
