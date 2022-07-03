import fetch from 'node-fetch';
import { EventEmitter } from 'stream';
import { createServer, Server } from 'http';
import { Logging } from 'homebridge';
import * as url from 'url';

interface InputState {
    id: number;
    state: boolean;
}

class Shelly extends EventEmitter {
    private baseUrl: string;
    private httpServer: Server;
    constructor(ip: string, port: number, log: Logging) {
        super();
        this.baseUrl = `http://${ip}`;
        this.httpServer = createServer((request, response) => {
            const queryObject = url.parse(request.url || '', true).query;
            if(queryObject && queryObject['status'] !== undefined) {
                const status: number = parseInt(queryObject['status'] as string);
                this.emit('statusChanged', status ? true : false);
            }
            response.end;
            response.writeHead(200);
            response.end();
        });
        this.httpServer.listen(port, () => {
            log('Listening for Shelly webhook on port', port);
        });
    }

    async toggleRelay(): Promise<void> {
        await fetch(`${this.baseUrl}/rpc/Switch.Set?id=0&on=true`);
        return new Promise((res) => {
            setTimeout(async () => {
                await fetch(`${this.baseUrl}/rpc/Switch.Set?id=0&on=false`);
                res();
            }, 1000);
        });
    }

    async getInput(): Promise<boolean> {
        const response = await fetch(`${this.baseUrl}/rpc/Input.GetStatus?id=0`);
        const state = await response.json() as InputState;
        return state.state;
    }
}

export default Shelly;

