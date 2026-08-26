export enum NEW_USER_TYPE {
	CLINE_PASS = "cline-pass",
	FREE = "free",
	POWER = "power",
	BYOK = "byok",
}

type UserTypeSelection = {
	titleKey: string
	descriptionKey: string
	type: NEW_USER_TYPE
	learnMoreUrl?: string
}

export const STEP_CONFIG = {
	0: {
		titleKey: "onboarding.userType.title",
		descriptionKey: "onboarding.userType.description",
		buttons: [
			{ textKey: "onboarding.button.continue", action: "next", variant: "default" },
			{ textKey: "onboarding.button.login", action: "signin", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.CLINE_PASS]: {
		title: "Select a ClinePass model",
		buttons: [
			{ text: "Create my Account", action: "signup", variant: "default" },
			{ text: "Back", action: "back", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.FREE]: {
		titleKey: "onboarding.step.free.title",
		buttons: [
			{ textKey: "onboarding.button.createAccount", action: "signup", variant: "default" },
			{ textKey: "onboarding.button.back", action: "back", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.POWER]: {
		titleKey: "onboarding.step.power.title",
		buttons: [
			{ textKey: "onboarding.button.createAccount", action: "signup", variant: "default" },
			{ textKey: "onboarding.button.back", action: "back", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.BYOK]: {
		titleKey: "onboarding.step.byok.title",
		buttons: [
			{ textKey: "onboarding.button.continue", action: "done", variant: "default" },
			{ textKey: "onboarding.button.back", action: "back", variant: "secondary" },
		],
	},
	2: {
		titleKey: "onboarding.step.almost.title",
		descriptionKey: "onboarding.step.almost.description",
		buttons: [{ textKey: "onboarding.button.back", action: "back", variant: "secondary" }],
	},
} as const

const CLINE_PASS_USER_TYPE_SELECTION: UserTypeSelection = {
	title: "ClinePass",
	description: "Low cost subscription plan for best open weights model.",
	type: NEW_USER_TYPE.CLINE_PASS,
	learnMoreUrl: "https://docs.cline.bot/getting-started/clinepass",
}

const BASE_USER_TYPE_SELECTIONS: UserTypeSelection[] = [
	{ title: "Absolutely Free", description: "Get started at no cost", type: NEW_USER_TYPE.FREE },
	{ title: "Frontier Model", description: "Claude, GPT Codex, Gemini, etc.", type: NEW_USER_TYPE.POWER },
	{ title: "Bring my own API key", description: "Use Cline with your provider of choice", type: NEW_USER_TYPE.BYOK },
]

/** Free leads (and is the default); ClinePass is inserted second when its models are available. */
export function getUserTypeSelections(hasClinePassModels: boolean): UserTypeSelection[] {
	if (!hasClinePassModels) {
		return BASE_USER_TYPE_SELECTIONS
	}
	const [free, ...rest] = BASE_USER_TYPE_SELECTIONS
	return [free, CLINE_PASS_USER_TYPE_SELECTION, ...rest]
}
