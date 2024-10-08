import { API } from 'homebridge';

import GarageDoor from './garageDoor';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerAccessory('GarageDoorController', GarageDoor);
};
