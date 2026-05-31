import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enCommon from "../locales/en/common.json"
import zhCommon from "../locales/zh-CN/common.json"

const resources = {
	en: {
		common: enCommon,
	},
	"zh-CN": {
		common: zhCommon,
	},
}

i18n.use(initReactI18next).init({
	resources,
	lng: "zh-CN",
	fallbackLng: "en",
	defaultNS: "common",
	interpolation: {
		escapeValue: false,
	},
})

export default i18n
