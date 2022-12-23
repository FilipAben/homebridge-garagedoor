import { CurrentDoorState, TargetDoorState } from 'hap-nodejs/dist/lib/definitions';
import {
    AccessoryConfig,
    API,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAPStatus,
    Logging,
    Service,
} from 'homebridge';
import Shelly from './shelly';
import * as net from 'net';


const state2String = {
    [CurrentDoorState.OPEN]: 'OPEN',
    [CurrentDoorState.CLOSED]: 'CLOSED',
    [CurrentDoorState.OPENING]: 'OPENING',
    [CurrentDoorState.CLOSING]: 'CLOSING',
    [CurrentDoorState.STOPPED]: 'STOPPED',
};

async function waitAsync(to: number): Promise<void> {
    return new Promise((res) => {
        setTimeout(() => {
            res();
        }, to);
    });
}


class GarageDoor {
    private readonly log: Logging;
    private readonly garageService: Service;
    private readonly informationService: Service;
    private readonly config: AccessoryConfig;
    private currentState: number;
    private shelly: Shelly;
    private api: API;

    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.api = api;
        this.config = { ...config };
        this.informationService = new api.hap.Service.AccessoryInformation();
        this.garageService = new api.hap.Service.GarageDoorOpener(config.name);

        /* Set general information */
        this.informationService
            .setCharacteristic(api.hap.Characteristic.Manufacturer, 'Custom Manufacturer')
            .setCharacteristic(api.hap.Characteristic.Model, 'Custom Model')
            .setCharacteristic(api.hap.Characteristic.SerialNumber, 'Custom serial')
            .setCharacteristic(api.hap.Characteristic.FirmwareRevision, 'Custom firmware');

        /* Register service operations */
        this.garageService
            .getCharacteristic(api.hap.Characteristic.TargetDoorState)
            .onSet(this.setTargetDoorState.bind(this));

        /* Set default state to closed */
        this.currentState = CurrentDoorState.CLOSED;

        if (!net.isIPv4(config.ip)) {
            throw new Error('Invalid IP configuration');
        }
        this.shelly = new Shelly(this.config.ip, this.config.webhookPort, this.log);
        setInterval(this.pollInput.bind(this), 5000);
    }

    async pollInput(): Promise<void> {
        const inputState = await this.shelly.getInput();
        this.doorStatus(inputState);
    }

    doorStatus(status: boolean) {
        if(status) { /* Door is open */
            if(this.currentState !== CurrentDoorState.CLOSED) {
                /* Knowing that the door sensor says it's open is only helpful when the door is fully closed. In the other
                    states (OPENING, OPEN or CLOSING) we don't need to take any action.
                */
                return;
            }
            this.#setCurrentState(CurrentDoorState.OPEN);
            this.garageService.setCharacteristic(this.api.hap.Characteristic.TargetDoorState, TargetDoorState.OPEN);
        } else { /* Door is closed */
            if(this.currentState !== CurrentDoorState.CLOSED && this.currentState !== CurrentDoorState.OPENING) {
                this.#setCurrentState(CurrentDoorState.CLOSED);
                this.garageService.setCharacteristic(this.api.hap.Characteristic.TargetDoorState, TargetDoorState.CLOSED);
            }
        }
    }

    #setCurrentState(state: number) {
        this.log(`Setting door state to ${state2String[state]}`);
        this.currentState = state;
        this.garageService.setCharacteristic(this.api.hap.Characteristic.CurrentDoorState, state);
    }

    async openDoor(): Promise<void> {
        this.log('start - openDoor');
        if (this.currentState === CurrentDoorState.CLOSED) {
            this.#setCurrentState(CurrentDoorState.OPENING);
            await this.shelly.toggleRelay();
            await waitAsync(this.config.waitOpen*1000);
            const inputState = await this.shelly.getInput();
            this.log('Input state from Shelly', inputState);
            if (inputState) {
                this.#setCurrentState(CurrentDoorState.OPEN);
            } else {
                this.#setCurrentState(CurrentDoorState.CLOSED);
            }
        }
        this.log('end - openDoor');
    }

    async closeDoor(): Promise<void> {
        this.log('start - closeDoor');
        if (this.currentState === CurrentDoorState.OPEN) {
            await this.shelly.toggleRelay();
            this.#setCurrentState(CurrentDoorState.CLOSING);
            await waitAsync(this.config.waitClosed*1000);
            const inputState = await this.shelly.getInput();
            this.log('Input state from Shelly', inputState);
            if (!inputState) {
                this.#setCurrentState(CurrentDoorState.CLOSED);
            } else {
                this.#setCurrentState(CurrentDoorState.OPEN);
            }
        }
        this.log('end - closeDoor');
    }


    async setTargetDoorState(value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
        this.log(`start - setTargetDoorState (${value})`);
        try {
            if (value.valueOf() === TargetDoorState.OPEN) {
                this.openDoor();
            } else if (value.valueOf() === TargetDoorState.CLOSED) {
                this.closeDoor();
            }
            callback && callback(HAPStatus.SUCCESS);
        } catch (err) {
            callback && callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        this.log('end - setTargetDoorState');
    }

    getServices(): Service[] {
        this.log('start -  getServices');

        /* TODO: fetch state from Shelley & set here */
        this.garageService.getCharacteristic(this.api.hap.Characteristic.CurrentDoorState).updateValue(CurrentDoorState.CLOSED);
        this.garageService.getCharacteristic(this.api.hap.Characteristic.TargetDoorState).updateValue(TargetDoorState.CLOSED);

        this.log('end -  getServices');
        return [
            this.informationService,
            this.garageService,
        ];
    }
}

export default GarageDoor;