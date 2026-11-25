import { config } from './config';
import { makeVault } from './vault';

// Key is derived from JWT_SECRET. Changing JWT_SECRET makes saved secrets unreadable (re-enter them).
export const vault = makeVault(config.JWT_SECRET);
