import type { CityConfig } from '../city';
import { HARIDWAR } from './haridwar';
import { NAGPUR } from './nagpur';

export const CITIES: Record<string, CityConfig> = { haridwar: HARIDWAR, nagpur: NAGPUR };
/** Cities the model may be tuned on. Everything else is held out. */
export const DEV_CITIES = ['haridwar'];
export { HARIDWAR, NAGPUR };
