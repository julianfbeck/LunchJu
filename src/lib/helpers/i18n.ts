import { addMessages, getLocaleFromNavigator, init, t } from 'svelte-i18n';
import en from './en.json';
import de from './de.json';
function setupI18n() {
	addMessages('en', en);
	addMessages('de', de);
	init({
		fallbackLocale: 'en',
		initialLocale: getLocaleFromNavigator()
	});
}
export { t, setupI18n };
